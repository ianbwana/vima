import { IsString, IsUUID, IsOptional, IsNumber, IsPositive } from 'class-validator';

/**
 * DTO for initiating a wallet refund.
 * Used by admins to refund a completed payment back to the customer.
 */
export class RefundDto {
  /** The PSP payment ID to refund */
  @IsString()
  paymentId: string;

  /** The user whose wallet to debit (refund source) */
  @IsUUID()
  userId: string;

  /** Amount to refund in minor units (cents). Omit for full refund. */
  @IsOptional()
  @IsNumber()
  @IsPositive()
  amount?: number;

  @IsString()
  currency: string;

  @IsOptional()
  @IsString()
  reason?: string;
}

/**
 * Response returned after a refund is processed.
 */
export class RefundResponseDto {
  /** The ledger transaction ID for the refund entries */
  transactionId: string;

  /** The PSP refund ID returned by the adapter */
  pspRefundId: string;

  /** Status from the PSP (e.g., 'succeeded', 'pending') */
  status: string;
}
