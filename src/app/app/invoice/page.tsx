'use client'

import React, { useState } from 'react'
import { motion } from 'framer-motion'
import { useTheme } from '@/context/ThemeContext'
import {
  FileSpreadsheet, Globe, Copy, Check, Download, Share2,
  ShieldCheck, Zap, Sparkles, RefreshCw
} from 'lucide-react'
import toast from 'react-hot-toast'

const CURRENCIES = [
  { code: 'EUR', symbol: '€', flag: '🇪🇺', country: 'Eurozone (SEPA Instant)', bank: 'BNP Paribas / Banking Circle', iban: 'BE76 3631 0423 9812 4019', bic: 'TRWIBEBBXXX', accountName: 'SureXend Europe B.V.' },
  { code: 'GBP', symbol: '£', flag: '🇬🇧', country: 'United Kingdom (FPS)', bank: 'ClearBank UK', iban: 'GB29 NWBK 6016 1331 9268 19', bic: 'NWBKGB2L', accountName: 'SureXend UK Ltd.' },
  { code: 'USD', symbol: '$', flag: '🇺🇸', country: 'United States (FedWire / ACH)', bank: 'Evolve Bank & Trust USA', iban: 'US08 EVLB 0910 0001 8293 401', bic: 'EVLBUS33', accountName: 'SureXend Inc.' },
  { code: 'CHF', symbol: 'CHF', flag: '🇨🇭', country: 'Switzerland (SIC)', bank: 'UBS Switzerland AG', iban: 'CH93 0023 5235 1042 9819 0', bic: 'UBSWCHZH', accountName: 'SureXend Swiss GmbH' },
  { code: 'PLN', symbol: 'zł', flag: '🇵🇱', country: 'Poland (Elixir)', bank: 'mBank S.A. Poland', iban: 'PL10 1140 2004 0000 3002 8192', bic: 'BREXPLPW', accountName: 'SureXend PL Sp. z o.o.' },
  { code: 'SEK', symbol: 'kr', flag: '🇸🇪', country: 'Sweden (Bankgirot)', bank: 'Handelsbanken Sweden', iban: 'SE45 5000 0000 0583 9102 4819', bic: 'HANDSESS', accountName: 'SureXend Sweden AB' },
  { code: 'DKK', symbol: 'kr.', flag: '🇩🇰', country: 'Denmark (Intradagclearing)', bank: 'Danske Bank A/S', iban: 'DK84 3000 0010 4910 2819', bic: 'DABADKKK', accountName: 'SureXend Denmark ApS' },
  { code: 'NOK', symbol: 'kr', flag: '🇳🇴', country: 'Norway (NIX)', bank: 'DNB Bank ASA Norway', iban: 'NO93 1205 2039 1049 2819', bic: 'DNBNNOKK', accountName: 'SureXend Norway AS' },
  { code: 'CZK', symbol: 'Kč', flag: '🇨🇿', country: 'Czechia (CERTIS)', bank: 'Česká spořitelna A.S.', iban: 'CZ68 0800 0000 0019 8240 1842', bic: 'GIBACZPX', accountName: 'SureXend CZ s.r.o.' },
  { code: 'HUF', symbol: 'Ft', flag: '🇭🇺', country: 'Hungary (VIBER)', bank: 'OTP Bank Nyrt Hungary', iban: 'HU48 1177 3016 1111 2222 3333', bic: 'OTPVHUHB', accountName: 'SureXend HU Kft.' },
  { code: 'BGN', symbol: 'лв', flag: '🇧🇬', country: 'Bulgaria (BISERA)', bank: 'UniCredit Bulbank', iban: 'BG18 UNCR 7000 1523 9102 4819', bic: 'UNCRBGSF', accountName: 'SureXend Bulgaria EOOD' },
  { code: 'RON', symbol: 'lei', flag: '🇷🇴', country: 'Romania (ReGIS)', bank: 'Banca Transilvania', iban: 'RO49 BTRL EURC RT01 2345 6789', bic: 'BTRLRO22', accountName: 'SureXend Romania SRL' },
]

// USD equivalent rates for display
const TO_USD: Record<string, number> = {
  EUR: 1.09, GBP: 1.28, USD: 1.0, CHF: 1.12,
  PLN: 0.25, SEK: 0.095, DKK: 0.145, NOK: 0.094,
  CZK: 0.044, HUF: 0.0028, BGN: 0.55, RON: 0.22,
}

