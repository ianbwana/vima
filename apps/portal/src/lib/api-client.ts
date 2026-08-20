/**
 * Fetch wrapper for API communication.
 *
 * - Attaches Bearer token from the in-memory store
 * - On 401, attempts a silent refresh via /api/auth/refresh (proxied through Next.js rewrites)
 * - Retries the original request once after a successful refresh
 * - If refresh fails, redirects to /login
 */

import { isTokenExpired, type AuthTokens } from './auth';

// Module-level token store (lives in browser memory only)
let accessToken: string | null = null;
let refreshToken: string | null = null;
let refreshPromise: Promise<boolean> | null = null;

/**
 * Set tokens in the in-memory store. Called after login/refresh.
 */
export function setTokens(tokens: AuthTokens): void {
  accessToken = tokens.accessToken;
  refreshToken = tokens.refreshToken;
}

/**
 * Get the current access token (for external use, e.g. SSE headers).
 */
export function getAccessToken(): string | null {
  return accessToken;
}

/**
 * Clear tokens from memory (on logout or auth failure).
 */
export function clearTokens(): void {
  accessToken = null;
  refreshToken = null;
}

/**
 * Attempt to refresh the access token using the stored refresh token.
 * Deduplicates concurrent refresh calls.
 */
async function attemptRefresh(): Promise<boolean> {
  if (!refreshToken) return false;

  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    try {
      const res = await fetch('/api/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });

      if (!res.ok) {
        clearTokens();
        return false;
      }

      const data: AuthTokens = await res.json();
      setTokens(data);
      return true;
    } catch {
      clearTokens();
      return false;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

export interface ApiRequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Make an authenticated API request.
 *
 * The path is relative to the API base (proxied through Next.js rewrites at /api/*).
 * Example: apiClient('/dashboard/metrics') → GET /api/dashboard/metrics
 */
export async function apiClient<T = unknown>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<T> {
  const { body, headers: customHeaders, ...rest } = options;

  // Proactively refresh if the token is about to expire
  if (accessToken && isTokenExpired(accessToken)) {
    await attemptRefresh();
  }

  const makeRequest = () => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(customHeaders as Record<string, string>),
    };

    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`;
    }

    return fetch(`/api${path}`, {
      ...rest,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  };

  let res = await makeRequest();

  // On 401, attempt refresh and retry once
  if (res.status === 401 && refreshToken) {
    const refreshed = await attemptRefresh();
    if (refreshed) {
      res = await makeRequest();
    } else {
      // Refresh failed — redirect to login
      if (typeof window !== 'undefined') {
        window.location.href = '/login';
      }
      throw new ApiError(401, 'UNAUTHORIZED', 'Session expired');
    }
  }

  if (!res.ok) {
    let errorBody: { code?: string; message?: string } = {};
    try {
      errorBody = await res.json();
    } catch {
      // Response may not be JSON
    }
    throw new ApiError(
      res.status,
      errorBody.code || 'UNKNOWN_ERROR',
      errorBody.message || `Request failed with status ${res.status}`,
    );
  }

  // Handle 204 No Content
  if (res.status === 204) {
    return undefined as T;
  }

  return res.json() as Promise<T>;
}
