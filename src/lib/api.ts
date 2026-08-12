import axios, { AxiosError } from 'axios'
import { withRetry } from './utils'
import toast from 'react-hot-toast'

// Store access + refresh tokens in localStorage and the access token as a cookie
function storeTokens(accessToken: string, refreshToken?: string) {
  localStorage.setItem('surexend_access_token', accessToken)
  document.cookie = `surexend_access_token=${accessToken}; path=/; max-age=86400;`
  if (refreshToken) {
    localStorage.setItem('surexend_refresh_token', refreshToken)
  }
}

function clearTokens() {
  localStorage.removeItem('surexend_access_token')
  localStorage.removeItem('surexend_refresh_token')
  document.cookie = 'surexend_access_token=; path=/; max-age=0;'
}

// Send the user to the login page after clearing tokens (deduped)
let redirectingToLogin = false
function redirectToLogin() {
  if (redirectingToLogin) return
  redirectingToLogin = true
  if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/auth/login')) {
    window.location.href = '/auth/login'
  }
}

// Single in-flight refresh promise so concurrent 401s share one refresh call
let refreshPromise: Promise<string | null> | null = null

async function refreshAccessToken(): Promise<string | null> {
  if (typeof window === 'undefined') return null
  const refreshToken = localStorage.getItem('surexend_refresh_token')
  if (!refreshToken) return null

  try {
    const response = await apiClient.post('/auth/refresh', { refreshToken })
    const newAccess = response.data?.accessToken
    const newRefresh = response.data?.refreshToken
    if (!newAccess) return null
    storeTokens(newAccess, newRefresh)
    return newAccess
  } catch {
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
  timeout: 15000, // 15 second timeout for real backend calls
})

