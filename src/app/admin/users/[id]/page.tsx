'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { adminAPI } from '@/lib/api'
import { ArrowLeft, Ban, CheckCircle2, ShieldCheck, Plus, Trash2, Users, Gift } from 'lucide-react'
import Link from 'next/link'
import { formatDate } from '@/lib/utils'
import toast from 'react-hot-toast'

export default function AdminUserDetailPage() {
  const { id } = useParams()
  const router = useRouter()
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [role, setRole] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')

  // Manual deposit credit form
  const [creditOpen, setCreditOpen] = useState(false)
  const [creditAmount, setCreditAmount] = useState('')
  const [creditCurrency, setCreditCurrency] = useState('USDC')
  const [creditNote, setCreditNote] = useState('')
  const [crediting, setCrediting] = useState(false)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    adminAPI.getUser(String(id)).then((u: any) => {
      setData(u)
      setRole(u?.role || 'USER')
      setEmail(u?.email || '')
      setPhone(u?.phone || '')
    }).catch(() => setData(null)).finally(() => setLoading(false))
  }, [id])

  if (loading) {
    return <div className="flex justify-center py-32"><div className="w-8 h-8 rounded-full border-2 border-white/10 border-t-white/40 animate-spin" /></div>
  }
  if (!data) return <p className="text-[#94A3B8] text-sm py-20 text-center">User not found.</p>

  const save = () => {
    adminAPI.updateUser(String(id), { role, email, phone }).then(() => toast.success('Saved')).catch(() => toast.error('Save failed (email/phone may be in use)'))
  }
  const toggle = (body: any) => {
    adminAPI.updateUser(String(id), body).then(() => { toast.success('User updated'); setData((d: any) => ({ ...d, ...body })) }).catch(() => toast.error('Update failed'))
  }
  const handleDelete = () => {
    if (!window.confirm(`Delete ${data?.firstName} ${data?.lastName} permanently? This removes their wallet, transactions and documents.`)) return
    adminAPI.deleteUser(String(id))
      .then(() => { toast.success('User deleted'); router.push('/admin/users') })
      .catch((e: any) => toast.error(e?.response?.data?.message || 'Delete failed'))
  }
  const credit = () => {
    const amount = parseFloat(creditAmount)
    if (!amount || amount <= 0) return toast.error('Enter a valid amount')
    setCrediting(true)
    adminAPI.creditUser(String(id), { amount, currency: creditCurrency, note: creditNote || undefined })
      .then((res: any) => {
        toast.success(`${amount} ${creditCurrency} credited (${res.reference})`)
        setCreditOpen(false)
        setCreditAmount(''); setCreditNote('')
        adminAPI.getUser(String(id)).then(setData)
      })
      .catch((e: any) => toast.error(e?.response?.data?.message || 'Credit failed'))
      .finally(() => setCrediting(false))
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
          <button
            onClick={handleDelete}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-red-500/10 text-red-400 text-xs font-semibold border border-red-500/20 hover:bg-red-500/20"
            title="Permanently delete user"
          >
            <Trash2 className="w-3.5 h-3.5" /> Delete
          </button>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="liquid-glass p-4 relative overflow-hidden">
          <p className="text-[10px] uppercase tracking-wider text-[#64748B] font-semibold">USDC Balance</p>
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
          <p className="text-[10px] text-emerald-400 mt-1">Real naira (pays bills): ₦{fmt(w?.realLocalBalance)}</p>
        </div>
        <div className="liquid-glass p-4 relative overflow-hidden">
          <p className="text-[10px] uppercase tracking-wider text-[#64748B] font-semibold">Locked / Pending</p>
          <p className="text-xl font-black text-white mt-1.5">${fmt(w?.lockedBalance)}</p>
          <p className="text-[10px] text-[#64748B] mt-0.5">${fmt(w?.pendingBalance)} pending</p>
        </div>
      </div>

      <div className="liquid-glass p-4 relative overflow-hidden">
        {!creditOpen ? (
          <button onClick={() => setCreditOpen(true)} className="flex items-center gap-2 text-xs text-emerald-400 font-semibold hover:text-emerald-300 transition-colors">
            <Plus className="w-4 h-4" /> Credit wallet (manual deposit)
          </button>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-[#94A3B8]">Credit this wallet after confirming an off-platform deposit. USDC goes to the testnet crypto wallet; NGN is real money that can pay bills. Creates a completed RECEIVE transaction and notifies the user.</p>
            <div className="flex flex-wrap items-end gap-3">
              <label className="block">
                <span className="text-[10px] text-[#64748B] font-semibold uppercase tracking-wider">Amount</span>
                <input value={creditAmount} onChange={e => setCreditAmount(e.target.value)} type="number" min="0" step="any" placeholder="0.00" className="mt-1 w-36 bg-[#121419] border border-white/10 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-white/25" />
              </label>
              <label className="block">
                <span className="text-[10px] text-[#64748B] font-semibold uppercase tracking-wider">Currency</span>
                <select value={creditCurrency} onChange={e => setCreditCurrency(e.target.value)} className="mt-1 bg-[#121419] border border-white/10 rounded-lg px-3 py-2 text-xs text-white outline-none">
                  <option value="USDC">USDC</option>
                  <option value="NGN">NGN (real naira)</option>
                </select>
              </label>
              <label className="block flex-1 min-w-[160px]">
                <span className="text-[10px] text-[#64748B] font-semibold uppercase tracking-wider">Note</span>
                <input value={creditNote} onChange={e => setCreditNote(e.target.value)} type="text" placeholder="e.g. Bank transfer 12/03" className="mt-1 w-full bg-[#121419] border border-white/10 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-white/25" />
              </label>
              <button onClick={credit} disabled={crediting} className="px-4 py-2 rounded-lg bg-emerald-500/20 text-emerald-300 text-xs font-semibold hover:bg-emerald-500/30 disabled:opacity-50">
                {crediting ? 'Crediting…' : 'Credit'}
              </button>
              <button onClick={() => setCreditOpen(false)} className="px-3 py-2 rounded-lg bg-white/5 text-[#94A3B8] text-xs hover:bg-white/10">Cancel</button>
            </div>
          </div>
        )}
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
              <select value={role} onChange={e => setRole(e.target.value)} className="bg-[#121419] border border-white/10 rounded-lg px-2 py-1 text-xs text-white outline-none">
                <option value="USER">USER</option>
                <option value="ADMIN">ADMIN</option>
              </select>
            </div>
          </div>

          <div className="space-y-2 pt-1">
            <label className="block">
              <span className="text-[10px] text-[#64748B] font-semibold uppercase tracking-wider">Email</span>
              <input value={email} onChange={e => setEmail(e.target.value)} type="email" className="mt-1 w-full bg-[#121419] border border-white/10 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-white/25" />
            </label>
            <label className="block">
              <span className="text-[10px] text-[#64748B] font-semibold uppercase tracking-wider">Phone</span>
              <input value={phone} onChange={e => setPhone(e.target.value)} type="text" className="mt-1 w-full bg-[#121419] border border-white/10 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-white/25" />
            </label>
            <button onClick={save} className="w-full px-3 py-2 rounded-lg bg-white/10 text-xs text-white font-semibold hover:bg-white/15">Save profile</button>
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
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="font-semibold text-sm text-white flex items-center gap-2"><Users className="w-4 h-4 text-cyan-400" /> Referral network</h3>
            <p className="text-[11px] text-[#64748B] mt-1">Verified signup attribution for this account.</p>
          </div>
          <div className="text-right"><p className="text-xl font-black text-white">{data.referralsMade?.length || 0}</p><p className="text-[10px] text-[#64748B]">users invited</p></div>
        </div>

        {data.referredUsers?.[0]?.referrer && (
          <div className="mb-4 rounded-xl border border-cyan-400/15 bg-cyan-400/[0.05] px-3 py-2.5 text-xs">
            <span className="text-[#64748B]">Referred by </span>
            <Link href={`/admin/users/${data.referredUsers[0].referrer.id}`} className="text-cyan-300 font-semibold hover:underline">
              {data.referredUsers[0].referrer.firstName} {data.referredUsers[0].referrer.lastName}
            </Link>
            <span className="text-[#64748B]"> · {data.referredUsers[0].referrer.referralCode}</span>
          </div>
        )}

        {!data.referralsMade?.length ? (
          <div className="py-8 text-center"><Gift className="w-6 h-6 mx-auto text-[#475569]" /><p className="text-xs text-[#64748B] mt-2">This user has not referred anyone yet.</p></div>
        ) : (
          <div className="divide-y divide-white/5 border border-white/5 rounded-xl overflow-hidden">
            {data.referralsMade.map((referral: any) => (
              <div key={referral.id} className="flex items-center justify-between gap-3 px-3 py-3 bg-white/[0.02]">
                <div className="min-w-0">
                  <Link href={`/admin/users/${referral.referred.id}`} className="text-xs text-white font-semibold hover:underline truncate block">{referral.referred.firstName} {referral.referred.lastName}</Link>
                  <p className="text-[10px] text-[#64748B] truncate">{referral.referred.email} · joined {formatDate(referral.referred.createdAt)}</p>
                </div>
                <div className="text-right flex-shrink-0"><p className="text-xs font-semibold text-emerald-400">{fmt(referral.earnings)} USDC</p><p className="text-[9px] text-[#64748B]">{referral.isActive ? 'ACTIVE' : 'INACTIVE'}</p></div>
              </div>
            ))}
          </div>
        )}
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
