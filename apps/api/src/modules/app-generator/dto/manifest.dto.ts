import { IsArray, IsBoolean, IsNotEmpty, IsNumber, IsObject, IsOptional, IsString, IsUUID, Min } from 'class-validator';

/**
 * Theme tokens subset for the manifest.
 */
export interface ManifestTheme {
  colors: { primary: string; onPrimary: string; secondary?: string; surface?: string; background?: string; error?: string };
  typography: { fontFamily: string };
  radius?: string;
  darkMode?: 'auto' | 'light' | 'dark';
}

/**
 * Full build manifest structure (immutable per version).
 */
export interface BuildManifestDocument {
  version: number;
  surface: 'customer' | 'provider';
  identity: {
    appName: string;
    bundleId: string;
    deepLinkDomain: string;
    developerAccountMode: 'platform_managed' | 'tenant_owned';
    defaultEnvironment: 'production' | 'demo';
  };
  features: {
    enabledModules: string[];
    derivedJobTypes: string[];
    flags: Record<string, boolean>;
    layoutPreset: string;
    locales: string[];
  };
  theme: ManifestTheme;
  assets: {
    iconHash: string;
    splashHash?: string;
    notificationIconHash?: string;
    onboardingImages: string[];
    providerIconHash?: string;
    assetPackHash: string;
  };
  sounds: {
    events: Record<string, { source: 'library' | 'custom'; id: string }>;
  };
  endpoints: {
    configUrl: string;
    bakedBinding: { tenantId: string; surface: string; environment: string };
    platformPublicKey: string;
  };
  keyGrants: Record<string, string>;
  storeListing?: {
    descriptions: Record<string, { short: string; full: string }>;
    keywords: string[];
    category: string;
    privacyPolicyUrl: string;
    supportUrl?: string;
    marketingUrl?: string;
  };
}

/**
 * DTO for saving/updating a manifest draft.
 */
export class SaveManifestDto {
  @IsString()
  surface: 'customer' | 'provider';

  @IsObject()
  identity: BuildManifestDocument['identity'];

  @IsObject()
  features: BuildManifestDocument['features'];

  @IsObject()
  theme: ManifestTheme;

  @IsObject()
  assets: BuildManifestDocument['assets'];

  @IsObject()
  sounds: BuildManifestDocument['sounds'];

  @IsObject()
  @IsOptional()
  storeListing?: BuildManifestDocument['storeListing'];
}

/**
 * DTO for triggering a build.
 */
export class TriggerBuildDto {
  @IsString()
  surface: 'customer' | 'provider';

  @IsNumber()
  @IsOptional()
  manifestVersion?: number; // defaults to latest
}

/**
 * DTO for publishing a demo.
 */
export class PublishDemoDto {
  @IsArray()
  surfaces: Array<'customer' | 'provider'>;

  @IsBoolean()
  @IsOptional()
  paired?: boolean; // create cohort for two-device demo
}

/**
 * DTO for uploading an asset.
 */
export class UploadAssetDto {
  @IsString()
  kind: 'logo' | 'icon' | 'splash' | 'notification_icon' | 'onboarding' | 'sound';

  @IsString()
  @IsOptional()
  surfaceVariant?: 'shared' | 'customer' | 'provider';

  @IsString()
  @IsNotEmpty()
  url: string;

  @IsString()
  @IsNotEmpty()
  hash: string;

  @IsBoolean()
  @IsOptional()
  rightsDeclaration?: boolean;
}
