'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useTheme } from '@/context/ThemeContext'
import { useRouter } from 'next/navigation'
import { transactionAPI } from '@/lib/api'
import { formatDate, formatCurrency } from '@/lib/utils'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowUpRight, ArrowDownLeft, RefreshCw, Zap, Gift,
  Search, Filter, Download, ChevronDown, Calendar,
  CheckCircle, XCircle, Clock, FileText, X, Copy, Check, Hash, ExternalLink
} from 'lucide-react'
import toast from 'react-hot-toast'

// ── Types ──────────────────────────────────────────────────────────────────
type TxType = 'ALL' | 'SEND' | 'RECEIVE' | 'CONVERT' | 'BILL_PAYMENT' | 'REFERRAL_EARNING'
type PeriodType = 'year' | 'month' | 'week' | 'day'

interface FilterState {
  year: number | null
  month: number | null
  week: number | null
  day: string | null
  type: TxType
}

// ── Transaction icon ───────────────────────────────────────────────────────
function TxIcon({ type, accentHex }: { type: string; accentHex: string }) {
  const map: Record<string, { icon: any; bg: string; color: string }> = {
    SEND: { icon: ArrowUpRight, bg: 'rgba(239,68,68,0.12)', color: '#EF4444' },
    RECEIVE: { icon: ArrowDownLeft, bg: 'rgba(16,185,129,0.12)', color: '#10B981' },
    CONVERT: { icon: RefreshCw, bg: 'rgba(245,158,11,0.12)', color: '#F59E0B' },
    BILL_PAYMENT: { icon: Zap, bg: `rgba(${accentHex},0.12)`, color: accentHex },
    REFERRAL_EARNING: { icon: Gift, bg: 'rgba(16,185,129,0.12)', color: '#10B981' },
  }
  const typeUpper = (type || '').toUpperCase()
  const config = map[typeUpper] || map.SEND
  const Icon = config.icon
  return (
    <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
      style={{ background: config.bg }}>
      <Icon size={18} style={{ color: config.color }} />
    </div>
  )
}

// ── Status badge ───────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const statusUpper = (status || '').toUpperCase()
  const map: Record<string, { icon: any; cls: string; label: string }> = {
    COMPLETED: { icon: CheckCircle, cls: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20', label: 'Completed' },
    PENDING: { icon: Clock, cls: 'bg-amber-500/10 text-amber-400 border border-amber-500/20', label: 'Pending' },
    FAILED: { icon: XCircle, cls: 'bg-red-500/10 text-red-400 border border-red-500/20', label: 'Failed' },
  }
  const cfg = map[statusUpper] || map.PENDING
  const Icon = cfg.icon
  return (
    <span className={`${cfg.cls} border inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold mt-1`}>
      <Icon size={10} />
      {cfg.label}
    </span>
  )
}

