'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useTheme } from '@/context/ThemeContext'
import { useRouter } from 'next/navigation'
import { billsAPI } from '@/lib/api'
import { useQuery } from '@tanstack/react-query'
import {
  Smartphone, Wifi, Zap, Tv, ChevronRight, ArrowLeft,
  Search, CheckCircle, AlertCircle, Loader2, Trophy,
  Lock, Coins, Gamepad2, Sun, GraduationCap, Globe,
  CreditCard, FileText, Heart, Landmark, ShoppingBag,
  ShoppingCart, Store, Fuel, Plane, Grid, MoreHorizontal
} from 'lucide-react'
import toast from 'react-hot-toast'

// ── Essential Crypto Fintech Bill Categories ────────────────────────────────
const CATEGORIES = [
  { type: 'airtime', label: 'Airtime', icon: Smartphone, badge: 'Popular' },
  { type: 'data', label: 'Data', icon: Wifi, badge: null },
  { type: 'electricity', label: 'Electricity', icon: Zap, badge: null },
  { type: 'tv', label: 'Cable TV', icon: Tv, badge: null },
  { type: 'internet', label: 'Internet Services', icon: Globe, badge: null },
  { type: 'school', label: 'School & Exam', icon: GraduationCap, badge: null },
  { type: 'invoice', label: 'Invoice Payments', icon: FileText, badge: null },
  { type: 'giftcards', label: 'Gift Cards', icon: CreditCard, badge: 'New' },
]

// ── Amount presets for airtime ─────────────────────────────────────────────
const AIRTIME_AMOUNTS_NGN = [200, 500, 1000, 2000, 5000]

