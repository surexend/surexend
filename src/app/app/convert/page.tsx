'use client'

import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowUpDown, Building2, CheckCircle2, ChevronDown, Check, X, Globe, ArrowDown } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { conversionAPI, bankAPI } from '@/lib/api'
import { useTheme } from '@/context/ThemeContext'

const SUPPORTED_CURRENCIES = [
  { code: 'NGN', name: 'Nigerian Naira', symbol: '₦', flag: '🇳🇬', rate: 1500 },
  { code: 'GHS', name: 'Ghanaian Cedi', symbol: 'GH₵', flag: '🇬🇭', rate: 15.8 },
  { code: 'KES', name: 'Kenyan Shilling', symbol: 'KSh', flag: '🇰🇪', rate: 129.5 },
  { code: 'ZAR', name: 'South African Rand', symbol: 'R', flag: '🇿🇦', rate: 18.2 },
  { code: 'UGX', name: 'Ugandan Shilling', symbol: 'USh', flag: '🇺🇬', rate: 3680 },
  { code: 'TZS', name: 'Tanzanian Shilling', symbol: 'TSh', flag: '🇹🇿', rate: 2650 },
  { code: 'XAF', name: 'Central African CFA', symbol: 'FCFA', flag: '🇨🇲', rate: 610 },
  { code: 'XOF', name: 'West African CFA', symbol: 'CFA', flag: '🇸🇳', rate: 605 },
]

