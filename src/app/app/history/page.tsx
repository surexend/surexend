'use client'

import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useTheme } from '@/context/ThemeContext'
import { useRouter } from 'next/navigation'
import { transactionAPI, userAPI } from '@/lib/api'
import { formatDate, formatCurrency, getSwapInfo, currencySymbol, formatAmount } from '@/lib/utils'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowUpRight, ArrowDownLeft, RefreshCw, Zap, Gift,
  Search, Filter, Download, ChevronDown, Calendar,
  CheckCircle, XCircle, Clock, FileText, X, Copy, Check, Hash, ExternalLink, ArrowRight, BarChart3
} from 'lucide-react'
import toast from 'react-hot-toast'
import { useBackLayer } from '@/context/BackNavigationContext'
import { renderReceiptCanvas as renderReceiptCanvasUtil, downloadReceiptFile } from '@/lib/receipt'
import { generateStatementPDF } from '@/lib/statement'
import { explorerTransactionUrl } from '@/lib/explorers'

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
    SEND: { icon: ArrowUpRight, bg: 'rgba(255,255,255,0.06)', color: '#E2E8F0' },
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

  const { variant } = useTheme()

  const download = async () => {
    setLoading(true)
    try {
      const filterParams: any = { limit: 1000 }
      if (period === 'year') filterParams.year = year
      if (period === 'month') { filterParams.year = year; filterParams.month = month }
      if (period === 'week') { filterParams.year = year; filterParams.week = week }

      const [txRes, profileRes] = await Promise.all([
        transactionAPI.getTransactions(filterParams).catch(() => null),
        userAPI.getProfile().catch(() => null),
      ])

      const txList = txRes?.transactions || []
      const userObj = {
        name: profileRes ? `${profileRes.firstName || ''} ${profileRes.lastName || ''}`.trim() || 'Account Holder' : 'Account Holder',
        email: profileRes?.email || 'user@surexend.com',
        surexTag: profileRes?.surexTag || undefined,
        accountNumber: profileRes?.id || undefined,
      }

      const periodLabel = period === 'year'
        ? `${year}`
        : period === 'month'
          ? `${months[month - 1]} ${year}`
          : `Week ${week}, ${year}`

      await generateStatementPDF({
        user: userObj,
        transactions: txList,
        periodLabel,
        variant,
        accentHex,
      })

      toast.success('Statement downloaded!')
      onClose()
    } catch (err) {
      toast.error('Failed to generate statement. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  if (typeof document === 'undefined') return null
  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div className="fixed inset-0 liquid-backdrop z-[80]"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose} />
          <div className="fixed inset-0 z-[90] flex items-end sm:items-center sm:justify-center px-3 pb-20 sm:pb-0 pointer-events-none">
          <motion.div
            className="w-full sm:w-[420px] max-h-[80vh] overflow-y-auto pointer-events-auto"
            initial={{ opacity: 0, y: 100 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 100 }}
            transition={{ type: 'spring', damping: 24, stiffness: 300 }}
          >
            <div className="bg-[#121419] rounded-t-3xl sm:rounded-3xl p-5 sm:p-6 border border-white/10 shadow-2xl">
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
          </div>
        </>
      )}
    </AnimatePresence>,
    document.body
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

  // Mobile: full-height bottom sheet above the nav bar (z-[70] beats nav z-50)
  // with its own internal scroll + sticky action bar so Reset/Apply are always
  // reachable. Desktop: a self-contained dropdown with the same scroll+sticky.
  return (
    <motion.div
      className="fixed inset-0 z-[70] flex items-end sm:items-start sm:justify-end sm:pr-3 sm:pt-14 sm:inset-auto"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
    >
      {/* Mobile backdrop only */}
      <div className="absolute inset-0 liquid-backdrop sm:hidden" onClick={onClose} />

      <motion.div
        className="relative w-full sm:w-80 max-h-[82vh] sm:max-h-[70vh] bg-[#121419] rounded-t-3xl sm:rounded-2xl border border-white/10 shadow-2xl flex flex-col overflow-hidden sm:shadow-2xl"
        style={{ boxShadow: '0 -20px 60px rgba(0,0,0,0.6)' }}
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 40, opacity: 0 }}
        transition={{ type: 'spring', damping: 28, stiffness: 320 }}
      >
        {/* Header + drag handle */}
        <div className="flex items-center justify-between px-5 pt-3 pb-3 border-b border-white/[0.08] flex-shrink-0">
          <div className="flex items-center gap-2">
            <Filter size={14} style={{ color: accentHex }} />
            <h4 className="text-white font-semibold text-sm">Filter Transactions</h4>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-white/10 text-[#64748B] hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Scrollable filter body */}
        <div className="overflow-y-auto px-5 py-4 flex-1 min-h-0">
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
        </div>

        {/* Sticky action bar — always visible */}
        <div className="flex gap-3 px-5 py-4 border-t border-white/[0.08] bg-[#121419] flex-shrink-0">
          <button
            className="flex-1 py-3 rounded-xl text-sm text-[#94A3B8] border border-white/08 hover:text-white transition-colors"
            onClick={() => { setLocal({ year: null, month: null, week: null, day: null, type: 'ALL' }); setFilters({ year: null, month: null, week: null, day: null, type: 'ALL' }); onClose() }}
          >
            Reset
          </button>
          <button
            className="flex-1 py-3 rounded-xl text-sm font-bold text-black"
            style={{ background: accentHex }}
            onClick={() => { setFilters(local); onClose() }}
          >
            Apply Filters
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}

