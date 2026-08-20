export enum UserRole {
  PLATFORM_ADMIN = 'platform_admin',
  TENANT_OWNER = 'tenant_owner',
  TENANT_ADMIN = 'tenant_admin',
  TENANT_OPS = 'tenant_ops',
  TENANT_FINANCE = 'tenant_finance',
  TENANT_SUPPORT = 'tenant_support',
  CUSTOMER = 'customer',
  PROVIDER = 'provider',
  MERCHANT = 'merchant',
}

export interface JwtPayload {
  sub: string; // user id
  tenantId: string;
  role: UserRole;
  iat: number;
  exp: number;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}
