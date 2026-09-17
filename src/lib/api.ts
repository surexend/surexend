import axios, { AxiosError } from 'axios'
import { withRetry } from './utils'
import toast from 'react-hot-toast'
import {
  getStoredAccessToken,
  getStoredRefreshToken,
  storeAuthTokens,
  clearStoredAuthSession,
} from './auth-session'

// African local currencies (mirrors backend SUPPORTED_LOCAL_CURRENCIES).
// `countryCode` renders a cross-platform flag badge (Windows doesn't render
// flag emoji). `country` powers the picker search by country name.
export const AFRICAN_CURRENCIES = [
  { code: 'NGN', name: 'Nigerian Naira', symbol: '₦', country: 'Nigeria', countryCode: 'NG', flag: '🇳🇬', rate: 1500 },
  { code: 'GHS', name: 'Ghanaian Cedi', symbol: 'GH₵', country: 'Ghana', countryCode: 'GH', flag: '🇬🇭', rate: 15.8 },
  { code: 'KES', name: 'Kenyan Shilling', symbol: 'KSh', country: 'Kenya', countryCode: 'KE', flag: '🇰🇪', rate: 129.5 },
  { code: 'ZAR', name: 'South African Rand', symbol: 'R', country: 'South Africa', countryCode: 'ZA', flag: '🇿🇦', rate: 18.2 },
  { code: 'UGX', name: 'Ugandan Shilling', symbol: 'USh', country: 'Uganda', countryCode: 'UG', flag: '🇺🇬', rate: 3680 },
  { code: 'TZS', name: 'Tanzanian Shilling', symbol: 'TSh', country: 'Tanzania', countryCode: 'TZ', flag: '🇹🇿', rate: 2650 },
  { code: 'EGP', name: 'Egyptian Pound', symbol: 'E£', country: 'Egypt', countryCode: 'EG', flag: '🇪🇬', rate: 48.2 },
  { code: 'MAD', name: 'Moroccan Dirham', symbol: 'DH', country: 'Morocco', countryCode: 'MA', flag: '🇲🇦', rate: 10.1 },
  { code: 'ETB', name: 'Ethiopian Birr', symbol: 'Br', country: 'Ethiopia', countryCode: 'ET', flag: '🇪🇹', rate: 57.2 },
  { code: 'RWF', name: 'Rwandan Franc', symbol: 'FRw', country: 'Rwanda', countryCode: 'RW', flag: '🇷🇼', rate: 1320 },
  { code: 'ZMW', name: 'Zambian Kwacha', symbol: 'K', country: 'Zambia', countryCode: 'ZM', flag: '🇿🇲', rate: 26.4 },
  { code: 'MZN', name: 'Mozambican Metical', symbol: 'MT', country: 'Mozambique', countryCode: 'MZ', flag: '🇲🇿', rate: 64.2 },
  { code: 'BWP', name: 'Botswana Pula', symbol: 'P', country: 'Botswana', countryCode: 'BW', flag: '🇧🇼', rate: 13.7 },
  { code: 'AOA', name: 'Angolan Kwanza', symbol: 'Kz', country: 'Angola', countryCode: 'AO', flag: '🇦🇴', rate: 830 },
  { code: 'CDF', name: 'Congolese Franc', symbol: 'FC', country: 'DR Congo', countryCode: 'CD', flag: '🇨🇩', rate: 2850 },
  { code: 'TND', name: 'Tunisian Dinar', symbol: 'DT', country: 'Tunisia', countryCode: 'TN', flag: '🇹🇳', rate: 3.1 },
  { code: 'DZD', name: 'Algerian Dinar', symbol: 'DA', country: 'Algeria', countryCode: 'DZ', flag: '🇩🇿', rate: 134.5 },
  { code: 'LYD', name: 'Libyan Dinar', symbol: 'LD', country: 'Libya', countryCode: 'LY', flag: '🇱🇾', rate: 4.85 },
  { code: 'SDG', name: 'Sudanese Pound', symbol: 'SD', country: 'Sudan', countryCode: 'SD', flag: '🇸🇩', rate: 600 },
  { code: 'SSP', name: 'South Sudanese Pound', symbol: 'SS', country: 'South Sudan', countryCode: 'SS', flag: '🇸🇸', rate: 1300 },
  { code: 'SOS', name: 'Somali Shilling', symbol: 'Sh', country: 'Somalia', countryCode: 'SO', flag: '🇸🇴', rate: 57000 },
  { code: 'DJF', name: 'Djiboutian Franc', symbol: 'Fdj', country: 'Djibouti', countryCode: 'DJ', flag: '🇩🇯', rate: 177.5 },
  { code: 'ERN', name: 'Eritrean Nakfa', symbol: 'Nfk', country: 'Eritrea', countryCode: 'ER', flag: '🇪🇷', rate: 15.2 },
  { code: 'MRU', name: 'Mauritanian Ouguiya', symbol: 'UM', country: 'Mauritania', countryCode: 'MR', flag: '🇲🇷', rate: 40.1 },
  { code: 'MGA', name: 'Malagasy Ariary', symbol: 'Ar', country: 'Madagascar', countryCode: 'MG', flag: '🇲🇬', rate: 4550 },
  { code: 'MWK', name: 'Malawian Kwacha', symbol: 'MK', country: 'Malawi', countryCode: 'MW', flag: '🇲🇼', rate: 1750 },
  { code: 'NAD', name: 'Namibian Dollar', symbol: 'N$', country: 'Namibia', countryCode: 'NA', flag: '🇳🇦', rate: 18.2 },
  { code: 'LSL', name: 'Lesotho Loti', symbol: 'L', country: 'Lesotho', countryCode: 'LS', flag: '🇱🇸', rate: 18.2 },
  { code: 'SZL', name: 'Swazi Lilangeni', symbol: 'E', country: 'Eswatini', countryCode: 'SZ', flag: '🇸🇿', rate: 18.2 },
  { code: 'MUR', name: 'Mauritian Rupee', symbol: 'Rs', country: 'Mauritius', countryCode: 'MU', flag: '🇲🇺', rate: 46.4 },
  { code: 'SCR', name: 'Seychellois Rupee', symbol: 'SR', country: 'Seychelles', countryCode: 'SC', flag: '🇸🇨', rate: 13.6 },
  { code: 'KMF', name: 'Comorian Franc', symbol: 'CF', country: 'Comoros', countryCode: 'KM', flag: '🇰🇲', rate: 490 },
  { code: 'CVE', name: 'Cape Verdean Escudo', symbol: '$', country: 'Cape Verde', countryCode: 'CV', flag: '🇨🇻', rate: 110 },
  { code: 'STN', name: 'São Tomé Dobra', symbol: 'Db', country: 'São Tomé and Príncipe', countryCode: 'ST', flag: '🇸🇹', rate: 22.5 },
  { code: 'GMD', name: 'Gambian Dalasi', symbol: 'D', country: 'Gambia', countryCode: 'GM', flag: '🇬🇲', rate: 67 },
  { code: 'SLL', name: 'Sierra Leonean Leone', symbol: 'Le', country: 'Sierra Leone', countryCode: 'SL', flag: '🇸🇱', rate: 22500 },
  { code: 'LRD', name: 'Liberian Dollar', symbol: 'L$', country: 'Liberia', countryCode: 'LR', flag: '🇱🇷', rate: 155 },
  { code: 'GNF', name: 'Guinean Franc', symbol: 'FG', country: 'Guinea', countryCode: 'GN', flag: '🇬🇳', rate: 8600 },
  { code: 'BIF', name: 'Burundian Franc', symbol: 'FBu', country: 'Burundi', countryCode: 'BI', flag: '🇧🇮', rate: 2900 },
  { code: 'ZWL', name: 'Zimbabwean Gold', symbol: 'ZWG', country: 'Zimbabwe', countryCode: 'ZW', flag: '🇿🇼', rate: 25.8 },
  { code: 'XAF', name: 'Central African CFA Franc', symbol: 'FCFA', country: 'Cameroon', countryCode: 'CM', flag: '🇨🇲', rate: 610, countries: ['Cameroon', 'Central African Republic', 'Chad', 'Republic of the Congo', 'Equatorial Guinea', 'Gabon'] },
  { code: 'XOF', name: 'West African CFA Franc', symbol: 'CFA', country: 'Senegal', countryCode: 'SN', flag: '🇸🇳', rate: 605, countries: ['Benin', 'Burkina Faso', 'Côte d’Ivoire', 'Guinea-Bissau', 'Mali', 'Niger', 'Senegal', 'Togo'] },
]

