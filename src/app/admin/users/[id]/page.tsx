'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { ArrowLeft, ArrowUpRight, Clock3, Landmark, ShieldCheck, Wallet } from 'lucide-react'
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

  useEffect(() => {
    if (!params?.id) return
    setLoading(true)
    adminAPI.getUser(params.id).then(setUser).catch(() => setUser(null)).finally(() => setLoading(false))
  }, [params?.id])

  const localBalances = useMemo(() => {
    const balances = user?.wallet?.localBalances
    if (!balances || typeof balances !== 'object') return [] as [string, unknown][]
    return Object.entries(balances).filter(([, amount]) => Number(amount) !== 0)
  }, [user])

  if (loading) {
    return <div className="flex justify-center py-28"><div className="w-8 h-8 rounded-full border-2 border-white/10 border-t-white/40 animate-spin" /></div>
  }

  if (!user) {
    return (
      <div className="py-20 text-center">
        <p className="text-sm text-[#94A3B8]">This user could not be found.</p>
        <Link href="/admin/users" className="inline-flex items-center gap-2 mt-4 text-sm font-semibold text-amber-400"><ArrowLeft className="w-4 h-4" /> Back to users</Link>
      </div>
    )
  }

  const transactions = user.activity?.transactions || []
  const statusClass = user.isBanned ? 'bg-red-500/10 text-red-400 border-red-500/20' : user.isActive ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-white/5 text-[#94A3B8] border-white/10'

  return (
    <div className="space-y-6 max-w-6xl">
      <Link href="/admin/users" className="inline-flex items-center gap-2 text-xs font-semibold text-[#94A3B8] hover:text-white"><ArrowLeft className="w-3.5 h-3.5" /> All users</Link>

      <section className="liquid-glass p-5 sm:p-6 overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-5">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-[0.18em] font-extrabold text-[#64748B]">Customer account</p>
            <h1 className="text-2xl font-black text-white mt-1">{user.firstName} {user.lastName}</h1>
            <p className="text-sm text-[#94A3B8] mt-1 truncate">{user.email} · {user.phone || 'No phone number'}</p>
            <p className="text-xs text-[#64748B] mt-1">@{user.surexTag || '—'} · Joined {formatDate(user.createdAt)}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`px-2.5 py-1 rounded-full border text-[10px] font-bold ${statusClass}`}>{user.isBanned ? 'BANNED' : user.isActive ? 'ACTIVE' : 'DISABLED'}</span>
            <span className={`px-2.5 py-1 rounded-full border text-[10px] font-bold ${user.kycStatus === 'VERIFIED' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-amber-500/10 text-amber-400 border-amber-500/20'}`}>{user.kycStatus} KYC</span>
          </div>
        </div>
      </section>

      <section>
        <div className="flex items-center gap-2 mb-3"><Wallet className="w-4 h-4 text-amber-400" /><h2 className="text-sm font-bold text-white">Wallet balances</h2><span className="text-[10px] text-[#64748B]">Amounts are kept in their original currencies.</span></div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="liquid-glass p-4"><p className="text-[10px] uppercase tracking-wider text-[#64748B]">USDC</p><p className="text-xl font-black text-white mt-2">{displayMoney(user.wallet?.usdcBalance, 'USDC')}</p></div>
          <div className="liquid-glass p-4"><p className="text-[10px] uppercase tracking-wider text-[#64748B]">Reserved</p><p className="text-xl font-black text-amber-400 mt-2">{displayMoney(user.wallet?.lockedBalance, 'USDC')}</p></div>
          <div className="liquid-glass p-4"><p className="text-[10px] uppercase tracking-wider text-[#64748B]">Pending</p><p className="text-xl font-black text-blue-400 mt-2">{displayMoney(user.wallet?.pendingBalance, 'USDC')}</p></div>
          <div className="liquid-glass p-4"><p className="text-[10px] uppercase tracking-wider text-[#64748B]">Real NGN</p><p className="text-xl font-black text-emerald-400 mt-2">{displayMoney(user.wallet?.realLocalBalance, 'NGN')}</p></div>
        </div>
        <div className="liquid-glass mt-3 p-4">
          <p className="text-[10px] uppercase tracking-wider text-[#64748B] font-semibold mb-3">Local-currency wallets</p>
          {localBalances.length ? <div className="flex flex-wrap gap-2">{localBalances.map(([currency, amount]) => <span key={currency} className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm font-bold text-white">{displayMoney(Number(amount), currency)}</span>)}</div> : <p className="text-sm text-[#64748B]">No local-currency balance.</p>}
        </div>
      </section>

      <section className="grid lg:grid-cols-3 gap-5">
        <div className="liquid-glass p-5 lg:col-span-2 overflow-hidden">
          <div className="flex items-center gap-2 mb-4"><Clock3 className="w-4 h-4 text-blue-400" /><h2 className="text-sm font-bold text-white">Recent account activity</h2></div>
          {transactions.length ? (
            <div className="divide-y divide-white/5">
              {transactions.map((transaction: any) => {
                const swap = getSwapInfo(transaction)
                const credit = ['RECEIVE', 'REFERRAL_EARNING'].includes(String(transaction.type).toUpperCase())
                return <div key={transaction.id} className="flex items-center justify-between gap-4 py-3">
                  <div className="min-w-0"><p className="text-sm font-semibold text-white truncate">{swap ? `${swap.from} → ${swap.to}` : String(transaction.type || '').replace(/_/g, ' ')}</p><p className="text-[10px] text-[#64748B] truncate">{transaction.reference} · {formatDate(transaction.createdAt)}</p></div>
                  <div className="text-right flex-shrink-0"><p className={`text-sm font-bold ${credit ? 'text-emerald-400' : 'text-white'}`}>{swap ? `${displayMoney(swap.fromAmount, swap.from)} → ${displayMoney(swap.toAmount, swap.to)}` : displayMoney(transaction.amount, transaction.currency)}</p><p className="text-[10px] text-[#64748B]">{transaction.status}</p></div>
                </div>
              })}
            </div>
          ) : <p className="text-sm text-[#64748B] py-8 text-center">No transactions recorded for this user.</p>}
        </div>

        <div className="space-y-5">
          <div className="liquid-glass p-5"><div className="flex items-center gap-2 mb-3"><Landmark className="w-4 h-4 text-emerald-400" /><h2 className="text-sm font-bold text-white">Saved banks</h2></div><p className="text-2xl font-black text-white">{user.bankAccounts?.length || 0}</p><p className="text-xs text-[#64748B] mt-1">Verified payout destinations</p></div>
          <div className="liquid-glass p-5"><div className="flex items-center gap-2 mb-3"><ShieldCheck className="w-4 h-4 text-amber-400" /><h2 className="text-sm font-bold text-white">Account controls</h2></div><div className="space-y-2 text-xs text-[#94A3B8]"><p>2FA: <span className="text-white font-semibold">{user.twoFactorEnabled ? 'Enabled' : 'Not enabled'}</span></p><p>Default wallet: <span className="text-white font-semibold">{user.defaultWallet || 'AUTO'}</span></p><p>Display currency: <span className="text-white font-semibold">{user.currencyDisplay || 'NGN'}</span></p></div></div>
          <div className="liquid-glass p-5"><div className="flex items-center gap-2 mb-3"><ArrowUpRight className="w-4 h-4 text-purple-400" /><h2 className="text-sm font-bold text-white">Referrals</h2></div><p className="text-2xl font-black text-white">{user.referralsMade?.length || 0}</p><p className="text-xs text-[#64748B] mt-1">Attributed registrations</p></div>
        </div>
      </section>
    </div>
  )
}
