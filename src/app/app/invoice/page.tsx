'use client'

import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useTheme } from '@/context/ThemeContext'
import { 
  FileSpreadsheet, Globe, Copy, Check, Download, Share2, 
  Building2, ArrowRight, ShieldCheck, Zap, Sparkles, User, RefreshCw, Send, CheckCircle
} from 'lucide-react'
import toast from 'react-hot-toast'

// Complete European & Global Currencies Catalog
const EUROPEAN_CURRENCIES = [
  { code: 'EUR', symbol: '€', flag: '🇪🇺', country: 'Eurozone (SEPA Instant)', bankName: 'BNP Paribas / Banking Circle Europe', iban: 'BE76 3631 0423 9812 4019', bic: 'TRWIBEBBXXX' },
  { code: 'GBP', symbol: '£', flag: '🇬🇧', country: 'United Kingdom (FPS)', bankName: 'ClearBank UK', iban: 'GB29 NWBK 6016 1331 9268 19', bic: 'NWBKGB2L' },
  { code: 'USD', symbol: '$', flag: '🇺🇸', country: 'United States (FedWire/ACH)', bankName: 'Evolve Bank & Trust USA', iban: 'US08 EVLB 0910 0001 8293 401', bic: 'EVLBUS33' },
  { code: 'CHF', symbol: 'CHF', flag: '🇨🇭', country: 'Switzerland (SIC)', bankName: 'UBS Switzerland AG', iban: 'CH93 0023 5235 1042 9819 0', bic: 'UBSWCHZH' },
  { code: 'PLN', symbol: 'zł', flag: '🇵🇱', country: 'Poland (Elixir)', bankName: 'mBank S.A. Poland', iban: 'PL10 1140 2004 0000 3002 8192', bic: 'BREXPLPW' },
  { code: 'SEK', symbol: 'kr', flag: '🇸🇪', country: 'Sweden (Bankgirot)', bankName: 'Handelsbanken Sweden', iban: 'SE45 5000 0000 0583 9102 4819', bic: 'HANDSESS' },
  { code: 'DKK', symbol: 'kr.', flag: '🇩🇰', country: 'Denmark (Intradagclearing)', bankName: 'Danske Bank A/S', iban: 'DK84 3000 0010 4910 2819', bic: 'DABADKKK' },
  { code: 'NOK', symbol: 'kr', flag: '🇳🇴', country: 'Norway (NIX)', bankName: 'DNB Bank ASA Norway', iban: 'NO93 1205 2039 1049 2819', bic: 'DNBNNOKK' },
  { code: 'CZK', symbol: 'Kč', flag: '🇨🇿', country: 'Czechia (CERTIS)', bankName: 'Česká spořitelna A.S.', iban: 'CZ68 0800 0000 0019 8240 1842', bic: 'GIBACZPX' },
  { code: 'HUF', symbol: 'Ft', flag: '🇭🇺', country: 'Hungary (VIBER)', bankName: 'OTP Bank Nyrt Hungary', iban: 'HU48 1177 3016 1111 2222 3333', bic: 'OTPVHUHB' },
  { code: 'BGN', symbol: 'лв', flag: '🇧🇬', country: 'Bulgaria (BISERA)', bankName: 'UniCredit Bulbank', iban: 'BG18 UNCR 7000 1523 9102 4819', bic: 'UNCRBGSF' },
  { code: 'RON', symbol: 'lei', flag: '🇷🇴', country: 'Romania (ReGIS)', bankName: 'Banca Transilvania', iban: 'RO49 BTRL EURC RT01 2345 6789', bic: 'BTRLRO22' }
]

