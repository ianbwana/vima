import { IsString, IsEnum, IsOptional } from 'class-validator';

export class UpdateSubscriptionItemsDto {
  @IsEnum(['add', 'remove'])
  action: 'add' | 'remove';

  @IsString()
  module: string;

  @IsString()
  @IsOptional()
  priceId?: string;

  @IsString()
  @IsOptional()
  price?: string;
}
