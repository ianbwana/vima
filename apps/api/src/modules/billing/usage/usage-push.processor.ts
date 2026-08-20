import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { ControlPlaneDbService } from '../../../database/control-plane-db.service';
import { StripeBillingClient } from '../stripe-billing.client';
import { UsageService } from './usage.service';
import * as schema from '../../../database/schemas/control-plane.schema';
import { eq, and } from 'drizzle-orm';

interface UsagePushJobData {
  /** If provided, only push for this tenant. Otherwise push for all tenants with usage. */
  tenantId?: string;
}

/**
 * Nightly BullMQ repeatable job that aggregates usage records and pushes
 * them to Stripe metered billing API.
 *
 * Requirements: 8.2, 8.3, 8.4
 *
 * - Aggregates usage by tenant and metric for the current billing period
 * - Pushes to Stripe with idempotency keys: `usage_${tenantId}_${metric}_${period}`
 * - Retries 3x with exponential backoff on Stripe API failures
 * - Alerts ops team (structured log) after 3 failures
 */
@Processor('usage-push', {
  concurrency: 5,
  limiter: { max: 10, duration: 1000 },
})
export class UsagePushProcessor extends WorkerHost {
  private readonly logger = new Logger(UsagePushProcessor.name);

  constructor(
    private readonly usageService: UsageService,
    private readonly stripeClient: StripeBillingClient,
    private readonly controlPlaneDb: ControlPlaneDbService,
  ) {
    super();
  }

  async process(job: Job<UsagePushJobData>): Promise<void> {
    this.logger.log(`Starting usage push job ${job.id}`);

    const { tenantId } = job.data;

    // Determine the period: yesterday (for nightly push)
    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 0, 0, 0, 0);
    const periodEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 59, 59, 999);
    const periodKey = periodStart.toISOString().split('T')[0]; // e.g., "2024-01-15"

    // Get tenants to process
    let tenantIds: string[];
    if (tenantId) {
      tenantIds = [tenantId];
    } else {
      tenantIds = await this.usageService.getTenantsWithUsage(periodStart, periodEnd);
    }

    this.logger.log(`Processing usage push for ${tenantIds.length} tenant(s), period: ${periodKey}`);

    let successCount = 0;
    let failureCount = 0;

    for (const tid of tenantIds) {
      try {
        await this.pushUsageForTenant(tid, periodStart, periodEnd, periodKey);
        successCount++;
      } catch (error) {
        failureCount++;
        this.logger.error(
          {
            message: `Failed to push usage for tenant ${tid}`,
            tenantId: tid,
            period: periodKey,
            error: error instanceof Error ? error.message : String(error),
            alert: 'ops_team',
            severity: 'high',
            type: 'usage_push_failure',
          },
          error instanceof Error ? error.stack : undefined,
        );
      }
    }

    this.logger.log(
      `Usage push complete: ${successCount} succeeded, ${failureCount} failed`,
    );
  }

  /**
   * Pushes aggregated usage for a single tenant to Stripe.
   * Uses idempotency keys to prevent duplicate charges (Req 8.3).
   * Retries 3x with exponential backoff on failure (Req 8.4).
   */
  private async pushUsageForTenant(
    tenantId: string,
    periodStart: Date,
    periodEnd: Date,
    periodKey: string,
  ): Promise<void> {
    const db = this.controlPlaneDb.db;

    // Get tenant's active subscription
    const [subscription] = await db
      .select()
      .from(schema.subscriptions)
      .where(eq(schema.subscriptions.tenantId, tenantId))
      .limit(1);

    if (!subscription?.stripeSubscriptionId) {
      this.logger.warn(
        `Tenant ${tenantId} has no active Stripe subscription, skipping usage push`,
      );
      return;
    }

    // Get subscription items to find the right Stripe subscription item for each metric
    const subscriptionItems = await db
      .select()
      .from(schema.subscriptionItems)
      .where(eq(schema.subscriptionItems.subscriptionId, subscription.id));

    // Aggregate usage
    const usageSummaries = await this.usageService.aggregateUsageForPeriod(
      tenantId,
      periodStart,
      periodEnd,
    );

    if (usageSummaries.length === 0) {
      this.logger.debug(`No usage records for tenant ${tenantId} in period ${periodKey}`);
      return;
    }

    // Push each metric to Stripe
    for (const usage of usageSummaries) {
      const subscriptionItem = subscriptionItems.find(
        (item) => item.module === usage.metric,
      );

      if (!subscriptionItem) {
        this.logger.debug(
          `No subscription item for metric "${usage.metric}" on tenant ${tenantId}, skipping`,
        );
        continue;
      }

      // Idempotency key format: usage_${tenantId}_${metric}_${period} (Req 8.3)
      const idempotencyKey = `usage_${tenantId}_${usage.metric}_${periodKey}`;

      await this.pushWithRetry(
        subscriptionItem.id,
        usage.totalQuantity,
        Math.floor(periodEnd.getTime() / 1000),
        idempotencyKey,
        tenantId,
        usage.metric,
      );
    }
  }

  /**
   * Pushes usage to Stripe with retry logic.
   * Retries 3x with exponential backoff (Req 8.4).
   * Alerts ops team after exhausting all retries.
   */
  private async pushWithRetry(
    subscriptionItemId: string,
    quantity: number,
    timestamp: number,
    idempotencyKey: string,
    tenantId: string,
    metric: string,
  ): Promise<void> {
    const MAX_RETRIES = 3;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        await this.stripeClient.createUsageRecord({
          subscriptionItemId,
          quantity,
          timestamp,
          idempotencyKey,
        });

        this.logger.debug(
          `Pushed usage to Stripe: tenant=${tenantId} metric=${metric} qty=${quantity} key=${idempotencyKey}`,
        );
        return;
      } catch (error) {
        const isLastAttempt = attempt === MAX_RETRIES;

        if (isLastAttempt) {
          // Alert ops team after 3 failures (Req 8.4)
          this.logger.error({
            message: `Usage push to Stripe exhausted all retries`,
            alert: 'ops_team',
            severity: 'critical',
            type: 'usage_push_stripe_failure',
            tenantId,
            metric,
            quantity,
            idempotencyKey,
            attempts: MAX_RETRIES,
            error: error instanceof Error ? error.message : String(error),
          });
          throw error;
        }

        // Exponential backoff: 1s, 2s, 4s
        const delay = Math.pow(2, attempt - 1) * 1000;
        this.logger.warn(
          `Stripe usage push attempt ${attempt}/${MAX_RETRIES} failed for tenant=${tenantId} metric=${metric}. Retrying in ${delay}ms...`,
        );
        await this.sleep(delay);
      }
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