// The backend now issues HttpOnly access/refresh cookies. Keep this adapter for
// legacy callers, but never persist credentials in JavaScript-readable storage.
function storeTokens(accessToken: string, refreshToken?: string) {
  storeAuthTokens(accessToken, refreshToken)
}

function clearTokens() {
  clearStoredAuthSession()
}

// Send the user to the login page after clearing tokens (deduped)
let redirectingToLogin = false
function redirectToLogin() {
  if (redirectingToLogin) return
  redirectingToLogin = true
  if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/auth/login')) {
    window.location.replace('/auth/login')
  }
}

// Single in-flight refresh promise so concurrent 401s share one refresh call
let refreshPromise: Promise<string | null> | null = null

async function refreshAccessToken(): Promise<string | null> {
  if (typeof window === 'undefined') return null
  // Refresh credentials are HttpOnly cookies. The legacy body token is sent
  // only when an older session still has one, so the migration remains
  // backwards compatible without creating any new JS-readable credentials.
  const refreshToken = getStoredRefreshToken()

  try {
    const response = await apiClient.post('/auth/refresh', refreshToken ? { refreshToken } : {})
    const newAccess = response.data?.accessToken
    const newRefresh = response.data?.refreshToken
    if (newAccess) storeTokens(newAccess, newRefresh)
    // A successful cookie refresh intentionally has no token in JSON.
    return newAccess || 'cookie-session'
  } catch {
    try { await apiClient.post('/auth/logout') } catch { /* best effort cookie revocation */ }
    clearTokens()
    return null
  }
}

// ── Axios instance with auth interceptor ─────────────────────────────────
// Base URL defaults to a relative /api/v1 path which Next.js rewrites to the backend
// (see next.config.ts rewrites). Override with NEXT_PUBLIC_API_URL for a full URL.
export const apiClient = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || '/api/v1',
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
  timeout: 15000, // 15 second timeout for real backend calls
})

