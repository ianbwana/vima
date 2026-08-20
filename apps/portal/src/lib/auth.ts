/**
 * Authentication utilities for the Tenant Portal.
 *
 * Strategy:
 * - Access token: stored in-memory (React context) to minimize XSS exposure
 * - Refresh token: stored in an httpOnly cookie (set by the server-side refresh flow)
 *
 * The access token is short-lived (~15m). When it expires the API client
 * transparently calls /auth/refresh using the refresh token cookie.
 */

// Cookie name for the refresh token (httpOnly, sameSite=strict)
export const REFRESH_TOKEN_COOKIE = 'vima_refresh_token';

// Cookie name for a lightweight "session exists" flag (readable by middleware)
export const SESSION_COOKIE = 'vima_session';

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  role: string;
  tenantId: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

/**
 * Roles allowed to access the tenant portal.
 */
export const PORTAL_ALLOWED_ROLES = ['owner', 'admin', 'ops', 'finance'] as const;
export type PortalRole = (typeof PORTAL_ALLOWED_ROLES)[number];

export function isPortalRole(role: string): role is PortalRole {
  return PORTAL_ALLOWED_ROLES.includes(role as PortalRole);
}

/**
 * Decode a JWT payload without verification (for client-side token inspection).
 * The actual verification happens server-side in the API.
 */
export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const [, payload] = token.split('.');
    if (!payload) return null;
    const decoded = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

/**
 * Check if a JWT is expired (with a 30-second buffer for clock skew).
 */
export function isTokenExpired(token: string): boolean {
  const payload = decodeJwtPayload(token);
  if (!payload || typeof payload.exp !== 'number') return true;
  return Date.now() >= (payload.exp - 30) * 1000;
}
