'use client'

import { useEffect, useState } from 'react'
import { adminAPI } from '@/lib/api'
import { Users, UserCheck, ShieldAlert, FileText, TrendingUp, TrendingDown, Wallet, ArrowUpRight } from 'lucide-react'
import Link from 'next/link'
import { formatDate } from '@/lib/utils'

export default function AdminOverviewPage() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    adminAPI.getOverview().then(setData).catch(() => setData(null)).finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="w-8 h-8 rounded-full border-2 border-white/10 border-t-white/40 animate-spin" />
      </div>
    )
  }

  if (!data) {
    return <p className="text-[#94A3B8] text-sm py-20 text-center">Failed to load overview.</p>
  }

  const kpis = [
    { label: 'Total Users', value: data.totalUsers, icon: Users, color: '#60A5FA' },
    { label: 'Active Users', value: data.activeUsers, icon: UserCheck, color: '#10B981' },
    { label: 'Pending KYC', value: data.kycPending, icon: ShieldAlert, color: '#F59E0B' },
    { label: 'Transactions', value: data.totalTransactions, icon: FileText, color: '#A78BFA' },
  ]

  const maxSignups = Math.max(1, ...data.signups.map((s: any) => s.count))
  const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 2 })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-extrabold">Overview</h1>
        <p className="text-xs text-[#64748B] mt-0.5">Live platform metrics</p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {kpis.map(k => (
          <div key={k.label} className="liquid-glass p-4 relative overflow-hidden">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] uppercase tracking-wider text-[#64748B] font-semibold">{k.label}</span>
              <k.icon className="w-4 h-4" style={{ color: k.color }} />
            </div>
            <p className="text-2xl font-black" style={{ color: k.color }}>{fmt(k.value)}</p>
          </div>
        ))}
      </div>

      {/* Volume + revenue */}
      <div className="grid sm:grid-cols-3 gap-3">
        <div className="liquid-glass p-4 relative overflow-hidden">
          <p className="text-[10px] uppercase tracking-wider text-[#64748B] font-semibold flex items-center gap-1.5"><TrendingUp className="w-3.5 h-3.5 text-emerald-400" /> Volume In (USD)</p>
          <p className="text-2xl font-black text-emerald-400 mt-2">${fmt(data.totalVolumeIn)}</p>
        </div>
        <div className="liquid-glass p-4 relative overflow-hidden">
          <p className="text-[10px] uppercase tracking-wider text-[#64748B] font-semibold flex items-center gap-1.5"><TrendingDown className="w-3.5 h-3.5 text-red-400" /> Volume Out (USD)</p>
          <p className="text-2xl font-black text-red-400 mt-2">${fmt(data.totalVolumeOut)}</p>
        </div>
        <div className="liquid-glass p-4 relative overflow-hidden">
          <p className="text-[10px] uppercase tracking-wider text-[#64748B] font-semibold flex items-center gap-1.5"><Wallet className="w-3.5 h-3.5 text-amber-400" /> Revenue (fees)</p>
          <p className="text-2xl font-black text-amber-400 mt-2">${fmt(data.revenue)}</p>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* 7-day signups */}
        <div className="liquid-glass p-5 relative overflow-hidden">
          <h3 className="font-semibold text-sm text-white mb-4">New signups (7 days)</h3>
          <div className="flex items-end gap-2 h-40">
            {data.signups.map((s: any) => (
              <div key={s.date} className="flex-1 flex flex-col items-center gap-1">
                <span className="text-[10px] text-[#94A3B8]">{s.count}</span>
                <div
                  className="w-full rounded-t-md transition-all"
                  style={{ height: `${Math.max(4, (s.count / maxSignups) * 100)}%`, background: 'linear-gradient(180deg, #D4A017, rgba(212,160,23,0.25))' }}
                />
                <span className="text-[9px] text-[#64748B]">{s.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Recent users */}
        <div className="liquid-glass p-5 relative overflow-hidden">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-sm text-white">Recent signups</h3>
            <Link href="/admin/users" className="text-[11px] text-[#94A3B8] hover:text-white flex items-center gap-1">All users <ArrowUpRight className="w-3 h-3" /></Link>
          </div>
          <div className="space-y-2">
            {data.recentUsers.map((u: any) => (
              <div key={u.id} className="flex items-center justify-between py-2 px-3 rounded-xl bg-white/[0.03] border border-white/5">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-white truncate">{u.firstName} {u.lastName}</p>
                  <p className="text-[10px] text-[#64748B] truncate">{u.email}</p>
                </div>
                <div className="text-right flex-shrink-0 ml-2">
                  <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-semibold ${
                    u.kycStatus === 'VERIFIED' ? 'bg-emerald-500/10 text-emerald-400' :
                    u.kycStatus === 'PENDING' ? 'bg-amber-500/10 text-amber-400' : 'bg-white/5 text-[#64748B]'
                  }`}>{u.kycStatus}</span>
                  <p className="text-[9px] text-[#64748B] mt-0.5">{formatDate(u.createdAt)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent transactions */}
      <div className="liquid-glass p-5 relative overflow-hidden">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-sm text-white">Recent transactions</h3>
          <Link href="/admin/transactions" className="text-[11px] text-[#94A3B8] hover:text-white flex items-center gap-1">All transactions <ArrowUpRight className="w-3 h-3" /></Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="text-[#64748B] text-[10px] uppercase tracking-wider">
                <th className="py-2 pr-3">User</th>
                <th className="py-2 pr-3">Type</th>
                <th className="py-2 pr-3">Amount</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2">Date</th>
              </tr>
            </thead>
            <tbody>
              {data.recentTransactions.map((t: any) => (
                <tr key={t.id} className="border-t border-white/5">
                  <td className="py-2.5 pr-3 text-white">{t.user?.firstName} {t.user?.lastName}</td>
                  <td className="py-2.5 pr-3 text-[#94A3B8]">{t.type}</td>
                  <td className="py-2.5 pr-3 text-white">${fmt(t.amount)}</td>
                  <td className="py-2.5 pr-3">
                    <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-semibold ${
                      t.status === 'COMPLETED' ? 'bg-emerald-500/10 text-emerald-400' :
                      t.status === 'FAILED' ? 'bg-red-500/10 text-red-400' : 'bg-amber-500/10 text-amber-400'
                    }`}>{t.status}</span>
                  </td>
                  <td className="py-2.5 text-[#64748B]">{formatDate(t.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}