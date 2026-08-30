'use client'

import { useState, useMemo, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useTheme } from '@/context/ThemeContext'
import { ArrowLeft, Building2, ChevronDown, Landmark, Bell, Sparkles, Search, ShieldCheck } from 'lucide-react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { walletAPI, AFRICAN_CURRENCIES, bankAPI } from '@/lib/api'
import CurrencyFlag from '@/components/CurrencyFlag'
import ComingSoon from '@/components/ui/ComingSoon'
import { useBackLayer } from '@/context/BackNavigationContext'

const FIAT_CURRENCIES = AFRICAN_CURRENCIES.map((c) => ({
  code: c.code,
  name: c.name,
  flag: c.flag,
  symbol: c.symbol,
  rate: c.rate,
  countryCode: c.countryCode,
  country: c.country,
  countries: c.countries,
}))

export default function WithdrawPage() {
  const { variant, colors } = useTheme()
  const isGold = variant === 'gold'
  const accentRgb = isGold ? '212, 160, 23' : '181, 226, 61'
  const accentHex = isGold ? '#D4A017' : '#B5E23D'

  const [amountUsdc, setAmountUsdc] = useState('')
  const [selectedFiat, setSelectedFiat] = useState(FIAT_CURRENCIES[0])
  const [currencySearch, setCurrencySearch] = useState('')
  const [showCurrencyPicker, setShowCurrencyPicker] = useState(false)
  const [showWaitlist, setShowWaitlist] = useState(false)
  const [selectedBankId, setSelectedBankId] = useState<string | null>(null)

  useBackLayer(showCurrencyPicker || showWaitlist, useCallback(() => {
    if (showWaitlist) {
      setShowWaitlist(false)
      return
    }
    setShowCurrencyPicker(false)
  }, [showCurrencyPicker, showWaitlist]), 30)

  const { data: balanceData } = useQuery({
    queryKey: ['balance'],
    queryFn: walletAPI.getBalance,
    staleTime: 30000,
  })

  const { data: bankAccountsData, isLoading: bankAccountsLoading } = useQuery({
    queryKey: ['bankAccounts'],
    queryFn: bankAPI.list,
    staleTime: 30000,
  })

  const bankAccounts = Array.isArray(bankAccountsData)
    ? bankAccountsData
    : (bankAccountsData as any)?.accounts || []

  useEffect(() => {
    if (!selectedBankId && bankAccounts.length > 0) {
      setSelectedBankId(bankAccounts[0].id)
    }
  }, [bankAccounts, selectedBankId])

  const selectedBank = bankAccounts.find((bank: any) => bank.id === selectedBankId) || null
  const availableUsdc = balanceData?.usdBalance ?? 0
  const numUsdc = parseFloat(amountUsdc) || 0
  const previewFeeUsdc = numUsdc > 0 ? 0.5 : 0
  const netUsdc = Math.max(0, numUsdc - previewFeeUsdc)
  const fiatAmount = netUsdc * selectedFiat.rate

  const filteredCurrencies = useMemo(() => {
    const q = currencySearch.trim().toLowerCase()
    if (!q) return FIAT_CURRENCIES
    return FIAT_CURRENCIES.filter((fiat) =>
      fiat.code.toLowerCase().includes(q) ||
      fiat.name.toLowerCase().includes(q) ||
      fiat.country.toLowerCase().includes(q) ||
      (fiat.countries || []).some((country: string) => country.toLowerCase().includes(q)),
    )
  }, [currencySearch])

  return (
    <div className="w-full max-w-full overflow-x-hidden px-4 py-5 sm:px-6 md:px-8 max-w-3xl mx-auto pb-32">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/app/dashboard" className="w-10 h-10 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-white hover:bg-white/10 transition-colors">
          <ArrowLeft size={18} />
        </Link>
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight">Local bank payouts</h1>
          <p className="text-sm text-[#94A3B8]">A premium rollout preview — with honest status, saved accounts, and payout estimates.</p>
        </div>
      </div>

      <div className="space-y-5">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="liquid-glass rounded-3xl border border-white/10 p-5 sm:p-6 overflow-hidden relative"
        >
          <div
            className="absolute inset-x-0 top-0 h-[2px] pointer-events-none"
            style={{ background: `linear-gradient(90deg, transparent, rgba(${accentRgb}, 0.82), transparent)` }}
          />

          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div className="max-w-xl">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-extrabold uppercase tracking-[0.18em] border"
                style={{ color: accentHex, borderColor: `rgba(${accentRgb}, 0.35)`, background: `rgba(${accentRgb}, 0.10)` }}>
                <Sparkles className="w-3.5 h-3.5" /> Rolling out
              </span>
              <h2 className="text-white text-xl sm:text-2xl font-black mt-3 tracking-tight">Design it like a top fintech. Ship it honestly.</h2>
              <p className="text-sm text-[#94A3B8] mt-2 leading-relaxed">
                Direct bank withdrawals are still in controlled rollout. For now, this screen shows a clean payout estimate,
                your saved destination accounts, and a waitlist for launch access — instead of pretending money has already moved.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:w-[260px]">
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                <p className="text-[10px] uppercase tracking-wider font-extrabold text-[#64748B]">Saved banks</p>
                <p className="text-lg font-black text-white mt-1">{bankAccounts.length}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                <p className="text-[10px] uppercase tracking-wider font-extrabold text-[#64748B]">Available</p>
                <p className="text-lg font-black text-white mt-1">${availableUsdc.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 col-span-2">
                <p className="text-[10px] uppercase tracking-wider font-extrabold text-[#64748B]">What you can do now</p>
                <p className="text-sm font-semibold text-white mt-1">Save payout accounts, preview rates, join launch access.</p>
              </div>
            </div>
          </div>
        </motion.div>

        <div className="grid lg:grid-cols-[1.1fr_0.9fr] gap-5 items-start">
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="space-y-5">
            <div className="liquid-glass rounded-3xl border border-white/10 p-5 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.18em] font-extrabold text-[#64748B]">Step 1</p>
                  <h3 className="text-white font-bold text-lg">Choose payout currency</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowCurrencyPicker(true)}
                  className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm font-bold text-white hover:bg-white/[0.07] transition-colors"
                >
                  <CurrencyFlag countryCode={selectedFiat.countryCode} emoji={selectedFiat.flag} size={18} />
                  {selectedFiat.code}
                  <ChevronDown className="w-4 h-4 text-[#64748B]" />
                </button>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="flex items-center justify-between gap-3 mb-2">
                  <div>
                    <p className="text-xs font-semibold text-[#94A3B8]">Estimated withdrawal amount</p>
                    <p className="text-[11px] text-[#64748B] mt-1">This is a preview only until bank payouts fully launch.</p>
                  </div>
                  <span className="px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider border border-amber-500/20 bg-amber-500/10 text-amber-300">
                    Preview
                  </span>
                </div>

                <div className="flex items-end justify-between gap-3 mt-4">
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="0.00"
                    value={amountUsdc}
                    onChange={(e) => setAmountUsdc(e.target.value.replace(/[^0-9.]/g, ''))}
                    className="w-full bg-transparent text-4xl font-black tracking-tight text-white placeholder:text-[#334155] focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setAmountUsdc(availableUsdc.toFixed(2))}
                    className="rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2 text-xs font-bold text-white hover:bg-white/[0.08] transition-colors"
                  >
                    MAX
                  </button>
                </div>
                <p className="text-sm text-[#94A3B8] mt-2">USDC</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                  <p className="text-[10px] uppercase tracking-wider font-extrabold text-[#64748B]">FX preview</p>
                  <p className="text-sm font-semibold text-white mt-1">1 USDC = {selectedFiat.symbol}{selectedFiat.rate.toLocaleString()}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                  <p className="text-[10px] uppercase tracking-wider font-extrabold text-[#64748B]">Launch fee</p>
                  <p className="text-sm font-semibold text-white mt-1">{previewFeeUsdc.toFixed(2)} USDC</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                  <p className="text-[10px] uppercase tracking-wider font-extrabold text-[#64748B]">You’d receive</p>
                  <p className="text-sm font-semibold mt-1" style={{ color: accentHex }}>
                    {selectedFiat.symbol}{fiatAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                </div>
              </div>
            </div>

            <div className="liquid-glass rounded-3xl border border-white/10 p-5 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.18em] font-extrabold text-[#64748B]">Step 2</p>
                  <h3 className="text-white font-bold text-lg">Choose destination bank</h3>
                </div>
                <Link
                  href="/app/bank-accounts"
                  className="text-sm font-bold"
                  style={{ color: accentHex }}
                >
                  Manage
                </Link>
              </div>

              {bankAccountsLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 2 }, (_, i) => (
                    <div key={i} className="h-20 rounded-2xl skeleton" />
                  ))}
                </div>
              ) : bankAccounts.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-5 text-center">
                  <div className="w-12 h-12 rounded-2xl bg-white/[0.04] border border-white/10 flex items-center justify-center mx-auto mb-3">
                    <Building2 className="w-5 h-5 text-[#94A3B8]" />
                  </div>
                  <h4 className="text-white font-semibold">No payout account saved yet</h4>
                  <p className="text-sm text-[#94A3B8] mt-1">Add a verified bank account now so you are ready when withdrawals launch.</p>
                  <Link
                    href="/app/bank-accounts"
                    className="inline-flex items-center gap-2 mt-4 rounded-2xl px-4 py-3 font-bold text-black shadow-lg"
                    style={{ background: colors.gradientBg }}
                  >
                    <Landmark className="w-4 h-4" /> Add bank account
                  </Link>
                </div>
              ) : (
                <div className="space-y-3">
                  {bankAccounts.map((bank: any) => {
                    const active = selectedBankId === bank.id
                    return (
                      <button
                        key={bank.id}
                        type="button"
                        onClick={() => setSelectedBankId(bank.id)}
                        className="w-full rounded-2xl border p-4 text-left transition-all"
                        style={active
                          ? { background: `rgba(${accentRgb}, 0.12)`, borderColor: `rgba(${accentRgb}, 0.35)` }
                          : { background: 'rgba(255,255,255,0.02)', borderColor: 'rgba(255,255,255,0.08)' }}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-11 h-11 rounded-2xl border border-white/10 bg-white/[0.05] flex items-center justify-center flex-shrink-0">
                              <Building2 className="w-5 h-5 text-white" />
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-bold text-white truncate">{bank.bankName || 'Verified bank account'}</p>
                              <p className="text-xs text-[#94A3B8] font-mono truncate">{bank.accountNumber} · {bank.accountName || 'Verified holder'}</p>
                            </div>
                          </div>
                          <span className={`w-5 h-5 rounded-full border flex-shrink-0 ${active ? 'border-transparent' : 'border-white/15'}`}
                            style={active ? { background: accentHex } : undefined}
                          />
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="space-y-5">
            <div className="liquid-glass rounded-3xl border border-white/10 p-5 space-y-4 sticky top-5">
              <div>
                <p className="text-[11px] uppercase tracking-[0.18em] font-extrabold text-[#64748B]">Launch summary</p>
                <h3 className="text-white font-bold text-lg mt-1">What this rollout will feel like</h3>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm text-[#94A3B8]">Selected currency</span>
                  <span className="text-sm font-bold text-white">{selectedFiat.code}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm text-[#94A3B8]">Destination</span>
                  <span className="text-sm font-bold text-white text-right">{selectedBank?.bankName || 'Choose a saved bank'}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm text-[#94A3B8]">Security model</span>
                  <span className="text-sm font-bold text-white">PIN + biometrics</span>
                </div>
                <div className="h-px bg-white/5" />
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm text-[#94A3B8]">Estimated payout</span>
                  <span className="text-lg font-black" style={{ color: accentHex }}>
                    {selectedFiat.symbol}{fiatAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              </div>

              <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4 flex items-start gap-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center flex-shrink-0">
                  <ShieldCheck className="w-5 h-5 text-emerald-400" />
                </div>
                <div>
                  <p className="text-sm font-bold text-white">No fake success states</p>
                  <p className="text-xs text-[#C7F9D4] mt-1 leading-relaxed">Until payouts are truly live, SureXend should be explicit about rollout status, pricing assumptions, and which action will happen next.</p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowWaitlist(true)}
                className="w-full rounded-2xl px-4 py-4 font-bold text-black shadow-lg transition-transform hover:scale-[1.01] active:scale-[0.98]"
                style={{ background: colors.gradientBg }}
              >
                Get notified when withdrawals launch
              </button>

              <div className="grid grid-cols-2 gap-3">
                <Link
                  href="/app/convert"
                  className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-center text-sm font-semibold text-white hover:bg-white/[0.06] transition-colors"
                >
                  Open Convert
                </Link>
                <Link
                  href="/app/bank-accounts"
                  className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-center text-sm font-semibold text-white hover:bg-white/[0.06] transition-colors"
                >
                  Manage banks
                </Link>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/20 p-4 space-y-2">
                <div className="flex items-center gap-2 text-[#94A3B8] text-[11px] font-extrabold uppercase tracking-[0.18em]">
                  <Bell className="w-3.5 h-3.5" /> Launch checklist
                </div>
                <div className="space-y-2 text-sm text-white">
                  <div className="flex items-center justify-between gap-3"><span>Saved destination account</span><span>{bankAccounts.length > 0 ? 'Ready' : 'Needed'}</span></div>
                  <div className="flex items-center justify-between gap-3"><span>Wallet balance</span><span>{availableUsdc > 0 ? 'Ready' : 'Fund wallet'}</span></div>
                  <div className="flex items-center justify-between gap-3"><span>Waitlist access</span><span>Optional</span></div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>

      <AnimatePresence>
        {showCurrencyPicker && (
          <div className="fixed inset-0 z-[100] flex items-end justify-center liquid-backdrop">
            <motion.div
              initial={{ opacity: 0, y: 80 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 80 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="w-full max-w-md liquid-glass rounded-t-3xl border-t border-white/15 shadow-2xl"
              style={{ borderColor: `rgba(${accentRgb}, 0.35)` }}
            >
              <div className="flex items-center justify-between p-4 border-b border-white/10">
                <div>
                  <h3 className="font-bold text-white text-sm">Select payout currency</h3>
                  <p className="text-[11px] text-[#64748B]">Search by country or currency code</p>
                </div>
                <button onClick={() => setShowCurrencyPicker(false)} className="p-2 rounded-full hover:bg-white/10 text-[#64748B] hover:text-white transition-colors">
                  <ArrowLeft className="w-4 h-4 rotate-180" />
                </button>
              </div>
              <div className="p-4 pb-2 sticky top-0 z-10" style={{ background: 'rgba(8,9,12,0.96)', backdropFilter: 'blur(12px)' }}>
                <div className="relative">
                  <Search className="w-4 h-4 text-[#64748B] absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    value={currencySearch}
                    onChange={(e) => setCurrencySearch(e.target.value)}
                    placeholder="Search Nigeria, NGN, Ghana…"
                    className="w-full rounded-2xl border border-white/10 bg-white/[0.04] py-3 pl-10 pr-4 text-sm text-white placeholder:text-[#64748B] focus:outline-none focus:border-white/25"
                  />
                </div>
              </div>
              <div className="p-4 space-y-2 max-h-[58vh] overflow-y-auto pb-8">
                {filteredCurrencies.map((fiat) => {
                  const active = selectedFiat.code === fiat.code
                  return (
                    <button
                      key={fiat.code}
                      type="button"
                      onClick={() => {
                        setSelectedFiat(fiat)
                        setShowCurrencyPicker(false)
                        setCurrencySearch('')
                      }}
                      className="w-full rounded-2xl border p-3.5 text-left transition-all"
                      style={active
                        ? { background: `rgba(${accentRgb}, 0.12)`, borderColor: `rgba(${accentRgb}, 0.35)` }
                        : { background: 'rgba(255,255,255,0.02)', borderColor: 'rgba(255,255,255,0.08)' }}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <CurrencyFlag countryCode={fiat.countryCode} emoji={fiat.flag} size={28} />
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-white truncate">{fiat.code} · {fiat.name}</p>
                            <p className="text-xs text-[#94A3B8] truncate">{fiat.country}</p>
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-xs font-bold text-white">{fiat.symbol}{fiat.rate.toLocaleString()}</p>
                          <p className="text-[10px] text-[#64748B]">per USDC</p>
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <ComingSoon
        open={showWaitlist}
        onClose={() => setShowWaitlist(false)}
        title="Direct local bank withdrawals"
        subtitle="We’re rolling out real USDC-to-bank payouts carefully so launch quality matches the trust users expect from a serious fintech product."
        eta="Controlled rollout in progress"
        notifyEmail="support@surexend.com"
        features={[
          'Choose a verified bank account you already saved in the app.',
          'See the live rate, fee, payout currency, and destination before approval.',
          'Authorize each payout with the same PIN and biometrics flow used across SureXend.',
          'Receive downloadable receipts and clear status updates once settlement is truly live.',
        ]}
      />
    </div>
  )
}
