export const ACCESS_TOKEN_STORAGE_KEY = 'surexend_access_token'
export const REFRESH_TOKEN_STORAGE_KEY = 'surexend_refresh_token'

function decodeBase64Url(value: string): string | null {
  try {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=')
    if (typeof atob === 'function') {
      return atob(normalized)
    }
    if (typeof Buffer !== 'undefined') {
      return Buffer.from(normalized, 'base64').toString('utf8')
    }
    return null
  } catch {
    return null
  }
}

export function decodeJwtPayload<T = Record<string, unknown>>(token: string | null | undefined): T | null {
  if (!token) return null
  const [, payload] = token.split('.')
  if (!payload) return null
  const decoded = decodeBase64Url(payload)
  if (!decoded) return null
  try {
    return JSON.parse(decoded) as T
  } catch {
    return null
  }
}

export function isJwtExpired(token: string | null | undefined, skewSeconds = 15): boolean {
  if (!token) return true
  const payload = decodeJwtPayload<{ exp?: number }>(token)
  if (!payload?.exp) return true
  return payload.exp <= Math.floor(Date.now() / 1000) + skewSeconds
}

export function getCookieValue(cookieSource: string, name: string): string | null {
  const target = `${name}=`
  for (const part of cookieSource.split(';')) {
    const trimmed = part.trim()
    if (trimmed.startsWith(target)) {
      return decodeURIComponent(trimmed.slice(target.length))
    }
  }
  return null
}

function accessCookieAttributes(): string {
  const attrs = ['path=/', 'max-age=604800', 'SameSite=Lax']
  if (typeof window !== 'undefined' && window.location.protocol === 'https:') {
    attrs.push('Secure')
  }
  return attrs.join('; ')
}

export function getStoredAccessToken(): string | null {
  if (typeof window === 'undefined') return null
  return (
    window.sessionStorage.getItem(ACCESS_TOKEN_STORAGE_KEY) ||
    window.localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY) ||
    getCookieValue(document.cookie, ACCESS_TOKEN_STORAGE_KEY)
  )
}

export function getStoredRefreshToken(): string | null {
  if (typeof window === 'undefined') return null
  return window.localStorage.getItem(REFRESH_TOKEN_STORAGE_KEY)
}

export function storeAuthTokens(accessToken: string, refreshToken?: string) {
  if (typeof window === 'undefined') return
  window.sessionStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, accessToken)
  window.localStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY)
  document.cookie = `${ACCESS_TOKEN_STORAGE_KEY}=${encodeURIComponent(accessToken)}; ${accessCookieAttributes()}`
  if (refreshToken) {
    window.localStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, refreshToken)
  }
}

export function clearStoredAuthSession() {
  if (typeof window === 'undefined') return
  window.sessionStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY)
  window.localStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY)
  window.localStorage.removeItem(REFRESH_TOKEN_STORAGE_KEY)
  document.cookie = `${ACCESS_TOKEN_STORAGE_KEY}=; path=/; max-age=0; SameSite=Lax`
}

export function hasClientAuthSession(): boolean {
  if (typeof window === 'undefined') return false
  return Boolean(getStoredAccessToken() || getStoredRefreshToken())
}
