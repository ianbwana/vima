export enum PspProvider {
  STRIPE = 'stripe',
  PAYSTACK = 'paystack',
  XENDIT = 'xendit',
  MERCADO_PAGO = 'mercado_pago',
}

export interface PspCapabilities {
  methods: string[];
  currencies: string[];
  payouts: boolean;
  splits: boolean;
}

export enum LedgerAccountType {
  CUSTOMER_WALLET = 'customer_wallet',
  PROVIDER_WALLET = 'provider_wallet',
  MERCHANT_WALLET = 'merchant_wallet',
  TENANT_REVENUE = 'tenant_revenue',
  PLATFORM_FEES = 'platform_fees',
  PSP_CLEARING = 'psp_clearing',
  CASH_IN_TRANSIT = 'cash_in_transit',
}

export enum PaymentStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  SUCCEEDED = 'succeeded',
  FAILED = 'failed',
  REFUNDED = 'refunded',
}
