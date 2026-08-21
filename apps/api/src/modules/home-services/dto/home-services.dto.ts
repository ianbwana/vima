import { IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class CreateBookingDto {
  @IsUUID()
  categoryId: string;

  @IsUUID()
  @IsOptional()
  priceCardId?: string;

  @IsString()
  @IsNotEmpty()
  scheduledDate: string; // YYYY-MM-DD

  @IsString()
  @IsNotEmpty()
  scheduledTime: string; // HH:MM

  @IsNumber()
  @IsOptional()
  durationHours?: number;

  @IsString()
  @IsOptional()
  address?: string;

  @IsNumber()
  @IsOptional()
  locationLat?: number;

  @IsNumber()
  @IsOptional()
  locationLng?: number;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsString()
  @IsOptional()
  currency?: string;
}

export class SubmitQuoteDto {
  @IsUUID()
  bookingId: string;

  @IsNumber()
  @Min(0)
  price: number;

  @IsString()
  @IsOptional()
  description?: string;

  @IsNumber()
  @IsOptional()
  validUntilDays?: number;
}

export class CreateServiceCategoryDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsUUID()
  @IsOptional()
  parentId?: string;

  @IsString()
  @IsOptional()
  iconUrl?: string;

  @IsNumber()
  @IsOptional()
  sortOrder?: number;
}

export class CreatePriceCardDto {
  @IsUUID()
  categoryId: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  type: 'fixed' | 'hourly' | 'quote';

  @IsNumber()
  @IsOptional()
  price?: number;

  @IsNumber()
  @IsOptional()
  minDurationHours?: number;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  currency?: string;
}
