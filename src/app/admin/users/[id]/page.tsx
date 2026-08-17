'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { adminAPI } from '@/lib/api'
import { ArrowLeft, Ban, CheckCircle2, ShieldCheck } from 'lucide-react'
import Link from 'next/link'
import { formatDate } from '@/lib/utils'
import toast from 'react-hot-toast'

export default function AdminUserDetailPage() {
  const { id } = useParams()
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [role, setRole] = useState('')

  useEffect(() => {
    if (!id) return
    setLoading(true)
    adminAPI.getUser(String(id)).then((u: any) => {
      setData(u)
      setRole(u?.role || 'USER')
    }).catch(() => setData(null)).finally(() => setLoading(false))
  }, [id])

  if (loading) {
    return <div className="flex justify-center py-32"><div className="w-8 h-8 rounded-full border-2 border-white/10 border-t-white/40 animate-spin" /></div>
  }
  if (!data) return <p className="text-[#94A3B8] text-sm py-20 text-center">User not found.</p>

  const save = () => {
    adminAPI.updateUser(String(id), { role }).then(() => toast.success('Saved')).catch(() => toast.error('Save failed'))
  }
  const toggle = (body: any) => {
    adminAPI.updateUser(String(id), body).then(() => { toast.success('User updated'); setData((d: any) => ({ ...d, ...body })) }).catch(() => toast.error('Update failed'))
  }
  const w = data.wallet
  const fmt = (n: number) => Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })

  return (
    <div className="space-y-5">
      <Link href="/admin/users" className="inline-flex items-center gap-1.5 text-xs text-[#94A3B8] hover:text-white">
        <ArrowLeft className="w-3.5 h-3.5" /> Back to users
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-extrabold">{data.firstName} {data.lastName}</h1>
          <p className="text-xs text-[#64748B] mt-0.5">@{data.surexTag || '—'} · {data.email} · {data.phone || 'no phone'}</p>
        </div>
        <div className="flex items-center gap-2">
          {data.isBanned ? (
            <button onClick={() => toggle({ isBanned: false })} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-500/15 text-emerald-400 text-xs font-semibold">
              <CheckCircle2 className="w-3.5 h-3.5" /> Unban
            </button>
          ) : (
            <button onClick={() => toggle({ isBanned: true })} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-red-500/15 text-red-400 text-xs font-semibold">
              <Ban className="w-3.5 h-3.5" /> Ban
            </button>
          )}
          <button onClick={() => toggle({ isActive: !data.isActive })} className="px-3 py-2 rounded-xl bg-white/5 text-white text-xs font-semibold border border-white/10">
            {data.isActive ? 'Disable' : 'Enable'}
          </button>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="liquid-glass p-4 relative overflow-hidden">
          <p className="text-[10px] uppercase tracking-wider text-[#64748B] font-semibold">USDT Balance</p>
          <p className="text-xl font-black text-white mt-1.5">${fmt(w?.usdtBalance)}</p>
        </div>
        <div className="liquid-glass p-4 relative overflow-hidden">
          <p className="text-[10px] uppercase tracking-wider text-[#64748B] font-semibold">USDC Balance</p>
          <p className="text-xl font-black text-white mt-1.5">${fmt(w?.usdcBalance)}</p>
        </div>
        <div className="liquid-glass p-4 relative overflow-hidden">
          <p className="text-[10px] uppercase tracking-wider text-[#64748B] font-semibold">Local Balance</p>
          <p className="text-xl font-black text-white mt-1.5">{fmt(w?.localBalance)}</p>
          <p className="text-[10px] text-[#64748B] mt-0.5">{JSON.stringify(w?.localBalances || {})}</p>
        </div>
        <div className="liquid-glass p-4 relative overflow-hidden">
          <p className="text-[10px] uppercase tracking-wider text-[#64748B] font-semibold">Locked / Pending</p>
          <p className="text-xl font-black text-white mt-1.5">${fmt(w?.lockedBalance)}</p>
          <p className="text-[10px] text-[#64748B] mt-0.5">${fmt(w?.pendingBalance)} pending</p>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        <div className="liquid-glass p-5 relative overflow-hidden space-y-4">
          <h3 className="font-semibold text-sm text-white">Profile</h3>
          <div className="space-y-2 text-xs">
            {[
              ['KYC Status', data.kycStatus],
              ['KYC Tier', String(data.kycTier)],
              ['2FA', data.twoFactorEnabled ? 'Enabled' : 'Disabled'],
              ['Display Currency', data.currencyDisplay],
              ['Default Wallet', data.defaultWallet],
              ['Referral Code', data.referralCode],
              ['Joined', formatDate(data.createdAt)],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between py-1.5 border-b border-white/5">
                <span className="text-[#64748B]">{k}</span>
                <span className="text-white font-medium">{v}</span>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between pt-2">
            <label className="flex items-center gap-2 text-xs text-[#94A3B8]">
              <ShieldCheck className="w-3.5 h-3.5 text-amber-400" /> Role
            </label>
            <div className="flex gap-2">
              <select value={role} onChange={e => setRole(e.target.value)} className="bg-[#0F1629] border border-white/10 rounded-lg px-2 py-1 text-xs text-white outline-none">
                <option value="USER">USER</option>
                <option value="ADMIN">ADMIN</option>
              </select>
              <button onClick={save} className="px-3 py-1 rounded-lg bg-white/10 text-xs text-white font-semibold hover:bg-white/15">Save</button>
            </div>
          </div>
        </div>

        <div className="liquid-glass p-5 relative overflow-hidden">
          <h3 className="font-semibold text-sm text-white mb-3">KYC documents</h3>
          {data.kycDocuments.length === 0 ? (
            <p className="text-xs text-[#64748B]">No documents submitted.</p>
          ) : (
            <div className="space-y-2">
              {data.kycDocuments.map((d: any) => (
                <div key={d.id} className="flex items-center justify-between py-2 px-3 rounded-xl bg-white/[0.03] border border-white/5">
                  <div>
                    <p className="text-xs text-white font-semibold">{d.type} · Tier {d.tier}</p>
                    <p className="text-[10px] text-[#64748B]">{formatDate(d.createdAt)}{d.rejectionReason ? ` · ${d.rejectionReason}` : ''}</p>
                  </div>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-semibold ${
                    d.status === 'VERIFIED' ? 'bg-emerald-500/10 text-emerald-400' :
                    d.status === 'REJECTED' ? 'bg-red-500/10 text-red-400' :
                    d.status === 'PENDING' ? 'bg-amber-500/10 text-amber-400' : 'bg-white/5 text-[#64748B]'
                  }`}>{d.status}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="liquid-glass p-5 relative overflow-hidden">
        <h3 className="font-semibold text-sm text-white mb-3">Recent activity</h3>
        <div className="space-y-3">
          {data.activity.transactions.slice(0, 8).map((t: any) => (
            <div key={t.id} className="flex items-center justify-between py-2 px-3 rounded-xl bg-white/[0.03] border border-white/5">
              <div>
                <p className="text-xs text-white font-semibold">{t.type}</p>
                <p className="text-[10px] text-[#64748B]">{t.reference}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-white font-semibold">${fmt(t.amount)}</p>
                <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-semibold ${
                  t.status === 'COMPLETED' ? 'bg-emerald-500/10 text-emerald-400' :
                  t.status === 'FAILED' ? 'bg-red-500/10 text-red-400' : 'bg-amber-500/10 text-amber-400'
                }`}>{t.status}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}