import { IsString, IsOptional, IsArray, IsIn, Matches, MinLength, MaxLength } from 'class-validator';

export class CreateTenantDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name: string;

  @IsString()
  @MinLength(3)
  @MaxLength(50)
  @Matches(/^[a-z0-9-]+$/, {
    message: 'Slug must contain only lowercase letters, numbers, and hyphens',
  })
  slug: string;

  @IsOptional()
  @IsIn(['starter', 'growth', 'scale'])
  tier?: 'starter' | 'growth' | 'scale';

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  enabledModules?: string[];
}
