'use client'

import { useCallback, useEffect, useState } from 'react'
import { adminAPI } from '@/lib/api'
import { Search, ChevronLeft, ChevronRight } from 'lucide-react'
import { formatDate } from '@/lib/utils'

const TYPES = ['SEND', 'RECEIVE', 'CONVERT', 'BILL_PAYMENT', 'REFERRAL_EARNING', 'WITHDRAWAL']
const STATUSES = ['PENDING', 'COMPLETED', 'FAILED']

export default function AdminTransactionsPage() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [type, setType] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)

  const load = useCallback(() => {
    setLoading(true)
    adminAPI.getTransactions({ search: search || undefined, type: type || undefined, status: status || undefined, page })
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [search, type, status, page])

  useEffect(() => { load() }, [load])

  const totalPages = Math.max(1, Math.ceil((data?.total || 0) / (data?.limit || 20)))
  const fmt = (n: number) => Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-extrabold">Transactions</h1>
        <p className="text-xs text-[#64748B] mt-0.5">{data ? `${data.total} transactions` : 'Loading…'}</p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex items-center gap-2 flex-1 bg-[#0F1629] border border-white/10 rounded-xl px-3 py-2">
          <Search className="w-4 h-4 text-[#64748B]" />
          <input
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }}
            placeholder="Search reference or user email…"
            className="bg-transparent outline-none text-sm text-white w-full placeholder:text-[#64748B]"
          />
        </div>
        <select value={type} onChange={e => { setType(e.target.value); setPage(1) }} className="bg-[#0F1629] border border-white/10 rounded-xl px-3 py-2 text-sm text-white outline-none">
          <option value="">All types</option>
          {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={status} onChange={e => { setStatus(e.target.value); setPage(1) }} className="bg-[#0F1629] border border-white/10 rounded-xl px-3 py-2 text-sm text-white outline-none">
          <option value="">All statuses</option>
          {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {loading && !data ? (
        <div className="flex justify-center py-24"><div className="w-8 h-8 rounded-full border-2 border-white/10 border-t-white/40 animate-spin" /></div>
      ) : !data ? (
        <p className="text-[#94A3B8] text-sm py-20 text-center">Failed to load transactions.</p>
      ) : (
        <>
          <div className="liquid-glass p-4 sm:p-5 relative overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs min-w-[760px]">
                <thead>
                  <tr className="text-[#64748B] text-[10px] uppercase tracking-wider">
                    <th className="py-2 pr-3">User</th>
                    <th className="py-2 pr-3">Type</th>
                    <th className="py-2 pr-3">Amount</th>
                    <th className="py-2 pr-3">Fee</th>
                    <th className="py-2 pr-3">Currency</th>
                    <th className="py-2 pr-3">Status</th>
                    <th className="py-2 pr-3">Reference</th>
                    <th className="py-2">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {data.transactions.map((t: any) => (
                    <tr key={t.id} className="border-t border-white/5">
                      <td className="py-3 pr-3">
                        <p className="text-white font-semibold">{t.user?.firstName} {t.user?.lastName}</p>
                        <p className="text-[10px] text-[#64748B]">{t.user?.email}</p>
                      </td>
                      <td className="py-3 pr-3 text-[#94A3B8]">{t.type}</td>
                      <td className="py-3 pr-3 text-white">${fmt(t.amount)}</td>
                      <td className="py-3 pr-3 text-[#94A3B8]">${fmt(t.fee)}</td>
                      <td className="py-3 pr-3 text-[#94A3B8]">{t.currency}</td>
                      <td className="py-3 pr-3">
                        <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-semibold ${
                          t.status === 'COMPLETED' ? 'bg-emerald-500/10 text-emerald-400' :
                          t.status === 'FAILED' ? 'bg-red-500/10 text-red-400' : 'bg-amber-500/10 text-amber-400'
                        }`}>{t.status}</span>
                      </td>
                      <td className="py-3 pr-3 text-[#64748B] font-mono">{t.reference}</td>
                      <td className="py-3 text-[#64748B]">{formatDate(t.createdAt)}</td>
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