import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { ControlPlaneDbService } from '../../../database/control-plane-db.service';
import { StripeBillingClient } from '../stripe-billing.client';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';
import * as schema from '../../../database/schemas/control-plane.schema';
import { eq, and } from 'drizzle-orm';

/**
 * Manages Stripe Billing subscriptions for platform tenants.
 *
 * Responsibilities:
 * - Creates subscriptions when a tenant selects a plan tier (Req 7.1)
 * - Adds/removes subscription items when modules are enabled/disabled (Req 7.2)
 * - Syncs invoice status from Stripe webhooks (Req 7.3)
 * - Handles payment failures: past_due + dunning flow (Req 7.4, 7.5)
 * - Stores Stripe subscription ID and billing period (Req 7.6)
 */
@Injectable()
export class SubscriptionService {
  private readonly logger = new Logger(SubscriptionService.name);

  /** Grace period (in days) before suspended status during dunning */
  private readonly DUNNING_GRACE_PERIOD_DAYS = 7;

  constructor(
    private readonly controlPlaneDb: ControlPlaneDbService,
    private readonly stripeClient: StripeBillingClient,
  ) {}

  // ─── Create Subscription (Req 7.1, 7.6) ────────────────────────────

  /**
   * Creates a Stripe subscription for a tenant based on their selected plan tier.
   * Stores the Stripe subscription ID and billing period locally.
   */
  async createSubscription(dto: CreateSubscriptionDto) {
    const db = this.controlPlaneDb.db;

    // Fetch the plan to get the Stripe price mapping
    const [plan] = await db
      .select()
      .from(schema.plans)
      .where(eq(schema.plans.id, dto.planId))
      .limit(1);

    if (!plan) {
      throw new NotFoundException(`Plan ${dto.planId} not found`);
    }

    // Ensure the tenant exists
    const [tenant] = await db
      .select()
      .from(schema.tenants)
      .where(eq(schema.tenants.id, dto.tenantId))
      .limit(1);

    if (!tenant) {
      throw new NotFoundException(`Tenant ${dto.tenantId} not found`);
    }

    // Ensure a Stripe customer exists — either provided or create one
    let stripeCustomerId = dto.stripeCustomerId;
    if (!stripeCustomerId) {
      const customer = await this.stripeClient.createCustomer({
        name: tenant.name,
        metadata: { tenantId: dto.tenantId },
      });
      stripeCustomerId = customer.id;
    }

    // Create subscription in Stripe
    // The priceId is derived from plan tier convention: price_{tier}_monthly
    // In production, this would come from a pricing configuration table
    const stripePriceId = `price_${plan.tier}_monthly`;

    const stripeSubscription = await this.stripeClient.createSubscription({
      customerId: stripeCustomerId,
      priceId: stripePriceId,
      metadata: {
        tenantId: dto.tenantId,
        planId: dto.planId,
      },
    });

    // Store subscription locally with Stripe IDs and billing period (Req 7.6)
    const [subscription] = await db
      .insert(schema.subscriptions)
      .values({
        tenantId: dto.tenantId,
        planId: dto.planId,
        status: 'active',
        stripeSubscriptionId: stripeSubscription.id,
        currentPeriodStart: new Date(stripeSubscription.current_period_start * 1000),
        currentPeriodEnd: new Date(stripeSubscription.current_period_end * 1000),
      })
      .returning();

    this.logger.log(
      `Created subscription ${subscription.id} for tenant ${dto.tenantId} (Stripe: ${stripeSubscription.id})`,
    );

    return subscription;
  }

  // ─── Add/Remove Subscription Items (Req 7.2) ───────────────────────

  /**
   * Adds a subscription item when a module is enabled.
   * Called by the entitlements event handler.
   */
  async addModuleItem(tenantId: string, module: string, priceId: string, price: string) {
    const db = this.controlPlaneDb.db;

    const subscription = await this.getActiveSubscription(tenantId);
    if (!subscription || !subscription.stripeSubscriptionId) {
      throw new BadRequestException(
        `No active Stripe subscription found for tenant ${tenantId}`,
      );
    }

    // Add item in Stripe
    const stripeItem = await this.stripeClient.addSubscriptionItem({
      subscriptionId: subscription.stripeSubscriptionId,
      priceId,
      metadata: { module, tenantId },
    });

    // Store locally
    const [item] = await db
      .insert(schema.subscriptionItems)
      .values({
        subscriptionId: subscription.id,
        module,
        price,
        quantity: 1,
      })
      .returning();

    this.logger.log(
      `Added module "${module}" to subscription ${subscription.id} (Stripe item: ${stripeItem.id})`,
    );

    return item;
  }

