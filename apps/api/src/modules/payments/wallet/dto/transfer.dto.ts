import { IsString, IsUUID, Matches } from 'class-validator';

/**
 * DTO for P2P wallet transfer requests.
 */
export class TransferDto {
  @IsUUID()
  senderId: string;

  @IsUUID()
  recipientId: string;

  @IsString()
  @Matches(/^\d+(\.\d{1,2})?$/, {
    message: 'amount must be a positive decimal string with up to 2 decimal places',
  })
  amount: string;

  @IsString()
  currency: string;
}
