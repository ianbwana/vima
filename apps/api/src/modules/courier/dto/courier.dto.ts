import { IsBoolean, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class SendParcelDto {
  @IsString()
  @IsNotEmpty()
  recipientName: string;

  @IsString()
  @IsNotEmpty()
  recipientPhone: string;

  @IsString()
  packageCategory: 'document' | 'small' | 'medium' | 'large';

  @IsNumber()
  @IsOptional()
  weightKg?: number;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  specialInstructions?: string;

  @IsString()
  @IsNotEmpty()
  pickupAddress: string;

  @IsNumber()
  pickupLat: number;

  @IsNumber()
  pickupLng: number;

  @IsString()
  @IsNotEmpty()
  dropoffAddress: string;

  @IsNumber()
  dropoffLat: number;

  @IsNumber()
  dropoffLng: number;

  @IsNumber()
  @IsOptional()
  codAmount?: number;
}

export class ConfirmPickupDto {
  @IsUUID()
  parcelId: string;
}

export class ConfirmDeliveryDto {
  @IsUUID()
  parcelId: string;

  @IsString()
  @IsOptional()
  proofPhotoUrl?: string;

  @IsString()
  @IsOptional()
  recipientOtp?: string;

  @IsBoolean()
  @IsOptional()
  codCollected?: boolean;
}