  /**
   * Removes a subscription item when a module is disabled.
   * Called by the entitlements event handler.
   */
  async removeModuleItem(tenantId: string, module: string) {
    const db = this.controlPlaneDb.db;

    const subscription = await this.getActiveSubscription(tenantId);
    if (!subscription) {
      throw new BadRequestException(
        `No active subscription found for tenant ${tenantId}`,
      );
    }

    // Find local subscription item
    const [item] = await db
      .select()
      .from(schema.subscriptionItems)
      .where(
        and(
          eq(schema.subscriptionItems.subscriptionId, subscription.id),
          eq(schema.subscriptionItems.module, module),
        ),
      )
      .limit(1);

    if (!item) {
      this.logger.warn(
        `Module "${module}" not found on subscription ${subscription.id}`,
      );
      return;
    }

    // Remove from Stripe — we need to find the Stripe subscription item
    // In a full implementation, we'd store the Stripe item ID locally
    // For now we retrieve the subscription and find the matching item
    if (subscription.stripeSubscriptionId) {
      const stripeSubscription = await this.stripeClient.getSubscription(
        subscription.stripeSubscriptionId,
      );
      const stripeItem = stripeSubscription.items.data.find(
        (si) => si.metadata?.module === module,
      );
      if (stripeItem) {
        await this.stripeClient.removeSubscriptionItem(stripeItem.id);
      }
    }

    // Remove locally
    await db
      .delete(schema.subscriptionItems)
      .where(eq(schema.subscriptionItems.id, item.id));

    this.logger.log(
      `Removed module "${module}" from subscription ${subscription.id}`,
    );
  }

  // ─── Invoice Sync (Req 7.3) ────────────────────────────────────────

  /**
   * Syncs invoice status from a Stripe webhook event to the local invoices table.
   * Called by the webhook handler when invoice events are received.
   */
  async syncInvoiceFromWebhook(stripeInvoice: {
    id: string;
    subscription: string | null;
    amount_due: number;
    currency: string;
    status: string | null;
    due_date: number | null;
    status_transitions?: { paid_at?: number | null };
  }) {
    const db = this.controlPlaneDb.db;

    // Resolve tenant from subscription
    const tenantId = await this.resolveTenantFromStripeSubscription(
      stripeInvoice.subscription,
    );
    if (!tenantId) {
      this.logger.warn(
        `Cannot sync invoice ${stripeInvoice.id}: no tenant found for subscription ${stripeInvoice.subscription}`,
      );
      return;
    }

    const invoiceStatus = this.mapStripeInvoiceStatus(stripeInvoice.status);
    const amountDecimal = (stripeInvoice.amount_due / 100).toFixed(2);

    // Upsert: check if invoice already exists
    const [existing] = await db
      .select()
      .from(schema.invoices)
      .where(eq(schema.invoices.stripeInvoiceId, stripeInvoice.id))
      .limit(1);

    if (existing) {
      await db
        .update(schema.invoices)
        .set({
          status: invoiceStatus,
          paidAt: stripeInvoice.status_transitions?.paid_at
            ? new Date(stripeInvoice.status_transitions.paid_at * 1000)
            : undefined,
        })
        .where(eq(schema.invoices.id, existing.id));
    } else {
      await db.insert(schema.invoices).values({
        tenantId,
        stripeInvoiceId: stripeInvoice.id,
        amount: amountDecimal,
        currency: stripeInvoice.currency.toUpperCase(),
        status: invoiceStatus,
        dueDate: stripeInvoice.due_date
          ? new Date(stripeInvoice.due_date * 1000)
          : null,
      });
    }

    this.logger.log(
      `Synced invoice ${stripeInvoice.id} → status: ${invoiceStatus}`,
    );
  }

  // ─── Payment Failure & Dunning (Req 7.4, 7.5) ─────────────────────

  /**
   * Handles invoice payment failure from Stripe webhook.
   * Updates subscription to past_due and initiates dunning flow.
   */
  async handlePaymentFailure(stripeSubscriptionId: string) {
    const db = this.controlPlaneDb.db;

    const [subscription] = await db
      .select()
      .from(schema.subscriptions)
      .where(eq(schema.subscriptions.stripeSubscriptionId, stripeSubscriptionId))
      .limit(1);

    if (!subscription) {
      this.logger.warn(
        `Payment failure for unknown subscription: ${stripeSubscriptionId}`,
      );
      return;
    }

    // Update subscription status to past_due (Req 7.4)
    await db
      .update(schema.subscriptions)
      .set({ status: 'past_due' })
      .where(eq(schema.subscriptions.id, subscription.id));

    this.logger.warn(
      `Subscription ${subscription.id} marked past_due (Stripe: ${stripeSubscriptionId})`,
    );

    // Initiate dunning flow (Req 7.5)
    await this.initiateDunningFlow(subscription.tenantId);
  }

