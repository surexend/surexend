import type { Request, Response } from 'express';

export const ACCESS_TOKEN_COOKIE = 'surexend_access_token';
export const REFRESH_TOKEN_COOKIE = 'surexend_refresh_token';
export const OAUTH_STATE_COOKIE = 'surexend_oauth_state';

const ACCESS_MAX_AGE_MS = 15 * 60 * 1000;
const REFRESH_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function isProduction() {
  return process.env.NODE_ENV === 'production';
}

function parseCookies(header: string | undefined): Record<string, string> {
  if (!header) return {};
  return Object.fromEntries(
    header.split(';').flatMap((part) => {
      const separator = part.indexOf('=');
      if (separator <= 0) return [];
      const key = part.slice(0, separator).trim();
      const value = part.slice(separator + 1).trim();
      try {
        return [[key, decodeURIComponent(value)]];
      } catch {
        return [[key, value]];
      }
    }),
  );
}

export function readCookie(request: Request, name: string): string | undefined {
  return parseCookies(request.headers.cookie)[name];
}

export function setAuthCookies(response: Response, tokens: { accessToken: string; refreshToken: string }) {
  const secure = isProduction();
  response.cookie(ACCESS_TOKEN_COOKIE, tokens.accessToken, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: ACCESS_MAX_AGE_MS,
  });
  response.cookie(REFRESH_TOKEN_COOKIE, tokens.refreshToken, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    // The refresh credential is never needed by application routes.
    path: '/api/v1/auth',
    maxAge: REFRESH_MAX_AGE_MS,
  });
}

export function setOAuthStateCookie(response: Response, state: string) {
  response.cookie(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: isProduction(),
    sameSite: 'lax',
    path: '/api/v1/auth',
    maxAge: 10 * 60 * 1000,
  });
}

export function clearAuthCookies(response: Response) {
  const secure = isProduction();
  response.clearCookie(ACCESS_TOKEN_COOKIE, { httpOnly: true, secure, sameSite: 'lax', path: '/' });
  response.clearCookie(REFRESH_TOKEN_COOKIE, { httpOnly: true, secure, sameSite: 'lax', path: '/api/v1/auth' });
  response.clearCookie(OAUTH_STATE_COOKIE, { httpOnly: true, secure, sameSite: 'lax', path: '/api/v1/auth' });
}

/** Return auth response including tokens for Authorization header support */
export function publicAuthResponse<T extends { accessToken?: string; refreshToken?: string }>(value: T): T {
  return value;
}

/**
 * Passport's JWT extractor runs before a controller exists, so it cannot use
 * Nest's cookie decorators. Authorization headers remain supported for a
 * short migration window; new sessions are issued only as HttpOnly cookies.
 */
export function cookieTokenExtractor(request: Request | undefined): string | null {
  if (!request) return null;
  return readCookie(request, ACCESS_TOKEN_COOKIE) || null;
}