// Attach JWT from storage on every request
apiClient.interceptors.request.use((config) => {
  const token = typeof window !== 'undefined'
    ? getStoredAccessToken()
    : null
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// Global error handler - fail loudly, never silently return fake data
apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const config = error.config as any
    const message = (error.response?.data as any)?.message || error.message || 'Network error'

    // Log the error for debugging
    console.error('[SureXend API Error]:', {
      url: config?.url,
      status: error.response?.status,
      message
    })

    // On 401, try to refresh the access token once and retry the request
    const isRefreshCall = config?.url?.includes('/auth/refresh')
    const isAuthLogoutCall = config?.url?.includes('/auth/logout')
    // Login 401s (wrong password, inactive account) must NOT be swallowed by
    // the refresh flow — let the login page surface the real message instead
    // of a misleading "Session expired" toast. Logout is deliberately
    // excluded too: signing out must never refresh a session that is being
    // revoked.
    const isAuthLoginCall = config?.url?.includes('/auth/login')
    if (error.response?.status === 401 && config && !config._retried && !isRefreshCall && !isAuthLoginCall && !isAuthLogoutCall) {
      config._retried = true
      if (!refreshPromise) {
        refreshPromise = refreshAccessToken().finally(() => { refreshPromise = null })
      }
      const newToken = await refreshPromise
      if (newToken) {
        // Cookie sessions do not expose the refreshed access token to JS. The
        // browser will attach the new HttpOnly cookie on the retry.
        if (newToken !== 'cookie-session') {
          config.headers.Authorization = `Bearer ${newToken}`
        }
        return apiClient(config)
      }
      // Refresh failed or no refresh token available — session is over
      clearTokens()
      redirectToLogin()
      return Promise.reject(error)
    }

    // Show user-friendly error toast (only for critical operations, using unique IDs to prevent duplicate spam)
    const status = error.response?.status
    if (status === 401 && !isAuthLoginCall && !isAuthLogoutCall) {
      toast.error('Session expired. Please login again.', { id: 'auth-error' })
    } else if (status !== undefined && status >= 500 && !isAuthLoginCall && !isAuthLogoutCall) {
      toast.error('Server error. Please try again later.', { id: 'server-error' })
    } else if (!error.response && !isAuthLogoutCall) {
      toast.error('Cannot connect to server. Please check your connection.', { id: 'network-error' })
    }

    return Promise.reject(error)
  }
)

// Helper to handle API calls with explicit error propagation and commented-out local mocks
const tryWithMock = async <T>(apiCall: () => Promise<T>, mockFallback: () => T | Promise<T>): Promise<T> => {
  try {
    return await apiCall()
  } catch (error: any) {
    console.error('[SureXend API Error]:', error.message || error)
    // To test locally offline, comment out the line below and uncomment the mock fallback:
    // return await mockFallback()
    throw error
  }
}

// ── Auth API ──────────────────────────────────────────────────────────────
export const authAPI = {
  register: (payload: { email: string; phone: string; password: string; firstName: string; lastName: string; surexTag?: string; referralCode?: string }) =>
    apiClient.post('/auth/register', payload),

  login: async (payload: { email: string; password: string }) => {
    const response = await apiClient.post('/auth/login', payload)
    if (typeof window !== 'undefined' && response.data?.accessToken) {
      storeTokens(response.data.accessToken, response.data.refreshToken)
    }
    return response
  },

  verifyOTP: async (payload: { identifier: string; code: string }) => {
    const response = await apiClient.post('/auth/verify-otp', payload)
    if (typeof window !== 'undefined' && response.data?.accessToken) {
      storeTokens(response.data.accessToken, response.data.refreshToken)
    }
    return response
  },

  resendOTP: (payload: { identifier: string; type: 'email' | 'phone' }) =>
    apiClient.post('/auth/resend-otp', payload),

  refreshToken: (refreshToken: string) =>
    apiClient.post('/auth/refresh', { refreshToken }),

  // Revocation is best-effort, but local cleanup is guaranteed. The refresh
  // token is captured before cleanup so the server can revoke this device even
  // when the UI navigates away immediately or the access token has expired.
  logout: async () => {
    const refreshToken = getStoredRefreshToken()
    try {
      return await apiClient.post('/auth/logout', refreshToken ? { refreshToken } : {})
    } finally {
      if (typeof window !== 'undefined') {
        clearTokens()
      }
    }
  },

  forgotPassword: (email: string) =>
    apiClient.post('/auth/forgot-password', { email }),

  resetPassword: (payload: { token: string; newPassword: string; email?: string }) =>
    apiClient.post('/auth/reset-password', payload),

  googleConfig: () =>
    apiClient.get('/auth/google/config').then(r => r.data),

  googleUrl: async () => {
    const response = await apiClient.get('/auth/google')
    return response.data?.url as string
  },

  requestLoginOtp: (email: string) =>
    apiClient.post('/auth/otp/request', { email }),

  verifyLoginOtp: async (payload: { email: string; code: string }) => {
    const response = await apiClient.post('/auth/otp/verify-login', payload)
    if (typeof window !== 'undefined' && response.data?.accessToken) {
      storeTokens(response.data.accessToken, response.data.refreshToken)
    }
    return response
  },

  verify2FALogin: async (payload: { challengeToken: string; code: string }) => {
    const response = await apiClient.post('/auth/2fa/verify-login', payload)
    if (typeof window !== 'undefined' && response.data?.accessToken) {
      storeTokens(response.data.accessToken, response.data.refreshToken)
    }
    return response
  },

  storeOAuthTokens: (accessToken: string, refreshToken?: string) => {
    if (typeof window !== 'undefined') {
      storeTokens(accessToken, refreshToken)
    }
  },

  // Kept for older callers. Profiles are served by /users/me, not /auth/me.
  getProfile: () =>
    tryWithMock(
      () => apiClient.get('/users/me').then(r => r.data),
      () => ({ firstName: 'User', lastName: '', email: 'user@surexend.com', surexTag: 'surexuser' })
    ),
}

