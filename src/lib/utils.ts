import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number, currency: string = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

export function formatNGN(amount: number): string {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

// Per-currency display glyphs so swap tiles can show both legs cleanly.
const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$', NGN: '₦', GHS: 'GH₵', KES: 'KSh', ZAR: 'R', UGX: 'USh',
  TZS: 'TSh', EGP: 'E£', MAD: 'DH', ETB: 'Br', RWF: 'FRw', ZMW: 'K',
  MZN: 'MT', BWP: 'P', AOA: 'Kz', CDF: 'FC', TND: 'DT', DZD: 'DA',
  LYD: 'LD', SDG: 'SD', SSP: 'SS', SOS: 'Sh', DJF: 'Fdj', ERN: 'Nfk',
  MRU: 'UM', MGA: 'Ar', MWK: 'MK', NAD: 'N$', LSL: 'L', SZL: 'E',
  MUR: 'Rs', SCR: 'SR', KMF: 'CF', CVE: '$', STN: 'Db', GMD: 'D',
  SLL: 'Le', LRD: 'L$', GNF: 'FG', BIF: 'FBu', ZWL: 'ZWG', XAF: 'FCFA',
  XOF: 'CFA',
}

export function currencySymbol(code: string): string {
  return CURRENCY_SYMBOLS[(code || '').toUpperCase()] || (code || '')
}

export function formatAmount(amount: number, maxFractionDigits = 2): string {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: maxFractionDigits,
  }).format(Number(amount) || 0)
}

// Extract the two swap legs for a CONVERT transaction. The transaction's own
// `currency`/`amount` only describe the *from* side; the metadata carries the
// real swap pair ({from, to, fromAmount, toAmount, rate}), which is what the
// tile must show so figures never contradict each other.
export function getSwapInfo(tx: any): {
  from: string; to: string; fromAmount: number; toAmount: number; rate: number
} | null {
  if (!tx || (tx.type || '').toUpperCase() !== 'CONVERT') return null
  const meta = tx.metadata || {}
  const from = (meta.from || tx.currency || 'USD').toUpperCase()
  const to = (meta.to || '').toUpperCase()
  const fromAmount = Number(meta.fromAmount ?? tx.amount ?? 0)
  const toAmount = Number(meta.toAmount ?? meta.fiatAmount ?? 0)
  if (!from || !to || toAmount <= 0) return null
  return { from, to, fromAmount, toAmount, rate: Number(meta.rate ?? 0) }
}

export function truncateAddress(address: string, chars = 6): string {
  if (!address) return ''
  return `${address.slice(0, chars)}...${address.slice(-chars)}`
}

export function formatDate(date: Date | string): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date))
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export function getInitials(name: string): string {
  return name
    .split(' ')
    .slice(0, 2)
    .map(n => n[0]?.toUpperCase() ?? '')
    .join('')
}

// Exponential backoff for API retries
export async function withRetry<T>(
  fn: () => Promise<T>,
  retries = 3,
  baseDelay = 500
): Promise<T> {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn()
    } catch (err) {
      if (i === retries - 1) throw err
      await sleep(baseDelay * Math.pow(2, i))
    }
  }
  throw new Error('Max retries exceeded')
}

export function isValidEthAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address)
}

export function isValidTronAddress(address: string): boolean {
  return /^T[a-zA-Z0-9]{33}$/.test(address)
}
