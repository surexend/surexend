'use client'

import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Repeat, ArrowDown, Building2, CheckCircle2, ChevronDown, Check, X, Globe, Sparkles } from 'lucide-react'
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
  { code: 'XAF', name: 'Central African CFA (Cameroon)', symbol: 'FCFA', flag: '🇨🇲', rate: 610 },
  { code: 'XOF', name: 'West African CFA', symbol: 'CFA', flag: '🇸🇳', rate: 605 }
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
  const [userBalance, setUserBalance] = useState(2450.75)
  const [swapDirection, setSwapDirection] = useState<'cryptoToFiat' | 'fiatToCrypto'>('cryptoToFiat')

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
  const fee = 1.5 // USD
  const numAmount = parseFloat(amount) || 0
  const receiveAmount = Math.max(0, (numAmount - fee) * rate)

  const handlePresetPercentage = (pct: number) => {
    const calculated = (userBalance * (pct / 100)).toFixed(2)
    setAmount(calculated)
  }

  const toggleDirection = () => {
    setSwapDirection(prev => prev === 'cryptoToFiat' ? 'fiatToCrypto' : 'cryptoToFiat')
    toast.success('Swap direction flipped')
  }

  const handleNext = () => {
    if (numAmount <= fee) {
      toast.error('Amount must be greater than fee')
      return
    }
    setStep(2)
  }

  const handlePinInput = (num: string) => {
    const emptyIndex = pin.findIndex(p => p === '')
    if (emptyIndex !== -1) {
      const newPin = [...pin]
      newPin[emptyIndex] = num
      setPin(newPin)
      if (emptyIndex === 3) {
        executeConversion(newPin.join(''))
      }
    }
  }

  const handlePinDelete = () => {
    const lastFilledIndex = pin.map(p => p !== '').lastIndexOf(true)
    if (lastFilledIndex !== -1) {
      const newPin = [...pin]
      newPin[lastFilledIndex] = ''
      setPin(newPin)
    }
  }

  const executeConversion = async (finalPin: string) => {
    setIsLoading(true)
    try {
      await conversionAPI.execute({
        amount: numAmount,
        currency: fiatCurrency,
        bankAccountId: selectedBank,
        pin: finalPin
      })
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
    <div className="w-full max-w-full overflow-x-hidden px-3 py-4 sm:p-6 md:p-8 max-w-md mx-auto min-h-[80vh] flex flex-col pt-2 pb-28 sm:pb-36">
      <AnimatePresence mode="wait">
        {/* Step 1: Amount & Currency */}
        {step === 1 && (
          <motion.div 
            key="step1" 
            initial={{ opacity: 0, y: 20 }} 
            animate={{ opacity: 1, y: 0 }} 
            exit={{ opacity: 0, x: -20 }} 
            className="glass-card p-5 sm:p-6 space-y-5 rounded-3xl border border-white/10 shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div>
                <h2 className="text-lg sm:text-xl font-extrabold text-white tracking-tight flex items-center gap-2">
                  <Repeat className="w-5 h-5" style={{ color: colors.primary }} /> Convert Currency
                </h2>
                <p className="text-xs text-[#94A3B8] mt-0.5">Live rates • Instant bank settlement</p>
              </div>
              <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                0.13% 1h • Live Rates
              </span>
            </div>
            
            <div className="space-y-4">
              {/* TOP PAY CARD (Uniswap / Rainbow style) */}
              <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 focus-within:border-emerald-500/50 transition-all space-y-3">
                <div className="flex justify-between items-center text-xs">
                  <div className="flex items-center gap-2 bg-white/10 px-3 py-1.5 rounded-xl border border-white/10 shadow-sm">
                    <img src="/usd-coin-logo.png" alt="USD" className="w-5 h-5 rounded-full object-contain" />
                    <span className="font-extrabold text-sm text-white">USD</span>
                    <span className="text-[10px] text-emerald-400 font-bold">✓</span>
                  </div>
                  
                  {/* Balance + Quick Percentage Buttons */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-[#94A3B8] text-[11px] font-medium">Bal: ${userBalance.toLocaleString()}</span>
                    {[25, 50, 75, 100].map((pct) => (
                      <button
                        key={pct}
                        type="button"
                        onClick={() => handlePresetPercentage(pct)}
                        className="px-2 py-0.5 rounded-md bg-white/5 hover:bg-white/15 text-[10px] font-bold text-gray-300 transition-colors"
                      >
                        {pct === 100 ? 'Max' : `${pct}%`}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex justify-between items-baseline pt-1">
                  <input 
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0"
                    className="bg-transparent text-3xl sm:text-4xl font-extrabold text-white w-full focus:outline-none placeholder:text-gray-600"
                  />
                </div>
              </div>

              {/* FLIP DIRECTION BUTTON (Interactive Arrow Switcher) */}
              <div className="flex justify-center -my-3 relative z-10">
                <button
                  type="button"
                  onClick={toggleDirection}
                  className="w-10 h-10 rounded-full bg-[#0A0F1E] border-2 border-emerald-500/40 hover:border-emerald-400 flex items-center justify-center shadow-2xl transition-all active:scale-95 group"
                  title="Swap direction"
                >
                  <Repeat className="w-5 h-5 text-emerald-400 group-hover:rotate-180 transition-transform duration-300" />
                </button>
              </div>

              {/* BOTTOM RECEIVE CARD */}
              <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-3">
                <div className="flex justify-between items-center">
                  {/* Currency Selector Button */}
                  <button
                    type="button"
                    onClick={() => setShowCurrencyModal(true)}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/10 border border-white/15 hover:bg-white/20 text-white font-bold text-sm transition-all shadow-md active:scale-95"
                  >
                    <span className="text-xl">{selectedCurrInfo.flag}</span>
                    <span className="font-extrabold text-white">{selectedCurrInfo.code}</span>
                    <ChevronDown className="w-4 h-4 text-gray-400" />
                  </button>

                  <span className="text-xs text-[#94A3B8] font-medium">Recipient Bank Account</span>
                </div>

                <div className="flex justify-between items-baseline pt-1">
                  <div className="text-2xl sm:text-3xl font-black text-white truncate">
                    {selectedCurrInfo.symbol} {receiveAmount > 0 ? receiveAmount.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '0.00'}
                  </div>
                  <span className="text-xs text-[#94A3B8]">$0.00</span>
                </div>
              </div>

              {/* Rate & Fee breakdown */}
              <div className="text-xs space-y-2 py-3 px-4 rounded-2xl bg-white/[0.02] border border-white/5">
                <div className="flex justify-between items-center text-[#94A3B8]">
                  <span>Exchange Rate</span>
                  <span className="text-white font-extrabold">1 USD = {selectedCurrInfo.symbol}{rate.toLocaleString()} {fiatCurrency}</span>
                </div>
                <div className="flex justify-between items-center text-[#94A3B8]">
                  <span>Processing Fee</span>
                  <span className="text-white font-extrabold">{fee} USD</span>
                </div>
              </div>

              <button 
                onClick={handleNext}
                disabled={!numAmount || numAmount <= fee}
                className="w-full py-4 rounded-2xl text-center font-extrabold text-black shadow-xl transition-transform hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ background: colors.gradientBg }}
              >
                Continue to Bank Selection
              </button>
            </div>
          </motion.div>
        )}

        {/* Step 2: Select Bank */}
        {step === 2 && (
          <motion.div 
            key="step2" 
            initial={{ opacity: 0, x: 20 }} 
            animate={{ opacity: 1, x: 0 }} 
            exit={{ opacity: 0, x: -20 }} 
            className="glass-card p-6 space-y-6"
          >
            <button onClick={() => setStep(1)} className="text-[#94A3B8] hover:text-white mb-2 text-xs font-semibold flex items-center gap-1">
              ← Back to Amount
            </button>
            <h2 className="text-xl font-bold text-white">Select Bank Account</h2>
            
            <div className="space-y-3">
              {banksData?.map((bank: any) => (
                <label key={bank.id} className="flex items-center p-4 border border-white/10 rounded-2xl cursor-pointer hover:bg-white/[0.04] transition-all bg-white/[0.02]">
                  <input 
                    type="radio" 
                    name="bank" 
                    value={bank.id} 
                    checked={selectedBank === bank.id}
                    onChange={() => setSelectedBank(bank.id)}
                    className="mr-4 accent-emerald-500 w-4 h-4"
                  />
                  <div>
                    <p className="font-bold text-white text-sm">{bank.bankName}</p>
                    <p className="text-xs text-[#94A3B8] font-mono mt-0.5">{bank.accountNumber}</p>
                  </div>
                </label>
              ))}
              
              <button 
                onClick={() => toast.success('Redirecting to Add Bank...')} 
                className="w-full p-4 border border-dashed border-white/20 rounded-2xl text-[#94A3B8] hover:text-white hover:border-white/40 transition-colors flex items-center justify-center gap-2 text-xs font-bold"
              >
                <Building2 className="w-4 h-4" /> Add New Bank Account
              </button>
            </div>

            <button 
              onClick={() => setStep(3)}
              disabled={!selectedBank}
              className="w-full py-4 rounded-xl text-center font-bold text-black shadow-lg transition-transform hover:scale-[1.02] disabled:opacity-50"
              style={{ background: colors.gradientBg }}
            >
              Review Withdrawal
            </button>
          </motion.div>
        )}

        {/* Step 3: PIN Security Confirmation */}
        {step === 3 && (
          <motion.div key="step3" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="glass-card p-6 text-center space-y-6">
            <h2 className="text-xl font-bold text-white">Enter Transaction PIN</h2>
            <p className="text-xs text-[#94A3B8]">Confirm conversion of ${numAmount} USD to {selectedCurrInfo.symbol}{receiveAmount.toLocaleString()} {fiatCurrency}</p>

            <div className="flex justify-center gap-3 my-6">
              {pin.map((digit, idx) => (
                <div key={idx} className={`w-10 h-12 rounded-xl border flex items-center justify-center text-xl font-bold ${digit ? 'border-emerald-500 bg-emerald-500/10 text-white' : 'border-white/10 bg-white/5'}`}>
                  {digit ? '•' : ''}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-3 gap-3 max-w-xs mx-auto">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                <button key={num} onClick={() => handlePinInput(num.toString())} className="p-3 rounded-xl bg-white/5 hover:bg-white/10 text-white font-bold text-lg active:scale-95">
                  {num}
                </button>
              ))}
              <button onClick={() => setStep(2)} className="p-3 rounded-xl bg-white/5 text-gray-400 text-xs font-bold">Cancel</button>
              <button onClick={() => handlePinInput('0')} className="p-3 rounded-xl bg-white/5 text-white font-bold text-lg">0</button>
              <button onClick={handlePinDelete} className="p-3 rounded-xl bg-white/5 text-red-400 font-bold text-sm">⌫</button>
            </div>
          </motion.div>
        )}

        {/* Step 4: Success Screen */}
        {step === 4 && (
          <motion.div key="step4" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="glass-card p-8 text-center space-y-6">
            <div className="w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-10 h-10" />
            </div>
            <div>
              <h2 className="text-2xl font-black text-white">Conversion Submitted!</h2>
              <p className="text-xs text-[#94A3B8] mt-1">Your local bank account will receive {selectedCurrInfo.symbol}{receiveAmount.toLocaleString()} within 5 minutes.</p>
            </div>
            <button onClick={() => { setStep(1); setAmount(''); setPin(['','','','']) }} className="w-full py-3.5 rounded-xl font-bold text-black shadow-lg" style={{ background: colors.gradientBg }}>
              Done / Convert Again
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── FIAT CURRENCY SELECTOR MODAL (FIXED CAMEROON BOTTOM SCROLL) ── */}
      <AnimatePresence>
        {showCurrencyModal && (
          <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, y: 100 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 100 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="glass-card w-full max-w-md p-5 pb-28 sm:pb-6 rounded-t-3xl sm:rounded-3xl border border-white/15 space-y-4 shadow-2xl relative max-h-[80vh] overflow-y-auto mb-16 sm:mb-0"
              style={{ borderColor: variant === 'gold' ? 'rgba(212,160,23,0.4)' : 'rgba(181,226,61,0.4)' }}
            >
              {/* Header */}
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <div className="flex items-center gap-2">
                  <Globe className="w-5 h-5 text-emerald-400" />
                  <h3 className="font-extrabold text-white text-base sm:text-lg">Select Fiat Currency</h3>
                </div>
                <button onClick={() => setShowCurrencyModal(false)} className="p-1.5 rounded-full hover:bg-white/10 text-gray-400 hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Currency List Cards */}
              <div className="space-y-2.5">
                {SUPPORTED_CURRENCIES.map((curr) => {
                  const isSelected = fiatCurrency === curr.code
                  return (
                    <button
                      key={curr.code}
                      onClick={() => {
                        setFiatCurrency(curr.code)
                        setShowCurrencyModal(false)
                        toast.success(`Selected ${curr.name} (${curr.code})`)
                      }}
                      className={`w-full p-3.5 rounded-2xl border flex items-center justify-between transition-all duration-200 ${
                        isSelected 
                          ? 'bg-white/10 border-emerald-500/60 shadow-lg' 
                          : 'bg-white/[0.02] border-white/10 hover:bg-white/[0.06] hover:border-white/20'
                      }`}
                      style={isSelected ? { borderColor: colors.primary } : {}}
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">{curr.flag}</span>
                        <div className="text-left">
                          <div className="flex items-center gap-2">
                            <span className="font-extrabold text-white text-sm">{curr.code}</span>
                            <span className="text-xs text-[#94A3B8]">({curr.symbol})</span>
                          </div>
                          <p className="text-[11px] text-[#94A3B8] font-medium">{curr.name}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <div className="text-right">
                          <p className="text-xs font-bold text-emerald-400">1 USD = {curr.symbol}{curr.rate.toLocaleString()}</p>
                          <p className="text-[9px] text-[#64748B]">Instant Settlement</p>
                        </div>
                        {isSelected && (
                          <div className="w-5 h-5 rounded-full flex items-center justify-center text-black" style={{ background: colors.primary }}>
                            <Check className="w-3.5 h-3.5 stroke-[3]" />
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
