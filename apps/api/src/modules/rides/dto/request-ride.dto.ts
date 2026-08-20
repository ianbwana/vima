import { IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class RequestRideDto {
  @IsNumber()
  pickupLat: number;

  @IsNumber()
  pickupLng: number;

  @IsString()
  @IsOptional()
  pickupAddress?: string;

  @IsNumber()
  dropoffLat: number;

  @IsNumber()
  dropoffLng: number;

  @IsString()
  @IsOptional()
  dropoffAddress?: string;

  @IsUUID()
  vehicleClassId: string;

  @IsString()
  @IsOptional()
  paymentMethod?: 'wallet' | 'card' | 'cash';
}

export class FareEstimateDto {
  @IsNumber()
  pickupLat: number;

  @IsNumber()
  pickupLng: number;

  @IsNumber()
  dropoffLat: number;

  @IsNumber()
  dropoffLng: number;

  @IsUUID()
  @IsOptional()
  vehicleClassId?: string;
}

export class CancelRideDto {
  @IsString()
  @IsOptional()
  reason?: string;
}

export class RateRideDto {
  @IsNumber()
  @Min(1)
  score: number; // 1-5

  @IsString()
  @IsOptional()
  comment?: string;
}
