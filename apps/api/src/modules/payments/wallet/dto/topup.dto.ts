import {
  IsString,
  IsNumber,
  IsPositive,
  IsOptional,
  IsObject,
} from 'class-validator';

/**
 * Input DTO for initiating a wallet top-up.
 * The caller provides the amount, currency, and their PSP customer ID.
 */
export class TopupDto {
  @IsNumber()
  @IsPositive()
  amount: number;

  @IsString()
  currency: string;

  @IsString()
  customerId: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, string>;
}

/**
 * Response returned after initiating a top-up.
 * Contains the payment intent details needed for client-side confirmation.
 */
export class TopupResponseDto {
  /** The PSP payment intent ID for tracking */
  paymentIntentId: string;

  /** Client secret for Stripe or authorization URL for Paystack */
  clientSecret: string;

  /** Status of the payment intent (e.g., 'requires_confirmation', 'pending') */
  status: string;
}

/**
 * Input for completing a top-up after webhook confirmation.
 * Called internally by the webhook processor, not exposed via REST.
 */
export class CompleteTopupDto {
  /** The tenant the payment belongs to */
  tenantId: string;

  /** The user whose wallet to credit */
  userId: string;

  /** Amount in minor units (cents) as received from PSP */
  amount: number;

  /** Currency code */
  currency: string;

  /** PSP provider reference for audit trail */
  providerReference: string;
}
