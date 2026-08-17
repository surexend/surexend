'use client'

import { useCallback, useEffect, useState } from 'react'
import { adminAPI } from '@/lib/api'
import { Search, ChevronLeft, ChevronRight, X, Copy, Check, FileText, Zap } from 'lucide-react'
import { formatDate } from '@/lib/utils'
import toast from 'react-hot-toast'

const TYPES = ['SEND', 'RECEIVE', 'CONVERT', 'BILL_PAYMENT', 'REFERRAL_EARNING', 'WITHDRAWAL']
const STATUSES = ['PENDING', 'COMPLETED', 'FAILED']

function DetailModal({ id, onClose }: { id: string; onClose: () => void }) {
  const [tx, setTx] = useState<any>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    adminAPI.getTransaction(id).then(setTx).catch(() => setTx(null))
  }, [id])

  const copy = (v: string) => {
    navigator.clipboard.writeText(v).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) }).catch(() => {})
  }

  if (!tx) {
    return (
      <div className="fixed inset-0 z-[80] flex items-center justify-center">
        <div className="absolute inset-0 bg-black/70" onClick={onClose} />
        <div className="relative w-full max-w-md mx-4 bg-[#0F1629] rounded-3xl border border-white/10 p-8 text-center">
          <div className="w-8 h-8 mx-auto rounded-full border-2 border-white/10 border-t-white/40 animate-spin" />
        </div>
      </div>
    )
  }

  const meta = tx.metadata || {}
  const bill = tx.bill
  const statusColor = (s: string) => s === 'COMPLETED' ? 'bg-emerald-500/10 text-emerald-400' : s === 'FAILED' ? 'bg-red-500/10 text-red-400' : 'bg-amber-500/10 text-amber-400'

  const rows: { label: string; value: string }[] = [
    { label: 'Invoice No', value: tx.reference || '—' },
    { label: 'Type', value: tx.type },
    { label: 'Status', value: tx.status },
    { label: 'Amount', value: `${tx.amount} ${tx.currency}` },
    { label: 'Fee', value: `${tx.fee} ${tx.currency}` },
    { label: 'Date', value: new Date(tx.createdAt).toLocaleString('en-US', { dateStyle: 'long', timeStyle: 'short' }) },
    ...(tx.user?.email ? [{ label: 'User', value: `${tx.user.firstName || ''} ${tx.user.lastName || ''} (${tx.user.email})` }] : []),
    ...(bill ? [
      { label: 'Service', value: `${bill.provider} ${bill.type === 'data' ? 'Data' : 'Airtime'}` },
      { label: 'Recipient', value: bill.recipient },
      { label: 'Paid (NGN)', value: `₦${Number(bill.amount || 0).toLocaleString()}` },
      ...(bill.type === 'data' && meta.planName ? [{ label: 'Plan', value: `${meta.planName}${meta.planValidity ? ` · ${meta.planValidity}` : ''}` }] : []),
      ...(meta.rate ? [{ label: 'Rate', value: `₦${meta.rate} / USDT` }] : []),
    ] : []),
    ...(meta.costPrice != null ? [{ label: 'Service cost (NGN)', value: `₦${meta.costPrice.toLocaleString()}` }] : []),
    ...(meta.sellPrice != null ? [{ label: 'Sell price (NGN)', value: `₦${meta.sellPrice.toLocaleString()}` }] : []),
    ...(meta.marginPct != null ? [{ label: 'Margin / markup', value: `${meta.marginPct}%` }] : []),
    ...(meta.smartspeed?.reference ? [{ label: 'Provider ref', value: meta.smartspeed.reference }] : []),
    ...(meta.error ? [{ label: 'Error', value: meta.error }] : []),
    ...(meta.txHash ? [{ label: 'Tx Hash', value: meta.txHash }] : []),
    ...(meta.destinationAddress ? [{ label: 'To Address', value: meta.destinationAddress }] : []),
    ...(meta.sourceAddress ? [{ label: 'From Address', value: meta.sourceAddress }] : []),
  ]

  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center sm:justify-center">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative w-full sm:max-w-lg mx-auto bg-[#0F1629] rounded-t-3xl sm:rounded-3xl border border-white/10 max-h-[88vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-white/10 sticky top-0 bg-[#0F1629]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
              {tx.type === 'BILL_PAYMENT' ? <Zap className="w-4 h-4 text-amber-400" /> : <FileText className="w-4 h-4 text-amber-400" />}
            </div>
            <div>
              <h3 className="text-white font-bold text-sm">Transaction Detail</h3>
              <p className="text-[10px] text-[#64748B]">Full record incl. provider invoice info</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-white/10 text-[#64748B] hover:text-white"><X size={18} /></button>
        </div>

        <div className="p-5">
          <div className="flex items-center justify-between mb-4 p-3 rounded-2xl bg-white/[0.03] border border-white/10">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-[#64748B] font-semibold mb-1">Invoice No</p>
              <p className="text-white font-mono text-sm font-bold">{tx.reference}</p>
            </div>
            <button onClick={() => copy(tx.reference)} className="px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 bg-white/5 border border-white/10 hover:bg-white/10 text-white transition-colors">
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>

          <div className="space-y-3">
            {rows.map((r) => (
              <div key={r.label} className="flex items-start justify-between gap-4">
                <span className="text-[#64748B] text-xs mt-0.5 flex-shrink-0">{r.label}</span>
                <span className="text-white text-xs font-semibold text-right break-all min-w-0">{r.value}</span>
              </div>
            ))}
          </div>

          {tx.type === 'BILL_PAYMENT' && (
            <div className={`mt-5 text-center py-3 rounded-xl border text-xs font-bold ${statusColor(tx.status)}`}>
              {tx.status}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function AdminTransactionsPage() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [type, setType] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const [detailId, setDetailId] = useState<string | null>(null)

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
        <p className="text-xs text-[#64748B] mt-0.5">{data ? `${data.total} transactions · tap a row for full details` : 'Loading…'}</p>
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
                    <tr key={t.id} onClick={() => setDetailId(t.id)}
                      className="border-t border-white/5 cursor-pointer hover:bg-white/[0.03] transition-colors">
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

      {detailId && <DetailModal id={detailId} onClose={() => setDetailId(null)} />}
    </div>
  )
}