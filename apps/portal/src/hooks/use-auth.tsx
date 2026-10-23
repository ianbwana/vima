'use client';

/**
 * Auth context and hook for managing authentication state in the portal.
 *
 * Provides:
 * - login(email, password) — authenticates against the API
 * - logout() — clears tokens and redirects to /login
 * - user — the decoded user from the JWT
 * - isAuthenticated — whether a valid session exists
 * - isLoading — true while initial session check is in progress
 */

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';
import {
  type AuthUser,
  type LoginCredentials,
  decodeJwtPayload,
  isPortalRole,
  REFRESH_TOKEN_COOKIE,
  SESSION_COOKIE,
} from '@/lib/auth';
import { apiClient, setTokens, clearTokens, getAccessToken } from '@/lib/api-client';

interface AuthContextValue {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (credentials: LoginCredentials) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function extractUserFromToken(token: string): AuthUser | null {
  const payload = decodeJwtPayload(token);
  if (!payload) return null;

  return {
    id: payload.sub as string,
    email: (payload.email as string) || '',
    name: (payload.name as string) || null,
    role: payload.role as string,
    tenantId: payload.tenantId as string,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  // On mount, attempt to restore session by refreshing the token
  useEffect(() => {
    const restoreSession = async () => {
      try {
        // Check if there's a session cookie (set during login)
        const hasSession = document.cookie.includes(SESSION_COOKIE);
        if (!hasSession) {
          setIsLoading(false);
          return;
        }

        // Try to get a fresh access token via refresh
        const res = await fetch('/api/auth/refresh', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken: getCookieValue(REFRESH_TOKEN_COOKIE) }),
        });

        if (res.ok) {
          const tokens = await res.json();
          setTokens(tokens);
          const decoded = extractUserFromToken(tokens.accessToken);
          if (decoded && isPortalRole(decoded.role)) {
            setUser(decoded);
          } else {
            clearTokens();
            clearSessionCookies();
          }
        } else {
          clearTokens();
          clearSessionCookies();
        }
      } catch {
        clearTokens();
        clearSessionCookies();
      } finally {
        setIsLoading(false);
      }
    };

    restoreSession();
  }, []);

  const login = useCallback(
    async (credentials: LoginCredentials) => {
      const data = await apiClient<{ accessToken: string; refreshToken: string }>(
        '/auth/login',
        {
          method: 'POST',
          body: credentials,
        },
      );

      setTokens(data);

      const decoded = extractUserFromToken(data.accessToken);
      if (!decoded) {
        clearTokens();
        throw new Error('Failed to decode authentication token');
      }

      if (!isPortalRole(decoded.role)) {
        clearTokens();
        throw new Error('Access denied. You need an admin, owner, ops, or finance role.');
      }

      // Store refresh token in cookie for middleware detection and refresh flow
      setSessionCookies(data.refreshToken);
      setUser(decoded);
      router.push('/overview');
    },
    [router],
  );

  const logout = useCallback(async () => {
    try {
      const token = getAccessToken();
      if (token) {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ refreshToken: getCookieValue(REFRESH_TOKEN_COOKIE) }),
        });
      }
    } catch {
      // Best-effort logout
    } finally {
      clearTokens();
      clearSessionCookies();
      setUser(null);
      router.push('/login');
    }
  }, [router]);

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

// --- Cookie helpers ---

function getCookieValue(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function setSessionCookies(refreshToken: string): void {
  if (typeof document === 'undefined') return;

  // Session flag cookie (readable by middleware and client)
  document.cookie = `${SESSION_COOKIE}=1; path=/; max-age=${7 * 24 * 60 * 60}; samesite=strict`;

  // Refresh token cookie
  document.cookie = `${REFRESH_TOKEN_COOKIE}=${encodeURIComponent(refreshToken)}; path=/; max-age=${7 * 24 * 60 * 60}; samesite=strict`;
}

function clearSessionCookies(): void {
  if (typeof document === 'undefined') return;
  document.cookie = `${SESSION_COOKIE}=; path=/; max-age=0`;
  document.cookie = `${REFRESH_TOKEN_COOKIE}=; path=/; max-age=0`;
}