export default function InvoicePage() {
  const { variant, colors } = useTheme()
  const [selectedCurrencyCode, setSelectedCurrencyCode] = useState('EUR')
  const [payerName, setPayerName] = useState('')
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [isGenerated, setIsGenerated] = useState(false)
  const [copiedField, setCopiedField] = useState<string | null>(null)

  const currentAcc = EUROPEAN_CURRENCIES.find(c => c.code === selectedCurrencyCode) || EUROPEAN_CURRENCIES[0]

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text)
    setCopiedField(label)
    toast.success(`Copied ${label} to clipboard!`)
    setTimeout(() => setCopiedField(null), 2000)
  }

  const handleGenerate = (e: React.FormEvent) => {
    e.preventDefault()
    if (!amount || parseFloat(amount) <= 0) {
      toast.error('Please enter a valid invoice amount')
      return
    }
    setIsGenerated(true)
    toast.success('European Payment Invoice Generated!')
  }

  return (
    <div className="w-full max-w-full overflow-x-hidden px-3 py-4 sm:p-6 md:p-8 max-w-5xl mx-auto space-y-4 sm:space-y-6 pb-28 sm:pb-32">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 border-b border-white/5 pb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider px-2.5 py-0.5 rounded-full border" style={{ color: colors.primary, borderColor: colors.cardBorder, background: `rgba(${colors.glowRgb}, 0.1)` }}>
              International Billing
            </span>
            <span className="text-xs text-emerald-400 flex items-center gap-1 font-medium">
              <Zap className="w-3 h-3" /> Auto-USD Conversion
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight flex items-center gap-2">
            European & Global Invoice <Globe className="w-6 h-6 text-blue-400" />
          </h1>
          <p className="text-xs sm:text-sm text-[#94A3B8] mt-1">
            Generate SEPA (EUR), UK (GBP), or US (USD) bank details to get paid internationally. Funds received automatically credit your USD wallet balance.
          </p>
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Invoice Generator Form (5 cols) */}
        <motion.div 
          className="glass-card p-5 sm:p-6 lg:col-span-5 space-y-5"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <h3 className="font-bold text-white text-lg flex items-center gap-2 border-b border-white/5 pb-3">
            <FileSpreadsheet className="w-5 h-5" style={{ color: colors.primary }} />
            Create New Invoice
          </h3>

          <form onSubmit={handleGenerate} className="space-y-4">
            {/* Currency Selector */}
            <div>
              <label className="block text-xs font-medium text-[#94A3B8] mb-2">Select European / Global Billing Currency</label>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-44 overflow-y-auto pr-1 no-scrollbar">
                {EUROPEAN_CURRENCIES.map((curr) => {
                  const isSel = selectedCurrencyCode === curr.code
                  return (
                    <button
                      key={curr.code}
                      type="button"
                      onClick={() => { setSelectedCurrencyCode(curr.code); setIsGenerated(false) }}
                      className={`p-2.5 rounded-xl border flex flex-col items-center gap-1 transition-all ${
                        isSel 
                          ? 'bg-white/10 text-white font-bold border-emerald-500/50 shadow-lg scale-105' 
                          : 'bg-white/[0.02] text-[#94A3B8] border-white/5 hover:bg-white/[0.05]'
                      }`}
                      style={isSel ? { borderColor: colors.primary, color: colors.primary } : {}}
                    >
                      <span className="text-lg">{curr.flag}</span>
                      <span className="text-[11px] font-extrabold">{curr.code}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Payer Name */}
            <div>
              <label className="block text-xs font-medium text-[#94A3B8] mb-1">Payer / Client Name (Optional)</label>
              <input
                type="text"
                placeholder="e.g. Acme Corp / Hans Müller"
                value={payerName}
                onChange={(e) => setPayerName(e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-white/[0.03] border border-white/10 text-white text-sm focus:outline-none focus:border-blue-500 transition-colors"
              />
            </div>

            {/* Amount */}
            <div>
              <label className="block text-xs font-medium text-[#94A3B8] mb-1">Invoice Amount ({currentAcc.symbol})</label>
              <div className="relative">
                <span className="absolute left-4 top-3 text-lg font-bold text-white">{currentAcc.symbol}</span>
                <input
                  type="number"
                  placeholder="0.00"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full pl-9 pr-4 py-3 rounded-xl bg-white/[0.03] border border-white/10 text-white text-base font-bold focus:outline-none focus:border-blue-500 transition-colors"
                  required
                />
              </div>
            </div>

            {/* Note / Memo */}
            <div>
              <label className="block text-xs font-medium text-[#94A3B8] mb-1">Payment Reference / Note</label>
              <input
                type="text"
                placeholder="e.g. Design Consulting Invoice #104"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-white/[0.03] border border-white/10 text-white text-sm focus:outline-none focus:border-blue-500 transition-colors"
              />
            </div>

            {/* Submit CTA */}
            <button
              type="submit"
              className="w-full py-3.5 rounded-xl font-bold text-black flex items-center justify-center gap-2 shadow-lg transition-transform hover:scale-[1.02]"
              style={{ background: colors.gradientBg }}
            >
              <Sparkles className="w-4 h-4" />
              Generate {selectedCurrency} Payment Invoice
            </button>
          </form>
        </motion.div>

        {/* Right: Live Interactive European Bank Account Invoice Card (7 cols) */}
        <motion.div 
          className="glass-card p-6 lg:col-span-7 space-y-6 relative overflow-hidden flex flex-col justify-between"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          {/* Top Info Banner */}
          <div className="flex items-center justify-between border-b border-white/10 pb-4">
            <div className="flex items-center gap-3">
              <span className="text-3xl">{currentAcc.flag}</span>
              <div>
                <h4 className="font-bold text-white text-lg">{currentAcc.country} Account</h4>
                <p className="text-xs text-[#94A3B8]">{currentAcc.bankName}</p>
              </div>
            </div>
            <span className="px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5" /> SEPA / Instant
            </span>
          </div>

          {/* Invoice Display Box */}
          <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/10 space-y-4 relative">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-xs text-[#64748B] uppercase tracking-wider">Invoice Total</p>
                <p className="text-3xl font-black text-white tracking-tight mt-0.5">
                  {currentAcc.symbol}{amount ? parseFloat(amount).toLocaleString(undefined, { minimumFractionDigits: 2 }) : '0.00'} {selectedCurrency}
                </p>
                <p className="text-xs text-emerald-400 mt-1 font-medium flex items-center gap-1">
                  ≈ ${amount ? (parseFloat(amount) * (selectedCurrency === 'GBP' ? 1.28 : selectedCurrency === 'EUR' ? 1.09 : 1.0)).toFixed(2) : '0.00'} USD (Direct Credit)
                </p>
              </div>
              <div className="p-2 rounded-xl bg-white flex flex-col items-center justify-center shadow-md">
                <svg className="w-16 h-16 text-black" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M2 2h8v8H2V2zm2 2v4h4V4H4zm9-2h8v8h-8V2zm2 2v4h4V4h-4zM2 14h8v8H2v-8zm2 2v4h4v-4H4zm11-2h2v2h-2v-2zm-2 2h2v2h-2v-2zm4 0h2v2h-2v-2zm-2 2h2v2h-2v-2zm2 2h2v2h-2v-2zm-4 0h2v2h-2v-2zm2-6h2v2h-2v-2z" />
                </svg>
                <span className="text-[9px] font-bold text-gray-700 tracking-tighter uppercase">SEPA QR</span>
              </div>
            </div>

            {payerName && (
              <div className="text-xs text-[#94A3B8] border-t border-white/5 pt-2">
                Payer: <span className="text-white font-semibold">{payerName}</span> {description && `(${description})`}
              </div>
            )}

            {/* Bank Details Card Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5">
                <p className="text-[11px] text-[#64748B]">Account Name</p>
                <p className="text-xs font-bold text-white mt-0.5 truncate">{currentAcc.accountName}</p>
              </div>

              <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5">
                <p className="text-[11px] text-[#64748B]">Bank SWIFT / BIC</p>
                <div className="flex justify-between items-center">
                  <p className="text-xs font-mono font-bold text-white mt-0.5">{currentAcc.bic}</p>
                  <button onClick={() => handleCopy(currentAcc.bic, 'BIC')} className="text-xs text-[#94A3B8] hover:text-white">
                    {copiedField === 'BIC' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              <div className="col-span-1 sm:col-span-2 p-3.5 rounded-xl bg-white/[0.04] border border-white/10 space-y-1.5">
                <div className="flex justify-between items-center">
                  <p className="text-[11px] text-[#64748B] uppercase font-bold tracking-wider">IBAN / Account Number</p>
                  <button
                    onClick={() => handleCopy(currentAcc.iban, 'IBAN')}
                    className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-white/10 hover:bg-white/20 text-white flex items-center gap-1 transition-all"
                  >
                    {copiedField === 'IBAN' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    {copiedField === 'IBAN' ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <p className="text-xs sm:text-sm font-mono font-extrabold text-white tracking-normal break-all select-all">{currentAcc.iban}</p>
              </div>
            </div>
          </div>

          {/* Delivery & Auto-USD Notice */}
          <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-300 leading-relaxed flex items-start gap-3">
            <RefreshCw className="w-5 h-5 flex-shrink-0 text-emerald-400 mt-0.5 animate-spin-slow" />
            <div>
              <p className="font-semibold text-white">Automated Real-Time Settlement</p>
              <p className="text-[#94A3B8] text-[11px] mt-0.5">
                When funds reach this European IBAN or account, SureXend automatically converts the payment into USD and credits your wallet immediately.
              </p>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex gap-3 pt-2">
            <button
              onClick={() => handleCopy(`Pay Invoice: ${currentAcc.iban} (${accountDetails[selectedCurrency].symbol}${amount || '0'})`, 'Invoice Link')}
              className="flex-1 py-3 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-white text-xs font-semibold flex items-center justify-center gap-2 transition-all"
            >
              <Share2 className="w-4 h-4 text-blue-400" /> Share Invoice Link
            </button>
            <button
              onClick={() => toast.success('Invoice PDF downloading...')}
              className="flex-1 py-3 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-white text-xs font-semibold flex items-center justify-center gap-2 transition-all"
            >
              <Download className="w-4 h-4 text-emerald-400" /> Download PDF
            </button>
          </div>
        </motion.div>
      </div>
    </div>
  )
}
