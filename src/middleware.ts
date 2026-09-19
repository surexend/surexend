import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { ACCESS_TOKEN_STORAGE_KEY, isJwtExpired } from '@/lib/auth-session'

const AUTH_PAGES = new Set(['/auth/login', '/auth/register'])
const ALWAYS_PUBLIC_AUTH_PREFIXES = ['/auth/forgot-password', '/auth/reset-password', '/auth/verify-otp', '/auth/oauth-callback']

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const token = request.cookies.get(ACCESS_TOKEN_STORAGE_KEY)?.value || null
  const hasAccessToken = Boolean(token)
  const hasFreshAccessToken = hasAccessToken && !isJwtExpired(token)

  const isAlwaysPublicAuthPage = ALWAYS_PUBLIC_AUTH_PREFIXES.some((prefix) => pathname.startsWith(prefix))
  const isAuthPage = AUTH_PAGES.has(pathname)

  // If the user has a fresh token and tries to visit a login/register page,
  // send them to the app. All other auth is handled client-side via
  // hasClientAuthSession() and the API 401 interceptor — this avoids a race
  // where the HttpOnly cookie lands after the middleware check fires.
  if (isAuthPage && hasFreshAccessToken) {
    return NextResponse.redirect(new URL('/app/dashboard', request.url))
  }

  if (pathname.startsWith('/auth') && !isAlwaysPublicAuthPage && !isAuthPage && hasFreshAccessToken) {
    return NextResponse.redirect(new URL('/app/dashboard', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/app/:path*', '/admin/:path*', '/auth/:path*'],
}
