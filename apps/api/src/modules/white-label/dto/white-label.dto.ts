import { IsBoolean, IsNotEmpty, IsNumber, IsObject, IsOptional, IsString, IsUUID } from 'class-validator';

// --- Theme DTOs ---

export interface ThemeTokens {
  colors: {
    primary: string;
    onPrimary: string;
    secondary?: string;
    surface?: string;
    background?: string;
    error?: string;
  };
  typography: {
    fontFamily: string;
  };
  logos: {
    appIcon?: string;
    splash?: string;
    headerLight?: string;
    headerDark?: string;
  };
  radius?: string;
  copy?: {
    appName: string;
    tagline?: string;
    moduleLabels?: Record<string, string>;
  };
}

export class SaveThemeDto {
  @IsObject()
  tokens: ThemeTokens;

  @IsBoolean()
  @IsOptional()
  publish?: boolean;
}

// --- Domain DTOs ---

export class AddDomainDto {
  @IsString()
  @IsNotEmpty()
  domain: string;
}

// --- App Build DTOs ---

export class TriggerBuildDto {
  @IsString()
  platform: 'ios' | 'android';

  @IsObject()
  @IsOptional()
  config?: Record<string, unknown>;
}

// --- Asset DTOs ---

export class UploadAssetDto {
  @IsString()
  type: 'logo' | 'splash' | 'icon' | 'hero' | 'guideline' | 'app_icon' | 'favicon';

  @IsString()
  @IsNotEmpty()
  url: string;

  @IsObject()
  @IsOptional()
  metadata?: Record<string, unknown>;
}