// Attach JWT from storage on every request
apiClient.interceptors.request.use((config) => {
  const token = typeof window !== 'undefined'
    ? localStorage.getItem('surexend_access_token')
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
    if (error.response?.status === 401 && config && !config._retried && !isRefreshCall) {
      config._retried = true
      if (!refreshPromise) {
        refreshPromise = refreshAccessToken().finally(() => { refreshPromise = null })
      }
      const newToken = await refreshPromise
      if (newToken) {
        config.headers.Authorization = `Bearer ${newToken}`
        return apiClient(config)
      }
      // Refresh failed or no refresh token available — session is over
      clearTokens()
      redirectToLogin()
      return Promise.reject(error)
    }

    // Show user-friendly error toast (only for critical operations, using unique IDs to prevent duplicate spam)
    if (error.response?.status === 401) {
      toast.error('Session expired. Please login again.', { id: 'auth-error' })
    } else if (error.response?.status >= 500) {
      toast.error('Server error. Please try again later.', { id: 'server-error' })
    } else if (!error.response) {
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
  register: (payload: { email: string; phone: string; password: string; firstName: string; lastName: string; referralCode?: string }) =>
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

  logout: async () => {
    const response = await apiClient.post('/auth/logout')
    if (typeof window !== 'undefined') {
      clearTokens()
    }
    return response
  },

  forgotPassword: (email: string) =>
    apiClient.post('/auth/forgot-password', { email }),

  resetPassword: (payload: { token: string; newPassword: string }) =>
    apiClient.post('/auth/reset-password', payload),
}

// ── Wallet API ────────────────────────────────────────────────────────────
export const walletAPI = {
  getBalance: () =>
    tryWithMock(
      () => withRetry(() => apiClient.get('/wallets/balance').then(r => r.data)),
      () => ({ usdt: 2450.75, fiat: 3676125, rate: 1500, locked: 0, pending: 0 })
    ),

  getDepositAddress: (network: 'POLYGON' | 'AVALANCHE' | 'ARBITRUM' | 'ETHEREUM' | 'BASE' | 'OPTIMISM' | 'SOLANA' | 'BSC' | 'BEP20' | 'ARC') =>
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

  send: (payload: { address: string; amount: number; network: string; pin: string; destinationNetwork?: string }) =>
    tryWithMock(
      () => apiClient.post('/wallets/send', {
        toAddress: payload.address,
        amount: payload.amount,
        network: payload.network,
        destinationNetwork: payload.destinationNetwork,
        pin: payload.pin,
      }, { timeout: 180000 }).then(r => r.data),
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

  getNetworks: () =>
    tryWithMock(
      () => apiClient.get('/wallets/networks').then(r => r.data),
      () => [
        { id: 'ETHEREUM', name: 'Ethereum (ERC20)', fee: '2.5 USDT', minDeposit: '10 USDT', speed: '~1 minute' },
        { id: 'POLYGON', name: 'Polygon (Amoy/POS)', fee: '0.1 USDT', minDeposit: '1 USDT', speed: '~10 seconds' },
        { id: 'AVALANCHE', name: 'Avalanche C-Chain', fee: '0.2 USDT', minDeposit: '1 USDT', speed: '~5 seconds' },
        { id: 'ARBITRUM', name: 'Arbitrum One', fee: '0.15 USDT', minDeposit: '1 USDT', speed: '~10 seconds' },
        { id: 'BASE', name: 'Base', fee: '0.1 USDT', minDeposit: '1 USDT', speed: '~5 seconds' },
        { id: 'OPTIMISM', name: 'Optimism', fee: '0.1 USDT', minDeposit: '1 USDT', speed: '~5 seconds' },
        { id: 'SOLANA', name: 'Solana', fee: '0.05 USDT', minDeposit: '1 USDT', speed: '~10 seconds' },
        { id: 'BSC', name: 'BNB Smart Chain (BEP20)', fee: '0.2 USDT', minDeposit: '1 USDT', speed: '~15 seconds' },
      ]
    ),
}

// ── Transaction API ───────────────────────────────────────────────────────
export const transactionAPI = {
  getHistory: (params: { page?: number; limit?: number; year?: number; month?: number; week?: number; day?: string; type?: string }) =>
    tryWithMock(
      () => apiClient.get('/transactions', { params }).then(r => r.data),
      () => ({
        transactions: [
          { id: 'tx_1', type: 'send', amount: 150, currency: 'USDT', status: 'completed', recipient: 'TYvj...G5h', date: new Date().toISOString() },
          { id: 'tx_2', type: 'receive', amount: 500, currency: 'USDT', status: 'completed', sender: '0x71...76F', date: new Date(Date.now() - 86400000).toISOString() },
          { id: 'tx_3', type: 'convert', amount: 100, currency: 'USDT', fiatAmount: 150000, fiatCurrency: 'NGN', status: 'completed', date: new Date(Date.now() - 172800000).toISOString() },
          { id: 'tx_4', type: 'bill_payment', amount: 2000, currency: 'NGN', provider: 'MTN Airtime', status: 'completed', date: new Date(Date.now() - 259200000).toISOString() },
          { id: 'tx_5', type: 'receive', amount: 1200, currency: 'USDT', status: 'completed', sender: 'Binance Deposit', date: new Date(Date.now() - 432000000).toISOString() },
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
        currency: 'USDT',
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
  getRates: (fiatCurrency: string) =>
    tryWithMock(
      () => withRetry(() => apiClient.get(`/conversions/rates?currency=${fiatCurrency}`).then(r => r.data)),
      () => {
        const rateMap: Record<string, number> = {
          NGN: 1500,
          GHS: 14.5,
          KES: 132,
          ZAR: 18.5,
          UGX: 3750,
          TZS: 2600,
          XOF: 605,
        }
        return {
          currency: fiatCurrency,
          rate: rateMap[fiatCurrency] || 1500,
          feePercent: 0.5,
          minUsdt: 5,
          maxUsdt: 50000,
        }
      }
    ),

  preview: (payload: { amount: number; currency: string }) =>
    tryWithMock(
      () => apiClient.post('/conversions/preview', { usdtAmount: payload.amount, fiatCurrency: payload.currency }).then(r => r.data),
      () => {
        const rateMap: Record<string, number> = { NGN: 1500, GHS: 14.5, KES: 132, ZAR: 18.5 }
        const rate = rateMap[payload.currency] || 1500
        const grossFiat = payload.amount * rate
        const feeFiat = grossFiat * 0.005
        return {
          usdtAmount: payload.amount,
          fiatCurrency: payload.currency,
          rate,
          grossFiat,
          feeUsdt: payload.amount * 0.005,
          netFiat: grossFiat - feeFiat,
        }
      }
    ),

  execute: (payload: { amount: number; currency: string; bankAccountId: string; pin: string }) =>
    tryWithMock(
      () => apiClient.post('/conversions/execute', {
        usdtAmount: payload.amount,
        fiatCurrency: payload.currency,
        bankAccountId: payload.bankAccountId,
        pin: payload.pin,
      }).then(r => r.data),
      () => ({
        success: true,
        reference: 'CNV-' + Math.random().toString(36).substring(2, 8).toUpperCase(),
        amount: payload.amount,
        fiatCurrency: payload.currency,
        estimatedDelivery: 'Instant (1-3 minutes)',
        message: 'Conversion & bank withdrawal initiated successfully'
      })
    ),
}

// ── Bank Accounts API ─────────────────────────────────────────────────────
export const bankAPI = {
  list: () =>
    tryWithMock(
      () => apiClient.get('/bank-accounts').then(r => r.data),
      () => [
        { id: 'b1', bankName: 'Guaranty Trust Bank (GTB)', accountNumber: '0123456789', accountName: 'SUREXEND DEMO USER', isDefault: true, currency: 'NGN' },
        { id: 'b2', bankName: 'Access Bank', accountNumber: '9876543210', accountName: 'SUREXEND DEMO USER', isDefault: false, currency: 'NGN' },
      ]
    ),

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

  remove: (id: string) =>
    tryWithMock(
      () => apiClient.delete(`/bank-accounts/${id}`),
      () => ({ success: true })
    ),

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
        { id: 'mtn', name: 'MTN Nigeria', logo: '📶' },
        { id: 'airtel', name: 'Airtel Nigeria', logo: '🔴' },
        { id: 'glo', name: 'Glo Nigeria', logo: '🟢' },
        { id: '9mobile', name: '9mobile', logo: '💚' },
      ]
    ),

  getDataPlans: (provider: string) =>
    tryWithMock(
      () => apiClient.get(`/bills/data-plans?provider=${provider}`).then(r => r.data),
      () => [
        { code: 'data_1gb', name: '1GB Monthly Data', price: 300, usdtPrice: 0.2 },
        { code: 'data_2.5gb', name: '2.5GB Monthly Data', price: 500, usdtPrice: 0.33 },
        { code: 'data_10gb', name: '10GB Monthly Data', price: 2000, usdtPrice: 1.33 },
        { code: 'data_20gb', name: '20GB Monthly Data', price: 3500, usdtPrice: 2.33 },
      ]
    ),

  purchase: (payload: {
    type: string; provider: string; recipient: string;
    amount?: number; planCode?: string; pin: string
  }) =>
    tryWithMock(
      () => apiClient.post('/bills/purchase', payload).then(r => r.data),
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
  getStats: () =>
    tryWithMock(
      () => apiClient.get('/referrals/stats').then(r => r.data),
      () => ({
        totalReferrals: 14,
        activeReferrals: 9,
        totalEarnedUsdt: 68.50,
        thisMonthUsdt: 22.00,
        referralCode: 'SUREXEND-AFRICA',
        referralLink: 'https://surexend.com/auth/register?ref=SUREXEND-AFRICA'
      })
    ),

  getReferrals: (page = 1, limit = 20) =>
    tryWithMock(
      () => apiClient.get(`/referrals?page=${page}&limit=${limit}`).then(r => r.data),
      () => ({
        referrals: [
          { id: 'ref_1', name: 'Emmanuel A.', date: '2026-08-01', status: 'ACTIVE', earned: '10.00 USDT' },
          { id: 'ref_2', name: 'Chidimma O.', date: '2026-08-03', status: 'ACTIVE', earned: '8.50 USDT' },
          { id: 'ref_3', name: 'Kwame M.', date: '2026-08-05', status: 'PENDING', earned: '0.00 USDT' },
        ],
        total: 3
      })
    ),

  getEarnings: () =>
    tryWithMock(
      () => apiClient.get('/referrals/earnings').then(r => r.data),
      () => [
        { month: 'May 2026', amount: 15.00 },
        { month: 'Jun 2026', amount: 18.50 },
        { month: 'Jul 2026', amount: 22.00 },
      ]
    ),
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
        email: 'emmanuel@surexend.com',
        phone: '+2348012345678',
        kycTier: 2,
        kycStatus: 'APPROVED',
        avatar: '',
        referralCode: 'SUREXEND-AFRICA'
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
      () => ({ tier: 2, status: 'APPROVED', limits: { dailyWithdrawal: '10,000 USDT' } })
    ),

  submitKYC: (payload: FormData) =>
    tryWithMock(
      () => apiClient.post('/users/kyc', payload, { headers: { 'Content-Type': 'multipart/form-data' } }),
      () => ({ success: true, message: 'KYC documents submitted for review' })
    ),
}

// ── Support API ───────────────────────────────────────────────────────────
export const supportAPI = {
  chat: (payload: { message: string; sessionId?: string; history?: any[] }) =>
    tryWithMock(
      () => apiClient.post('/support/chat', { message: payload.message, history: payload.history || [] }).then(r => r.data),
      () => ({ response: "Hello! I am your SureXend AI Assistant. I can help you guide through instant USDT transfers, bank withdrawals, or bill payments!", escalate: false })
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
