import {
  IsString,
  IsOptional,
  IsArray,
  ValidateNested,
  IsEnum,
  IsUUID,
  Matches,
  ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum LedgerAccountType {
  CUSTOMER_WALLET = 'customer_wallet',
  PROVIDER_WALLET = 'provider_wallet',
  MERCHANT_WALLET = 'merchant_wallet',
  TENANT_REVENUE = 'tenant_revenue',
  PLATFORM_FEES = 'platform_fees',
  PSP_CLEARING = 'psp_clearing',
  CASH_IN_TRANSIT = 'cash_in_transit',
}

export enum LedgerDirection {
  DEBIT = 'debit',
  CREDIT = 'credit',
}

export class LedgerEntryInput {
  @IsUUID()
  accountId: string;

  @IsString()
  @Matches(/^\d+(\.\d{1,2})?$/, {
    message: 'amount must be a positive decimal string with up to 2 decimal places',
  })
  amount: string;

  @IsEnum(LedgerDirection)
  direction: LedgerDirection;
}

export class CreateTransactionDto {
  @IsString()
  type: string; // 'topup' | 'p2p_transfer' | 'payout' | 'refund' | 'fare' | 'commission'

  @IsOptional()
  @IsUUID()
  referenceId?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsArray()
  @ArrayMinSize(2)
  @ValidateNested({ each: true })
  @Type(() => LedgerEntryInput)
  entries: LedgerEntryInput[];
}