// ── PIN pad ────────────────────────────────────────────────────────────────
function PinPad({ onComplete, accentHex, accentRgb }: {
  onComplete: (pin: string) => void; accentHex: string; accentRgb: string
}) {
  const [pin, setPin] = useState('')
  const keys = ['1','2','3','4','5','6','7','8','9','','0','⌫']

  const tap = (k: string) => {
    if (k === '⌫') setPin(p => p.slice(0, -1))
    else if (pin.length < 4) {
      const next = pin + k
      setPin(next)
      if (next.length === 4) setTimeout(() => onComplete(next), 150)
    }
  }

  return (
    <div>
      <div className="flex justify-center gap-3 mb-8">
        {Array.from({ length: 6 }, (_, i) => (
          <motion.div key={i}
            className="w-4 h-4 rounded-full border-2 transition-all"
            style={i < pin.length
              ? { background: accentHex, borderColor: accentHex }
              : { borderColor: 'rgba(255,255,255,0.2)', background: 'transparent' }}
            animate={i < pin.length ? { scale: [1, 1.3, 1] } : {}}
            transition={{ duration: 0.15 }}
          />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-4">
        {keys.map((k, i) => (
          <motion.button
            key={i} disabled={!k}
            className="h-16 rounded-2xl text-xl font-semibold disabled:opacity-0"
            style={k && k !== '⌫'
              ? { background: 'rgba(255,255,255,0.06)', color: '#fff' }
              : { background: 'transparent', color: '#94A3B8' }}
            whileTap={k ? { scale: 0.9, background: `rgba(${accentRgb}, 0.15)` } : {}}
            onClick={() => k && tap(k)}
          >
            {k}
          </motion.button>
        ))}
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════
// BILLS PAGE
// ══════════════════════════════════════════════════════════════════════════

export default function BillsPage() {
  const { variant, colors } = useTheme()
  const isGold = variant === 'gold'
  const accentRgb = isGold ? '212, 160, 23' : '181, 226, 61'
  const accentHex = isGold ? '#D4A017' : '#B5E23D'

  const [step, setStep] = useState<'categories' | 'providers' | 'form' | 'pin' | 'success' | 'failed'>('categories')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [selectedProvider, setSelectedProvider] = useState<any>(null)
  const [selectedPlan, setSelectedPlan] = useState<any>(null)
  const [recipient, setRecipient] = useState('')
  const [amount, setAmount] = useState('')
  const [meterName, setMeterName] = useState('')
  const [validating, setValidating] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [result, setResult] = useState<any>(null)

  const { data: providers } = useQuery({
    queryKey: ['bill-providers', selectedCategory],
    queryFn: () => billsAPI.getProviders(selectedCategory as any, 'NG'),
    enabled: !!selectedCategory && step === 'providers',
  })

  const { data: plans } = useQuery({
    queryKey: ['data-plans', selectedProvider?.code],
    queryFn: () => billsAPI.getDataPlans(selectedProvider?.code),
    enabled: selectedCategory === 'data' && !!selectedProvider,
  })

  const validateMeter = async () => {
    if (!recipient || recipient.length < 10) return
    setValidating(true)
    try {
      const res = await billsAPI.validateMeter(recipient, selectedProvider?.code)
      setMeterName(res.name)
      toast.success(`Meter verified: ${res.name}`)
    } catch {
      toast.error('Could not verify meter number')
    } finally {
      setValidating(false)
    }
  }

  const executePurchase = async (pin: string) => {
    setProcessing(true)
    setStep('pin')
    try {
      const payload: any = {
        type: selectedCategory!,
        provider: selectedProvider?.code,
        recipient,
        pin,
      }
      if (selectedCategory === 'data' && selectedPlan) {
        payload.planCode = selectedPlan.code
        payload.amount = selectedPlan.amount
      } else {
        payload.amount = parseFloat(amount)
      }
      const res = await billsAPI.purchase(payload)
      setResult(res)
      setStep('success')
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Purchase failed')
      setStep('failed')
    } finally {
      setProcessing(false)
    }
  }

  const reset = () => {
    setStep('categories')
    setSelectedCategory(null)
    setSelectedProvider(null)
    setSelectedPlan(null)
    setRecipient('')
    setAmount('')
    setMeterName('')
    setResult(null)
  }

  return (
    <div className="min-h-screen bg-[#0A0F1E] pb-32">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-[#0A0F1E]/90 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
          {step !== 'categories' && (
            <motion.button
              className="w-9 h-9 rounded-xl bg-white/5 flex items-center justify-center"
              whileTap={{ scale: 0.9 }}
              onClick={() => {
                if (step === 'providers') { setStep('categories'); setSelectedCategory(null) }
                else if (step === 'form') { setStep('providers'); setSelectedProvider(null) }
                else if (step === 'pin') setStep('form')
                else reset()
              }}
            >
              <ArrowLeft size={18} className="text-white" />
            </motion.button>
          )}
          <div>
            <h1 className="text-white font-inter font-bold text-xl">Pay Bills</h1>
            <p className="text-[#64748B] text-xs">
              {step === 'categories' && 'Airtime · Data · Electricity · TV · Utilities'}
              {step === 'providers' && `Select ${selectedCategory} provider`}
              {step === 'form' && selectedProvider?.name}
              {step === 'pin' && 'Enter your PIN'}
            </p>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 pt-4">
        <AnimatePresence mode="wait">
          {/* STEP 1: Categories (4-Column Grid matching Images 2 & 3) */}
          {step === 'categories' && (
            <motion.div key="cats" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
              <div className="bg-[#121827] rounded-3xl p-5 border border-white/5 mb-6">
                <p className="text-[#64748B] text-xs font-bold uppercase tracking-widest mb-5 px-1">Utilities & Services</p>
                <div className="grid grid-cols-4 gap-y-6 gap-x-2 sm:gap-x-4">
                  {CATEGORIES.map((cat, i) => {
                    const Icon = cat.icon
                    return (
                      <motion.button key={cat.type}
                        className="flex flex-col items-center gap-2 group text-center"
                        initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.02 }}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => { setSelectedCategory(cat.type); setStep('providers') }}
                      >
                        <div className="relative">
                          <div className="w-12 h-12 rounded-full bg-[#1E2738] border border-white/5 flex items-center justify-center group-hover:bg-white/10 transition-colors shadow-inner">
                            <Icon size={20} className="text-white" />
                          </div>
                          {cat.badge && (
                            <span className="absolute -top-1.5 -right-2 px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-[#FF4D6D] text-white shadow-md animate-pulse">
                              {cat.badge}
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] font-medium text-[#94A3B8] group-hover:text-white transition-colors line-clamp-1 max-w-[72px]">
                          {cat.label}
                        </span>
                      </motion.button>
                    )
                  })}
                </div>
              </div>

              {/* Quick Recharge Empty State */}
              <div className="bg-[#121827] rounded-3xl p-6 border border-white/5 text-center">
                <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center mx-auto mb-3">
                  <Zap className="w-6 h-6" />
                </div>
                <h4 className="font-semibold text-white text-sm mb-1">Quick Recharge & Pay</h4>
                <p className="text-[#64748B] text-xs max-w-xs mx-auto leading-relaxed">
                  Your frequent bill payments and mobile top-ups will automatically appear here for one-tap repeat.
                </p>
              </div>
            </motion.div>
          )}

          {/* STEP 2: Providers */}
          {step === 'providers' && (
            <motion.div key="providers" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
              {!providers ? (
                <div className="space-y-3">
                  {Array.from({ length: 6 }, (_, i) => (
                    <div key={i} className="skeleton h-16 rounded-xl" />
                  ))}
                </div>
              ) : (
                <div className="space-y-2">
                  {providers.map((provider: any, i: number) => (
                    <motion.button key={provider.code}
                      className="w-full bg-[#0F1629] rounded-xl p-4 flex items-center gap-4 border border-white/5 text-left"
                      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.05 }}
                      whileHover={{ borderColor: `rgba(${accentRgb}, 0.2)` }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => { setSelectedProvider(provider); setStep('form') }}
                    >
                      <div className="w-12 h-12 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center font-black text-sm flex-shrink-0 shadow-md">
                        {provider.image ? (
                          <img src={provider.image} alt={provider.name} className="w-10 h-10 object-contain rounded-lg" />
                        ) : (
                          (() => {
                            const name = (provider.name || '').toLowerCase()
                            if (name.includes('mtn')) return <span className="px-2 py-1 rounded bg-yellow-400 text-black font-black text-xs">MTN</span>
                            if (name.includes('airtel')) return <span className="px-2 py-1 rounded bg-red-600 text-white font-black text-xs">airtel</span>
                            if (name.includes('glo')) return <span className="px-2 py-1 rounded bg-emerald-600 text-white font-black text-xs">glo</span>
                            if (name.includes('9mobile') || name.includes('etisalat')) return <span className="px-2 py-1 rounded bg-lime-500 text-black font-black text-xs">9mob</span>
                            if (name.includes('dstv')) return <span className="px-2 py-1 rounded bg-blue-600 text-white font-black text-xs">DSTV</span>
                            if (name.includes('gotv')) return <span className="px-2 py-1 rounded bg-amber-500 text-black font-black text-xs">GOtv</span>
                            if (name.includes('startimes')) return <span className="px-2 py-1 rounded bg-orange-600 text-white font-black text-xs">ST</span>
                            return <span className="text-white font-extrabold">{provider.name?.[0]}</span>
                          })()
                        )}
                      </div>
                      <div className="flex-1">
                        <p className="text-white font-medium text-sm">{provider.name}</p>
                        <p className="text-[#64748B] text-xs">{provider.code}</p>
                      </div>
                      <ChevronRight size={16} className="text-[#64748B]" />
                    </motion.button>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {/* STEP 3: Form */}
          {step === 'form' && (
            <motion.div key="form" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
              className="space-y-4">

              {/* Recipient */}
              <div>
                <label className="text-[#94A3B8] text-xs mb-2 block">
                  {selectedCategory === 'electricity' ? 'Meter Number' :
                   selectedCategory === 'tv' ? 'Smart Card / Decoder Number' :
                   'Phone Number'}
                </label>
                <div className="relative">
                  <input
                    className="input-field pr-24"
                    placeholder={selectedCategory === 'electricity' ? '0801234567890' :
                                 selectedCategory === 'tv' ? '1234567890' : '080XXXXXXXX'}
                    value={recipient}
                    onChange={e => setRecipient(e.target.value)}
                  />
                  {selectedCategory === 'electricity' && (
                    <button
                      className="absolute right-3 top-1/2 -translate-y-1/2 px-3 py-1.5 rounded-lg text-xs font-bold transition-opacity"
                      style={{ background: `rgba(${accentRgb}, 0.12)`, color: accentHex }}
                      onClick={validateMeter}
                      disabled={validating}
                    >
                      {validating ? <Loader2 size={12} className="animate-spin" /> : 'Verify'}
                    </button>
                  )}
                </div>
                {meterName && (
                  <div className="flex items-center gap-2 mt-2">
                    <CheckCircle size={13} className="text-[#10B981]" />
                    <p className="text-[#10B981] text-xs font-medium">{meterName}</p>
                  </div>
                )}
              </div>

              {/* Amount / Plan */}
              {selectedCategory === 'data' ? (
                <div>
                  <label className="text-[#94A3B8] text-xs mb-2 block">Select Data Plan</label>
                  {!plans ? (
                    <div className="skeleton h-40 rounded-xl" />
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      {plans.slice(0, 8).map((plan: any) => (
                        <button key={plan.code}
                          className="p-4 rounded-xl text-left border transition-all"
                          style={selectedPlan?.code === plan.code ? {
                            background: `rgba(${accentRgb}, 0.1)`,
                            borderColor: `rgba(${accentRgb}, 0.4)`,
                          } : {
                            background: '#0F1629',
                            borderColor: 'rgba(255,255,255,0.06)',
                          }}
                          onClick={() => setSelectedPlan(plan)}
                        >
                          <p className="text-white text-xs font-bold">{plan.name}</p>
                          <p className="text-[#64748B] text-xs">{plan.validity}</p>
                          <p className="font-bold mt-1 text-sm" style={{ color: accentHex }}>
                            ₦{plan.amount?.toLocaleString()}
                          </p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div>
                  <label className="text-[#94A3B8] text-xs mb-2 block">Amount (NGN)</label>
                  {selectedCategory === 'airtime' && (
                    <div className="flex gap-2 mb-3 overflow-x-auto pb-1">
                      {AIRTIME_AMOUNTS_NGN.map(a => (
                        <button key={a}
                          className="px-4 py-2 rounded-xl text-xs font-semibold flex-shrink-0 transition-all"
                          style={amount === String(a) ? {
                            background: `rgba(${accentRgb}, 0.15)`,
                            color: accentHex, border: `1px solid rgba(${accentRgb}, 0.3)`,
                          } : {
                            background: 'rgba(255,255,255,0.05)',
                            color: '#94A3B8', border: '1px solid transparent',
                          }}
                          onClick={() => setAmount(String(a))}
                        >
                          ₦{a.toLocaleString()}
                        </button>
                      ))}
                    </div>
                  )}
                  <input
                    className="input-field"
                    placeholder="Enter amount in NGN"
                    type="number"
                    value={amount}
                    onChange={e => setAmount(e.target.value)}
                  />
                </div>
              )}

              {/* USDT equivalent */}
              {(amount || selectedPlan) && (
                <motion.div
                  className="rounded-xl p-4 border"
                  style={{ background: `rgba(${accentRgb}, 0.06)`, borderColor: `rgba(${accentRgb}, 0.15)` }}
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                >
                  <p className="text-[#94A3B8] text-xs mb-1">Estimated cost</p>
                  <p className="text-white font-inter font-bold text-xl">
                    ~{((selectedPlan?.amount || parseFloat(amount) || 0) / 1650).toFixed(4)} USDT
                  </p>
                  <p className="text-[#64748B] text-xs mt-1">At current rate ₦1,650/$1</p>
                </motion.div>
              )}

              <motion.button
                className="w-full py-4 rounded-xl font-bold text-black"
                style={{ background: colors.gradientBg }}
                whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }}
                onClick={() => {
                  if (!recipient) return toast.error('Enter recipient number')
                  if (!selectedPlan && !amount) return toast.error('Select plan or enter amount')
                  if (selectedCategory === 'electricity' && !meterName) return toast.error('Please verify meter number first')
                  setStep('pin')
                }}
              >
                Continue to Payment
              </motion.button>
            </motion.div>
          )}

          {/* STEP 4: PIN */}
          {step === 'pin' && !processing && (
            <motion.div key="pin" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="pt-4">
              <div className="text-center mb-8">
                <div className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center"
                  style={{ background: `rgba(${accentRgb}, 0.12)` }}>
                  <span className="text-3xl">🔐</span>
                </div>
                <p className="text-white font-semibold text-lg">Confirm with PIN</p>
                <p className="text-[#64748B] text-sm mt-1">Enter your 4-digit transaction PIN</p>
              </div>
              <PinPad onComplete={executePurchase} accentHex={accentHex} accentRgb={accentRgb} />
            </motion.div>
          )}

          {/* Processing */}
          {step === 'pin' && processing && (
            <motion.div key="processing" className="flex flex-col items-center justify-center py-24"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <motion.div
                className="w-20 h-20 rounded-full border-4 border-t-transparent mb-6"
                style={{ borderColor: `rgba(${accentRgb}, 0.2)`, borderTopColor: accentHex }}
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
              />
              <p className="text-white font-semibold">Processing payment...</p>
              <p className="text-[#64748B] text-sm mt-2">Please wait, do not close this screen</p>
            </motion.div>
          )}

          {/* SUCCESS */}
          {step === 'success' && (
            <motion.div key="success" className="flex flex-col items-center justify-center py-16 text-center"
              initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}>
              <motion.div
                className="w-24 h-24 rounded-full flex items-center justify-center mb-6"
                style={{ background: 'rgba(16,185,129,0.12)' }}
                animate={{ scale: [1, 1.1, 1] }} transition={{ duration: 0.5 }}
              >
                <CheckCircle size={48} className="text-[#10B981]" />
              </motion.div>
              <h2 className="text-white font-inter font-bold text-2xl mb-2">Payment Successful!</h2>
              <p className="text-[#94A3B8] text-sm mb-2">
                {selectedCategory === 'electricity' ? `₦${amount} electricity credit added to ${meterName}` :
                 selectedCategory === 'data' ? `${selectedPlan?.name} sent to ${recipient}` :
                 selectedCategory === 'tv' ? `${selectedProvider?.name} subscription renewed` :
                 `₦${amount} airtime sent to ${recipient}`}
              </p>
              {result?.reference && (
                <p className="text-[#64748B] text-xs mb-8">Ref: {result.reference}</p>
              )}
              <div className="grid grid-cols-2 gap-3 w-full max-w-xs">
                <button
                  className="py-3.5 rounded-xl text-sm font-semibold"
                  style={{ background: `rgba(${accentRgb}, 0.12)`, color: accentHex }}
                  onClick={reset}
                >
                  Pay Another Bill
                </button>
                <button
                  className="py-3.5 rounded-xl text-sm font-bold text-black"
                  style={{ background: colors.gradientBg }}
                  onClick={() => window.location.href = '/app/dashboard'}
                >
                  Go to Dashboard
                </button>
              </div>
            </motion.div>
          )}

          {/* FAILED */}
          {step === 'failed' && (
            <motion.div key="failed" className="flex flex-col items-center justify-center py-16 text-center"
              initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}>
              <div className="w-24 h-24 rounded-full bg-[#EF4444]/12 flex items-center justify-center mb-6">
                <AlertCircle size={48} className="text-[#EF4444]" />
              </div>
              <h2 className="text-white font-inter font-bold text-2xl mb-2">Payment Failed</h2>
              <p className="text-[#94A3B8] text-sm mb-8">Your wallet was not charged. Please try again.</p>
              <button
                className="py-3.5 px-8 rounded-xl text-sm font-bold text-black"
                style={{ background: colors.gradientBg }}
                onClick={reset}
              >
                Try Again
              </button>
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </div>
  )
}
