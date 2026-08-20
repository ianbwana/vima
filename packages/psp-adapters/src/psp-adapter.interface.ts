import { PspCapabilities } from '@vima/shared-types';

export interface CreateCustomerInput {
  email: string;
  name: string;
  metadata?: Record<string, string>;
}

export interface CreatePaymentIntentInput {
  amount: number;
  currency: string;
  customerId: string;
  metadata?: Record<string, string>;
}

export interface RefundInput {
  paymentId: string;
  amount?: number; // partial refund if less than original
  reason?: string;
}

export interface CreateTransferRecipientInput {
  name: string;
  bankCode: string;
  accountNumber: string;
  currency: string;
}

export interface PayoutInput {
  recipientId: string;
  amount: number;
  currency: string;
  reference: string;
}

export interface NormalizedWebhookEvent {
  type: 'payment.succeeded' | 'payment.failed' | 'payout.succeeded' | 'payout.failed' | 'refund.succeeded';
  provider: string;
  providerEventId: string;
  providerReference: string;
  amount: number;
  currency: string;
  metadata?: Record<string, string>;
  raw: unknown;
}

/**
 * All vertical code talks to this interface only.
 * No vertical ever imports a PSP SDK directly.
 */
export interface PspAdapter {
  readonly provider: string;

  createCustomer(input: CreateCustomerInput): Promise<{ id: string }>;
  createPaymentIntent(input: CreatePaymentIntentInput): Promise<{ id: string; clientSecret: string }>;
  confirm(paymentIntentId: string): Promise<{ status: string }>;
  refund(input: RefundInput): Promise<{ id: string; status: string }>;
  createTransferRecipient(input: CreateTransferRecipientInput): Promise<{ id: string }>;
  payout(input: PayoutInput): Promise<{ id: string; status: string }>;
  verifyWebhook(rawBody: Buffer, headers: Record<string, string>): NormalizedWebhookEvent;
  capabilities(): PspCapabilities;
}
