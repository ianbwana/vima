import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Next.js middleware to protect portal routes.
 * Checks for the refresh token cookie on protected routes.
 * If absent, redirects to the login page.
 */

// Routes that do not require authentication
const PUBLIC_ROUTES = ['/login'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip auth check for public routes
  if (PUBLIC_ROUTES.some((route) => pathname.startsWith(route))) {
    return NextResponse.next();
  }

  // Check for the refresh token cookie (presence indicates an active session)
  const refreshToken = request.cookies.get('refreshToken');

  if (!refreshToken) {
    const loginUrl = new URL('/login', request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  // Run middleware on all routes except static assets and API routes
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/).*)'],
};
