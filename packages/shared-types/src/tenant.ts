import { PlanTier, PlatformModule } from '@vima/config';

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  tier: PlanTier;
  status: TenantStatus;
  enabledModules: PlatformModule[];
  createdAt: Date;
  updatedAt: Date;
}

export enum TenantStatus {
  PENDING_VERIFICATION = 'pending_verification',
  PROVISIONING = 'provisioning',
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
  OFFBOARDING = 'offboarding',
}

export interface TenantTheme {
  tenantId: string;
  colors: {
    primary: string;
    onPrimary: string;
    secondary: string;
    surface: string;
    background: string;
    error: string;
  };
  typography: {
    fontFamily: string;
  };
  logo: {
    appIcon?: string;
    splash?: string;
    headerLight?: string;
    headerDark?: string;
  };
  radius: number;
  copy: {
    appName: string;
    tagline?: string;
    moduleLabels?: Record<string, string>;
  };
}

export interface TenantDomain {
  id: string;
  tenantId: string;
  domain: string;
  type: 'subdomain' | 'custom';
  verified: boolean;
  sslStatus: 'pending' | 'active' | 'failed';
}
