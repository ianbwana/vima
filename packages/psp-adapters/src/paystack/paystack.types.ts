export interface PaystackCredentials {
  secretKey: string;
}

// --- API Response Types ---

export interface PaystackApiResponse<T> {
  status: boolean;
  message: string;
  data: T;
}

export interface PaystackTransactionInitData {
  authorization_url: string;
  access_code: string;
  reference: string;
}

export interface PaystackTransactionVerifyData {
  id: number;
  status: 'success' | 'failed' | 'abandoned';
  reference: string;
  amount: number;
  currency: string;
  customer: {
    id: number;
    email: string;
  };
  metadata?: Record<string, string>;
}

export interface PaystackCustomerData {
  id: number;
  customer_code: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
}

export interface PaystackTransferRecipientData {
  active: boolean;
  recipient_code: string;
  name: string;
  type: string;
}

export interface PaystackTransferData {
  id: number;
  transfer_code: string;
  reference: string;
  status: 'success' | 'pending' | 'failed';
  amount: number;
  currency: string;
}

export interface PaystackRefundData {
  id: number;
  status: 'pending' | 'processed' | 'failed';
  transaction: {
    id: number;
    reference: string;
  };
  amount: number;
}

// --- Webhook Event Types ---

export interface PaystackWebhookPayload {
  event: string;
  data: {
    id: number;
    reference: string;
    amount: number;
    currency: string;
    status: string;
    metadata?: Record<string, string>;
    transfer_code?: string;
    recipient?: {
      recipient_code: string;
    };
  };
}
