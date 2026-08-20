import * as crypto from 'node:crypto';
import { PspCapabilities } from '@vima/shared-types';
import {
  CreateCustomerInput,
  CreatePaymentIntentInput,
  CreateTransferRecipientInput,
  NormalizedWebhookEvent,
  PayoutInput,
  PspAdapter,
  RefundInput,
} from '../psp-adapter.interface.js';
import {
  PaystackApiResponse,
  PaystackCredentials,
  PaystackCustomerData,
  PaystackRefundData,
  PaystackTransactionInitData,
  PaystackTransactionVerifyData,
  PaystackTransferData,
  PaystackTransferRecipientData,
  PaystackWebhookPayload,
} from './paystack.types.js';

const PAYSTACK_BASE_URL = 'https://api.paystack.co';

export class PaystackAdapter implements PspAdapter {
  readonly provider = 'paystack';

  constructor(private readonly secretKey: string) {}

  /**
   * Factory method for multi-tenant credential injection.
   */
  static create(credentials: PaystackCredentials): PaystackAdapter {
    return new PaystackAdapter(credentials.secretKey);
  }

  async createCustomer(input: CreateCustomerInput): Promise<{ id: string }> {
    const [firstName, ...rest] = input.name.split(' ');
    const lastName = rest.join(' ') || undefined;

    const response = await this.request<PaystackCustomerData>('/customer', {
      method: 'POST',
      body: {
        email: input.email,
        first_name: firstName,
        last_name: lastName,
        metadata: input.metadata,
      },
    });

    return { id: response.data.customer_code };
  }

  async createPaymentIntent(
    input: CreatePaymentIntentInput,
  ): Promise<{ id: string; clientSecret: string }> {
    // Paystack amounts are in minor units (kobo for NGN, pesewas for GHS)
    const amountInMinorUnits = input.amount;

    const response = await this.request<PaystackTransactionInitData>(
      '/transaction/initialize',
      {
        method: 'POST',
        body: {
          amount: amountInMinorUnits,
          email: input.metadata?.email ?? '',
          currency: input.currency.toUpperCase(),
          reference: input.metadata?.reference,
          metadata: input.metadata,
        },
      },
    );

    // Return authorization_url as clientSecret (used by frontend to redirect)
    // and reference as id
    return {
      id: response.data.reference,
      clientSecret: response.data.authorization_url,
    };
  }

  async confirm(paymentIntentId: string): Promise<{ status: string }> {
    // Paystack confirmation is done by verifying the transaction
    const response = await this.request<PaystackTransactionVerifyData>(
      `/transaction/verify/${encodeURIComponent(paymentIntentId)}`,
      { method: 'GET' },
    );

    return { status: response.data.status };
  }

  async refund(input: RefundInput): Promise<{ id: string; status: string }> {
    const body: Record<string, unknown> = {
      transaction: input.paymentId,
    };

    if (input.amount !== undefined) {
      body.amount = input.amount;
    }

    if (input.reason) {
      body.merchant_note = input.reason;
    }

    const response = await this.request<PaystackRefundData>('/refund', {
      method: 'POST',
      body,
    });

    return {
      id: String(response.data.id),
      status: response.data.status,
    };
  }

  async createTransferRecipient(
    input: CreateTransferRecipientInput,
  ): Promise<{ id: string }> {
    const response = await this.request<PaystackTransferRecipientData>(
      '/transferrecipient',
      {
        method: 'POST',
        body: {
          type: 'nuban',
          name: input.name,
          account_number: input.accountNumber,
          bank_code: input.bankCode,
          currency: input.currency.toUpperCase(),
        },
      },
    );

    return { id: response.data.recipient_code };
  }

  async payout(input: PayoutInput): Promise<{ id: string; status: string }> {
    // Paystack transfer amounts are in minor units (kobo)
    const response = await this.request<PaystackTransferData>('/transfer', {
      method: 'POST',
      body: {
        source: 'balance',
        amount: input.amount,
        recipient: input.recipientId,
        reason: input.reference,
        currency: input.currency.toUpperCase(),
      },
    });

    return {
      id: response.data.transfer_code,
      status: response.data.status,
    };
  }

  verifyWebhook(
    rawBody: Buffer,
    headers: Record<string, string>,
  ): NormalizedWebhookEvent {
    const signature = headers['x-paystack-signature'];
    if (!signature) {
      throw new Error('Missing x-paystack-signature header');
    }

    const computedHash = crypto
      .createHmac('sha512', this.secretKey)
      .update(rawBody)
      .digest('hex');

    if (computedHash !== signature) {
      throw new Error('Invalid Paystack webhook signature');
    }

    const payload: PaystackWebhookPayload = JSON.parse(rawBody.toString());

    return this.normalizeEvent(payload);
  }

  capabilities(): PspCapabilities {
    return {
      methods: ['card', 'bank_transfer', 'ussd', 'mobile_money'],
      currencies: ['NGN', 'GHS', 'ZAR', 'KES'],
      payouts: true,
      splits: true,
    };
  }

  // --- Private helpers ---

  private normalizeEvent(payload: PaystackWebhookPayload): NormalizedWebhookEvent {
    const eventMap: Record<string, NormalizedWebhookEvent['type']> = {
      'charge.success': 'payment.succeeded',
      'charge.failed': 'payment.failed',
      'transfer.success': 'payout.succeeded',
      'transfer.failed': 'payout.failed',
      'refund.processed': 'refund.succeeded',
    };

    const type = eventMap[payload.event];
    if (!type) {
      throw new Error(`Unsupported Paystack event type: ${payload.event}`);
    }

    return {
      type,
      provider: 'paystack',
      providerEventId: String(payload.data.id),
      providerReference: payload.data.reference,
      amount: payload.data.amount,
      currency: payload.data.currency,
      metadata: payload.data.metadata,
      raw: payload,
    };
  }

  private async request<T>(
    path: string,
    options: { method: string; body?: Record<string, unknown> },
  ): Promise<PaystackApiResponse<T>> {
    const url = `${PAYSTACK_BASE_URL}${path}`;

    const fetchOptions: RequestInit = {
      method: options.method,
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        'Content-Type': 'application/json',
      },
    };

    if (options.body) {
      fetchOptions.body = JSON.stringify(options.body);
    }

    const response = await fetch(url, fetchOptions);

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(
        `Paystack API error (${response.status}): ${errorBody}`,
      );
    }

    return (await response.json()) as PaystackApiResponse<T>;
  }
}