// ── Passkey / Biometrics API (WebAuthn) ───────────────────────────────────
export const passkeyAPI = {
  registerBegin: () => apiClient.post('/auth/passkey/register/begin').then(r => r.data),
  registerComplete: (response: any, deviceName?: string) =>
    apiClient.post('/auth/passkey/register/complete', { response, deviceName }),

  loginBegin: (email?: string) =>
    apiClient.post('/auth/passkey/login/begin', { email }).then(r => r.data),
  loginComplete: async (challengeId: string, response: any) => {
    const result = await apiClient.post('/auth/passkey/login/complete', { challengeId, response })
    if (typeof window !== 'undefined' && result.data?.accessToken) {
      storeTokens(result.data.accessToken, result.data.refreshToken)
    }
    return result
  },

  approveBegin: (intent: Record<string, unknown>) =>
    apiClient.post('/auth/passkey/approve/begin', { intent }).then(r => r.data),
  approveComplete: (challengeId: string, response: any) =>
    apiClient.post('/auth/passkey/approve/complete', { challengeId, response }).then(r => r.data as { passkeyToken: string }),

  listDevices: () => apiClient.get('/auth/passkey/devices').then(r => r.data as any[]),
  removeDevice: (id: string) => apiClient.delete(`/auth/passkey/devices/${id}`),
}

// ── Wallet API ────────────────────────────────────────────────────────────

