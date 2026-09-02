export const ACCESS_TOKEN_STORAGE_KEY = 'surexend_access_token'
export const REFRESH_TOKEN_STORAGE_KEY = 'surexend_refresh_token'

// This is a coordination signal, not a credential. It lets other open tabs
// leave the authenticated app when one tab signs out. The token values never
// go through the storage event.
export const AUTH_SESSION_CLEARED_STORAGE_KEY = 'surexend_auth_session_cleared'
const USER_SCOPED_STORAGE_KEYS = ['surexend_user_avatar']

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
      try {
        return decodeURIComponent(trimmed.slice(target.length))
      } catch {
        return null
      }
    }
  }
  return null
}

function accessCookieAttributes(maxAge: number): string {
  const attrs = ['path=/', `max-age=${maxAge}`, 'SameSite=Lax']
  if (typeof window !== 'undefined' && window.location.protocol === 'https:') {
    attrs.push('Secure')
  }
  return attrs.join('; ')
}

function getBrowserStorage(kind: 'session' | 'local'): Storage | null {
  if (typeof window === 'undefined') return null
  try {
    return kind === 'session' ? window.sessionStorage : window.localStorage
  } catch {
    return null
  }
}

function readStorage(storage: Storage | null, key: string): string | null {
  if (!storage) return null
  try {
    return storage.getItem(key)
  } catch {
    return null
  }
}

function removeStorage(storage: Storage | null, key: string) {
  if (!storage) return
  try {
    storage.removeItem(key)
  } catch {
    // Storage can be disabled by a browser privacy setting. Cookie cleanup
    // and the in-memory redirect still make sign-out safe in that case.
  }
}

function writeStorage(storage: Storage | null, key: string, value: string) {
  if (!storage) return
  try {
    storage.setItem(key, value)
  } catch {
    // The API call and cookie remain the source of truth when storage is full
    // or unavailable.
  }
}

export function getStoredAccessToken(): string | null {
  if (typeof window === 'undefined') return null
  let cookieSource = ''
  try {
    cookieSource = document.cookie
  } catch {
    // Some privacy modes deny cookie access; storage may still be available.
  }
  return (
    readStorage(getBrowserStorage('session'), ACCESS_TOKEN_STORAGE_KEY) ||
    readStorage(getBrowserStorage('local'), ACCESS_TOKEN_STORAGE_KEY) ||
    getCookieValue(cookieSource, ACCESS_TOKEN_STORAGE_KEY)
  )
}

export function getStoredRefreshToken(): string | null {
  if (typeof window === 'undefined') return null
  return readStorage(getBrowserStorage('local'), REFRESH_TOKEN_STORAGE_KEY)
}

export function storeAuthTokens(accessToken: string, refreshToken?: string) {
  if (typeof window === 'undefined') return
  writeStorage(getBrowserStorage('session'), ACCESS_TOKEN_STORAGE_KEY, accessToken)
  // Remove the legacy persistent access token if an older build left one
  // behind. Access tokens should not survive a tab closing.
  removeStorage(getBrowserStorage('local'), ACCESS_TOKEN_STORAGE_KEY)
  try {
    document.cookie = `${ACCESS_TOKEN_STORAGE_KEY}=${encodeURIComponent(accessToken)}; ${accessCookieAttributes(604800)}`
  } catch {
    // Continue; the sessionStorage token still authenticates API requests.
  }

  // Never retain a refresh token from a previous account if a token response
  // is incomplete. All current token-issuing endpoints return both tokens.
  if (refreshToken) {
    writeStorage(getBrowserStorage('local'), REFRESH_TOKEN_STORAGE_KEY, refreshToken)
  } else {
    removeStorage(getBrowserStorage('local'), REFRESH_TOKEN_STORAGE_KEY)
  }
}

function clearAccessCookie() {
  if (typeof document === 'undefined') return
  const expiry = 'expires=Thu, 01 Jan 1970 00:00:00 GMT'
  try {
    // Write both variants so a cookie created by an HTTP development build is
    // also removed after the app is promoted to HTTPS.
    document.cookie = `${ACCESS_TOKEN_STORAGE_KEY}=; path=/; max-age=0; ${expiry}; SameSite=Lax`
    if (typeof window !== 'undefined' && window.location.protocol === 'https:') {
      document.cookie = `${ACCESS_TOKEN_STORAGE_KEY}=; path=/; max-age=0; ${expiry}; SameSite=Lax; Secure`
    }
  } catch {
    // A blocked cookie jar must not prevent the local redirect.
  }
}

function clearPrivateServiceWorkerCache() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
  try {
    navigator.serviceWorker.controller?.postMessage({ type: 'CLEAR_PRIVATE_CACHE' })
  } catch {
    // Service workers are best-effort; the next version activation also
    // removes the old cache namespace.
  }
}

function broadcastAuthSessionCleared() {
  if (typeof window === 'undefined') return
  try {
    const signal = `${Date.now()}-${Math.random().toString(36).slice(2)}`
    window.localStorage.setItem(AUTH_SESSION_CLEARED_STORAGE_KEY, signal)
    window.localStorage.removeItem(AUTH_SESSION_CLEARED_STORAGE_KEY)
  } catch {
    // Cross-tab coordination is optional and must never block sign-out.
  }
}

export function subscribeToAuthSessionCleared(onCleared: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined

  const handleStorage = (event: StorageEvent) => {
    if (event.key === AUTH_SESSION_CLEARED_STORAGE_KEY && event.newValue) {
      onCleared()
    }
  }

  window.addEventListener('storage', handleStorage)
  return () => window.removeEventListener('storage', handleStorage)
}

export function clearStoredAuthSession() {
  if (typeof window === 'undefined') return

  // Capture this before removal so a second cleanup in an API finally block
  // does not emit duplicate cross-tab navigation signals.
  const hadSession = Boolean(getStoredAccessToken() || getStoredRefreshToken())

  removeStorage(getBrowserStorage('session'), ACCESS_TOKEN_STORAGE_KEY)
  const localStore = getBrowserStorage('local')
  removeStorage(localStore, ACCESS_TOKEN_STORAGE_KEY)
  removeStorage(localStore, REFRESH_TOKEN_STORAGE_KEY)
  // The current avatar is a user datum, not a device preference. It is stored
  // locally by the profile UI today, so clear it to prevent the next account
  // on a shared device from seeing the previous user's image.
  USER_SCOPED_STORAGE_KEYS.forEach((key) => removeStorage(localStore, key))
  clearAccessCookie()
  clearPrivateServiceWorkerCache()

  if (hadSession) broadcastAuthSessionCleared()
}

export function hasClientAuthSession(): boolean {
  if (typeof window === 'undefined') return false
  const accessToken = getStoredAccessToken()
  const refreshToken = getStoredRefreshToken()
  return Boolean((accessToken && !isJwtExpired(accessToken)) || refreshToken)
}
