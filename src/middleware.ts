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

  const isAppRoute = pathname.startsWith('/app')
  const isAdminRoute = pathname.startsWith('/admin')
  const isAuthPage = AUTH_PAGES.has(pathname)
  const isAlwaysPublicAuthPage = ALWAYS_PUBLIC_AUTH_PREFIXES.some((prefix) => pathname.startsWith(prefix))

  if ((isAppRoute || isAdminRoute) && !hasAccessToken) {
    const loginUrl = new URL('/auth/login', request.url)
    loginUrl.searchParams.set('next', pathname)
    return NextResponse.redirect(loginUrl)
  }

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
