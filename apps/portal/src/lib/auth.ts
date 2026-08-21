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

import { setTokens } from './api-client';

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
 * Custom error class for auth failures.
 */
export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthError';
  }
}

/**
 * Sign in with email and password.
 * Calls the API login endpoint, stores tokens, and sets session cookie.
 */
export async function signIn(email: string, password: string): Promise<void> {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Tenant-Id': getTenantId(),
    },
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new AuthError(body.message || 'Invalid email or password.');
  }

  const data: AuthTokens = await res.json();

  // Store tokens in memory for API client
  setTokens(data);

  // Set session cookie for middleware (lightweight flag, not the actual token)
  document.cookie = `${SESSION_COOKIE}=1; path=/; max-age=${7 * 24 * 60 * 60}; samesite=strict`;
}

/**
 * Get the tenant ID for the current context.
 * In production this would be resolved from the subdomain.
 * For local development, uses a default demo tenant.
 */
function getTenantId(): string {
  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    // If running on a subdomain (e.g., demo.vima.app), extract slug
    if (host.includes('.') && !host.startsWith('localhost')) {
      // Would resolve via API in production
    }
  }
  // Default demo tenant for local development
  return 'demo';
}

/**
 * Sign out — clear tokens and session cookie.
 */
export async function signOut(): Promise<void> {
  document.cookie = `${SESSION_COOKIE}=; path=/; max-age=0`;
  // Clear in-memory tokens (import dynamically to avoid circular)
  const { clearTokens } = await import('./api-client');
  clearTokens();
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