// ── Statement download modal ───────────────────────────────────────────────
function StatementModal({
  open, onClose, accentHex, accentRgb
}: { open: boolean; onClose: () => void; accentHex: string; accentRgb: string }) {
  const [period, setPeriod] = useState<'year' | 'month' | 'week'>('month')
  const [year, setYear] = useState(new Date().getFullYear())
  const [month, setMonth] = useState(new Date().getMonth() + 1)
  const [week, setWeek] = useState(1)
  const [loading, setLoading] = useState(false)

  const currentYear = new Date().getFullYear()
  const years = Array.from({ length: 5 }, (_, i) => currentYear - i)
  const months = [
    'January','February','March','April','May','June',
    'July','August','September','October','November','December'
  ]

  const download = async () => {
    setLoading(true)
    try {
      const params: any = { format: 'pdf' }
      if (period === 'year') params.year = year
      if (period === 'month') { params.year = year; params.month = month }
      if (period === 'week') { params.year = year; params.week = week }
      const blob = await transactionAPI.downloadStatement(params)
      const url = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }))
      const a = document.createElement('a')
      a.href = url
      a.download = `surexend-statement-${period}-${year}${period !== 'year' ? `-${month}` : ''}.pdf`
      a.click()
      URL.revokeObjectURL(url)
      toast.success('Statement downloaded!')
      onClose()
    } catch {
      toast.error('Failed to download statement. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div className="fixed inset-0 bg-black/60 z-40 backdrop-blur-sm"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose} />
          <motion.div
            className="fixed inset-x-3 bottom-20 z-[70] sm:inset-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:w-[420px] max-h-[80vh] overflow-y-auto"
            initial={{ opacity: 0, y: 100 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 100 }}
            transition={{ type: 'spring', damping: 24, stiffness: 300 }}
          >
            <div className="bg-[#0F1629] rounded-3xl p-5 sm:p-6 border border-white/10 shadow-2xl">
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ background: `rgba(${accentRgb}, 0.12)` }}>
                    <FileText size={18} style={{ color: accentHex }} />
                  </div>
                  <div>
                    <h3 className="text-white font-bold text-sm sm:text-base">Download Statement</h3>
                    <p className="text-[#94A3B8] text-xs">PDF export of your transactions</p>
                  </div>
                </div>
                <button onClick={onClose} className="p-1.5 rounded-full hover:bg-white/10 text-[#64748B] hover:text-white transition-colors">
                  <X size={18} />
                </button>
              </div>

              {/* Period selector */}
              <div className="grid grid-cols-3 gap-2 mb-6">
                {(['year', 'month', 'week'] as const).map(p => (
                  <button key={p}
                    className="py-2.5 rounded-xl text-sm font-medium capitalize transition-all"
                    style={period === p ? {
                      background: `rgba(${accentRgb}, 0.15)`,
                      color: accentHex,
                      border: `1px solid rgba(${accentRgb}, 0.3)`,
                    } : {
                      background: 'rgba(255,255,255,0.04)',
                      color: '#94A3B8',
                      border: '1px solid rgba(255,255,255,0.06)',
                    }}
                    onClick={() => setPeriod(p)}
                  >
                    {p === 'year' ? 'Yearly' : p === 'month' ? 'Monthly' : 'Weekly'}
                  </button>
                ))}
              </div>

              {/* Year selector */}
              <div className="mb-4">
                <label className="text-[#94A3B8] text-xs mb-2 block">Year</label>
                <div className="relative">
                  <select value={year} onChange={e => setYear(Number(e.target.value))}
                    className="input-field appearance-none pr-10 cursor-pointer">
                    {years.map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                  <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#64748B] pointer-events-none" />
                </div>
              </div>

              {/* Month selector (if monthly) */}
              {period === 'month' && (
                <div className="mb-4">
                  <label className="text-[#94A3B8] text-xs mb-2 block">Month</label>
                  <div className="relative">
                    <select value={month} onChange={e => setMonth(Number(e.target.value))}
                      className="input-field appearance-none pr-10 cursor-pointer">
                      {months.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                    </select>
                    <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#64748B] pointer-events-none" />
                  </div>
                </div>
              )}

              {/* Week selector (if weekly) */}
              {period === 'week' && (
                <div className="mb-4">
                  <label className="text-[#94A3B8] text-xs mb-2 block">Week Number</label>
                  <div className="relative">
                    <select value={week} onChange={e => setWeek(Number(e.target.value))}
                      className="input-field appearance-none pr-10 cursor-pointer">
                      {Array.from({ length: 52 }, (_, i) => (
                        <option key={i + 1} value={i + 1}>Week {i + 1}</option>
                      ))}
                    </select>
                    <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#64748B] pointer-events-none" />
                  </div>
                </div>
              )}

              <motion.button
                className="w-full py-4 rounded-xl font-bold flex items-center justify-center gap-2 mt-2"
                style={{ background: `linear-gradient(135deg, ${accentHex}, ${accentHex}CC)`, color: '#0D0D0D' }}
                whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }}
                onClick={download} disabled={loading}
              >
                {loading ? (
                  <motion.div className="w-5 h-5 border-2 border-black/30 border-t-black rounded-full"
                    animate={{ rotate: 360 }} transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }} />
                ) : (
                  <><Download size={18} /> Download PDF</>
                )}
              </motion.button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