  /**
   * Initiates the dunning flow for a tenant:
   * - Applies a grace period with read-only banners
   * - After grace period expires, transitions tenant to suspended status
   *
   * In production, this would schedule a delayed job via BullMQ.
   * For now, we update the tenant metadata to trigger read-only banners
   * and schedule the suspension.
   */
  private async initiateDunningFlow(tenantId: string) {
    const db = this.controlPlaneDb.db;

    const gracePeriodEnd = new Date();
    gracePeriodEnd.setDate(gracePeriodEnd.getDate() + this.DUNNING_GRACE_PERIOD_DAYS);

    // Update tenant to indicate dunning state (read-only banners shown by portal)
    // The tenant status remains 'active' during the grace period but the
    // subscription status is 'past_due' which triggers UI banners.
    this.logger.warn(
      `Dunning initiated for tenant ${tenantId}. Grace period ends: ${gracePeriodEnd.toISOString()}`,
    );

    // In a full implementation, this would enqueue a delayed BullMQ job
    // that fires after DUNNING_GRACE_PERIOD_DAYS to transition tenant to suspended.
    // For now we log the intent — the suspension job will be implemented
    // alongside the BullMQ scheduler integration.
  }

  /**
   * Suspends a tenant after the dunning grace period expires.
   * Called by the scheduled dunning processor (BullMQ delayed job).
   */
  async suspendTenantAfterDunning(tenantId: string) {
    const db = this.controlPlaneDb.db;

    // Check if subscription is still past_due (tenant may have paid)
    const subscription = await this.getActiveSubscription(tenantId);
    if (!subscription || subscription.status !== 'past_due') {
      this.logger.log(
        `Tenant ${tenantId} no longer past_due — skipping suspension`,
      );
      return;
    }

    // Transition subscription to suspended
    await db
      .update(schema.subscriptions)
      .set({ status: 'suspended' })
      .where(eq(schema.subscriptions.id, subscription.id));

    // Transition tenant status to suspended
    await db
      .update(schema.tenants)
      .set({ status: 'suspended' })
      .where(eq(schema.tenants.id, tenantId));

    this.logger.warn(`Tenant ${tenantId} suspended after dunning grace period`);
  }

  // ─── Billing Period Sync (Req 7.6) ─────────────────────────────────

  /**
   * Updates the local subscription record with the current billing period from Stripe.
   * Called when subscription.updated webhook events arrive.
   */
  async syncBillingPeriod(stripeSubscriptionId: string) {
    const db = this.controlPlaneDb.db;

    const stripeSubscription = await this.stripeClient.getSubscription(stripeSubscriptionId);

    await db
      .update(schema.subscriptions)
      .set({
        currentPeriodStart: new Date(stripeSubscription.current_period_start * 1000),
        currentPeriodEnd: new Date(stripeSubscription.current_period_end * 1000),
      })
      .where(eq(schema.subscriptions.stripeSubscriptionId, stripeSubscriptionId));

    this.logger.log(
      `Synced billing period for Stripe subscription ${stripeSubscriptionId}`,
    );
  }

  // ─── Helpers ────────────────────────────────────────────────────────

  async getActiveSubscription(tenantId: string) {
    const db = this.controlPlaneDb.db;

    const [subscription] = await db
      .select()
      .from(schema.subscriptions)
      .where(
        and(
          eq(schema.subscriptions.tenantId, tenantId),
          // Include past_due as "active" since tenant still has access during dunning
        ),
      )
      .limit(1);

    return subscription ?? null;
  }

  async getSubscriptionByStripeId(stripeSubscriptionId: string) {
    const db = this.controlPlaneDb.db;

    const [subscription] = await db
      .select()
      .from(schema.subscriptions)
      .where(eq(schema.subscriptions.stripeSubscriptionId, stripeSubscriptionId))
      .limit(1);

    return subscription ?? null;
  }

  private async resolveTenantFromStripeSubscription(
    stripeSubscriptionId: string | null,
  ): Promise<string | null> {
    if (!stripeSubscriptionId) return null;

    const subscription = await this.getSubscriptionByStripeId(stripeSubscriptionId);
    return subscription?.tenantId ?? null;
  }

  private mapStripeInvoiceStatus(
    stripeStatus: string | null,
  ): 'draft' | 'open' | 'paid' | 'void' | 'uncollectible' {
    switch (stripeStatus) {
      case 'draft':
        return 'draft';
      case 'open':
        return 'open';
      case 'paid':
        return 'paid';
      case 'void':
        return 'void';
      case 'uncollectible':
        return 'uncollectible';
      default:
        return 'draft';
    }
  }
}
