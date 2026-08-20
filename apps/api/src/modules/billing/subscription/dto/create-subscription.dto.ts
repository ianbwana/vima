import { IsUUID, IsString, IsOptional } from 'class-validator';

export class CreateSubscriptionDto {
  @IsUUID()
  tenantId: string;

  @IsUUID()
  planId: string;

  @IsString()
  @IsOptional()
  stripeCustomerId?: string;
}