// ── Filter Panel ───────────────────────────────────────────────────────────
function FilterPanel({ filters, setFilters, accentHex, accentRgb, onClose }: {
  filters: FilterState;
  setFilters: (f: FilterState) => void;
  accentHex: string; accentRgb: string; onClose: () => void;
}) {
  const [local, setLocal] = useState(filters)
  const currentYear = new Date().getFullYear()
  const years = Array.from({ length: 5 }, (_, i) => currentYear - i)
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const types: TxType[] = ['ALL','SEND','RECEIVE','CONVERT','BILL_PAYMENT','REFERRAL_EARNING']
  const typeLabels: Record<TxType, string> = {
    ALL: 'All Types', SEND: 'Sent', RECEIVE: 'Received',
    CONVERT: 'Converted', BILL_PAYMENT: 'Bills', REFERRAL_EARNING: 'Referral'
  }

  return (
    <motion.div
      className="fixed inset-x-0 bottom-0 z-50 sm:absolute sm:top-12 sm:right-0 sm:bottom-auto sm:inset-x-auto sm:w-72"
      initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}
    >
      <div className="bg-[#0F1629] rounded-t-3xl sm:rounded-2xl p-5 border border-white/8"
        style={{ boxShadow: '0 -20px 60px rgba(0,0,0,0.6)' }}>
        <div className="flex items-center justify-between mb-5">
          <h4 className="text-white font-semibold">Filter Transactions</h4>
          <button onClick={onClose} className="text-[#64748B] hover:text-white">
            <X size={18} />
          </button>
        </div>

        {/* Type filter */}
        <div className="mb-4">
          <p className="text-[#64748B] text-xs mb-2">Transaction Type</p>
          <div className="flex flex-wrap gap-2">
            {types.map(t => (
              <button key={t}
                className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                style={local.type === t ? {
                  background: `rgba(${accentRgb}, 0.15)`,
                  color: accentHex, border: `1px solid rgba(${accentRgb}, 0.3)`
                } : {
                  background: 'rgba(255,255,255,0.04)',
                  color: '#94A3B8', border: '1px solid rgba(255,255,255,0.06)'
                }}
                onClick={() => setLocal({ ...local, type: t })}
              >
                {typeLabels[t]}
              </button>
            ))}
          </div>
        </div>

        {/* Year */}
        <div className="mb-3">
          <p className="text-[#64748B] text-xs mb-2">Year</p>
          <div className="flex gap-2 flex-wrap">
            {years.map(y => (
              <button key={y}
                className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                style={local.year === y ? {
                  background: `rgba(${accentRgb}, 0.15)`,
                  color: accentHex, border: `1px solid rgba(${accentRgb}, 0.3)`
                } : {
                  background: 'rgba(255,255,255,0.04)',
                  color: '#94A3B8', border: '1px solid rgba(255,255,255,0.06)'
                }}
                onClick={() => setLocal({ ...local, year: local.year === y ? null : y, month: null, week: null, day: null })}
              >
                {y}
              </button>
            ))}
          </div>
        </div>

        {/* Month (only if year selected) */}
        {local.year && (
          <div className="mb-3">
            <p className="text-[#64748B] text-xs mb-2">Month</p>
            <div className="grid grid-cols-4 gap-2">
              {months.map((m, i) => (
                <button key={m}
                  className="py-1.5 rounded-lg text-xs font-medium transition-all"
                  style={local.month === i + 1 ? {
                    background: `rgba(${accentRgb}, 0.15)`,
                    color: accentHex, border: `1px solid rgba(${accentRgb}, 0.3)`
                  } : {
                    background: 'rgba(255,255,255,0.04)',
                    color: '#94A3B8', border: '1px solid rgba(255,255,255,0.06)'
                  }}
                  onClick={() => setLocal({ ...local, month: local.month === i + 1 ? null : i + 1, week: null, day: null })}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-3 mt-5">
          <button
            className="flex-1 py-3 rounded-xl text-sm text-[#94A3B8] border border-white/08 hover:text-white transition-colors"
            onClick={() => { setLocal({ year: null, month: null, week: null, day: null, type: 'ALL' }); setFilters({ year: null, month: null, week: null, day: null, type: 'ALL' }); onClose() }}
          >
            Reset
          </button>
          <button
            className="flex-1 py-3 rounded-xl text-sm font-bold"
            style={{ background: `rgba(${accentRgb}, 0.15)`, color: accentHex }}
            onClick={() => { setFilters(local); onClose() }}
          >
            Apply
          </button>
        </div>
      </div>
    </motion.div>
  )
}

// ── Transaction Detail Modal ───────────────────────────────────────────────
function TransactionDetailModal({
  tx, onClose, accentHex, accentRgb
}: { tx: any; onClose: () => void; accentHex: string; accentRgb: string }) {
  const [copiedField, setCopiedField] = useState<string | null>(null)
  const [details, setDetails] = useState<any>(tx)

  useEffect(() => {
    let active = true
    async function load() {
      if (!tx?.id) return
      try {
        const full = await transactionAPI.getById(tx.id)
        if (active) setDetails(full || tx)
      } catch {
        if (active) setDetails(tx)
      }
    }
    load()
    return () => { active = false }
  }, [tx])

  const copy = async (field: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value)
      setCopiedField(field)
      setTimeout(() => setCopiedField(null), 1500)
    } catch { /* ignore */ }
  }

  const typeUpper = (details?.type || '').toUpperCase()
  const isCredit = typeUpper === 'RECEIVE' || typeUpper === 'REFERRAL_EARNING' || typeUpper === 'CONVERT'
  const isDebit = typeUpper === 'SEND' || typeUpper === 'BILL_PAYMENT'
  const sign = isCredit ? '+' : isDebit ? '-' : ''
  const amtColor = isCredit ? 'text-emerald-400' : isDebit ? 'text-red-400' : 'text-[#64748B]'
  const symbol = details?.currency === 'NGN' ? '₦' : details?.currency === 'GHS' ? 'GH₵' : details?.currency === 'KES' ? 'KSh' : '$'
  const typeLabel: Record<string, string> = {
    SEND: 'Send', RECEIVE: 'Receive', CONVERT: 'Convert',
    BILL_PAYMENT: 'Bill Payment', REFERRAL_EARNING: 'Referral Rewards',
  }

  const meta = details?.metadata || {}
  const network = meta.network || details?.network || 'ARC'
  const errorReason = meta.errorReason || details?.errorReason
  const explorerUrl = meta.txHash
    ? network === 'ARC'
      ? `https://testnet.arcscan.app/tx/${meta.txHash}`
      : `https://etherscan.io/tx/${meta.txHash}`
    : null

  const statusColor = (s: string) => {
    const u = (s || '').toUpperCase()
    if (u === 'COMPLETED') return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
    if (u === 'FAILED') return 'bg-red-500/10 text-red-400 border-red-500/20'
    return 'bg-amber-500/10 text-amber-400 border-amber-500/20'
  }

  const rows: { label: string; value: string; copyable?: string; mono?: boolean }[] = [
    { label: 'Reference', value: details?.reference || '—', copyable: details?.reference, mono: true },
    { label: 'Amount', value: `${sign}${symbol}${details?.amount}${details?.currency && details?.currency !== 'USDT' ? ` ${details?.currency}` : ' USD'}` },
    { label: 'Fee', value: `$${(details?.fee || 0)}` },
    { label: 'Network', value: network },
    { label: 'Date', value: new Date(details?.createdAt || details?.date || Date.now()).toLocaleString('en-US', { dateStyle: 'long', timeStyle: 'short' }) },
    ...(meta.sourceAddress ? [{ label: 'From Address', value: meta.sourceAddress, copyable: meta.sourceAddress, mono: true }] : []),
    ...(meta.destinationAddress || details?.recipient ? [{ label: 'To Address', value: meta.destinationAddress || details?.recipient, copyable: meta.destinationAddress || details?.recipient, mono: true }] : []),
    ...(meta.txHash ? [{ label: 'Transaction Hash', value: meta.txHash, copyable: meta.txHash, mono: true }] : []),
  ]

  return (
    <AnimatePresence>
      <motion.div className="fixed inset-0 bg-black/60 z-40 backdrop-blur-sm"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose} />
      <motion.div
        className="fixed inset-x-0 bottom-0 sm:inset-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:w-[460px] sm:max-w-[94vw] max-h-[88vh] overflow-y-auto sm:rounded-2xl rounded-t-2xl"
        initial={{ opacity: 0, y: 80 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 80 }}
        transition={{ type: 'spring', damping: 28, stiffness: 320 }}
      >
        <div className="bg-[#0F1629] sm:border border-white/10 shadow-2xl p-5 sm:p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: `rgba(${accentRgb}, 0.14)` }}>
                {isCredit
                  ? <ArrowDownLeft size={18} style={{ color: '#10B981' }} />
                  : typeUpper === 'CONVERT'
                    ? <RefreshCw size={18} style={{ color: '#F59E0B' }} />
                    : <ArrowUpRight size={18} style={{ color: '#EF4444' }} />}
              </div>
              <div>
                <h3 className="text-white font-bold text-sm">{typeLabel[typeUpper] || 'Transaction'}</h3>
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${statusColor(details?.status)}`}>
                  {(details?.status || 'PENDING').toUpperCase()}
                </span>
              </div>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-full hover:bg-white/10 text-[#64748B] hover:text-white transition-colors">
              <X size={18} />
            </button>
          </div>

          {/* Failure explanation */}
          {(details?.status || '').toUpperCase() === 'FAILED' && (
            <div className="mb-4 flex items-start gap-2.5 p-3.5 rounded-xl bg-red-500/[0.08] border border-red-500/25">
              <XCircle size={16} className="text-red-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-red-400 text-xs font-bold mb-0.5">Transaction Failed</p>
                <p className="text-[#FDA4AF] text-[11px] leading-relaxed">
                  {errorReason || 'This transaction was not completed. The sent amount (if any) has been refunded to your available balance.'}
                </p>
              </div>
            </div>
          )}

          {/* Amount */}
          <div className="text-center py-6 mb-5 bg-white/[0.03] border border-white/5 rounded-xl">
            <p className="text-[10px] uppercase tracking-widest text-[#64748B] font-bold mb-1.5">Amount</p>
            <p className={`text-4xl font-extrabold tracking-tight ${amtColor}`}>
              {sign}{symbol}{details?.amount}
            </p>
            <p className="text-[#94A3B8] text-xs mt-1.5">
              {details?.currency && details?.currency !== 'USDT' ? details?.currency : 'US Dollar'} · {network}
            </p>
          </div>

          {/* Detail rows */}
          <div className="space-y-3.5">
            {rows.map((row) => (
              <div key={row.label} className="flex items-start justify-between gap-3 pb-2.5 border-b border-white/[0.05] last:border-0 last:pb-0">
                <span className="text-[#94A3B8] text-xs font-medium mt-0.5 flex-shrink-0">{row.label}</span>
                <span className="flex items-center gap-2 min-w-0 justify-end flex-1">
                  <span className={`text-white text-xs font-medium text-right break-all ${row.mono ? 'font-mono' : ''}`}>{row.value}</span>
                  {row.copyable && (
                    <button
                      onClick={() => copy(row.label, row.copyable!)}
                      className="text-[#64748B] hover:text-white transition-colors flex-shrink-0"
                      title="Copy"
                    >
                      {copiedField === row.label ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
                    </button>
                  )}
                </span>
              </div>
            ))}
          </div>

          {/* Explorer link */}
          {explorerUrl && (
            <a
              href={explorerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-5 flex items-center justify-center gap-2 py-3 rounded-xl text-xs font-bold border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] text-white transition-all"
            >
              <ExternalLink size={14} style={{ color: accentHex }} />
              View on {network} Explorer
            </a>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  )
}

// ══════════════════════════════════════════════════════════════════════════
// HISTORY PAGE
// ══════════════════════════════════════════════════════════════════════════

export default function HistoryPage() {
  const { variant, colors } = useTheme()
  const isGold = variant === 'gold'
  const accentRgb = isGold ? '212, 160, 23' : '181, 226, 61'
  const accentHex = isGold ? '#D4A017' : '#B5E23D'

  const [filters, setFilters] = useState<FilterState>({ year: null, month: null, week: null, day: null, type: 'ALL' })
  const [search, setSearch] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [showStatement, setShowStatement] = useState(false)
  const [selectedTx, setSelectedTx] = useState<any>(null)
  const [page, setPage] = useState(1)

  // Build query params
  const queryParams = {
    page,
    limit: 20,
    ...(filters.year && { year: filters.year }),
    ...(filters.month && { month: filters.month }),
    ...(filters.week && { week: filters.week }),
    ...(filters.day && { day: filters.day }),
    ...(filters.type !== 'ALL' && { type: filters.type }),
  }

  const { data, isLoading } = useQuery({
    queryKey: ['transactions', queryParams],
    queryFn: () => transactionAPI.getHistory(queryParams),
    staleTime: 30000,
  })

  const transactions = data?.transactions || []
  const totalPages = data?.totalPages || 1

  // Count active filters
  const activeFilterCount = [filters.year, filters.month, filters.week, filters.day]
    .filter(Boolean).length + (filters.type !== 'ALL' ? 1 : 0)

  // Group transactions by date
  const grouped: Record<string, typeof transactions> = {}
  transactions.forEach((tx: any) => {
    const dateVal = tx.createdAt || tx.date
    let key = 'Other'
    if (dateVal) {
      const d = new Date(dateVal)
      if (!isNaN(d.getTime())) {
        key = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
      }
    }
    if (!grouped[key]) grouped[key] = []
    grouped[key].push(tx)
  })

  const txTypeLabel: Record<string, string> = {
    SEND: 'Send',
    RECEIVE: 'Receive',
    CONVERT: 'Convert',
    BILL_PAYMENT: 'Bill Payment',
    REFERRAL_EARNING: 'Referral Rewards',
  }

  return (
    <div className="w-full max-w-full overflow-x-hidden px-3 py-4 sm:p-6 md:p-8 max-w-2xl mx-auto space-y-4 pb-28 sm:pb-32">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 border-b border-white/5 pb-3">
        <div className="truncate">
          <h1 className="text-white font-extrabold text-base sm:text-lg tracking-tight truncate">
            Transaction History
          </h1>
          <p className="text-[#94A3B8] text-[11px] sm:text-xs truncate">
            Filter by Day, Week, Month, or Year
          </p>
        </div>
        <button
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all shadow-md flex-shrink-0"
          style={{ background: `rgba(${accentRgb}, 0.15)`, color: accentHex, border: `1px solid rgba(${accentRgb}, 0.3)` }}
          onClick={() => setShowStatement(true)}
        >
          <Download className="w-3.5 h-3.5" />
          <span>Download Statement</span>
        </button>
      </div>

      {/* Search + Filter row */}
      <div className="flex gap-2">
        <div className="flex-1 relative">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#64748B] pointer-events-none z-10" />
          <input
            className="w-full py-2.5 pl-10 pr-4 rounded-xl bg-white/[0.04] border border-white/10 text-white text-xs sm:text-sm focus:outline-none focus:border-emerald-500 transition-colors"
            placeholder="Search transactions..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="relative">
          <motion.button
            className="h-[46px] px-4 rounded-xl flex items-center gap-2 text-sm font-medium relative"
            style={activeFilterCount > 0 ? {
              background: `rgba(${accentRgb}, 0.15)`,
              color: accentHex, border: `1px solid rgba(${accentRgb}, 0.3)`
            } : {
              background: 'rgba(255,255,255,0.05)',
              color: '#94A3B8', border: '1px solid rgba(255,255,255,0.08)'
            }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setShowFilters(!showFilters)}
          >
            <Filter size={15} />
            <span className="hidden xs:inline">Filter</span>
            {activeFilterCount > 0 && (
              <span
                className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full text-[10px] font-bold flex items-center justify-center"
                style={{ background: accentHex, color: '#0D0D0D' }}
              >
                {activeFilterCount}
              </span>
            )}
          </motion.button>
          <AnimatePresence>
            {showFilters && (
              <FilterPanel
                filters={filters}
                setFilters={setFilters}
                accentHex={accentHex}
                accentRgb={accentRgb}
                onClose={() => setShowFilters(false)}
              />
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Active filter chips */}
      {activeFilterCount > 0 && (
        <div className="flex gap-2 mt-3 overflow-x-auto pb-1">
          {filters.year && (
            <span className="flex items-center gap-1 px-3 py-1 rounded-full text-xs flex-shrink-0"
              style={{ background: `rgba(${accentRgb}, 0.12)`, color: accentHex }}>
              <Calendar size={10} /> {filters.year}
              <button onClick={() => setFilters({ ...filters, year: null, month: null })} className="ml-1"><X size={10} /></button>
            </span>
          )}
          {filters.month && (
            <span className="flex items-center gap-1 px-3 py-1 rounded-full text-xs flex-shrink-0"
              style={{ background: `rgba(${accentRgb}, 0.12)`, color: accentHex }}>
              Month {filters.month}
              <button onClick={() => setFilters({ ...filters, month: null })} className="ml-1"><X size={10} /></button>
            </span>
          )}
          {filters.type !== 'ALL' && (
            <span className="flex items-center gap-1 px-3 py-1 rounded-full text-xs flex-shrink-0"
              style={{ background: `rgba(${accentRgb}, 0.12)`, color: accentHex }}>
              {filters.type.replace('_', ' ')}
              <button onClick={() => setFilters({ ...filters, type: 'ALL' })} className="ml-1"><X size={10} /></button>
            </span>
          )}
        </div>
      )}

      {/* Transaction list */}
      <div className="w-full">
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i} className="skeleton h-16 rounded-xl" style={{ animationDelay: `${i * 0.05}s` }} />
            ))}
          </div>
        ) : transactions.length === 0 ? (
          <motion.div
            className="flex flex-col items-center justify-center py-24 text-center"
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          >
            <div className="text-5xl mb-4">📊</div>
            <h3 className="text-white font-semibold mb-2">No transactions found</h3>
            <p className="text-[#64748B] text-sm max-w-xs">
              {activeFilterCount > 0 ? 'Try adjusting your filters' : 'Your transactions will appear here once you start using SureXend'}
            </p>
            {activeFilterCount > 0 && (
              <button
                className="mt-4 text-sm font-medium"
                style={{ color: accentHex }}
                onClick={() => setFilters({ year: null, month: null, week: null, day: null, type: 'ALL' })}
              >
                Clear all filters
              </button>
            )}
          </motion.div>
        ) : (
          <div className="space-y-5">
            {Object.entries(grouped).map(([date, txs], groupIdx) => (
              <div key={date}>
                {/* Date header */}
                <div className="flex items-center gap-3 mb-2.5">
                  <p className="text-[#475569] text-[10px] font-bold uppercase tracking-widest whitespace-nowrap">{date}</p>
                  <div className="flex-1 h-px bg-white/5" />
                </div>

                {/* Transaction rows — matches home page Recent Transactions card style */}
                <div className="glass-card rounded-2xl overflow-hidden">
                  {(txs as any[]).map((tx: any, idx: number) => {
                    const typeUpper = (tx.type || '').toUpperCase()
                    const isCredit = typeUpper === 'RECEIVE' || typeUpper === 'REFERRAL_EARNING' || typeUpper === 'CONVERT'
                    const isDebit = typeUpper === 'SEND' || typeUpper === 'BILL_PAYMENT'
                    const sign = isCredit ? '+' : isDebit ? '-' : ''
                    const amtColor = isCredit ? 'text-emerald-400' : isDebit ? 'text-red-400' : 'text-[#64748B]'
                    
                    const symbol = tx.currency === 'NGN' ? '₦' : tx.currency === 'GHS' ? 'GH₵' : tx.currency === 'KES' ? 'KSh' : '$'

                    return (
                      <motion.div
                        key={tx.id}
                        className={`flex items-center justify-between px-4 py-3.5 hover:bg-white/[0.03] transition-colors cursor-pointer ${idx !== 0 ? 'border-t border-white/[0.04]' : ''}`}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: (groupIdx * 5 + idx) * 0.035 }}
                        whileHover={{ x: 2 }}
                        onClick={() => setSelectedTx(tx)}
                      >
                        <div className="flex items-center gap-3">
                          <TxIcon type={tx.type} accentHex={accentHex} />
                          <div>
                            <p className="text-white font-semibold text-sm leading-tight">
                              {txTypeLabel[typeUpper] || tx.type}
                            </p>
                            <p className="text-[#64748B] text-xs mt-1 font-medium">
                              {new Date(tx.createdAt || tx.date || Date.now()).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                            </p>
                          </div>
                        </div>

                        <div className="text-right flex-shrink-0 ml-3">
                          <p className={`font-bold text-sm ${amtColor}`}>
                            {sign}{symbol}{tx.amount} {tx.currency && tx.currency !== 'USDT' ? tx.currency : 'USD'}
                          </p>
                          <StatusBadge status={tx.status} />
                        </div>
                      </motion.div>
                    )
                  })}
                </div>
              </div>
            ))}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-3 py-4">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                  className="px-4 py-2 rounded-xl text-sm disabled:opacity-30"
                  style={{ background: 'rgba(255,255,255,0.05)', color: '#94A3B8' }}>Previous</button>
                <span className="text-[#64748B] text-xs">Page {page} of {totalPages}</span>
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                  className="px-4 py-2 rounded-xl text-sm disabled:opacity-30"
                  style={{ background: `rgba(${accentRgb}, 0.12)`, color: accentHex }}>Next</button>
              </div>
            )}
          </div>
        )}
      </div>


      {/* Statement download modal */}
      <StatementModal
        open={showStatement}
        onClose={() => setShowStatement(false)}
        accentHex={accentHex}
        accentRgb={accentRgb}
      />

      {/* Transaction detail modal */}
      {selectedTx && (
        <TransactionDetailModal
          tx={selectedTx}
          onClose={() => setSelectedTx(null)}
          accentHex={accentHex}
          accentRgb={accentRgb}
        />
      )}
    </div>
  )
}
