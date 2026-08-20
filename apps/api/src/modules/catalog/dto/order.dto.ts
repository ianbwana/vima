import { IsArray, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Min, IsBoolean } from 'class-validator';

export class OrderItemInput {
  @IsUUID()
  catalogItemId: string;

  @IsNumber()
  @Min(1)
  quantity: number;

  @IsArray()
  @IsOptional()
  modifierIds?: string[];

  @IsBoolean()
  @IsOptional()
  substitutionAllowed?: boolean;
}

export class PlaceOrderDto {
  @IsUUID()
  merchantId: string;

  @IsArray()
  items: OrderItemInput[];

  @IsString()
  @IsOptional()
  deliveryAddress?: string;

  @IsNumber()
  @IsOptional()
  deliveryLat?: number;

  @IsNumber()
  @IsOptional()
  deliveryLng?: number;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsNumber()
  @IsOptional()
  deliveryFee?: number;

  @IsNumber()
  @IsOptional()
  tip?: number;

  @IsString()
  @IsOptional()
  currency?: string;
}
