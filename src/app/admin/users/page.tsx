'use client'

import { useCallback, useEffect, useState } from 'react'
import { adminAPI } from '@/lib/api'
import { Search, ChevronLeft, ChevronRight, Ban, CheckCircle2, Eye } from 'lucide-react'
import Link from 'next/link'
import { formatDate } from '@/lib/utils'
import toast from 'react-hot-toast'

export default function AdminUsersPage() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [kycStatus, setKycStatus] = useState('')
  const [page, setPage] = useState(1)

  const load = useCallback(() => {
    setLoading(true)
    adminAPI.getUsers({ search: search || undefined, kycStatus: kycStatus || undefined, page })
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [search, kycStatus, page])

  useEffect(() => { load() }, [load])

  const toggleUser = (id: string, body: any) => {
    adminAPI.updateUser(id, body).then(() => {
      toast.success('User updated')
      load()
    }).catch(() => toast.error('Update failed'))
  }

  const totalPages = Math.max(1, Math.ceil((data?.total || 0) / (data?.limit || 20)))

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-extrabold">Users</h1>
        <p className="text-xs text-[#64748B] mt-0.5">{data ? `${data.total} users` : 'Loading…'}</p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex items-center gap-2 flex-1 bg-[#0F1629] border border-white/10 rounded-xl px-3 py-2">
          <Search className="w-4 h-4 text-[#64748B]" />
          <input
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }}
            placeholder="Search email, phone, name or @tag…"
            className="bg-transparent outline-none text-sm text-white w-full placeholder:text-[#64748B]"
          />
        </div>
        <select
          value={kycStatus}
          onChange={e => { setKycStatus(e.target.value); setPage(1) }}
          className="bg-[#0F1629] border border-white/10 rounded-xl px-3 py-2 text-sm text-white outline-none"
        >
          <option value="">All KYC</option>
          <option value="UNVERIFIED">Unverified</option>
          <option value="PENDING">Pending</option>
          <option value="VERIFIED">Verified</option>
          <option value="REJECTED">Rejected</option>
        </select>
      </div>

      {loading && !data ? (
        <div className="flex justify-center py-24"><div className="w-8 h-8 rounded-full border-2 border-white/10 border-t-white/40 animate-spin" /></div>
      ) : !data ? (
        <p className="text-[#94A3B8] text-sm py-20 text-center">Failed to load users.</p>
      ) : (
        <>
          <div className="liquid-glass p-4 sm:p-5 relative overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs min-w-[720px]">
                <thead>
                  <tr className="text-[#64748B] text-[10px] uppercase tracking-wider">
                    <th className="py-2 pr-3">User</th>
                    <th className="py-2 pr-3">Contact</th>
                    <th className="py-2 pr-3">Wallets (USDC)</th>
                    <th className="py-2 pr-3">KYC</th>
                    <th className="py-2 pr-3">Status</th>
                    <th className="py-2 pr-3">Joined</th>
                    <th className="py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.users.map((u: any) => (
                    <tr key={u.id} className="border-t border-white/5">
                      <td className="py-3 pr-3">
                        <p className="text-white font-semibold">{u.firstName} {u.lastName}</p>
                        <p className="text-[10px] text-[#64748B]">@{u.surexTag || '—'} · {u.role}</p>
                      </td>
                      <td className="py-3 pr-3 text-[#94A3B8]">
                        <p>{u.email}</p>
                        <p className="text-[10px] text-[#64748B]">{u.phone || '—'}</p>
                      </td>
                      <td className="py-3 pr-3 text-[#94A3B8]">
                        <p>${Number(u.wallet?.usdtBalance || 0).toLocaleString()}</p>
                        <p className="text-[10px] text-[#64748B]">${Number(u.wallet?.usdcBalance || 0).toLocaleString()} USDC</p>
                      </td>
                      <td className="py-3 pr-3">
                        <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-semibold ${
                          u.kycStatus === 'VERIFIED' ? 'bg-emerald-500/10 text-emerald-400' :
                          u.kycStatus === 'PENDING' ? 'bg-amber-500/10 text-amber-400' :
                          u.kycStatus === 'REJECTED' ? 'bg-red-500/10 text-red-400' : 'bg-white/5 text-[#64748B]'
                        }`}>{u.kycStatus} {u.kycTier > 0 ? `· T${u.kycTier}` : ''}</span>
                      </td>
                      <td className="py-3 pr-3">
                        {u.isBanned ? (
                          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-red-500/15 text-red-400 font-semibold">BANNED</span>
                        ) : u.isActive ? (
                          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 font-semibold">ACTIVE</span>
                        ) : (
                          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-white/5 text-[#64748B] font-semibold">DISABLED</span>
                        )}
                      </td>
                      <td className="py-3 pr-3 text-[#64748B]">{formatDate(u.createdAt)}</td>
                      <td className="py-3">
                        <div className="flex items-center gap-1.5">
                          <Link href={`/admin/users/${u.id}`} className="p-1.5 rounded-lg hover:bg-white/10 text-[#94A3B8] hover:text-white" title="View">
                            <Eye className="w-3.5 h-3.5" />
                          </Link>
                          <button
                            onClick={() => toggleUser(u.id, { isActive: !u.isActive })}
                            className="p-1.5 rounded-lg hover:bg-white/10 text-[#94A3B8] hover:text-white"
                            title={u.isActive ? 'Disable' : 'Enable'}
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => toggleUser(u.id, { isBanned: !u.isBanned })}
                            className={`p-1.5 rounded-lg hover:bg-white/10 ${u.isBanned ? 'text-red-400' : 'text-[#94A3B8] hover:text-red-400'}`}
                            title={u.isBanned ? 'Unban' : 'Ban'}
                          >
                            <Ban className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex items-center justify-between text-xs text-[#94A3B8]">
            <span>Page {page} of {totalPages}</span>
            <div className="flex gap-2">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 disabled:opacity-40">
                <ChevronLeft className="w-3.5 h-3.5" /> Prev
              </button>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 disabled:opacity-40">
                Next <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}