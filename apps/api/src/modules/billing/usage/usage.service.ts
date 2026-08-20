import { Injectable, Logger } from '@nestjs/common';
import { ControlPlaneDbService } from '../../../database/control-plane-db.service';
import * as schema from '../../../database/schemas/control-plane.schema';
import { eq, and, gte, lte } from 'drizzle-orm';

/**
 * Records and queries usage-based billing metrics for tenants.
 *
 * Responsibilities:
 * - Records usage_record entries (job completed, app build, SMS sent) (Req 8.1)
 * - Queries accumulated usage for the current billing period grouped by metric (Req 8.5)
 *
 * Note: The nightly aggregation push to Stripe (Req 8.2, 8.3, 8.4) is handled
 * by the UsagePushProcessor (BullMQ repeatable job) — implemented in task 8.2.
 */
@Injectable()
export class UsageService {
  private readonly logger = new Logger(UsageService.name);

  constructor(private readonly controlPlaneDb: ControlPlaneDbService) {}

  /**
   * Records a billable usage event.
   * Requirement 8.1
   */
  async recordUsage(tenantId: string, metric: string, quantity: number) {
    const db = this.controlPlaneDb.db;

    const [record] = await db
      .insert(schema.usageRecords)
      .values({
        tenantId,
        metric,
        quantity,
      })
      .returning();

    this.logger.log(
      `Recorded usage: tenant=${tenantId}, metric=${metric}, quantity=${quantity}`,
    );

    return record;
  }

  /**
   * Retrieves accumulated usage records for the current billing period,
   * grouped by metric type.
   * Requirement 8.5
   */
  async getCurrentPeriodUsage(tenantId: string) {
    const db = this.controlPlaneDb.db;

    // Get the current billing period start from the tenant's active subscription
    const [subscription] = await db
      .select()
      .from(schema.subscriptions)
      .where(eq(schema.subscriptions.tenantId, tenantId))
      .limit(1);

    const periodStart = subscription?.currentPeriodStart ?? this.getDefaultPeriodStart();

    // Fetch all usage records since period start for this tenant
    const records = await db
      .select()
      .from(schema.usageRecords)
      .where(
        and(
          eq(schema.usageRecords.tenantId, tenantId),
          gte(schema.usageRecords.recordedAt, periodStart),
        ),
      );

    // Aggregate by metric
    const grouped = records.reduce<Record<string, number>>((acc, record) => {
      acc[record.metric] = (acc[record.metric] ?? 0) + record.quantity;
      return acc;
    }, {});

    return {
      tenantId,
      periodStart,
      periodEnd: subscription?.currentPeriodEnd ?? null,
      metrics: Object.entries(grouped).map(([metric, total]) => ({
        metric,
        total,
      })),
    };
  }

  /**
   * Defaults to the start of the current calendar month if no subscription period is found.
   */
  private getDefaultPeriodStart(): Date {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  }

  /**
   * Returns tenant IDs that have usage records within the given time window.
   * Used by the nightly usage-push processor.
   */
  async getTenantsWithUsage(periodStart: Date, periodEnd: Date): Promise<string[]> {
    const db = this.controlPlaneDb.db;

    const records = await db
      .select({ tenantId: schema.usageRecords.tenantId })
      .from(schema.usageRecords)
      .where(
        and(
          gte(schema.usageRecords.recordedAt, periodStart),
          lte(schema.usageRecords.recordedAt, periodEnd),
        ),
      )
      .groupBy(schema.usageRecords.tenantId);

    return records.map((r) => r.tenantId);
  }

  /**
   * Aggregates usage records for a tenant within the given time window,
   * grouped by metric. Used by the nightly usage-push processor.
   */
  async aggregateUsageForPeriod(
    tenantId: string,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<Array<{ metric: string; totalQuantity: number }>> {
    const db = this.controlPlaneDb.db;

    const records = await db
      .select()
      .from(schema.usageRecords)
      .where(
        and(
          eq(schema.usageRecords.tenantId, tenantId),
          gte(schema.usageRecords.recordedAt, periodStart),
          lte(schema.usageRecords.recordedAt, periodEnd),
        ),
      );

    const grouped = records.reduce<Record<string, number>>((acc, record) => {
      acc[record.metric] = (acc[record.metric] ?? 0) + record.quantity;
      return acc;
    }, {});

    return Object.entries(grouped).map(([metric, totalQuantity]) => ({
      metric,
      totalQuantity,
    }));
  }
}
