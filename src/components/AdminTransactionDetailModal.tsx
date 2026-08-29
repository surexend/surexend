'use client'

import { useEffect, useState } from 'react'
import { adminAPI } from '@/lib/api'
import { X, Copy, Check, FileText, Zap, ExternalLink } from 'lucide-react'

const EXPLORER_BASE: Record<string, string> = {
  ARC: 'https://testnet.arcscan.app/tx/',
  ETHEREUM: 'https://sepolia.etherscan.io/tx/',
  POLYGON: 'https://amoy.polygonscan.com/tx/',
  AVALANCHE: 'https://testnet.snowtrace.io/tx/',
  ARBITRUM: 'https://sepolia.arbiscan.io/tx/',
  BASE: 'https://sepolia.basescan.org/tx/',
  OPTIMISM: 'https://sepolia-optimistic.etherscan.io/tx/',
  SOLANA: 'https://explorer.solana.com/tx/',
  MONAD: 'https://testnet.monadscan.com/tx/',
  BSC: 'https://testnet.bscscan.com/tx/',
}

export function AdminTransactionDetailModal({ id, onClose }: { id: string; onClose: () => void }) {
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
        <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={onClose} />
        <div className="relative w-full max-w-md mx-4 bg-[#121419] rounded-3xl border border-white/10 p-8 text-center shadow-2xl">
          <div className="w-8 h-8 mx-auto rounded-full border-2 border-white/10 border-t-amber-400 animate-spin" />
        </div>
      </div>
    )
  }

  const meta = tx.metadata || {}
  const bill = tx.bill
  const statusColor = (s: string) =>
    s === 'COMPLETED'
      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
      : s === 'FAILED'
        ? 'bg-red-500/10 text-red-400 border-red-500/20'
        : 'bg-amber-500/10 text-amber-400 border-amber-500/20'

  const explorerNetwork = (meta.destinationNetwork || meta.network || tx.network || 'ARC').toUpperCase()
  const explorerUrl = meta.txHash
    ? `${EXPLORER_BASE[explorerNetwork] || EXPLORER_BASE.ARC}${meta.txHash}`
    : `https://testnet.arcscan.app/tx/${tx.reference}`

  const rows: { label: string; value: string; mono?: boolean; accent?: boolean }[] = [
    { label: 'Reference / Invoice', value: tx.reference || '—', mono: true, accent: true },
    { label: 'Type', value: tx.type },
    { label: 'Status', value: tx.status },
    { label: 'Amount', value: `${tx.amount} ${tx.currency}`, accent: true },
    { label: 'Fee', value: `${tx.fee} ${tx.currency}` },
    { label: 'Date', value: new Date(tx.createdAt).toLocaleString('en-US', { dateStyle: 'long', timeStyle: 'short' }) },
    ...(tx.user?.email ? [{ label: 'User', value: `${tx.user.firstName || ''} ${tx.user.lastName || ''} (@${tx.user.surexTag || ''}) · ${tx.user.email}` }] : []),
    ...(bill ? [
      { label: 'Service', value: `${bill.provider} ${bill.type === 'data' ? 'Data' : 'Airtime'}` },
      { label: 'Recipient', value: bill.recipient, mono: true },
      { label: 'Paid (NGN)', value: `₦${Number(bill.amount || 0).toLocaleString()}`, accent: true },
      ...(bill.type === 'data' && meta.planName ? [{ label: 'Plan', value: `${meta.planName}${meta.planValidity ? ` · ${meta.planValidity}` : ''}` }] : []),
      ...(meta.rate ? [{ label: 'Rate', value: `₦${meta.rate} / USDC` }] : []),
    ] : []),
    ...(meta.costPrice != null ? [{ label: 'Service Cost (NGN)', value: `₦${meta.costPrice.toLocaleString()}` }] : []),
    ...(meta.sellPrice != null ? [{ label: 'Sell Price (NGN)', value: `₦${meta.sellPrice.toLocaleString()}` }] : []),
    ...(meta.marginPct != null ? [{ label: 'Margin / Markup', value: `${meta.marginPct}%` }] : []),
    ...(meta.smartspeed?.reference ? [{ label: 'Provider Ref', value: meta.smartspeed.reference, mono: true }] : []),
    ...(meta.note ? [{ label: 'Narration / Note', value: meta.note }] : []),
    ...(meta.error ? [{ label: 'Error Reason', value: meta.error }] : []),
    ...(meta.txHash ? [{ label: 'Tx Hash', value: meta.txHash, mono: true }] : []),
    ...(meta.destinationAddress ? [{ label: 'To Address', value: meta.destinationAddress, mono: true }] : []),
    ...(meta.sourceAddress ? [{ label: 'From Address', value: meta.sourceAddress, mono: true }] : []),
  ]

  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center sm:justify-center p-3 sm:p-4">
      <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full sm:max-w-lg mx-auto bg-[#0A0B0E] rounded-3xl border border-white/10 max-h-[90vh] overflow-y-auto shadow-2xl z-10">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-white/10 sticky top-0 bg-[#0A0B0E]/95 backdrop-blur-md z-20">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
              {tx.type === 'BILL_PAYMENT' ? <Zap className="w-4 h-4 text-amber-400" /> : <FileText className="w-4 h-4 text-amber-400" />}
            </div>
            <div>
              <h3 className="text-white font-extrabold text-sm flex items-center gap-2">
                Transaction Receipt
                <span className="text-[10px] text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full font-bold">ADMIN VIEW</span>
              </h3>
              <p className="text-[10px] text-[#64748B]">Full record &amp; explorer verification</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-white/10 text-[#64748B] hover:text-white transition-colors"><X size={18} /></button>
        </div>

        <div className="p-6 space-y-5">
          {/* Status badge */}
          <div className="flex items-center justify-between">
            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider border ${statusColor(tx.status)}`}>
              <span className="w-1.5 h-1.5 rounded-full bg-current" />
              {tx.status}
            </span>
            <span className="text-xs font-semibold text-[#94A3B8]">{tx.type}</span>
          </div>

          {/* Amount Card */}
          <div className="text-center px-6 py-6 rounded-2xl bg-white/[0.03] border border-white/10 relative overflow-hidden">
            <div className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-transparent via-amber-400 to-transparent" />
            <p className="text-[9px] uppercase tracking-[0.25em] text-[#64748B] font-bold mb-1">Transaction Amount</p>
            <p className="text-3xl font-black text-white tracking-tight">${Number(tx.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })} {tx.currency}</p>
            {tx.fee > 0 && <p className="text-xs text-[#94A3B8] mt-1">+ ${Number(tx.fee).toFixed(2)} fee</p>}
          </div>

          {/* Reference copy box */}
          <div className="flex items-center justify-between p-3.5 rounded-2xl bg-white/[0.03] border border-white/10">
            <div className="min-w-0 pr-2">
              <p className="text-[10px] uppercase tracking-wider text-[#64748B] font-semibold mb-0.5">Reference ID</p>
              <p className="text-white font-mono text-xs font-bold truncate">{tx.reference}</p>
            </div>
            <button onClick={() => copy(tx.reference)} className="px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 bg-white/5 border border-white/10 hover:bg-white/10 text-white transition-colors flex-shrink-0">
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>

          {/* Detail Rows */}
          <div className="space-y-3 pt-1">
            {rows.map((r) => (
              <div key={r.label} className="flex items-start justify-between gap-4 py-1 border-b border-white/5 last:border-0">
                <span className="text-[#64748B] text-xs font-medium flex-shrink-0">{r.label}</span>
                <span className={`text-xs font-semibold text-right break-all min-w-0 ${r.mono ? 'font-mono text-[11px]' : ''} ${r.accent ? 'text-amber-400 font-bold' : 'text-white'}`}>{r.value}</span>
              </div>
            ))}
          </div>

          {/* Admin-only Explorer Link */}
          <div className="pt-3">
            <a
              href={explorerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl text-xs font-extrabold border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 transition-all shadow-lg active:scale-[0.98]"
            >
              <ExternalLink className="w-4 h-4 text-amber-400" />
              View on Arc Explorer ↗
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
