import { IsBoolean, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class CreateVehicleClassDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  iconUrl?: string;

  @IsNumber()
  @Min(1)
  capacity: number;

  @IsNumber()
  @IsOptional()
  sortOrder?: number;
}

export class UpdateVehicleClassDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  iconUrl?: string;

  @IsNumber()
  @IsOptional()
  capacity?: number;

  @IsNumber()
  @IsOptional()
  sortOrder?: number;

  @IsBoolean()
  @IsOptional()
  active?: boolean;
}

export class CreateFareRuleDto {
  @IsUUID()
  zoneId: string;

  @IsUUID()
  vehicleClassId: string;

  @IsNumber()
  @Min(0)
  baseFare: number;

  @IsNumber()
  @Min(0)
  perKm: number;

  @IsNumber()
  @Min(0)
  perMinute: number;

  @IsNumber()
  @Min(0)
  minimumFare: number;

  @IsNumber()
  @Min(1)
  @IsOptional()
  surgeMultiplier?: number;

  @IsString()
  @IsOptional()
  currency?: string;

  @IsNumber()
  @Min(0)
  @IsOptional()
  commissionRate?: number;
}

export class UpdateFareRuleDto {
  @IsNumber()
  @IsOptional()
  baseFare?: number;

  @IsNumber()
  @IsOptional()
  perKm?: number;

  @IsNumber()
  @IsOptional()
  perMinute?: number;

  @IsNumber()
  @IsOptional()
  minimumFare?: number;

  @IsNumber()
  @IsOptional()
  surgeMultiplier?: number;

  @IsNumber()
  @IsOptional()
  commissionRate?: number;
}

export class CreateZoneDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  boundary: Record<string, unknown>; // GeoJSON polygon
}