export default function InvoicePage() {
  const { colors } = useTheme()
  const [selectedCode, setSelectedCode] = useState('EUR')
  const [payerName, setPayerName] = useState('')
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [copiedField, setCopiedField] = useState<string | null>(null)

  const curr = CURRENCIES.find(c => c.code === selectedCode) || CURRENCIES[0]
  const numAmount = parseFloat(amount) || 0
  const usdEquivalent = (numAmount * (TO_USD[selectedCode] || 1)).toFixed(2)

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text)
    setCopiedField(label)
    toast.success(`${label} copied!`)
    setTimeout(() => setCopiedField(null), 2000)
  }

  const CopyBtn = ({ text, label }: { text: string; label: string }) => (
    <button
      onClick={() => handleCopy(text, label)}
      className="p-1.5 rounded-lg hover:bg-white/10 text-[#64748B] hover:text-white transition-colors"
    >
      {copiedField === label
        ? <Check className="w-3.5 h-3.5 text-emerald-400" />
        : <Copy className="w-3.5 h-3.5" />}
    </button>
  )

  return (
    <div className="w-full max-w-full overflow-x-hidden px-3 py-4 sm:p-6 max-w-2xl mx-auto space-y-5 pb-28 sm:pb-32">

      {/* Page Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span
              className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full border"
              style={{ color: colors.primary, borderColor: colors.cardBorder, background: `rgba(${colors.glowRgb}, 0.1)` }}
            >
              International Billing
            </span>
            <span className="text-[10px] text-emerald-400 flex items-center gap-1 font-medium">
              <Zap className="w-3 h-3" /> Auto-USD Conversion
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight flex items-center gap-2">
            <Globe className="w-5 h-5 text-blue-400" /> Invoice Generator
          </h1>
          <p className="text-xs text-[#94A3B8] mt-0.5">
            Generate IBAN / SWIFT payment details. Funds auto-credit your USD wallet.
          </p>
        </div>
      </div>

      {/* Currency Selector */}
      <motion.div
        className="liquid-glass p-4 sm:p-5 space-y-3"
        initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
      >
        <h3 className="font-bold text-white text-sm flex items-center gap-2">
          <FileSpreadsheet className="w-4 h-4" style={{ color: colors.primary }} />
          Select Billing Currency
        </h3>
        <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
          {CURRENCIES.map((c) => {
            const isSel = selectedCode === c.code
            return (
              <button
                key={c.code}
                onClick={() => setSelectedCode(c.code)}
                className="p-2 rounded-xl border flex flex-col items-center gap-0.5 transition-all text-center"
                style={isSel
                  ? { background: `rgba(${colors.glowRgb},0.15)`, borderColor: colors.primary, color: colors.primary }
                  : { background: 'rgba(255,255,255,0.02)', borderColor: 'rgba(255,255,255,0.07)', color: '#94A3B8' }
                }
              >
                <span className="text-lg leading-none">{c.flag}</span>
                <span className="text-[10px] font-extrabold leading-none mt-0.5">{c.code}</span>
              </button>
            )
          })}
        </div>
      </motion.div>

      {/* Invoice Form */}
      <motion.div
        className="liquid-glass p-4 sm:p-5 space-y-4"
        initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
      >
        <h3 className="font-bold text-white text-sm flex items-center gap-2 border-b border-white/5 pb-3">
          <Sparkles className="w-4 h-4" style={{ color: colors.primary }} />
          Invoice Details
        </h3>

        {/* Payer */}
        <div>
          <label className="block text-xs font-medium text-[#94A3B8] mb-1.5">Payer / Client Name (Optional)</label>
          <input
            type="text"
            placeholder="e.g. Acme Corp / Hans Müller"
            value={payerName}
            onChange={(e) => setPayerName(e.target.value)}
            className="w-full px-4 py-2.5 rounded-xl bg-white/[0.03] border border-white/10 text-white text-sm focus:outline-none focus:border-blue-500/60 transition-colors placeholder:text-[#475569]"
          />
        </div>

        {/* Amount */}
        <div>
          <label className="block text-xs font-medium text-[#94A3B8] mb-1.5">
            Invoice Amount ({curr.symbol} {curr.code})
          </label>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-base font-bold text-white pointer-events-none">{curr.symbol}</span>
            <input
              type="number"
              placeholder="0.00"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white/[0.03] border border-white/10 text-white text-lg font-bold focus:outline-none focus:border-blue-500/60 transition-colors placeholder:text-[#475569]"
            />
          </div>
          {numAmount > 0 && (
            <p className="text-xs text-emerald-400 mt-1.5 font-medium">
              ≈ ${usdEquivalent} USD will credit your wallet
            </p>
          )}
        </div>

        {/* Reference */}
        <div>
          <label className="block text-xs font-medium text-[#94A3B8] mb-1.5">Payment Reference / Note</label>
          <input
            type="text"
            placeholder="e.g. Design Consulting Invoice #104"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full px-4 py-2.5 rounded-xl bg-white/[0.03] border border-white/10 text-white text-sm focus:outline-none focus:border-blue-500/60 transition-colors placeholder:text-[#475569]"
          />
        </div>
      </motion.div>

      {/* Generated Bank Account Details */}
      <motion.div
        className="liquid-glass p-4 sm:p-5 space-y-4"
        initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
      >
        {/* Card Header */}
        <div className="flex items-center justify-between border-b border-white/8 pb-3">
          <div className="flex items-center gap-2.5">
            <span className="text-2xl">{curr.flag}</span>
            <div>
              <h4 className="font-bold text-white text-sm">{curr.country}</h4>
              <p className="text-[10px] text-[#64748B]">{curr.bank}</p>
            </div>
          </div>
          <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1 flex-shrink-0">
            <ShieldCheck className="w-3 h-3" /> Verified
          </span>
        </div>

        {/* Invoice Summary */}
        {numAmount > 0 && (
          <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/8">
            <p className="text-[10px] text-[#64748B] uppercase tracking-wider mb-0.5">Invoice Total</p>
            <p className="text-2xl font-black text-white">{curr.symbol}{numAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })} {curr.code}</p>
            <p className="text-xs text-emerald-400 font-medium mt-0.5">≈ ${usdEquivalent} USD (Auto-credited to wallet)</p>
            {payerName && <p className="text-xs text-[#94A3B8] mt-1.5 border-t border-white/5 pt-1.5">Payer: <span className="text-white font-semibold">{payerName}</span>{description ? ` · ${description}` : ''}</p>}
          </div>
        )}

        {/* Bank Details */}
        <div className="space-y-2.5">
          {/* Account Name */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-white/[0.03] border border-white/6">
            <div>
              <p className="text-[10px] text-[#64748B] uppercase tracking-wider">Account Name</p>
              <p className="text-xs font-bold text-white mt-0.5">{curr.accountName}</p>
            </div>
            <CopyBtn text={curr.accountName} label="Account Name" />
          </div>

          {/* BIC / SWIFT */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-white/[0.03] border border-white/6">
            <div>
              <p className="text-[10px] text-[#64748B] uppercase tracking-wider">BIC / SWIFT</p>
              <p className="text-xs font-mono font-bold text-white mt-0.5">{curr.bic}</p>
            </div>
            <CopyBtn text={curr.bic} label="BIC" />
          </div>

          {/* IBAN */}
          <div className="p-3.5 rounded-xl bg-white/[0.04] border border-white/10">
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-[10px] text-[#64748B] uppercase tracking-wider font-bold">IBAN / Account Number</p>
              <button
                onClick={() => handleCopy(curr.iban, 'IBAN')}
                className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-white/10 hover:bg-white/20 text-white flex items-center gap-1 transition-all"
              >
                {copiedField === 'IBAN' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                {copiedField === 'IBAN' ? 'Copied' : 'Copy'}
              </button>
            </div>
            <p className="text-sm font-mono font-extrabold text-white tracking-wide break-all select-all">{curr.iban}</p>
          </div>
        </div>

        {/* Auto-Settlement Notice */}
        <div className="p-3.5 rounded-xl bg-emerald-500/8 border border-emerald-500/20 flex items-start gap-3">
          <RefreshCw className="w-4 h-4 flex-shrink-0 text-emerald-400 mt-0.5" />
          <div>
            <p className="text-xs font-semibold text-white">Automated Real-Time Settlement</p>
            <p className="text-[11px] text-[#94A3B8] mt-0.5 leading-relaxed">
              When funds arrive at this account, SureXend automatically converts & credits your USD wallet instantly.
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-2 gap-3 pt-1">
          <button
            onClick={() => handleCopy(`IBAN: ${curr.iban} | BIC: ${curr.bic} | Bank: ${curr.bank}`, 'Invoice Details')}
            className="py-3 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-white text-xs font-semibold flex items-center justify-center gap-2 transition-all active:scale-95"
          >
            <Share2 className="w-4 h-4 text-blue-400" /> Share Details
          </button>
          <button
            onClick={() => toast.success('Invoice PDF downloading...')}
            className="py-3 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-white text-xs font-semibold flex items-center justify-center gap-2 transition-all active:scale-95"
          >
            <Download className="w-4 h-4 text-emerald-400" /> Download PDF
          </button>
        </div>
      </motion.div>
    </div>
  )
}