// Every money-moving request carries a fresh Idempotency-Key. If the same
// request reaches the server twice — double tap, dropped connection, automatic
// retry — the backend replays the first response instead of charging twice.
function idempotencyHeaders(extra?: Record<string, string>): Record<string, string> {
  const key =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`
  return { 'Idempotency-Key': key, ...(extra || {}) }
}

export const walletAPI = {
  getBalance: () =>
    tryWithMock(
      () => withRetry(() => apiClient.get('/wallets/balance').then(r => r.data)),
      () => ({ usdt: 0, fiat: 0, rate: 1500, locked: 0, pending: 0, usdBalance: 0, ngnBalance: 0, localBalances: { NGN: 0 } })
    ),

  getLocalFundingAccount: () =>
    tryWithMock(
      () => apiClient.get('/wallets/local-funding/account').then(r => r.data),
      () => ({ configured: false, message: 'Bank deposits are being set up. Contact support to fund your local wallet for now.' })
    ),

  getDepositAddress: (network: 'POLYGON' | 'AVALANCHE' | 'ARBITRUM' | 'ETHEREUM' | 'BASE' | 'OPTIMISM' | 'SOLANA' | 'MONAD' | 'BSC' | 'BEP20' | 'ARC') =>
    tryWithMock(
      () => apiClient.get(`/wallets/deposit-address?network=${network}`).then(r => r.data),
      () => {
        const addresses: Record<string, string> = {
          POLYGON: '0x3F91A775191a8F47A7308D22e968D740E7A68412',
          AVALANCHE: '0x3F91A775191a8F47A7308D22e968D740E7A68412',
          ARBITRUM: '0x3F91A775191a8F47A7308D22e968D740E7A68412',
          ETHEREUM: '0x3F91A775191a8F47A7308D22e968D740E7A68412',
          BASE: '0x3F91A775191a8F47A7308D22e968D740E7A68412',
          OPTIMISM: '0x3F91A775191a8F47A7308D22e968D740E7A68412',
          SOLANA: 'HN7cABviJ373u4AeeaoeeNC6YtUt1qq1C9Xf6S7vwLdi',
          MONAD: '0x3F91A775191a8F47A7308D22e968D740E7A68412',
          BSC: '0x3F91A775191a8F47A7308D22e968D740E7A68412',
          BEP20: '0x3F91A775191a8F47A7308D22e968D740E7A68412',
        }
        return {
          address: addresses[network] || addresses.POLYGON,
          network,
          qrCodeUrl: `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${addresses[network] || addresses.POLYGON}`
        }
      }
    ),

  send: (payload: { address: string; amount: number; network: string; currency?: string; pin?: string; passkeyToken?: string }, headers?: Record<string, string>) =>
    tryWithMock(
      () => apiClient.post('/wallets/send', {
        toAddress: payload.address,
        amount: payload.amount,
        network: payload.network,
        currency: payload.currency,
        pin: payload.pin,
        passkeyToken: payload.passkeyToken,
      }, { timeout: 180000, headers: idempotencyHeaders(headers) }).then(r => r.data),
      () => ({
        success: true,
        reference: 'TX-' + Math.random().toString(36).substring(2, 9).toUpperCase(),
        txHash: '0x' + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join(''),
        amount: payload.amount,
        recipient: payload.address,
        network: payload.network,
        message: 'Crypto transfer initiated successfully'
      })
    ),

  // Cross-chain (CCTP) fee Circle's forwarder deducts on an Arc -> network
  // send. Shows the user the fee before they confirm and what the total
  // deduction from their balance will be.
  getCctpFee: (payload: { destinationNetwork: string; amount: number }) =>
    apiClient.get(`/wallets/cctp-fee?destinationNetwork=${payload.destinationNetwork}&amount=${payload.amount || 0}`).then(r => r.data),

  getNetworks: () =>
    tryWithMock(
      () => apiClient.get('/wallets/networks').then(r => r.data),
      () => [
        { id: 'ETHEREUM', name: 'Ethereum (ERC20)', fee: '2.5 USDC', minDeposit: '10 USDC', speed: '~1 minute' },
        { id: 'POLYGON', name: 'Polygon (Amoy/POS)', fee: '0.1 USDC', minDeposit: '1 USDC', speed: '~10 seconds' },
        { id: 'AVALANCHE', name: 'Avalanche C-Chain', fee: '0.2 USDC', minDeposit: '1 USDC', speed: '~5 seconds' },
        { id: 'ARBITRUM', name: 'Arbitrum One', fee: '0.15 USDC', minDeposit: '1 USDC', speed: '~10 seconds' },
        { id: 'BASE', name: 'Base', fee: '0.1 USDC', minDeposit: '1 USDC', speed: '~5 seconds' },
        { id: 'OPTIMISM', name: 'Optimism', fee: '0.1 USDC', minDeposit: '1 USDC', speed: '~5 seconds' },
        { id: 'SOLANA', name: 'Solana', fee: '0.05 USDC', minDeposit: '1 USDC', speed: '~10 seconds' },
        { id: 'BSC', name: 'BNB Smart Chain (BEP20)', fee: '0.2 USDC', minDeposit: '1 USDC', speed: '~15 seconds' },
      ]
    ),
}

// ── Transaction API ───────────────────────────────────────────────────────
export const transactionAPI = {
  getTransactions: (params: { page?: number; limit?: number; year?: number; month?: number; week?: number; day?: string; type?: string }) =>
    transactionAPI.getHistory(params),

  getHistory: (params: { page?: number; limit?: number; year?: number; month?: number; week?: number; day?: string; type?: string }) =>
    tryWithMock(
      () => apiClient.get('/transactions', { params }).then(r => r.data),
      () => ({
        transactions: [
          { id: 'tx_1', type: 'send', amount: 150, currency: 'USDC', status: 'completed', recipient: 'TYvj...G5h', date: new Date().toISOString() },
          { id: 'tx_2', type: 'receive', amount: 500, currency: 'USDC', status: 'completed', sender: '0x71...76F', date: new Date(Date.now() - 86400000).toISOString() },
          { id: 'tx_3', type: 'convert', amount: 100, currency: 'USDC', fiatAmount: 150000, fiatCurrency: 'NGN', status: 'completed', date: new Date(Date.now() - 172800000).toISOString() },
          { id: 'tx_4', type: 'bill_payment', amount: 2000, currency: 'NGN', provider: 'MTN Airtime', status: 'completed', date: new Date(Date.now() - 259200000).toISOString() },
          { id: 'tx_5', type: 'receive', amount: 1200, currency: 'USDC', status: 'completed', sender: 'Binance Deposit', date: new Date(Date.now() - 432000000).toISOString() },
        ],
        total: 5,
        page: params.page || 1,
      })
    ),

  getById: (id: string) =>
    tryWithMock(
      () => apiClient.get(`/transactions/${id}`).then(r => r.data),
      () => ({
        id,
        type: 'send',
        amount: 150,
        currency: 'USDC',
        status: 'completed',
        reference: 'SXR-8829103',
        recipient: 'TYvj6H3xKk89Nq4P5W8zM1A2bC3dE4fG5h',
        network: 'TRC20',
        fee: 1,
        date: new Date().toISOString()
      })
    ),

  downloadStatement: (params: { year?: number; month?: number; week?: number; format?: 'pdf' | 'csv' }) =>
    tryWithMock(
      () => apiClient.get('/transactions/statement', { params, responseType: 'blob' }).then(r => r.data),
      () => new Blob(['Mock SureXend Account Statement'], { type: 'application/pdf' })
    ),
}

// ── Conversion API ────────────────────────────────────────────────────────
export const conversionAPI = {
  getCurrencies: () =>
    tryWithMock(
      () => withRetry(() => apiClient.get('/conversions/currencies').then(r => r.data)),
      () => ({
        usd: { code: 'USD', name: 'US Dollar', symbol: '$' },
        local: AFRICAN_CURRENCIES,
      })
    ),

  getRates: (fiatCurrency: string) =>
    tryWithMock(
      () => withRetry(() => apiClient.get(`/conversions/rates?currency=${fiatCurrency}`).then(r => r.data)),
      () => {
        const rateMap: Record<string, number> = Object.fromEntries(
          AFRICAN_CURRENCIES.map(c => [c.code, c.rate])
        )
        return {
          currency: fiatCurrency,
          rate: rateMap[fiatCurrency] || 1500,
          feePercent: 0,
          minUsdt: 1,
          maxUsdt: 50000,
        }
      }
    ),

  // Real market chart history for the dashboard (proxy through the backend so
  // browser CORS never blocks the upstream FX/crypto feeds).
  getMarketChart: (currency: string, timeframe: string) =>
    tryWithMock(
      () => withRetry(() => apiClient.get(`/conversions/market-chart?currency=${currency}&timeframe=${timeframe}`).then(r => r.data)),
      () => {
        const rateMap: Record<string, number> = Object.fromEntries(
          AFRICAN_CURRENCIES.map(c => [c.code, c.rate])
        )
        const now = Date.now()
        const points = Array.from({ length: 30 }, (_, i) => ({
          time: new Date(now - (29 - i) * 3600 * 1000).toISOString(),
          value: currency === 'USDC' ? 1 : rateMap[currency] || 1500,
        }))
        return { currency, timeframe, points, source: 'mock', updatedAt: now }
      }
    ),

  preview: (payload: { from: string; to: string; amount: number }) =>
    tryWithMock(
      () => apiClient.post('/conversions/preview', { from: payload.from, to: payload.to, amount: payload.amount }).then(r => r.data),
      () => {
        const rateMap: Record<string, number> = Object.fromEntries(
          AFRICAN_CURRENCIES.map(c => [c.code, c.rate])
        )
        const from = payload.from.toUpperCase()
        const to = payload.to.toUpperCase()
        const usdValue = from === 'USD' ? payload.amount : payload.amount / (rateMap[from] || 1500)
        const feeUsd = 0
        const receiveAmount = to === 'USD' ? usdValue : usdValue * (rateMap[to] || 1500)
        return {
          from,
          to,
          amount: payload.amount,
          rate: to === 'USD' ? 1 / (rateMap[from] || 1500) : (rateMap[to] || 1500),
          fee: feeUsd,
          receiveAmount,
        }
      }
    ),

  execute: (payload: { from: string; to: string; amount: number; pin?: string; passkeyToken?: string }, headers?: Record<string, string>) =>
    tryWithMock(
      () => apiClient.post('/conversions/execute', {
        from: payload.from,
        to: payload.to,
        amount: payload.amount,
        pin: payload.pin,
        passkeyToken: payload.passkeyToken,
      }, { headers: idempotencyHeaders(headers) }).then(r => r.data),
      () => ({
        success: true,
        reference: 'CNV-' + Math.random().toString(36).substring(2, 8).toUpperCase(),
        from: payload.from,
        to: payload.to,
        amount: payload.amount,
        receiveAmount: payload.amount * 1500,
        rate: 1500,
        fee: 0,
        message: 'Conversion completed successfully'
      })
    ),
}

// ── Bank Accounts API ─────────────────────────────────────────────────────
export const bankAPI = {
  // Legacy: fetch bank list from backend (Flutterwave lookup)
  list: () =>
    tryWithMock(
      () => apiClient.get('/bank-accounts').then(r => r.data),
      () => [
        { id: 'b1', bankName: 'Guaranty Trust Bank (GTB)', accountNumber: '0123456789', accountName: 'SUREXEND DEMO USER', isDefault: true, currency: 'NGN' },
        { id: 'b2', bankName: 'Access Bank', accountNumber: '9876543210', accountName: 'SUREXEND DEMO USER', isDefault: false, currency: 'NGN' },
      ]
    ),

  // NEW: Create a PaymentPoint virtual account
  createPaymentPointVirtualAccount: async (
    payload: {
      customerEmail: string
      customerName: string
      customerPhone: string
      bankCode: string  // '20946' = PalmPay, '20897' = OPay
      businessId: string
    }
  ) => {
    const response = await apiClient.post('/paymentpoint/create-virtual-account', payload)
    return response.data
  },

  // Legacy: add bank account (backend creates virtual account)
  add: (payload: { bankCode: string; accountNumber: string; country: string }) =>
    tryWithMock(
      () => apiClient.post('/bank-accounts', payload).then(r => r.data),
      () => ({
        id: 'b_' + Date.now(),
        bankName: 'Guaranty Trust Bank',
        accountNumber: payload.accountNumber,
        accountName: 'VERIFIED ACCOUNT HOLDER',
        currency: payload.country === 'NG' ? 'NGN' : 'USD'
      })
    ),

  // Legacy: remove bank account
  remove: (id: string) =>
    tryWithMock(
      () => apiClient.delete(`/bank-accounts/${id}`).then(r => r.data),
      () => ({ success: true })
    ),

  // Legacy: get banks list (for selector)
  getBanks: (country: string) =>
    tryWithMock(
      () => apiClient.get(`/bank-accounts/banks?country=${country}`).then(r => r.data),
      () => [
        { code: '058', name: 'Guaranty Trust Bank (GTB)' },
        { code: '044', name: 'Access Bank' },
        { code: '033', name: 'United Bank for Africa (UBA)' },
        { code: '057', name: 'Zenith Bank' },
        { code: '214', name: 'First City Monument Bank (FCMB)' },
        { code: '011', name: 'First Bank of Nigeria' },
        { code: '035', name: 'Wema Bank (ALAT)' },
        { code: '50515', name: 'Kuda Microfinance Bank' },
        { code: '999992', name: 'OPay Digital Services' },
        { code: '999991', name: 'PalmPay' },
      ]
    ),
}

// ── Bills API ─────────────────────────────────────────────────────────────
export const billsAPI = {
  getProviders: (type: 'airtime' | 'data' | 'electricity' | 'tv' | 'water', country?: string) =>
    tryWithMock(
      () => apiClient.get(`/bills/providers?type=${type}&country=${country || 'NG'}`).then(r => r.data),
      () => [
        { code: 'MTN', name: 'MTN Nigeria', networkId: 1, discount: 96.5 },
        { code: 'GLO', name: 'Globacom', networkId: 2, discount: 90 },
        { code: '9MOBILE', name: '9mobile (Etisalat)', networkId: 3, discount: 98 },
        { code: 'AIRTEL', name: 'Airtel Nigeria', networkId: 4, discount: 97 },
      ]
    ),

  getDataPlans: (provider: string) =>
    tryWithMock(
      () => apiClient.get(`/bills/data-plans?provider=${provider}`).then(r => r.data),
      () => [
        { code: '1', name: '1GB', validity: '30 Days', amount: 300, planType: 'GIFTING' },
        { code: '2', name: '2.5GB', validity: '30 Days', amount: 500, planType: 'GIFTING' },
        { code: '3', name: '10GB', validity: '30 Days', amount: 2000, planType: 'GIFTING' },
        { code: '4', name: '20GB', validity: '30 Days', amount: 3500, planType: 'GIFTING' },
      ]
    ),

  purchase: (payload: {
    type: string; provider: string; recipient: string;
    amount?: number; planCode?: string; pin?: string; passkeyToken?: string;
    portedNumber?: boolean
  }, headers?: Record<string, string>) =>
    tryWithMock(
      () => apiClient.post('/bills/purchase', payload, { headers: idempotencyHeaders(headers) }).then(r => r.data),
      () => ({
        success: true,
        reference: 'VTP-' + Math.random().toString(36).substring(2, 9).toUpperCase(),
        recipient: payload.recipient,
        provider: payload.provider,
        message: 'Bill payment fulfilled successfully'
      })
    ),

  validateMeter: (meterNumber: string, provider: string) =>
    tryWithMock(
      () => apiClient.get(`/bills/validate-meter?meter=${meterNumber}&provider=${provider}`).then(r => r.data),
      () => ({
        valid: true,
        customerName: 'SUREXEND DEMO CUSTOMER',
        address: '12 Victoria Island, Lagos',
        meterNumber
      })
    ),
}

// ── Referrals API ─────────────────────────────────────────────────────────
export const referralAPI = {
  getStats: () => apiClient.get('/referrals/stats').then(r => r.data),

  getReferrals: (page = 1, limit = 20) =>
    apiClient.get(`/referrals?page=${page}&limit=${limit}`).then(r => r.data),

  getEarnings: () => apiClient.get('/referrals/earnings').then(r => r.data),
}

// ── User API ──────────────────────────────────────────────────────────────
export const userAPI = {
  getProfile: () =>
    tryWithMock(
      () => apiClient.get('/users/me').then(r => r.data),
      () => ({
        id: 'demo_user_1',
        firstName: 'Emmanuel',
        lastName: 'SureXend',
        surexTag: 'emmanuel.surexend',
        email: 'emmanuel@surexend.com',
        phone: '+2348012345678',
        kycStatus: 'VERIFIED',
        avatar: '',
        pinSet: true,
      })
    ),

  updateProfile: (payload: Partial<{ firstName: string; lastName: string; avatar: string }>) =>
    tryWithMock(
      () => apiClient.patch('/users/me', payload).then(r => r.data),
      () => ({ message: 'Profile updated successfully' })
    ),

  changePin: (payload: { currentPin: string; newPin: string }) =>
    tryWithMock(
      () => apiClient.post('/users/change-pin', payload).then(r => r.data),
      () => ({ message: 'PIN changed successfully' })
    ),

  setupPin: (pin: string) =>
    tryWithMock(
      () => apiClient.post('/users/setup-pin', { pin }).then(r => r.data),
      () => ({ message: 'PIN set up successfully' })
    ),

  setup2FA: () =>
    tryWithMock(
      () => apiClient.post('/users/2fa/setup').then(r => r.data),
      () => ({ secret: 'JBSWY3DPEHPK3PXP', qrCodeUrl: 'https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=otpauth://totp/SureXend?secret=JBSWY3DPEHPK3PXP' })
    ),

  verify2FA: (token: string) =>
    tryWithMock(
      () => apiClient.post('/users/2fa/verify', { code: token }).then(r => r.data),
      () => ({ success: true, message: '2FA enabled successfully' })
    ),

  getKYCStatus: () =>
    tryWithMock(
      () => apiClient.get('/users/kyc').then(r => r.data),
      () => ({ status: 'VERIFIED', isVerified: true, limits: { dailyWithdrawal: '50,000 USDC' } })
    ),

  submitKYC: (payload: FormData) =>
    tryWithMock(
      () => apiClient.post('/users/kyc', payload, { headers: { 'Content-Type': 'multipart/form-data' } }).then(r => r.data),
      () => ({ success: true, message: 'KYC documents submitted for review' })
    ),

  updatePreferences: (payload: { currencyDisplay?: string; defaultWallet?: string }) =>
    tryWithMock(
      () => apiClient.post('/users/preferences', payload).then(r => r.data),
      () => ({ message: 'Preferences updated successfully' })
    ),
}

// ── Support API ───────────────────────────────────────────────────────────
export const supportAPI = {
  chat: (payload: { message: string; sessionId?: string; history?: any[] }) =>
    tryWithMock(
      () => apiClient.post('/support/chat', { message: payload.message, history: payload.history || [] }).then(r => r.data),
      () => ({ response: "Hello! I am your SureXend AI Assistant. I can help with USDC transfers, payout rollout questions, conversions, and bill payments.", escalate: false })
    ),

  createTicket: (payload: { subject: string; message: string; category: string }) =>
    tryWithMock(
      () => apiClient.post('/support/tickets', payload).then(r => r.data),
      () => ({ id: 'ticket_' + Date.now(), message: 'Support ticket created successfully' })
    ),

  getTickets: () =>
    tryWithMock(
      () => apiClient.get('/support/tickets').then(r => r.data),
      () => [
        { id: 't_1', subject: 'Inquiry regarding TRC20 transfer speed', category: 'General', status: 'RESOLVED', date: '2026-08-02' }
      ]
    ),
}

// ── Notifications API ─────────────────────────────────────────────────────
export const notificationsAPI = {
  getAll: () =>
    tryWithMock(
      () => apiClient.get('/notifications').then(r => r.data),
      () => ({ notifications: [], unreadCount: 0 })
    ),

  markAllRead: () =>
    tryWithMock(
      () => apiClient.patch('/notifications/read-all').then(r => r.data),
      () => ({ message: 'All notifications marked as read' })
    ),

}

export type AdminApprovalPayload = {
  adminPin?: string
  adminPasskeyToken?: string
}

// ── Admin API (requires the ADMIN role on the JWT) ──────────────────────
export const adminAPI = {
  getOverview: () => apiClient.get('/admin/overview').then(r => r.data),
  getUsers: (params?: { search?: string; kycStatus?: string; sort?: 'recent' | 'balance_asc' | 'balance_desc'; page?: number; limit?: number }) =>
    apiClient.get('/admin/users', { params }).then(r => r.data),
  getUser: (id: string) => apiClient.get(`/admin/users/${id}`).then(r => r.data),
  updateUser: (id: string, body: { isActive?: boolean; isBanned?: boolean; kycStatus?: string; kycTier?: number; role?: string; email?: string; phone?: string }, approval?: AdminApprovalPayload) =>
    apiClient.patch(`/admin/users/${id}`, { ...body, ...(approval || {}) }).then(r => r.data),
  creditUser: (id: string, body: { amount: number; currency?: string; note?: string }, approval?: AdminApprovalPayload) =>
    apiClient.post(`/admin/users/${id}/credit`, { ...body, ...(approval || {}) }).then(r => r.data),
  deleteUser: (id: string, approval?: AdminApprovalPayload) =>
    apiClient.delete(`/admin/users/${id}`, { data: approval || {} }).then(r => r.data),
  getTransactions: (params?: { type?: string; status?: string; search?: string; page?: number; limit?: number }) =>
    apiClient.get('/admin/transactions', { params }).then(r => r.data),
  getTransaction: (id: string) =>
    apiClient.get(`/admin/transactions/${id}`).then(r => r.data),
  getPricing: () =>
    apiClient.get('/admin/pricing').then(r => r.data),
  setAirtimePricing: (provider: string, marginPct: number, approval?: AdminApprovalPayload) =>
    apiClient.put('/admin/pricing/airtime', { provider, marginPct, ...(approval || {}) }).then(r => r.data),
  setDataMargin: (provider: string, marginPct: number, approval?: AdminApprovalPayload) =>
    apiClient.put('/admin/pricing/data-margin', { provider, marginPct, ...(approval || {}) }).then(r => r.data),
  setDataPlanPrice: (provider: string, planCode: string, sellPrice: number | null, approval?: AdminApprovalPayload) =>
    apiClient.put('/admin/pricing/data', { provider, planCode, sellPrice, ...(approval || {}) }).then(r => r.data),
  setDataPlanEnabled: (provider: string, planCode: string, enabled: boolean, approval?: AdminApprovalPayload) =>
    apiClient.put('/admin/pricing/data-disable', { provider, planCode, enabled, ...(approval || {}) }).then(r => r.data),
  getKyc: (params?: { status?: string; page?: number; limit?: number }) =>
    apiClient.get('/admin/kyc', { params }).then(r => r.data),
  decideKyc: (id: string, body: { approve: boolean; reason?: string }, approval?: AdminApprovalPayload) =>
    apiClient.post(`/admin/kyc/${id}/decision`, { ...body, ...(approval || {}) }).then(r => r.data),
  broadcastMessage: (body: { title: string; body: string; type?: string; data?: any }, approval?: AdminApprovalPayload) =>
    apiClient.post('/admin/broadcast-message', { ...body, ...(approval || {}) }).then(r => r.data),
  getBroadcastHistory: (params?: { page?: number; limit?: number }) =>
    apiClient.get('/admin/broadcast-message-history', { params }).then(r => r.data),

  getCampaignOverview: () =>
    apiClient.get('/admin/campaigns/overview').then(r => r.data),
  getReferralRewardWallet: () =>
    apiClient.get('/admin/referral-rewards/wallet').then(r => r.data),
  createReferralRewardWallet: (approval?: AdminApprovalPayload) =>
    apiClient.post('/admin/referral-rewards/wallet', approval || {}).then(r => r.data),
  getReferralRewards: (params?: { status?: string; page?: number; limit?: number }) =>
    apiClient.get('/admin/referral-rewards', { params }).then(r => r.data),
  payReferralReward: (id: string, approval?: AdminApprovalPayload) =>
    apiClient.post(`/admin/referral-rewards/${id}/pay`, approval || {}).then(r => r.data),
  refreshReferralReward: (id: string, approval?: AdminApprovalPayload) =>
    apiClient.post(`/admin/referral-rewards/${id}/refresh`, approval || {}).then(r => r.data),
}

export const campaignsAPI = {
  getLeaderboard: (type: 'bills' | 'crypto', range: 'day' | '7d' | '30d' | '365d' | 'all') =>
    apiClient.get('/campaigns/leaderboard', { params: { type, range } }).then(r => r.data),
  getMyStanding: () =>
    apiClient.get('/campaigns/me').then(r => r.data),
}