// ── Transaction Detail Modal ───────────────────────────────────────────────
function TransactionDetailModal({
  tx, onClose, accentHex, accentRgb, variant = 'gold'
}: { tx: any; onClose: () => void; accentHex: string; accentRgb: string; variant?: 'gold' | 'lemon' }) {
  const [copiedField, setCopiedField] = useState<string | null>(null)
  const [details, setDetails] = useState<any>(tx)
  const [downloading, setDownloading] = useState<'pdf' | 'png' | null>(null)
  const receiptRef = useRef<HTMLDivElement>(null)

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

  // Receipt is exported by DRAWING IT DIRECTLY ON A CANVAS — every element is
  // positioned in code with exact pixel coordinates. No DOM cloning, no SVG
  // foreignObject, no third-party layout engine: a blank page or overlapping
  // text is impossible by construction, and the real brand logo + app font are
  // used. jsPDF is lazy-loaded only for the PDF path.
  const downloadReceipt = async (format: 'pdf' | 'png') => {
    if (downloading) return
    setDownloading(format)
    try {
      await document.fonts.ready
      const canvas = await renderReceiptCanvasUtil({ tx: details, variant, accentHex })
      const refSlug = (details?.reference || details?.id || 'receipt').replace(/[^a-zA-Z0-9_-]/g, '')
      await downloadReceiptFile(canvas, refSlug, format)
      toast.success(`Receipt downloaded as ${format.toUpperCase()}`)
    } catch {
      toast.error('Failed to generate receipt. Please try again.')
    } finally {
      setDownloading(null)
    }
  }

  const typeUpper = (details?.type || '').toUpperCase()
  const isCredit = typeUpper === 'RECEIVE' || typeUpper === 'REFERRAL_EARNING' || typeUpper === 'CONVERT'
  const isDebit = typeUpper === 'SEND' || typeUpper === 'BILL_PAYMENT'
  const amtColor = isCredit ? 'text-emerald-400' : isDebit ? 'text-red-400' : 'text-[#64748B]'
  const symbol = currencySymbol(details?.currency || 'USDC')

  const meta = details?.metadata || {}
  // A send's on-chain hash ALWAYS lives on Arc: same-chain sends are native Arc
  // transfers, cross-chain sends burn on Arc first (via CCTP) before minting on
  // the destination. So the explorer deep-link must be Arc for sends, while the
  // displayed network reflects where the money is going.
  const isSend = typeUpper === 'SEND'
  const network = meta.network || details?.network || 'ARC'
  const displayNetwork = isSend ? (meta.destinationNetwork || network) : network
  const errorReason = meta.errorReason || details?.errorReason
  // Each chain has its own explorer. CCTP sends burn on Arc first, so a send's
  // txHash is an Arc hash even when the recipient is on another chain — always
  // deep-link to the chain the transaction hash actually landed on.
  const explorerNetwork = isSend ? 'ARC' : displayNetwork
  const explorerUrl = explorerTransactionUrl(explorerNetwork, meta.txHash)
  const swap = getSwapInfo(details)

  const statusColor = (s: string) => {
    const u = (s || '').toUpperCase()
    if (u === 'COMPLETED') return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
    if (u === 'FAILED') return 'bg-red-500/10 text-red-400 border-red-500/20'
    return 'bg-amber-500/10 text-amber-400 border-amber-500/20'
  }

  const statusLabel = (s: string) => {
    const u = (s || '').toUpperCase()
    if (u === 'COMPLETED') return 'Completed'
    if (u === 'FAILED') return 'Failed'
    return 'Pending'
  }

  // Receipt rows: swap (CONVERT) shows both legs; bills show the full invoice
  // (service, recipient, plan, paid amount, provider reference); internal
  // SureX-tag transfers show who sent/received with tags; everything else shows
  // the standard money-movement fields with copyable addresses.
  const isBill = typeUpper === 'BILL_PAYMENT'
  const bill = details?.bill || null
  const billMeta = meta
  const internal = meta?.delivery === 'internal'
  const feeVal = Number(details?.fee || 0)
  const feeTxt = feeVal > 0 ? `${currencySymbol(details?.currency || 'USDC')}${formatAmount(feeVal)} ${details?.currency || 'USDC'}` : 'Free'
  const dateValue = new Date(details?.createdAt || details?.date || Date.now()).toLocaleString('en-US', { dateStyle: 'long', timeStyle: 'short' })
  const fromParty = meta.fromTag
    ? `@${meta.fromTag}${meta.senderName ? ` · ${meta.senderName}` : ''}`
    : null
  const toParty = meta.toTag
    ? `@${meta.toTag}${meta.recipientName ? ` · ${meta.recipientName}` : ''}`
    : null
  const rows: { label: string; value: string; copyable?: string; mono?: boolean; accent?: boolean }[] = swap
    ? [
        { label: 'You swapped', value: `${currencySymbol(swap.from)}${formatAmount(swap.fromAmount)} ${swap.from}` },
        { label: 'You received', value: `${currencySymbol(swap.to)}${formatAmount(swap.toAmount)} ${swap.to}`, accent: true },
        ...(swap.rate ? [{ label: 'Rate', value: `1 ${swap.from} = ${formatAmount(swap.rate, 6)} ${swap.to}` }] : []),
        { label: 'Fee', value: feeTxt },
        { label: 'Reference', value: details?.reference || '—', copyable: details?.reference, mono: true },
        { label: 'Date', value: dateValue },
      ]
    : isBill
      ? [
          { label: 'Invoice No', value: details?.reference || '—', copyable: details?.reference, mono: true, accent: true },
          { label: 'Service', value: `${bill?.provider || billMeta.provider || 'Bill'} ${bill?.type === 'data' ? 'Data' : 'Airtime'}` },
          { label: 'Recipient', value: bill?.recipient || '—', copyable: bill?.recipient, mono: true },
          ...(bill?.type === 'data' && billMeta.planName ? [{ label: 'Plan', value: `${billMeta.planName}${billMeta.planValidity ? ` · ${billMeta.planValidity}` : ''}` }] : []),
          { label: 'Amount Paid', value: `₦${formatAmount(Number(bill?.amount ?? details?.amount ?? 0))}`, accent: true },
          { label: 'USDC', value: `$${formatAmount(Number(details?.amount || 0))}` },
          ...(billMeta.rate ? [{ label: 'Rate', value: `₦${formatAmount(billMeta.rate)} / USDC` }] : []),
          ...(meta.smartspeed?.reference ? [{ label: 'Provider Ref', value: meta.smartspeed.reference, copyable: meta.smartspeed.reference, mono: true }] : []),
          ...(meta.error ? [{ label: 'Error', value: meta.error }] : []),
          { label: 'Date', value: dateValue },
        ]
      : internal
        ? [
            ...(typeUpper === 'RECEIVE' && fromParty ? [{ label: 'From', value: fromParty, accent: true }] : []),
            ...(typeUpper !== 'RECEIVE' && toParty ? [{ label: 'To', value: toParty, accent: true }] : []),
            { label: 'Delivery', value: 'Instant · SureX Tag' },
            { label: 'Reference', value: details?.reference || '—', copyable: details?.reference, mono: true },
            { label: 'Amount', value: `${symbol}${formatAmount(Number(details?.amount || 0))} ${details?.currency || 'USDC'}` },
            { label: 'Fee', value: feeTxt },
            { label: 'Date', value: dateValue },
          ]
        : [
          { label: 'Reference', value: details?.reference || '—', copyable: details?.reference, mono: true },
          { label: 'Amount', value: `${symbol}${formatAmount(Number(details?.amount || 0))} ${details?.currency || 'USDC'}`, accent: true },
          { label: 'Fee', value: feeTxt },
          { label: 'Network', value: displayNetwork },
          { label: 'Date', value: dateValue },
          ...(meta.sourceAddress ? [{ label: 'From Address', value: meta.sourceAddress, copyable: meta.sourceAddress, mono: true }] : []),
          ...(meta.destinationAddress || details?.recipient ? [{ label: 'To Address', value: meta.destinationAddress || details?.recipient, copyable: meta.destinationAddress || details?.recipient, mono: true }] : []),
          ...(meta.txHash ? [{ label: 'Transaction Hash', value: meta.txHash, copyable: meta.txHash, mono: true }] : []),
        ]

  // Narration / channel context (e.g. admin manual-deposit notes) — surfaced
  // prominently so credits are self-explanatory on the receipt.
  if (rows.length && typeof meta.note === 'string' && meta.note.trim()) {
    if (meta.channel === 'manual_deposit') {
      rows.unshift({ label: 'Narration', value: meta.note.trim() });
      rows.unshift({ label: 'Channel', value: 'Admin deposit' });
    } else {
      rows.unshift({ label: 'Narration', value: meta.note.trim() });
    }
  }

  if (typeof document === 'undefined') return null
  return createPortal(
    <AnimatePresence>
      <motion.div className="fixed inset-0 liquid-backdrop z-[80]"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose} />
      <div className="fixed inset-0 z-[90] flex items-end sm:items-center sm:justify-center pointer-events-none">
      <motion.div
        className="w-full sm:w-[520px] sm:max-w-[94vw] max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl pointer-events-auto bg-[#0a0b0e] border border-white/10 shadow-2xl"
        initial={{ opacity: 0, y: 80 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 80 }}
        transition={{ type: 'spring', damping: 28, stiffness: 320 }}
      >
        {/* ── RECEIPT ── */}
        <div
          ref={receiptRef}
          className="px-7 py-8"
          style={{ fontFamily: 'var(--font-dm), sans-serif' }}
        >
          {/* Brand header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <img
                src={variant === 'gold' ? '/logo-mark-gold.png' : '/logo-mark-plain.png'}
                alt="SureXend"
                className={`w-7 h-7 object-contain ${variant === 'gold' ? 'gold-logo-glow' : 'lemon-logo-glow'}`}
              />
              <span className="font-extrabold text-white tracking-widest text-base leading-none">
                SURE<span style={{ color: accentHex }}>X</span>END
              </span>
            </div>
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-[0.2em] text-[#475569] font-bold leading-none pt-2">Official Receipt</p>
            </div>
          </div>

          {/* Type pill + date — credit/debit/swap/failed in the same position, small and clean */}
          <div className="flex items-center justify-between mt-6">
            {(() => {
              const isFailed = (details?.status || '').toUpperCase() === 'FAILED'
              const typePill = isFailed
                ? { label: 'Failed', cls: 'bg-red-500/10 text-red-400 border-red-500/20' }
                : swap
                  ? { label: 'Swap', cls: 'bg-amber-500/10 text-amber-400 border-amber-500/20' }
                  : isDebit
                    ? { label: 'Debit', cls: 'bg-white/[0.06] text-white border-white/15' }
                    : { label: 'Credit', cls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' }
              return (
                <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider border ${typePill.cls}`}>
                  <span className="w-1.5 h-1.5 rounded-full bg-current" />
                  {typePill.label}
                </span>
              )
            })()}
            <span className="text-[10px] text-[#475569] font-medium">
              {new Date(details?.createdAt || details?.date || Date.now()).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
            </span>
          </div>

          {/* Amount */}
          <div className="mt-5 text-center px-6 py-7 rounded-2xl bg-white/[0.03] border border-white/5 relative overflow-hidden">
            <div className="absolute inset-x-0 top-0 h-[3px]" style={{ background: `linear-gradient(90deg, transparent, ${accentHex}, transparent)` }} />
            <p className="text-[9px] uppercase tracking-[0.25em] text-[#64748B] font-bold mb-2">
              {swap ? 'You received' : 'Amount'}
            </p>
            {swap ? (
              <>
                <p className="text-4xl font-black tracking-tight text-white leading-none">
                  {currencySymbol(swap.to)}{formatAmount(swap.toAmount)}
                </p>
                <div className="mt-3.5 flex items-center justify-center gap-2.5 leading-none">
                  <span className="text-xs font-semibold text-[#94A3B8] whitespace-nowrap">
                    {currencySymbol(swap.from)}{formatAmount(swap.fromAmount)} {swap.from}
                  </span>
                  <span className="w-[22px] h-[22px] rounded-full bg-white/[0.06] border border-white/10 flex items-center justify-center flex-shrink-0">
                    <ArrowRight className="w-3 h-3 text-slate-300" strokeWidth={2.2} />
                  </span>
                  <span className="text-xs font-semibold text-white whitespace-nowrap">
                    {currencySymbol(swap.to)}{formatAmount(swap.toAmount)} {swap.to}
                  </span>
                </div>
              </>
            ) : (details?.status || '').toUpperCase() === 'FAILED' ? (
              <>
                <p className="text-4xl font-black tracking-tight text-white leading-none">Failed</p>
                <p className="text-[#94A3B8] text-xs mt-2.5">This transaction was not completed.</p>
              </>
            ) : (
              <>
                <p className="text-4xl font-black tracking-tight text-white leading-none">
                  {symbol}{formatAmount(Number(details?.amount || 0))}
                </p>
                <p className="text-[#94A3B8] text-xs mt-2.5">
                  {details?.currency || 'USDC'}
                </p>
              </>
            )}
          </div>

          {/* Failure explanation */}
          {(details?.status || '').toUpperCase() === 'FAILED' && (
            <div className="mt-4 flex items-start gap-2.5 p-3.5 rounded-xl bg-red-500/[0.08] border border-red-500/25">
              <XCircle size={16} className="text-red-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-red-400 text-xs font-bold mb-0.5">Transaction Failed</p>
                <p className="text-[#FDA4AF] text-[11px] leading-relaxed">
                  {errorReason || 'This transaction was not completed. The sent amount (if any) has been refunded to your available balance.'}
                </p>
              </div>
            </div>
          )}

          {/* Detail rows */}
          <div className="mt-7 space-y-3.5">
            {rows.map((row) => (
              <div key={row.label} className="flex items-center justify-between gap-4">
                <span className="text-[#64748B] text-[11px] font-medium leading-none flex-shrink-0">{row.label}</span>
                <span className="flex items-center gap-2 min-w-0 justify-end flex-1">
                  <span
                    className={`text-right text-[11px] font-semibold leading-none break-all ${row.mono ? 'font-mono text-[10.5px] tracking-tight' : ''} ${row.accent ? '' : 'text-white'}`}
                    style={row.accent ? { color: accentHex } : undefined}
                  >
                    {row.value}
                  </span>
                  {row.copyable && (
                    <button
                      onClick={() => copy(row.label, row.copyable!)}
                      className="text-[#475569] hover:text-white transition-colors flex-shrink-0 inline-flex items-center"
                      title="Copy"
                    >
                      {copiedField === row.label ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                    </button>
                  )}
                </span>
              </div>
            ))}
          </div>


          {/* Receipt footer */}
          <div className="mt-6 pt-5 border-t border-white/5">
            <p className="text-[9px] text-[#475569] font-medium text-center">Powered by SureXend · Verified digital transaction record</p>
            <button
              onClick={() => details?.reference && copy('Reference', details.reference)}
              className="mt-2 w-full text-[10px] text-[#64748B] font-mono font-semibold text-center break-all hover:text-white transition-colors"
              title="Copy reference"
            >
              {details?.reference || '—'}
              {details?.reference && (
                <span className="ml-1.5 text-[#475569]">↗</span>
              )}
            </button>
          </div>
        </div>

        {/* ── Action bar (not captured in download) ── */}
        <div className="border-t border-white/10 px-4 py-4 sm:px-6 grid grid-cols-3 gap-2.5 sm:gap-3">
          <button
            onClick={onClose}
            className="py-3 rounded-xl text-xs font-bold border border-white/10 bg-white/[0.04] text-[#94A3B8] hover:bg-white/[0.08] hover:text-white transition-all active:scale-[0.98]"
          >
            Close
          </button>
          <button
            onClick={() => downloadReceipt('png')}
            disabled={!!downloading}
            className="py-3 rounded-xl text-xs font-bold border transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-1.5"
            style={{ background: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,255,255,0.1)', color: '#94A3B8' }}
          >
            {downloading === 'png' ? <Download size={14} className="animate-pulse" /> : <Download size={14} />}
            Image
          </button>
          <button
            onClick={() => downloadReceipt('pdf')}
            disabled={!!downloading}
            className="py-3 rounded-xl text-xs font-bold transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-1.5 text-black shadow-lg"
            style={{ background: accentHex }}
          >
            {downloading === 'pdf' ? <Download size={14} className="animate-pulse" /> : <FileText size={14} />}
            PDF
          </button>
        </div>
      </motion.div>
      </div>
    </AnimatePresence>,
    document.body
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

  useBackLayer(showFilters || showStatement || !!selectedTx, () => {
    if (selectedTx) setSelectedTx(null)
    else if (showStatement) setShowStatement(false)
    else setShowFilters(false)
  }, 30)

  const normalizedSearch = search.trim()

  // Build query params. When the user is actively searching, pull a larger
  // slice once and filter client-side so the search box is genuinely useful
  // instead of only matching the current 20-row page.
  const queryParams = {
    page: normalizedSearch ? 1 : page,
    limit: normalizedSearch ? 200 : 20,
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

  const visibleTransactions = useMemo(() => {
    const q = normalizedSearch.toLowerCase()
    if (!q) return transactions
    return transactions.filter((tx: any) => {
      const meta = tx?.metadata || {}
      const haystack = [
        tx?.reference,
        tx?.type,
        tx?.status,
        tx?.currency,
        tx?.recipient,
        tx?.sender,
        meta?.toTag,
        meta?.fromTag,
        meta?.recipientName,
        meta?.senderName,
        meta?.provider,
        meta?.destinationNetwork,
        meta?.network,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return haystack.includes(q)
    })
  }, [transactions, normalizedSearch])

  // Count active filters
  const activeFilterCount = [filters.year, filters.month, filters.week, filters.day]
    .filter(Boolean).length + (filters.type !== 'ALL' ? 1 : 0)

  // Group transactions by date
  const grouped: Record<string, typeof visibleTransactions> = {}
  visibleTransactions.forEach((tx: any) => {
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
        ) : visibleTransactions.length === 0 ? (
          <motion.div
            className="flex flex-col items-center justify-center py-24 text-center"
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          >
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-white/[0.04] border border-white/10 flex items-center justify-center">
              <BarChart3 className="w-7 h-7 text-[#475569]" />
            </div>
            <h3 className="text-white font-semibold mb-2">No transactions found</h3>
            <p className="text-[#64748B] text-sm max-w-xs">
              {normalizedSearch
                ? 'No transaction on this screen matches your search yet'
                : activeFilterCount > 0
                  ? 'Try adjusting your filters'
                  : 'Your transactions will appear here once you start using SureXend'}
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
                <div className="liquid-glass rounded-2xl overflow-hidden">
                  {(txs as any[]).map((tx: any, idx: number) => {
                    const typeUpper = (tx.type || '').toUpperCase()
                    const statusUpper = (tx.status || '').toUpperCase()
                    const isCredit = typeUpper === 'RECEIVE' || typeUpper === 'REFERRAL_EARNING' || typeUpper === 'CONVERT'
                    const isDebit = typeUpper === 'SEND' || typeUpper === 'BILL_PAYMENT'
                    const sign = isCredit ? '+' : isDebit ? '-' : ''
                    const isFailed = statusUpper === 'FAILED'
                    const symbol = currencySymbol(tx.currency || 'USDC')
                    const swap = getSwapInfo(tx)
                    const dateStr = new Date(tx.createdAt || tx.date || Date.now()).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })

                    return (
                      <div
                        key={tx.id}
                        className={`flex items-center justify-between px-4 py-3.5 hover:bg-white/[0.03] active:bg-white/[0.06] transition-colors cursor-pointer ${idx !== 0 ? 'border-t border-white/[0.04]' : ''}`}
                        onClick={() => setSelectedTx(tx)}
                      >
                        <div className="flex items-center gap-3">
                          <TxIcon type={tx.type} accentHex={accentHex} />
                          <div>
                            {swap ? (
                              <>
                                <p className="text-white font-bold text-sm leading-tight">
                                  {swap.from} <span className="text-[#94A3B8] font-semibold">→</span> {swap.to}
                                </p>
                                <p className="text-[#64748B] text-xs mt-1 font-medium">{dateStr}</p>
                              </>
                            ) : (
                              <>
                                <p className="text-white font-semibold text-sm leading-tight">
                                  {txTypeLabel[typeUpper] || tx.type}
                                </p>
                                <p className="text-[#64748B] text-xs mt-1 font-medium">{dateStr}</p>
                              </>
                            )}
                          </div>
                        </div>

                        <div className="text-right flex-shrink-0 ml-3">
                          {isFailed ? (
                            <p className="font-bold text-sm text-white">Failed</p>
                          ) : swap ? (
                            <>
                              <p className="font-bold text-sm text-white">
                                {currencySymbol(swap.to)}{formatAmount(swap.toAmount)} {swap.to}
                              </p>
                              <p className="text-[#94A3B8] text-xs mt-1 font-medium">
                                {currencySymbol(swap.from)}{formatAmount(swap.fromAmount)} {swap.from}
                              </p>
                            </>
                          ) : (
                            <p className={`font-bold text-sm ${isDebit ? 'text-red-400' : 'text-white'}`}>
                              {sign}{symbol}{formatAmount(Number(tx.amount || 0))} {tx.currency || 'USDC'}
                            </p>
                          )}
                          <StatusBadge status={tx.status} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}

            {/* Pagination */}
            {!normalizedSearch && totalPages > 1 && (
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
          variant={variant}
        />
      )}
    </div>
  )
}
