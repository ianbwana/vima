import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';

/**
 * Thin wrapper around the Stripe SDK for platform-level billing operations.
 * Centralises Stripe configuration and provides typed convenience methods.
 */
@Injectable()
export class StripeBillingClient implements OnModuleInit {
  private stripe: Stripe;
  private readonly logger = new Logger(StripeBillingClient.name);

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const secretKey = this.config.getOrThrow<string>('STRIPE_SECRET_KEY');
    this.stripe = new Stripe(secretKey, {
      apiVersion: '2025-02-24.acacia',
      typescript: true,
    });
  }

  // ─── Subscriptions ──────────────────────────────────────────────────

  async createSubscription(params: {
    customerId: string;
    priceId: string;
    metadata?: Record<string, string>;
  }): Promise<Stripe.Subscription> {
    return this.stripe.subscriptions.create({
      customer: params.customerId,
      items: [{ price: params.priceId }],
      metadata: params.metadata,
      payment_behavior: 'default_incomplete',
      expand: ['latest_invoice.payment_intent'],
    });
  }

  async addSubscriptionItem(params: {
    subscriptionId: string;
    priceId: string;
    quantity?: number;
    metadata?: Record<string, string>;
  }): Promise<Stripe.SubscriptionItem> {
    return this.stripe.subscriptionItems.create({
      subscription: params.subscriptionId,
      price: params.priceId,
      quantity: params.quantity ?? 1,
      metadata: params.metadata,
    });
  }

  async removeSubscriptionItem(subscriptionItemId: string): Promise<Stripe.DeletedSubscriptionItem> {
    return this.stripe.subscriptionItems.del(subscriptionItemId);
  }

  async getSubscription(subscriptionId: string): Promise<Stripe.Subscription> {
    return this.stripe.subscriptions.retrieve(subscriptionId);
  }

  async cancelSubscription(subscriptionId: string): Promise<Stripe.Subscription> {
    return this.stripe.subscriptions.cancel(subscriptionId);
  }

  async updateSubscription(
    subscriptionId: string,
    params: Stripe.SubscriptionUpdateParams,
  ): Promise<Stripe.Subscription> {
    return this.stripe.subscriptions.update(subscriptionId, params);
  }

  // ─── Invoices ───────────────────────────────────────────────────────

  async getInvoice(invoiceId: string): Promise<Stripe.Invoice> {
    return this.stripe.invoices.retrieve(invoiceId);
  }

  // ─── Webhook Verification ──────────────────────────────────────────

  constructEvent(payload: Buffer, signature: string): Stripe.Event {
    const webhookSecret = this.config.getOrThrow<string>('STRIPE_BILLING_WEBHOOK_SECRET');
    return this.stripe.webhooks.constructEvent(payload, signature, webhookSecret);
  }

  // ─── Usage / Metered Billing ─────────────────────────────────────────

  /**
   * Reports metered usage for a subscription item to Stripe.
   * Uses idempotency keys to prevent duplicate charges (Req 8.3).
   */
  async createUsageRecord(params: {
    subscriptionItemId: string;
    quantity: number;
    timestamp: number;
    idempotencyKey: string;
  }): Promise<Stripe.UsageRecord> {
    return this.stripe.subscriptionItems.createUsageRecord(
      params.subscriptionItemId,
      {
        quantity: params.quantity,
        timestamp: params.timestamp,
        action: 'set',
      },
      {
        idempotencyKey: params.idempotencyKey,
      },
    );
  }

  // ─── Customers ──────────────────────────────────────────────────────

  async createCustomer(params: {
    name: string;
    email?: string;
    metadata?: Record<string, string>;
  }): Promise<Stripe.Customer> {
    return this.stripe.customers.create(params);
  }
}
