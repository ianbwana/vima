'use client';

/**
 * Minimal client-side auth for the Vima platform admin portal.
 *
 * Stores the platform-admin JWT in localStorage so it survives reloads, and
 * provides an authed fetch wrapper that attaches the Bearer token and redirects
 * to /login on 401.
 */

const TOKEN_KEY = 'vima_admin_access_token';
const REFRESH_KEY = 'vima_admin_refresh_token';

export interface AdminTokens {
  accessToken: string;
  refreshToken: string;
}

export function setAdminTokens(tokens: AdminTokens): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(TOKEN_KEY, tokens.accessToken);
  localStorage.setItem(REFRESH_KEY, tokens.refreshToken);
}

export function getAdminToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function clearAdminTokens(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
}

export function isAdminAuthenticated(): boolean {
  return !!getAdminToken();
}

/**
 * Log in as a platform admin. Returns true on success.
 */
export async function adminLogin(email: string, password: string): Promise<boolean> {
  const res = await fetch('/api/platform-admin/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) return false;
  const tokens: AdminTokens = await res.json();
  setAdminTokens(tokens);
  return true;
}

/**
 * Authenticated fetch against the API (proxied through /api/*).
 * Attaches the platform-admin Bearer token. On 401, clears tokens and
 * redirects to the login page.
 */
export async function adminFetch<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getAdminToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`/api${path}`, { ...options, headers });

  if (res.status === 401) {
    clearAdminTokens();
    if (typeof window !== 'undefined') {
      window.location.href = '/login';
    }
    throw new Error('Session expired');
  }

  if (!res.ok) {
    let message = `Request failed with status ${res.status}`;
    try {
      const body = await res.json();
      message = body.message || message;
    } catch {
      // non-JSON response
    }
    throw new Error(message);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}
