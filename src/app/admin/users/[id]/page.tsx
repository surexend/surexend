'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { ArrowLeft, ArrowUpRight, Check, Clock3, Copy, Landmark, PlusCircle, RefreshCw, ShieldCheck, Wallet } from 'lucide-react'
import { adminAPI } from '@/lib/api'
import { currencySymbol, formatAmount, formatDate, getSwapInfo } from '@/lib/utils'

function displayMoney(amount: number, currency: string) {
  const code = (currency || 'USDC').toUpperCase()
  const symbol = ['USD', 'USDC', 'USDT'].includes(code) ? '$' : currencySymbol(code)
  return `${symbol}${formatAmount(Number(amount || 0))} ${code}`
}

export default function AdminUserDetailPage() {
  const params = useParams<{ id: string }>()
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null)

  // Credit modal state
  const [showCreditModal, setShowCreditModal] = useState(false)
  const [creditAmount, setCreditAmount] = useState('')
  const [creditCurrency, setCreditCurrency] = useState('USDC')
  const [creditNote, setCreditNote] = useState('')
  const [creditAdminPin, setCreditAdminPin] = useState('')
  const [crediting, setCrediting] = useState(false)
  const [creditError, setCreditError] = useState('')
  const [creditSuccess, setCreditSuccess] = useState('')

  const fetchUser = async (isRefresh = false) => {
    if (!params?.id) return
    if (isRefresh) setRefreshing(true)
    else setLoading(true)
    try {
      const data = await adminAPI.getUser(params.id)
      setUser(data)
    } catch {
      setUser(null)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    fetchUser()
  }, [params?.id])

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text)
    setCopiedAddress(id)
    setTimeout(() => setCopiedAddress(null), 2000)
  }

  const localBalances = useMemo(() => {
    const balances = user?.wallet?.localBalances
    if (!balances || typeof balances !== 'object') return [] as [string, unknown][]
    return Object.entries(balances).filter(([, amount]) => Number(amount) !== 0)
  }, [user])

  // Unified activity stream combining transactions, conversions, and bill payments
  const allActivity = useMemo(() => {
    const list: any[] = []
    if (user?.activity?.transactions) {
      list.push(...user.activity.transactions.map((t: any) => ({ ...t, kind: 'transaction' })))
    }
    if (user?.activity?.conversions) {
      list.push(...user.activity.conversions.map((c: any) => ({
        id: c.id,
        type: 'CONVERT',
        status: c.status,
        amount: c.fromAmount,
        currency: c.fromCurrency,
        createdAt: c.createdAt,
        reference: c.reference || c.id,
        metadata: { from: c.fromCurrency, to: c.toCurrency, fromAmount: c.fromAmount, toAmount: c.toAmount, rate: c.rate },
        kind: 'conversion',
      })))
    }
    if (user?.activity?.bills) {
      list.push(...user.activity.bills.map((b: any) => ({
        id: b.id,
        type: 'BILL_PAYMENT',
        status: b.status,
        amount: b.amount,
        currency: b.currency || 'USDC',
        createdAt: b.createdAt,
        reference: b.reference || b.id,
        metadata: { billType: b.billType, customerId: b.customerId, provider: b.billerCode },
        kind: 'bill',
      })))
    }

    const seen = new Set<string>()
    return list
      .filter(item => {
        const key = item.reference || item.id
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  }, [user])

  const handleCreditUser = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!creditAmount || Number(creditAmount) <= 0) {
      setCreditError('Please enter a valid amount')
      return
    }
    setCrediting(true)
    setCreditError('')
    setCreditSuccess('')
    try {
      await adminAPI.creditUser(
        user.id,
        {
          amount: Number(creditAmount),
          currency: creditCurrency,
          note: creditNote || 'Admin manual credit',
        },
        creditAdminPin ? { adminPin: creditAdminPin } : undefined
      )
      setCreditSuccess(`Successfully credited ${displayMoney(Number(creditAmount), creditCurrency)}`)
      setCreditAmount('')
      setCreditNote('')
      setCreditAdminPin('')
      setTimeout(() => {
        setShowCreditModal(false)
        setCreditSuccess('')
        fetchUser(true)
      }, 1500)
    } catch (err: any) {
      setCreditError(err?.response?.data?.message || err?.message || 'Failed to credit user')
    } finally {
      setCrediting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-28">
        <div className="w-8 h-8 rounded-full border-2 border-white/10 border-t-amber-400 animate-spin" />
      </div>
    )
  }

  if (!user) {
    return (
      <div className="py-20 text-center">
        <p className="text-sm text-[#94A3B8]">This user could not be found.</p>
        <Link href="/admin/users" className="inline-flex items-center gap-2 mt-4 text-sm font-semibold text-amber-400">
          <ArrowLeft className="w-4 h-4" /> Back to users
        </Link>
      </div>
    )
  }

  const statusClass = user.isBanned
    ? 'bg-red-500/10 text-red-400 border-red-500/20'
    : user.isActive
    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
    : 'bg-white/5 text-[#94A3B8] border-white/10'

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex items-center justify-between">
        <Link href="/admin/users" className="inline-flex items-center gap-2 text-xs font-semibold text-[#94A3B8] hover:text-white">
          <ArrowLeft className="w-3.5 h-3.5" /> All users
        </Link>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowCreditModal(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 text-xs font-bold transition-all"
          >
            <PlusCircle className="w-3.5 h-3.5" /> Credit User
          </button>
          <button
            onClick={() => fetchUser(true)}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-[#94A3B8] hover:text-white border border-white/10 text-xs font-medium transition-all"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-amber-400' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      <section className="liquid-glass p-5 sm:p-6 overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-5">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-[0.18em] font-extrabold text-[#64748B]">Customer account</p>
            <h1 className="text-2xl font-black text-white mt-1">{user.firstName} {user.lastName}</h1>
            <p className="text-sm text-[#94A3B8] mt-1 truncate">{user.email} · {user.phone || 'No phone number'}</p>
            <p className="text-xs text-[#64748B] mt-1">@{user.surexTag || '—'} · Joined {formatDate(user.createdAt)}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`px-2.5 py-1 rounded-full border text-[10px] font-bold ${statusClass}`}>
              {user.isBanned ? 'BANNED' : user.isActive ? 'ACTIVE' : 'DISABLED'}
            </span>
            <span className={`px-2.5 py-1 rounded-full border text-[10px] font-bold ${user.kycStatus === 'VERIFIED' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-amber-500/10 text-amber-400 border-amber-500/20'}`}>
              {user.kycStatus} KYC
            </span>
          </div>
        </div>
      </section>

      <section>
        <div className="flex items-center gap-2 mb-3">
          <Wallet className="w-4 h-4 text-amber-400" />
          <h2 className="text-sm font-bold text-white">Wallet balances</h2>
          <span className="text-[10px] text-[#64748B]">Amounts are kept in their original currencies.</span>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="liquid-glass p-4">
            <p className="text-[10px] uppercase tracking-wider text-[#64748B]">USDC</p>
            <p className="text-xl font-black text-white mt-2">{displayMoney(user.wallet?.usdcBalance, 'USDC')}</p>
          </div>
          <div className="liquid-glass p-4">
            <p className="text-[10px] uppercase tracking-wider text-[#64748B]">USDT</p>
            <p className="text-xl font-black text-white mt-2">{displayMoney(user.wallet?.usdtBalance, 'USDT')}</p>
          </div>
          <div className="liquid-glass p-4">
            <p className="text-[10px] uppercase tracking-wider text-[#64748B]">Reserved / Pending</p>
            <p className="text-xl font-black text-amber-400 mt-2">{displayMoney((user.wallet?.lockedBalance || 0) + (user.wallet?.pendingBalance || 0), 'USDC')}</p>
          </div>
          <div className="liquid-glass p-4">
            <p className="text-[10px] uppercase tracking-wider text-[#64748B]">Real NGN</p>
            <p className="text-xl font-black text-emerald-400 mt-2">{displayMoney(user.wallet?.realLocalBalance, 'NGN')}</p>
          </div>
        </div>
        <div className="liquid-glass mt-3 p-4">
          <p className="text-[10px] uppercase tracking-wider text-[#64748B] font-semibold mb-3">Local-currency wallets</p>
          {localBalances.length ? (
            <div className="flex flex-wrap gap-2">
              {localBalances.map(([currency, amount]) => (
                <span key={currency} className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm font-bold text-white">
                  {displayMoney(Number(amount), currency)}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-sm text-[#64748B]">No local-currency balance.</p>
          )}
        </div>
      </section>

      {/* Wallet Addresses (On-Chain) */}
      {user.walletAddresses && user.walletAddresses.length > 0 && (
        <section className="liquid-glass p-5">
          <div className="flex items-center gap-2 mb-3">
            <Wallet className="w-4 h-4 text-cyan-400" />
            <h2 className="text-sm font-bold text-white">Deposit & On-Chain Addresses</h2>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {user.walletAddresses.map((addr: any) => (
              <div key={addr.id || addr.address} className="p-3 rounded-xl border border-white/5 bg-white/[0.02] flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[10px] uppercase font-bold tracking-wider text-cyan-400">{addr.network}</p>
                  <p className="text-xs font-mono text-[#94A3B8] truncate mt-0.5">{addr.address}</p>
                </div>
                <button
                  onClick={() => copyToClipboard(addr.address, addr.id || addr.address)}
                  className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-[#94A3B8] hover:text-white transition-all flex-shrink-0"
                  title="Copy address"
                >
                  {copiedAddress === (addr.id || addr.address) ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="grid lg:grid-cols-3 gap-5">
        <div className="liquid-glass p-5 lg:col-span-2 overflow-hidden">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Clock3 className="w-4 h-4 text-blue-400" />
              <h2 className="text-sm font-bold text-white">Recent account activity</h2>
            </div>
            <span className="text-xs text-[#64748B] font-medium">{allActivity.length} recorded</span>
          </div>

          {allActivity.length ? (
            <div className="divide-y divide-white/5">
              {allActivity.map((transaction: any) => {
                const swap = getSwapInfo(transaction)
                const typeUpper = String(transaction.type || '').toUpperCase()
                const credit = ['RECEIVE', 'REFERRAL_EARNING'].includes(typeUpper)
                return (
                  <div key={transaction.id || transaction.reference} className="flex items-center justify-between gap-4 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white truncate">
                        {swap ? `${swap.from} → ${swap.to}` : typeUpper.replace(/_/g, ' ')}
                      </p>
                      <p className="text-[10px] text-[#64748B] truncate">
                        {transaction.reference || '—'} · {formatDate(transaction.createdAt)}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className={`text-sm font-bold ${credit ? 'text-emerald-400' : 'text-white'}`}>
                        {swap
                          ? `${displayMoney(swap.fromAmount, swap.from)} → ${displayMoney(swap.toAmount, swap.to)}`
                          : `${credit ? '+' : ''}${displayMoney(transaction.amount, transaction.currency)}`}
                      </p>
                      <p className="text-[10px] text-[#64748B] uppercase font-bold">{transaction.status}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="text-sm text-[#64748B] py-8 text-center">No transactions recorded for this user.</p>
          )}
        </div>

        <div className="space-y-5">
          <div className="liquid-glass p-5">
            <div className="flex items-center gap-2 mb-3">
              <Landmark className="w-4 h-4 text-emerald-400" />
              <h2 className="text-sm font-bold text-white">Saved banks</h2>
            </div>
            <p className="text-2xl font-black text-white">{user.bankAccounts?.length || 0}</p>
            <p className="text-xs text-[#64748B] mt-1">Verified payout destinations</p>
          </div>

          <div className="liquid-glass p-5">
            <div className="flex items-center gap-2 mb-3">
              <ShieldCheck className="w-4 h-4 text-amber-400" />
              <h2 className="text-sm font-bold text-white">Account controls</h2>
            </div>
            <div className="space-y-2 text-xs text-[#94A3B8]">
              <p>2FA: <span className="text-white font-semibold">{user.twoFactorEnabled ? 'Enabled' : 'Not enabled'}</span></p>
              <p>Default wallet: <span className="text-white font-semibold">{user.defaultWallet || 'AUTO'}</span></p>
              <p>Display currency: <span className="text-white font-semibold">{user.currencyDisplay || 'NGN'}</span></p>
            </div>
          </div>

          <div className="liquid-glass p-5">
            <div className="flex items-center gap-2 mb-3">
              <ArrowUpRight className="w-4 h-4 text-purple-400" />
              <h2 className="text-sm font-bold text-white">Referrals</h2>
            </div>
            <p className="text-2xl font-black text-white">{user.referralsMade?.length || 0}</p>
            <p className="text-xs text-[#64748B] mt-1">Attributed registrations</p>
          </div>
        </div>
      </section>

      {/* Manual Credit Modal */}
      {showCreditModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="liquid-glass max-w-md w-full p-6 space-y-4">
            <h3 className="text-lg font-black text-white">Credit Customer Account</h3>
            <p className="text-xs text-[#94A3B8]">Directly credit funds to {user.firstName}&apos;s wallet balance.</p>

            {creditError && <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-semibold">{creditError}</div>}
            {creditSuccess && <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold">{creditSuccess}</div>}

            <form onSubmit={handleCreditUser} className="space-y-3">
              <div>
                <label className="text-[10px] uppercase tracking-wider text-[#64748B] font-bold block mb-1">Currency</label>
                <select
                  value={creditCurrency}
                  onChange={(e) => setCreditCurrency(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-400"
                >
                  <option value="USDC" className="bg-[#12141A]">USDC (USD Coin)</option>
                  <option value="USDT" className="bg-[#12141A]">USDT (Tether)</option>
                  <option value="NGN" className="bg-[#12141A]">NGN (Nigerian Naira)</option>
                </select>
              </div>

              <div>
                <label className="text-[10px] uppercase tracking-wider text-[#64748B] font-bold block mb-1">Amount</label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  placeholder="0.00"
                  value={creditAmount}
                  onChange={(e) => setCreditAmount(e.target.value)}
                  required
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-400"
                />
              </div>

              <div>
                <label className="text-[10px] uppercase tracking-wider text-[#64748B] font-bold block mb-1">Admin Note / Reason</label>
                <input
                  type="text"
                  placeholder="e.g. Testnet faucet, campaign award, resolution"
                  value={creditNote}
                  onChange={(e) => setCreditNote(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-400"
                />
              </div>

              <div>
                <label className="text-[10px] uppercase tracking-wider text-[#64748B] font-bold block mb-1">Admin PIN (if required)</label>
                <input
                  type="password"
                  placeholder="Enter 4-digit PIN if enabled"
                  value={creditAdminPin}
                  onChange={(e) => setCreditAdminPin(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-400"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreditModal(false)}
                  disabled={crediting}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-[#94A3B8] hover:text-white bg-white/5 hover:bg-white/10"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={crediting}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-black bg-amber-400 hover:bg-amber-300 disabled:opacity-50"
                >
                  {crediting ? 'Crediting...' : 'Confirm Credit'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
