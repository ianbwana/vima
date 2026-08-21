import { IsBoolean, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';

// --- Merchant DTOs ---

export class CreateMerchantDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  logoUrl?: string;

  @IsString()
  @IsOptional()
  coverUrl?: string;

  @IsString()
  @IsOptional()
  address?: string;

  @IsNumber()
  @IsOptional()
  locationLat?: number;

  @IsNumber()
  @IsOptional()
  locationLng?: number;

  @IsUUID()
  @IsOptional()
  zoneId?: string;

  @IsString()
  @IsOptional()
  category?: string; // 'restaurant', 'grocery_store'

  @IsNumber()
  @IsOptional()
  commissionRate?: number;
}

export class UpdateMerchantDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  logoUrl?: string;

  @IsString()
  @IsOptional()
  coverUrl?: string;

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
  status?: 'active' | 'suspended' | 'closed';

  @IsNumber()
  @IsOptional()
  commissionRate?: number;
}

// --- Catalog DTOs ---

export class CreateCatalogDto {
  @IsUUID()
  merchantId: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsNumber()
  @IsOptional()
  sortOrder?: number;
}

export class CreateCatalogItemDto {
  @IsUUID()
  catalogId: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  imageUrl?: string;

  @IsNumber()
  @Min(0)
  price: number;

  @IsString()
  @IsOptional()
  currency?: string;

  @IsNumber()
  @IsOptional()
  sortOrder?: number;

  // Grocery-specific
  @IsString()
  @IsOptional()
  unit?: 'piece' | 'kg' | 'g' | 'l' | 'ml';

  @IsBoolean()
  @IsOptional()
  weightBased?: boolean;

  @IsNumber()
  @IsOptional()
  avgWeight?: number;

  @IsString()
  @IsOptional()
  sku?: string;
}

export class UpdateCatalogItemDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  imageUrl?: string;

  @IsNumber()
  @IsOptional()
  price?: number;

  @IsBoolean()
  @IsOptional()
  available?: boolean;

  @IsNumber()
  @IsOptional()
  sortOrder?: number;
}

// --- Modifier DTOs ---

export class CreateModifierGroupDto {
  @IsUUID()
  catalogItemId: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsBoolean()
  @IsOptional()
  required?: boolean;

  @IsNumber()
  @IsOptional()
  minSelect?: number;

  @IsNumber()
  @IsOptional()
  maxSelect?: number;
}

export class CreateModifierDto {
  @IsUUID()
  modifierGroupId: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsNumber()
  @IsOptional()
  price?: number;
}
