'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useTheme } from '@/context/ThemeContext'
import { useRouter } from 'next/navigation'
import { billsAPI, walletAPI } from '@/lib/api'
import { useQuery } from '@tanstack/react-query'
import BiometricApproveButton from '@/components/BiometricApproveButton'
import {
  Smartphone, Wifi, Zap, Tv, ChevronRight, ArrowLeft,
  Search, CheckCircle, AlertCircle, Loader2, Trophy,
  Lock, Coins, Gamepad2, Sun, GraduationCap, Globe,
  CreditCard, FileText, Heart, Landmark, ShoppingBag,
  ShoppingCart, Store, Fuel, Plane, Grid, MoreHorizontal, Wallet, NairaSign
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
        {Array.from({ length: 4 }, (_, i) => (
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

  const [step, setStep] = useState<'categories' | 'providers' | 'form' | 'wallet' | 'pin' | 'success' | 'failed'>('categories')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [selectedProvider, setSelectedProvider] = useState<any>(null)
  const [selectedPlan, setSelectedPlan] = useState<any>(null)
  const [selectedWallet, setSelectedWallet] = useState<'NGN' | 'USD' | null>(null)
  const [recipient, setRecipient] = useState('')
  const [amount, setAmount] = useState('')
  const [meterName, setMeterName] = useState('')
  const [validating, setValidating] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [result, setResult] = useState<any>(null)

  // Real wallet balances — shows what can actually pay bills.
  const { data: walletBal } = useQuery({
    queryKey: ['bill-wallet-balance'],
    queryFn: () => walletAPI.getBalance(),
    refetchInterval: 30000,
  })
  const realNgn = walletBal?.realNgn ?? walletBal?.ngnBalance ?? 0

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

  // Total NGN the user will be charged (server recomputes this authoritatively).
  const effectiveNgn = (() => {
    if (!amount && !selectedPlan) return 0
    if (selectedCategory === 'airtime' && (selectedProvider?.sellMarkup || 0) > 0) {
      return (parseFloat(amount) || 0) * (1 + (selectedProvider.sellMarkup || 0) / 100)
    }
    return selectedPlan?.amount || parseFloat(amount) || 0
  })()

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

  const executePurchase = async (pin?: string, passkeyToken?: string) => {
    setProcessing(true)
    setStep('pin')
    try {
      const payload: any = {
        type: selectedCategory!,
        provider: selectedProvider?.code,
        recipient,
        pin,
        passkeyToken,
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
    setSelectedWallet(null)
    setRecipient('')
    setAmount('')
    setMeterName('')
    setResult(null)
  }

  return (
    <div className="min-h-screen bg-[#060A15] pb-32">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-[#060A15]/90 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
          {step !== 'categories' && (
            <motion.button
              className="w-9 h-9 rounded-xl bg-white/5 flex items-center justify-center"
              whileTap={{ scale: 0.9 }}
              onClick={() => {
                if (step === 'providers') { setStep('categories'); setSelectedCategory(null) }
                else if (step === 'form') { setStep('providers'); setSelectedProvider(null) }
                else if (step === 'wallet') setStep('form')
                else if (step === 'pin') setStep('wallet')
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
              {step === 'wallet' && 'Choose a wallet'}
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
                  {Array.from({ length: 4 }, (_, i) => (
                    <div key={i} className="skeleton h-[76px] rounded-2xl" />
                  ))}
                </div>
              ) : (
                <div className="space-y-3">
                  {providers.map((provider: any, i: number) => {
                    const name = (provider.name || '').toLowerCase()

                    // ── Network brand logos — actual logo image files ──
                    const NETWORK_LOGOS: Record<string, { src: string; description: string; circular?: boolean; fit?: 'cover' | 'contain'; scale?: number }> = {
                      mtn: { src: '/logos/mtn.png', description: 'Mobile Telecommunication Network', fit: 'cover' },
                      airtel: { src: '/logos/airtel.png', description: 'Airtel Networks Limited', fit: 'cover' },
                      glo: { src: '/logos/glo.png', description: 'Glo Mobile Network', circular: true, fit: 'cover', scale: 1.15 },
                      '9mobile': { src: '/logos/9mobile.png', description: 'Formerly Etisalat Nigeria', fit: 'contain' },
                      etisalat: { src: '/logos/9mobile.png', description: 'Formerly Etisalat Nigeria', fit: 'contain' },
                      dstv: { src: '/logos/dstv.svg', description: 'MultiChoice DStv Subscription' },
                      gotv: { src: '/logos/gotv.svg', description: 'MultiChoice GOtv Subscription' },
                      startimes: { src: '/logos/startimes.svg', description: 'StarTimes TV Subscription' },
                    }

                    const brand = (() => {
                      const match = Object.keys(NETWORK_LOGOS).find(key => name.includes(key))
                      if (match) {
                        const net = NETWORK_LOGOS[match]
                        return {
                          description: net.description,
                          logo: (
                            <div style={{
                              width: 52, height: 52, flexShrink: 0, overflow: 'hidden',
                              borderRadius: net.circular ? '50%' : 12,
                              background: 'transparent',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}>
                              <img
                                src={net.src}
                                alt={provider.name}
                                style={{
                                  width: '100%', height: '100%',
                                  objectFit: net.fit || 'cover',
                                  display: 'block',
                                  transform: net.scale ? `scale(${net.scale})` : undefined,
                                }}
                              />
                            </div>
                          ),
                        }
                      }
                      // Generic fallback — first letter
                      return {
                        description: provider.code || 'Service Provider',
                        logo: (
                          <div style={{ background: 'linear-gradient(135deg,#2A3450,#1A2238)', borderRadius: 10, width: 52, height: 52, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <span style={{ fontFamily: 'Arial Black, sans-serif', fontWeight: 900, fontSize: 20, color: '#fff' }}>
                              {(provider.name || '?')[0].toUpperCase()}
                            </span>
                          </div>
                        ),
                      }
                    })()

                    return (
                      <motion.button key={provider.code}
                        className="w-full rounded-2xl p-4 flex items-center gap-4 border text-left transition-all"
                        style={{
                          background: 'rgba(15,22,41,0.8)',
                          borderColor: 'rgba(255,255,255,0.07)',
                          backdropFilter: 'blur(8px)',
                        }}
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.06, type: 'spring', stiffness: 300, damping: 28 }}
                        whileHover={{
                          borderColor: `rgba(${accentRgb}, 0.35)`,
                          background: `rgba(${accentRgb}, 0.04)`,
                          scale: 1.005,
                        }}
                        whileTap={{ scale: 0.97 }}
                        onClick={() => { setSelectedProvider(provider); setStep('form') }}
                      >
                        {/* Logo tile */}
                        {provider.image ? (
                          <div style={{ width: 52, height: 52, borderRadius: 12, overflow: 'hidden', flexShrink: 0, border: `1.5px solid rgba(255,255,255,0.1)`, background: '#fff' }}>
                            <img src={provider.image} alt={provider.name} style={{ width: '100%', height: '100%', objectFit: 'contain', padding: 4 }} />
                          </div>
                        ) : brand.logo}

                        {/* Text */}
                        <div className="flex-1 min-w-0">
                          <p className="text-white font-semibold text-[15px] leading-snug">{provider.name}</p>
                          <p className="text-[#64748B] text-xs mt-0.5 truncate">
                            {selectedCategory === 'airtime' && provider.discount
                              ? `${provider.discount}% cashback discount`
                              : brand.description}
                          </p>
                        </div>

                        {/* Arrow */}
                        <div
                          className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                          style={{ background: `rgba(${accentRgb}, 0.08)` }}
                        >
                          <ChevronRight size={15} style={{ color: accentHex }} />
                        </div>
                      </motion.button>
                    )
                  })}
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
                    <div className="space-y-4 max-h-[52vh] overflow-y-auto pr-1">
                      {(() => {
                        const groups: Record<string, any[]> = {}
                        plans.forEach((plan: any) => {
                          const g = plan.planType || 'OTHER'
                          ;(groups[g] = groups[g] || []).push(plan)
                        })
                        return Object.entries(groups).map(([type, list]) => (
                          <div key={type}>
                            <p className="text-[#64748B] text-[10px] font-bold uppercase tracking-widest mb-2 px-1">
                              {type.replace(/_/g, ' ')}
                            </p>
                            <div className="grid grid-cols-2 gap-2">
                              {list.map((plan: any) => (
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
                                  <p className="text-[#64748B] text-[10px] leading-tight mt-0.5">{plan.validity}</p>
                                  <p className="font-bold mt-1 text-sm" style={{ color: accentHex }}>
                                    ₦{plan.amount?.toLocaleString()}
                                  </p>
                                </button>
                              ))}
                            </div>
                          </div>
                        ))
                      })()}
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

              {/* Estimated cost */}
              {effectiveNgn > 0 && (
                <motion.div
                  className="rounded-xl p-4 border"
                  style={{ background: `rgba(${accentRgb}, 0.06)`, borderColor: `rgba(${accentRgb}, 0.15)` }}
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                >
                  <p className="text-[#94A3B8] text-xs mb-1">Estimated cost (real naira)</p>
                  <p className="text-white font-inter font-bold text-xl">₦{effectiveNgn.toLocaleString()}</p>
                  {selectedCategory === 'airtime' && (selectedProvider?.sellMarkup || 0) > 0 && (
                    <p className="text-[#94A3B8] text-[10px] mt-1">
                      Includes {selectedProvider.sellMarkup}% markup
                    </p>
                  )}
                  {realNgn < effectiveNgn && (
                    <div className="flex items-start gap-2 mt-2 rounded-lg bg-amber-500/10 border border-amber-500/25 p-2.5">
                      <AlertCircle size={14} className="text-amber-400 flex-shrink-0 mt-0.5" />
                      <p className="text-amber-300 text-[11px] leading-relaxed">
                        You have ₦{realNgn.toLocaleString()} real naira — fund your NGN wallet via bank transfer on the Receive page.
                      </p>
                    </div>
                  )}
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
                  setSelectedWallet(null)
                  setStep('wallet')
                }}
              >
                Continue to Payment
              </motion.button>
            </motion.div>
          )}

          {/* STEP 4: Wallet picker — which wallet pays the bill */}
          {step === 'wallet' && (
            <motion.div key="wallet" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
              className="space-y-4 pt-2">
              <div className="text-center mb-2">
                <p className="text-white font-semibold text-lg">Pay with which wallet?</p>
                <p className="text-[#64748B] text-sm mt-1">Cost: <span className="text-white font-bold">₦{effectiveNgn.toLocaleString()}</span></p>
              </div>

              <button
                onClick={() => { setSelectedWallet('NGN'); setStep('pin') }}
                className="w-full rounded-2xl p-5 text-left border transition-all relative overflow-hidden"
                style={{
                  background: 'rgba(16,185,129,0.05)',
                  borderColor: 'rgba(16,185,129,0.25)',
                }}
                whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }}
              >
                <span className="absolute top-3 right-3 px-2 py-0.5 rounded-full text-[9px] font-extrabold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 uppercase tracking-wider">
                  Recommended
                </span>
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center">
                    <Landmark size={22} className="text-emerald-400" />
                  </div>
                  <div className="flex-1">
                    <p className="text-white font-bold text-sm">NGN Wallet <span className="text-emerald-400 text-xs">· Real money</span></p>
                    <p className="text-[#94A3B8] text-xs mt-0.5">Available: <span className="text-white font-bold">₦{realNgn.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span></p>
                    <p className="text-[#64748B] text-[11px] mt-1 leading-snug">Funded by bank transfers. This is the only wallet that can pay real bills.</p>
                  </div>
                  <ChevronRight size={18} className="text-[#64748B]" />
                </div>
              </button>

              <button
                onClick={() => toast('USDC wallet payments go live at mainnet launch. For now, bills are paid with real naira.', { duration: 5000 })}
                className="w-full rounded-2xl p-5 text-left border transition-all relative overflow-hidden opacity-80"
                style={{ background: 'rgba(255,255,255,0.02)', borderColor: 'rgba(255,255,255,0.08)' }}
              >
                <span className="absolute top-3 right-3 px-2 py-0.5 rounded-full text-[9px] font-extrabold bg-white/10 text-[#94A3B8] border border-white/15 uppercase tracking-wider flex items-center gap-1">
                  <Lock size={9} /> After Mainnet
                </span>
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
                    <Coins size={22} className="text-[#94A3B8]" />
                  </div>
                  <div className="flex-1">
                    <p className="text-white font-bold text-sm">USDC Wallet <span className="text-[#64748B] text-xs">· Crypto</span></p>
                    <p className="text-[#94A3B8] text-xs mt-0.5">Locked until mainnet launch</p>
                    <p className="text-[#64748B] text-[11px] mt-1 leading-snug">Testnet USDC can't pay real bills — you'll use it here once mainnet is live.</p>
                  </div>
                  <Lock size={18} className="text-[#475569]" />
                </div>
              </button>
            </motion.div>
          )}

          {/* STEP 5: PIN */}
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
                {selectedWallet === 'NGN' && (
                  <p className="text-emerald-400 text-xs mt-2">Paying ₦{effectiveNgn.toLocaleString()} from your NGN wallet</p>
                )}
              </div>
              <PinPad onComplete={executePurchase} accentHex={accentHex} accentRgb={accentRgb} />
              <div className="flex items-center gap-3 my-3">
                <div className="flex-1 h-px bg-white/5"></div>
                <span className="text-[10px] text-[#64748B] uppercase tracking-wider">or</span>
                <div className="flex-1 h-px bg-white/5"></div>
              </div>
              <BiometricApproveButton onApproved={(token) => executePurchase(undefined, token)} accentHex={accentHex} accentRgb={accentRgb} disabled={processing} />
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
