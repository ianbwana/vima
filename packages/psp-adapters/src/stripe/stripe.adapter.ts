import Stripe from 'stripe';
import { PspCapabilities } from '@vima/shared-types';
import {
  PspAdapter,
  CreateCustomerInput,
  CreatePaymentIntentInput,
  RefundInput,
  CreateTransferRecipientInput,
  PayoutInput,
  NormalizedWebhookEvent,
} from '../psp-adapter.interface.js';
import { StripeCredentials } from './stripe.types.js';

export class StripeAdapter implements PspAdapter {
  readonly provider = 'stripe';
  private readonly stripe: Stripe;
  private readonly webhookSecret: string;

  constructor(secretKey: string, webhookSecret: string) {
    this.stripe = new Stripe(secretKey, { apiVersion: '2025-02-24.acacia' as any });
    this.webhookSecret = webhookSecret;
  }

  static create(credentials: StripeCredentials): StripeAdapter {
    return new StripeAdapter(credentials.secretKey, credentials.webhookSecret);
  }

  async createCustomer(input: CreateCustomerInput): Promise<{ id: string }> {
    const customer = await this.stripe.customers.create({
      email: input.email,
      name: input.name,
      metadata: input.metadata,
    });
    return { id: customer.id };
  }

  async createPaymentIntent(
    input: CreatePaymentIntentInput,
  ): Promise<{ id: string; clientSecret: string }> {
    const paymentIntent = await this.stripe.paymentIntents.create({
      amount: input.amount,
      currency: input.currency,
      customer: input.customerId,
      metadata: input.metadata,
    });
    return {
      id: paymentIntent.id,
      clientSecret: paymentIntent.client_secret!,
    };
  }

  async confirm(paymentIntentId: string): Promise<{ status: string }> {
    const paymentIntent = await this.stripe.paymentIntents.confirm(paymentIntentId);
    return { status: paymentIntent.status };
  }

  async refund(input: RefundInput): Promise<{ id: string; status: string }> {
    const params: Stripe.RefundCreateParams = {
      payment_intent: input.paymentId,
    };
    if (input.amount !== undefined) {
      params.amount = input.amount;
    }
    if (input.reason) {
      params.reason = input.reason as Stripe.RefundCreateParams.Reason;
    }
    const refund = await this.stripe.refunds.create(params);
    return { id: refund.id, status: refund.status ?? 'unknown' };
  }

  async createTransferRecipient(
    input: CreateTransferRecipientInput,
  ): Promise<{ id: string }> {
    // In Stripe Connect, recipients are connected accounts.
    // We create a custom connected account and attach an external bank account.
    const account = await this.stripe.accounts.create({
      type: 'custom',
      country: this.currencyToCountry(input.currency),
      capabilities: {
        transfers: { requested: true },
      },
      business_type: 'individual',
      individual: {
        first_name: input.name.split(' ')[0],
        last_name: input.name.split(' ').slice(1).join(' ') || input.name,
      },
      external_account: {
        object: 'bank_account',
        country: this.currencyToCountry(input.currency),
        currency: input.currency,
        routing_number: input.bankCode,
        account_number: input.accountNumber,
        account_holder_name: input.name,
      },
    });
    return { id: account.id };
  }

  async payout(input: PayoutInput): Promise<{ id: string; status: string }> {
    // Use Stripe Connect transfers to move funds to the recipient's connected account
    const transfer = await this.stripe.transfers.create({
      amount: input.amount,
      currency: input.currency,
      destination: input.recipientId,
      transfer_group: input.reference,
    });
    return { id: transfer.id, status: 'pending' };
  }

  verifyWebhook(
    rawBody: Buffer,
    headers: Record<string, string>,
  ): NormalizedWebhookEvent {
    const signature = headers['stripe-signature'];
    if (!signature) {
      throw new Error('Missing stripe-signature header');
    }

    const event = this.stripe.webhooks.constructEvent(
      rawBody,
      signature,
      this.webhookSecret,
    );

    return this.normalizeEvent(event);
  }

  capabilities(): PspCapabilities {
    return {
      methods: ['card', 'bank_transfer', 'apple_pay', 'google_pay'],
      currencies: ['usd', 'eur', 'gbp', 'aud', 'cad', 'jpy', 'sgd'],
      payouts: true,
      splits: true,
    };
  }

  private normalizeEvent(event: Stripe.Event): NormalizedWebhookEvent {
    const eventData = event.data.object as unknown as Record<string, unknown>;

    const typeMap: Record<string, NormalizedWebhookEvent['type']> = {
      'payment_intent.succeeded': 'payment.succeeded',
      'payment_intent.payment_failed': 'payment.failed',
      'payout.paid': 'payout.succeeded',
      'payout.failed': 'payout.failed',
      'charge.refunded': 'refund.succeeded',
    };

    const normalizedType = typeMap[event.type];
    if (!normalizedType) {
      throw new Error(`Unsupported Stripe event type: ${event.type}`);
    }

    return {
      type: normalizedType,
      provider: 'stripe',
      providerEventId: event.id,
      providerReference: (eventData['id'] as string) ?? '',
      amount: (eventData['amount'] as number) ?? 0,
      currency: (eventData['currency'] as string) ?? '',
      metadata: (eventData['metadata'] as Record<string, string>) ?? undefined,
      raw: event,
    };
  }

  private currencyToCountry(currency: string): string {
    const map: Record<string, string> = {
      usd: 'US',
      eur: 'DE',
      gbp: 'GB',
      aud: 'AU',
      cad: 'CA',
      jpy: 'JP',
      sgd: 'SG',
    };
    return map[currency.toLowerCase()] ?? 'US';
  }
}