export default function ConvertPage() {
  const { variant, colors } = useTheme()
  const [amount, setAmount] = useState<string>('')
  const [fiatCurrency, setFiatCurrency] = useState('NGN')
  const [showCurrencyModal, setShowCurrencyModal] = useState(false)
  const [step, setStep] = useState(1)
  const [selectedBank, setSelectedBank] = useState<string>('')
  const [pin, setPin] = useState(['', '', '', ''])
  const [isLoading, setIsLoading] = useState(false)
  const [userBalance] = useState(2450.75)
  const [flipped, setFlipped] = useState(false) // false = USD → Fiat, true = Fiat → USD

  const selectedCurrInfo = SUPPORTED_CURRENCIES.find(c => c.code === fiatCurrency) || SUPPORTED_CURRENCIES[0]

  const { data: ratesData } = useQuery({
    queryKey: ['rates', fiatCurrency],
    queryFn: () => conversionAPI.getRates(fiatCurrency),
    initialData: { rate: selectedCurrInfo.rate }
  })

  const { data: banksData } = useQuery({
    queryKey: ['savedBanks'],
    queryFn: bankAPI.list,
    initialData: [
      { id: '1', bankName: 'Guaranty Trust Bank', accountNumber: '0123456789' },
      { id: '2', bankName: 'Zenith Bank', accountNumber: '9876543210' }
    ]
  })

  const rate = ratesData?.rate || selectedCurrInfo.rate
  const fee = 1.5
  const numAmount = parseFloat(amount) || 0
  const receiveAmount = flipped
    ? Math.max(0, (numAmount / rate) - fee)
    : Math.max(0, (numAmount - fee) * rate)

  const fromSymbol = flipped ? selectedCurrInfo.symbol : '$'
  const fromCode = flipped ? selectedCurrInfo.code : 'USD'
  const toSymbol = flipped ? '$' : selectedCurrInfo.symbol
  const toCode = flipped ? 'USD' : selectedCurrInfo.code

  const handlePreset = (pct: number) => {
    const base = flipped ? userBalance * rate : userBalance
    setAmount((base * pct / 100).toFixed(2))
  }

  const handleNext = () => {
    if (numAmount <= fee) { toast.error('Amount must be greater than fee'); return }
    setStep(2)
  }

  const handlePinInput = (num: string) => {
    const emptyIndex = pin.findIndex(p => p === '')
    if (emptyIndex !== -1) {
      const newPin = [...pin]
      newPin[emptyIndex] = num
      setPin(newPin)
      if (emptyIndex === 3) executeConversion(newPin.join(''))
    }
  }

  const handlePinDelete = () => {
    const lastFilled = pin.map(p => p !== '').lastIndexOf(true)
    if (lastFilled !== -1) {
      const newPin = [...pin]
      newPin[lastFilled] = ''
      setPin(newPin)
    }
  }

  const executeConversion = async (finalPin: string) => {
    setIsLoading(true)
    try {
      await conversionAPI.execute({ amount: numAmount, currency: fiatCurrency, bankAccountId: selectedBank, pin: finalPin })
      setStep(4)
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Conversion failed')
      setPin(['', '', '', ''])
      setStep(2)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="w-full max-w-full overflow-x-hidden px-3 py-4 max-w-md mx-auto flex flex-col pb-28 sm:pb-36">
      <AnimatePresence mode="wait">
        {/* ─── STEP 1: Swap UI ─── */}
        {step === 1 && (
          <motion.div
            key="step1"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-3"
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-extrabold text-white flex items-center gap-2">
                  <ArrowUpDown className="w-5 h-5 flex-shrink-0" style={{ color: colors.primary }} />
                  Convert Currency
                </h2>
                <p className="text-[11px] text-[#64748B] mt-0.5">Live rates · Instant bank settlement</p>
              </div>
              <span className="px-2 py-1 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 whitespace-nowrap flex-shrink-0">
                Live Rates
              </span>
            </div>

            {/* FROM Card */}
            <div className="glass-card p-4 rounded-2xl border border-white/10 space-y-3">
              {/* Top row: token badge + balance + presets */}
              <div className="flex items-center justify-between gap-2">
                {/* Token badge */}
                <div className="flex items-center gap-2 bg-white/8 px-3 py-1.5 rounded-xl border border-white/10 flex-shrink-0">
                  {flipped ? (
                    <>
                      <span className="text-base">{selectedCurrInfo.flag}</span>
                      <span className="font-extrabold text-sm text-white">{selectedCurrInfo.code}</span>
                    </>
                  ) : (
                    <>
                      <img src="/usd-coin-logo.png" alt="USD" className="w-5 h-5 rounded-full" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
                      <span className="font-extrabold text-sm text-white">USD</span>
                      <span className="text-[10px] text-emerald-400 font-bold">✓</span>
                    </>
                  )}
                </div>

                {/* Bal + presets */}
                <div className="flex items-center gap-1 flex-wrap justify-end">
                  <span className="text-[10px] text-[#64748B] font-medium mr-1">
                    Bal: {flipped ? `${selectedCurrInfo.symbol}${(userBalance * rate).toLocaleString(undefined, { maximumFractionDigits: 0 })}` : `$${userBalance.toLocaleString()}`}
                  </span>
                  {[25, 50, 75, 100].map((pct) => (
                    <button
                      key={pct}
                      type="button"
                      onClick={() => handlePreset(pct)}
                      className="px-1.5 py-0.5 rounded-md bg-white/6 hover:bg-white/15 text-[10px] font-bold text-[#94A3B8] hover:text-white transition-colors"
                    >
                      {pct === 100 ? 'Max' : `${pct}%`}
                    </button>
                  ))}
                </div>
              </div>

              {/* Amount input */}
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold text-[#64748B]">{fromSymbol}</span>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0"
                  className="bg-transparent text-3xl sm:text-4xl font-black text-white w-full focus:outline-none placeholder:text-[#2D3A50]"
                />
              </div>
            </div>

            {/* Flip Button */}
            <div className="flex justify-center -my-1 relative z-10">
              <button
                type="button"
                onClick={() => { setFlipped(f => !f); setAmount('') }}
                className="w-10 h-10 rounded-full flex items-center justify-center shadow-xl transition-all active:scale-90 border-2"
                style={{
                  background: colors.gradientBg,
                  borderColor: `rgba(${colors.glowRgb}, 0.4)`
                }}
                title="Flip conversion direction"
              >
                <ArrowDown className="w-5 h-5 text-black" />
              </button>
            </div>

            {/* TO Card */}
            <div className="glass-card p-4 rounded-2xl border border-white/10 space-y-3">
              <div className="flex items-center justify-between">
                {/* Currency selector */}
                <button
                  type="button"
                  onClick={() => setShowCurrencyModal(true)}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/8 border border-white/10 hover:bg-white/15 transition-all active:scale-95"
                >
                  {flipped ? (
                    <>
                      <img src="/usd-coin-logo.png" alt="USD" className="w-5 h-5 rounded-full" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
                      <span className="font-extrabold text-sm text-white">USD</span>
                    </>
                  ) : (
                    <>
                      <span className="text-lg">{selectedCurrInfo.flag}</span>
                      <span className="font-extrabold text-sm text-white">{selectedCurrInfo.code}</span>
                      <ChevronDown className="w-4 h-4 text-[#64748B]" />
                    </>
                  )}
                </button>
                <span className="text-[11px] text-[#64748B]">You receive</span>
              </div>

              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold text-[#64748B]">{toSymbol}</span>
                <span className="text-3xl sm:text-4xl font-black text-white">
                  {receiveAmount > 0
                    ? receiveAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })
                    : '0'}
                </span>
                <span className="text-sm text-[#64748B] font-medium">{toCode}</span>
              </div>

              {/* Rate + fee pill */}
              <div className="flex items-center gap-3 pt-1 border-t border-white/5 flex-wrap">
                <span className="text-[11px] text-[#64748B]">
                  1 USD = {selectedCurrInfo.symbol}{rate.toLocaleString()} {selectedCurrInfo.code}
                </span>
                <span className="text-[10px] text-[#64748B]">Fee: {fee} USD</span>
              </div>
            </div>

            {/* CTA */}
            <button
              onClick={handleNext}
              disabled={!numAmount || numAmount <= fee}
              className="w-full py-4 rounded-2xl font-extrabold text-black shadow-xl transition-transform active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed mt-2"
              style={{ background: colors.gradientBg }}
            >
              Continue to Bank Selection
            </button>
          </motion.div>
        )}

        {/* ─── STEP 2: Bank Selection ─── */}
        {step === 2 && (
          <motion.div key="step2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="glass-card p-5 space-y-5 rounded-2xl">
            <button onClick={() => setStep(1)} className="text-[#94A3B8] hover:text-white text-xs font-semibold flex items-center gap-1">← Back</button>
            <h2 className="text-lg font-bold text-white">Select Bank Account</h2>
            <div className="space-y-2.5">
              {(banksData as any[])?.map((bank: any) => (
                <label key={bank.id} className="flex items-center p-4 border border-white/10 rounded-2xl cursor-pointer hover:bg-white/[0.04] transition-all bg-white/[0.02]">
                  <input type="radio" name="bank" value={bank.id} checked={selectedBank === bank.id} onChange={() => setSelectedBank(bank.id)} className="mr-4 accent-emerald-500 w-4 h-4" />
                  <div>
                    <p className="font-bold text-white text-sm">{bank.bankName}</p>
                    <p className="text-xs text-[#94A3B8] font-mono mt-0.5">{bank.accountNumber}</p>
                  </div>
                </label>
              ))}
              <button onClick={() => toast.success('Redirecting to Add Bank...')} className="w-full p-4 border border-dashed border-white/20 rounded-2xl text-[#94A3B8] hover:text-white hover:border-white/40 transition-colors flex items-center justify-center gap-2 text-xs font-bold">
                <Building2 className="w-4 h-4" /> Add New Bank Account
              </button>
            </div>
            <button onClick={() => setStep(3)} disabled={!selectedBank} className="w-full py-4 rounded-xl font-bold text-black shadow-lg disabled:opacity-50" style={{ background: colors.gradientBg }}>
              Review Withdrawal
            </button>
          </motion.div>
        )}

        {/* ─── STEP 3: PIN ─── */}
        {step === 3 && (
          <motion.div key="step3" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="glass-card p-6 text-center space-y-6 rounded-2xl">
            <h2 className="text-xl font-bold text-white">Enter 4-Digit PIN</h2>
            <p className="text-xs text-[#94A3B8]">
              Confirm conversion of {fromSymbol}{numAmount} {fromCode} → {toSymbol}{receiveAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })} {toCode}
            </p>
            <div className="flex justify-center gap-3 my-4">
              {pin.map((digit, idx) => (
                <div key={idx} className={`w-11 h-14 rounded-xl border-2 flex items-center justify-center text-2xl font-bold transition-all ${digit ? 'border-emerald-500 bg-emerald-500/10 text-white' : 'border-white/10 bg-white/5 text-transparent'}`}>
                  {digit ? '•' : ''}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-3 max-w-[240px] mx-auto">
              {[1,2,3,4,5,6,7,8,9].map(n => (
                <button key={n} onClick={() => handlePinInput(n.toString())} className="p-3.5 rounded-2xl bg-white/6 hover:bg-white/12 text-white font-bold text-lg active:scale-95 transition-all">{n}</button>
              ))}
              <button onClick={() => setStep(2)} className="p-3.5 rounded-2xl bg-white/4 text-[#94A3B8] text-xs font-bold">Cancel</button>
              <button onClick={() => handlePinInput('0')} className="p-3.5 rounded-2xl bg-white/6 hover:bg-white/12 text-white font-bold text-lg active:scale-95">0</button>
              <button onClick={handlePinDelete} className="p-3.5 rounded-2xl bg-white/6 text-red-400 font-bold text-lg active:scale-95">⌫</button>
            </div>
          </motion.div>
        )}

        {/* ─── STEP 4: Success ─── */}
        {step === 4 && (
          <motion.div key="step4" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="glass-card p-8 text-center space-y-6 rounded-2xl">
            <div className="w-20 h-20 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-12 h-12 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-2xl font-black text-white">Conversion Submitted!</h2>
              <p className="text-sm text-[#94A3B8] mt-2">
                Your bank account will receive {toSymbol}{receiveAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })} {toCode} within 5 minutes.
              </p>
            </div>
            <button onClick={() => { setStep(1); setAmount(''); setPin(['','','','']); setFlipped(false) }} className="w-full py-4 rounded-xl font-bold text-black shadow-lg" style={{ background: colors.gradientBg }}>
              Done / Convert Again
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Fiat Currency Modal ── */}
      <AnimatePresence>
        {showCurrencyModal && (
          <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/80 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, y: 100 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 100 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="w-full max-w-md glass-card rounded-t-3xl border-t border-white/15 shadow-2xl"
              style={{ borderColor: `rgba(${colors.glowRgb},0.4)` }}
            >
              <div className="flex items-center justify-between p-4 border-b border-white/10">
                <div className="flex items-center gap-2">
                  <Globe className="w-4 h-4 text-emerald-400" />
                  <h3 className="font-bold text-white text-sm">Select Fiat Currency</h3>
                </div>
                <button onClick={() => setShowCurrencyModal(false)} className="p-1.5 rounded-full hover:bg-white/10 text-[#64748B] hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-4 space-y-2 max-h-[60vh] overflow-y-auto pb-8">
                {SUPPORTED_CURRENCIES.map((curr) => {
                  const isSelected = fiatCurrency === curr.code
                  return (
                    <button
                      key={curr.code}
                      onClick={() => { setFiatCurrency(curr.code); setShowCurrencyModal(false); toast.success(`Selected ${curr.name}`) }}
                      className="w-full p-3.5 rounded-2xl border flex items-center justify-between transition-all"
                      style={isSelected
                        ? { background: `rgba(${colors.glowRgb},0.12)`, borderColor: colors.primary }
                        : { background: 'rgba(255,255,255,0.02)', borderColor: 'rgba(255,255,255,0.08)' }
                      }
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">{curr.flag}</span>
                        <div className="text-left">
                          <div className="flex items-center gap-2">
                            <span className="font-extrabold text-white text-sm">{curr.code}</span>
                            <span className="text-xs text-[#94A3B8]">({curr.symbol})</span>
                          </div>
                          <p className="text-[11px] text-[#64748B]">{curr.name}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="text-right">
                          <p className="text-xs font-bold text-emerald-400">1 USD = {curr.symbol}{curr.rate.toLocaleString()}</p>
                          <p className="text-[9px] text-[#64748B]">Instant Settlement</p>
                        </div>
                        {isSelected && (
                          <div className="w-5 h-5 rounded-full flex items-center justify-center text-black" style={{ background: colors.primary }}>
                            <Check className="w-3 h-3 stroke-[3]" />
                          </div>
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}
