'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useTheme } from '@/context/ThemeContext'
import { useRouter, useSearchParams } from 'next/navigation'
import { billsAPI, walletAPI, passkeyAPI } from '@/lib/api'
import { useQuery } from '@tanstack/react-query'
import { startAuthentication } from '@simplewebauthn/browser'
import BiometricApproveButton from '@/components/BiometricApproveButton'
import {
  Smartphone, Wifi, Zap, Tv, ChevronRight, ChevronDown, ArrowLeft,
  Search, CheckCircle, AlertCircle, Loader2, Trophy,
  Lock, Coins, Gamepad2, Sun, GraduationCap, Globe,
  CreditCard, FileText, Heart, Landmark, ShoppingBag,
  ShoppingCart, Store, Fuel, Plane, Grid, MoreHorizontal, Wallet,
  User, Check, AlertTriangle, RefreshCw, X, Sparkles, Clock
} from 'lucide-react'
import toast from 'react-hot-toast'
import { useBackLayer } from '@/context/BackNavigationContext'
import ComingSoon from '@/components/ui/ComingSoon'
import {
  NIGERIAN_NETWORKS,
  NetworkCode,
  normalizeNigerianPhone,
  formatPhoneDisplay,
  detectNetworkFromPhone,
  validateNigerianPhone,
} from '@/lib/nigerian-phones'
import {
  buildPlanCategories,
  planMatchesCategory,
} from '@/lib/data-plan-categories'

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

const LIVE_CATEGORIES = new Set(['airtime', 'data'])

const COMING_SOON_COPY: Record<string, { title: string; subtitle: string; features: string[]; eta?: string }> = {
  electricity: {
    title: 'Electricity top-ups',
    subtitle: "We're wiring up NEPA so you can zap your meter straight from your wallet — no queues, no scratch cards, no candles.",
    features: [
      'Prepaid & postpaid meters for IKEDC, EKEDC, AEDC and more',
      'Instant token delivery straight to your phone',
      'Meter validation before you pay, receipts after',
    ],
    eta: 'Rolling out once the disco integration passes live tests',
  },
  tv: {
    title: 'Cable TV subscriptions',
    subtitle: "DStv, GOtv and StarTimes renewals are almost ready — soon your decoder will never see a blackout again.",
    features: [
      'Renew DStv, GOtv and StarTimes in a few taps',
      'Bouquet picker with live pricing',
      'Auto-reminders before your subscription expires',
    ],
    eta: 'In the queue right after electricity',
  },
  internet: {
    title: 'Internet services',
    subtitle: "Smile, Spectranet and Swift refills are on the roadmap — buffering on your router, not in our rollout.",
    features: [
      'Top up Smile, Spectranet and Swift accounts',
      'Data bundles and account payments in one place',
      'Instant confirmation and receipt history',
    ],
    eta: 'Coming after the core utility rollout',
  },
  school: {
    title: 'School & exam payments',
    subtitle: 'WAEC, JAMB and NECO pins without the cyber-café pilgrimage. Class is almost in session.',
    features: [
      'Buy WAEC, JAMB and NECO result-checker pins',
      'Pay accredited school fees directly',
      'Every payment backed by a verifiable receipt',
    ],
    eta: 'On the roadmap',
  },
  invoice: {
    title: 'Invoice payments',
    subtitle: "Pay business invoices straight from your wallet. We're completing the banking partnership that powers it.",
    features: [
      'Settle invoices in USDC or naira',
      'Automatic conversion at a transparent rate',
      'Payment confirmations both sides can trust',
    ],
    eta: 'Live once the payout banking integration is approved',
  },
  giftcards: {
    title: 'Gift cards',
    subtitle: 'Amazon, iTunes, Google Play and friends — a whole gift shop is moving into your wallet.',
    features: [
      'Buy top global gift cards with USDC or naira',
      'Codes delivered instantly, in-app',
      'Fair rates with zero hidden markup',
    ],
    eta: 'Stocking the shelves now',
  },
}

// ── Airtime 6 Presets (Matching Image 1) ────────────────────────────────────
const AIRTIME_PRESETS = [100, 200, 300, 500, 1000, 2000]

// ── Helper to format clean bundle volume ───────────────────────────────────
function formatDataVolume(name: string): string {
  if (!name) return 'Data'
  const match = name.match(/(\d+(?:\.\d+)?)\s*(GB|MB|TB)/i)
  if (match) {
    const num = parseFloat(match[1])
    const unit = match[2].toUpperCase()
    return `${num % 1 === 0 ? num : num.toFixed(1)} ${unit}`
  }
  return name.replace(/data|plan/gi, '').trim()
}

// ── PIN Pad Component ──────────────────────────────────────────────────────
function PinPad({
  onComplete,
  accentHex,
  accentRgb,
}: {
  onComplete: (pin: string) => void
  accentHex: string
  accentRgb: string
}) {
  const [pin, setPin] = useState('')
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫']

  const tap = (k: string) => {
    if (k === '⌫') setPin((p) => p.slice(0, -1))
    else if (pin.length < 4) {
      const next = pin + k
      setPin(next)
      if (next.length === 4) setTimeout(() => onComplete(next), 150)
    }
  }

  return (
    <div>
      <div
        className="flex justify-center gap-3 mb-[clamp(0.75rem,4dvh,2rem)]"
        aria-label={`PIN entered ${pin.length} of 4 digits`}
      >
        {Array.from({ length: 4 }, (_, i) => (
          <motion.div
            key={i}
            className="w-4 h-4 rounded-full border-2 transition-all"
            style={
              i < pin.length
                ? { background: accentHex, borderColor: accentHex }
                : { borderColor: 'rgba(255,255,255,0.2)', background: 'transparent' }
            }
            animate={i < pin.length ? { scale: [1, 1.3, 1] } : {}}
            transition={{ duration: 0.15 }}
          />
        ))}
      </div>
      {/* Keypad buttons scale with viewport height so 4 rows always fit on
          short phones (iPhone SE / small Android) without internal scrolling.
          Buttons: 3.25rem–4rem (52–64px); gap: 0.5rem–1rem. */}
      <div className="grid grid-cols-3 gap-[clamp(0.5rem,2.5dvh,1rem)] max-w-xs mx-auto">
        {keys.map((k, i) => (
          <motion.button
            key={i}
            type="button"
            disabled={!k}
            aria-label={k === '⌫' ? 'Delete digit' : k}
            className="h-[clamp(3.25rem,8.5dvh,4rem)] rounded-2xl text-xl font-semibold disabled:opacity-0"
            style={
              k && k !== '⌫'
                ? { background: 'rgba(255,255,255,0.06)', color: '#fff' }
                : { background: 'transparent', color: '#94A3B8' }
            }
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
// MAIN BILLS PAGE
// ══════════════════════════════════════════════════════════════════════════

export default function BillsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { variant, colors } = useTheme()
  const isGold = variant === 'gold'
  const accentRgb = isGold ? '212, 160, 23' : '181, 226, 61'
  const accentHex = isGold ? '#D4A017' : '#B5E23D'

  // Views: 'categories' | 'airtime' | 'data' | 'wallet' | 'pin' | 'success' | 'failed'
  const [step, setStep] = useState<'categories' | 'airtime' | 'data' | 'wallet' | 'pin' | 'success' | 'failed'>('categories')
  const [selectedNetwork, setSelectedNetwork] = useState<NetworkCode>('MTN')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [amount, setAmount] = useState('')
  const [selectedPreset, setSelectedPreset] = useState<number | null>(null)
  const [selectedPlan, setSelectedPlan] = useState<any>(null)
  const [activeDataTab, setActiveDataTab] = useState('ALL')
  const [networkModalOpen, setNetworkModalOpen] = useState(false)
  const [contactModalOpen, setContactModalOpen] = useState(false)
  const [recentNumbers, setRecentNumbers] = useState<string[]>([])
  const [comingSoonCategory, setComingSoonCategory] = useState<string | null>(null)

  // Transaction execution states
  const [selectedWallet, setSelectedWallet] = useState<'NGN' | 'USD' | null>('NGN')
  const [processing, setProcessing] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [errorMessage, setErrorMessage] = useState<string>('')
  // True while the WebAuthn biometric prompt (Face ID / fingerprint) is open.
  const [biometricBusy, setBiometricBusy] = useState(false)

  // Load recent numbers on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem('surexend_recent_phone_recipients')
      if (saved) {
        setRecentNumbers(JSON.parse(saved).slice(0, 5))
      }
    } catch { /* ignore */ }
  }, [])

  // Check URL search params for direct tab navigation
  useEffect(() => {
    const type = searchParams.get('type') || searchParams.get('tab')
    if (type === 'airtime') setStep('airtime')
    else if (type === 'data') setStep('data')
  }, [searchParams])

  const saveRecentNumber = (num: string) => {
    try {
      const norm = normalizeNigerianPhone(num)
      if (!norm) return
      const updated = [norm, ...recentNumbers.filter((n) => n !== norm)].slice(0, 5)
      setRecentNumbers(updated)
      localStorage.setItem('surexend_recent_phone_recipients', JSON.stringify(updated))
    } catch { /* ignore */ }
  }

  // Back button handling
  useBackLayer(
    step !== 'categories' || !!comingSoonCategory || networkModalOpen || contactModalOpen,
    useCallback(() => {
      if (networkModalOpen) setNetworkModalOpen(false)
      else if (contactModalOpen) setContactModalOpen(false)
      else if (comingSoonCategory) setComingSoonCategory(null)
      else if (step === 'pin') setStep('wallet')
      else if (step === 'wallet') setStep(selectedPlan ? 'data' : 'airtime')
      else if (step === 'airtime' || step === 'data') setStep('categories')
      else reset()
    }, [step, comingSoonCategory, networkModalOpen, contactModalOpen, selectedPlan]),
    30
  )

  // Lock page scroll while the secure PIN / processing overlay is up, so the
  // keypad and PIN dots can never move, scroll, or slide off-screen. The overlay
  // is `fixed inset-0`, but locking the body scroll is belt-and-braces so the
  // page can't scroll underneath on small screens. We only toggle `overflow`,
  // not `position`, to avoid resetting the page's scroll position.
  useEffect(() => {
    if (step !== 'pin') return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [step])

  // Real wallet balances
  const { data: walletBal } = useQuery({
    queryKey: ['bill-wallet-balance'],
    queryFn: () => walletAPI.getBalance(),
    refetchInterval: 30000,
  })
  const realNgn = walletBal?.realNgn ?? walletBal?.ngnBalance ?? 0

  // Airtime providers query
  const { data: airtimeProviders } = useQuery({
    queryKey: ['bill-providers-airtime'],
    queryFn: () => billsAPI.getProviders('airtime', 'NG'),
    enabled: step === 'airtime',
  })

  // Data plans query
  const { data: rawPlans, isLoading: plansLoading } = useQuery({
    queryKey: ['data-plans', selectedNetwork],
    queryFn: () => billsAPI.getDataPlans(selectedNetwork),
    enabled: step === 'data',
  })

  // Group categories by the REAL catalog `planType` (see data-plan-categories),
  // so the bundle tabs always match the VTU service catalogue and the admin
  // pricing console (which also reads `planType`). Falls back to a validity
  // bucket only when a plan carries no usable type.
  const planCategories = useMemo(() => buildPlanCategories(rawPlans as any[]), [rawPlans])

  // Automatically set default tab when category tabs are (re)loaded
  useEffect(() => {
    if (planCategories.length > 0 && !planCategories.some(c => c.id === activeDataTab)) {
      setActiveDataTab(planCategories[0].id)
    }
  }, [planCategories, activeDataTab])

  // Filter plans based on active tab
  const filteredPlans = useMemo(() => {
    if (!rawPlans || !Array.isArray(rawPlans)) return []
    return rawPlans.filter((p: any) => planMatchesCategory(p, activeDataTab))
  }, [rawPlans, activeDataTab])

  // Phone validation status
  const phoneValidation = useMemo(() => {
    return validateNigerianPhone(phoneNumber, selectedNetwork)
  }, [phoneNumber, selectedNetwork])

  // Auto-detect network when typing phone number
  // Switching networks invalidates any previously selected data plan and its
  // price — a bundle from the old network must never be charged under the new
  // one (this caused a stale price in the payment summary and wrong planCode).
  // We only reset the data plan (and its category tab); the user's airtime
  // amount/preset is network-independent and should survive the switch.
  const changeNetwork = (net: NetworkCode) => {
    if (net === selectedNetwork) return
    setSelectedNetwork(net)
    setSelectedPlan(null)
    setActiveDataTab('ALL')
  }

  const handlePhoneChange = (val: string) => {
    setPhoneNumber(val)
    const detected = detectNetworkFromPhone(val)
    if (detected && detected !== selectedNetwork) {
      changeNetwork(detected)
    }
  }

  // Open contact picker
  const openContactPicker = async () => {
    if (typeof window !== 'undefined' && 'contacts' in navigator && 'ContactsManager' in window) {
      try {
        const contacts = await (navigator as any).contacts.select(['tel'], { multiple: false })
        if (contacts && contacts[0]?.tel?.[0]) {
          handlePhoneChange(contacts[0].tel[0])
          return
        }
      } catch { /* ignore */ }
    }
    setContactModalOpen(true)
  }

  // Total NGN user will be charged. When a plan is selected (data), ALWAYS use
  // the plan's sell price regardless of the current step — the payment summary
  // and PIN screens render at 'wallet'/'pin' steps, so gating on `step === 'data'`
  // here made a selected bundle show ₦0 (or a leftover airtime amount) in the
  // summary, which is what drifted from the backend's price.
  const effectiveNgn = useMemo(() => {
    if (selectedPlan) {
      return Number(selectedPlan.amount) || 0
    }
    return parseFloat(amount) || 0
  }, [selectedPlan, amount])

  // Proceed to payment. `planOverride` lets a tapped bundle be validated
  // immediately; reading `selectedPlan` here would race the async setState
  // (still null on the first tap) and spuriously fail with "Please select a
  // data bundle" even though a bundle was just selected.
  const handleProceedToPayment = (planOverride?: any) => {
    // Only treat the argument as a plan when it actually looks like one. A bare
    // `onClick={handleProceedToPayment}` passes the DOM click event, which is
    // truthy — without this guard the airtime Pay button would set selectedPlan
    // to a MouseEvent and turn an airtime purchase into a broken "data" one.
    const plan = planOverride && typeof planOverride === 'object' && planOverride.code ? planOverride : selectedPlan
    if (!phoneNumber) {
      return toast.error('Please enter a phone number')
    }
    if (!phoneValidation.isValid) {
      return toast.error(phoneValidation.error || 'Please enter a valid 11-digit Nigerian phone number')
    }
    if (step === 'airtime') {
      const amt = parseFloat(amount)
      if (!amt || amt < 50) {
        return toast.error('Minimum airtime amount is ₦50')
      }
      if (amt > 500000) {
        return toast.error('Maximum airtime amount is ₦500,000')
      }
    } else if (step === 'data' && !plan) {
      return toast.error('Please select a data bundle')
    }

    // Make sure the plan we validated is the one the summary/PIN screens read.
    if (plan) setSelectedPlan(plan)
    setStep('wallet')
  }

  // Execute purchase
  const executePurchase = async (pin?: string, passkeyToken?: string) => {
    setProcessing(true)
    setErrorMessage('')
    setStep('pin')

    try {
      const payload: any = {
        type: step === 'data' || selectedPlan ? 'data' : 'airtime',
        provider: selectedNetwork,
        recipient: phoneValidation.normalized || phoneNumber,
        pin,
        passkeyToken,
      }

      if (selectedPlan) {
        payload.planCode = selectedPlan.code
        payload.amount = selectedPlan.amount
      } else {
        payload.amount = parseFloat(amount)
      }

      const res = await billsAPI.purchase(payload)
      setResult(res)
      saveRecentNumber(payload.recipient)
      setStep('success')
    } catch (err: any) {
      const msg =
        err?.response?.data?.message ||
        err?.message ||
        'Purchase could not be processed. Your wallet was not charged.'
      setErrorMessage(msg)
      toast.error(msg)
      setStep('failed')
    } finally {
      setProcessing(false)
    }
  }

  // Biometric-first approval: trigger Face ID / fingerprint via WebAuthn before
  // showing the PIN keypad. If the user has no enrolled passkey, cancels, or the
  // prompt fails, we fall back to the 4-digit PIN. This must be called from a
  // user-gesture handler (the "Continue" button) because browsers only allow
  // navigator.credentials.get() inside a transient activation.
  const approveWithBiometric = async () => {
    setBiometricBusy(true)
    try {
      // Skip straight to PIN if the account has no registered credential, so we
      // never flash an unusable OS prompt.
      const devices = await passkeyAPI.listDevices().catch(() => [] as any[])
      if (!Array.isArray(devices) || devices.length === 0) {
        setStep('pin')
        return
      }
      const options = await passkeyAPI.approveBegin()
      const response = await startAuthentication({ optionsJSON: options })
      const { passkeyToken } = await passkeyAPI.approveComplete(response)
      setBiometricBusy(false)
      await executePurchase(undefined, passkeyToken)
      return
    } catch {
      // Cancelled, no credential available, or WebAuthn not supported — fall
      // back to the PIN keypad.
    } finally {
      setBiometricBusy(false)
    }
    setStep('pin')
  }

  const handleConfirmPayment = () => {
    if (realNgn < effectiveNgn) {
      return toast.error('Insufficient real naira balance in your NGN wallet.')
    }
    void approveWithBiometric()
  }

  const reset = () => {
    setStep('categories')
    setAmount('')
    setSelectedPreset(null)
    setSelectedPlan(null)
    setResult(null)
    setErrorMessage('')
  }

  return (
    <div className="min-h-screen bg-[#000000] pb-32">
      {/* ── HEADER ── */}
      <div className="sticky top-0 z-30 bg-[#000000]/90 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {step !== 'categories' && (
              <motion.button
                className="w-9 h-9 rounded-xl bg-white/5 flex items-center justify-center active:scale-95 transition-transform"
                whileTap={{ scale: 0.9 }}
                onClick={() => {
                  if (step === 'pin') setStep('wallet')
                  else if (step === 'wallet') setStep(selectedPlan ? 'data' : 'airtime')
                  else if (step === 'success' || step === 'failed') reset()
                  else setStep('categories')
                }}
              >
                <ArrowLeft size={18} className="text-white" />
              </motion.button>
            )}
            <div>
              <h1 className="text-white font-inter font-bold text-xl">
                {step === 'categories' && 'Pay Bills'}
                {step === 'airtime' && 'Airtime'}
                {step === 'data' && 'Mobile Data'}
                {step === 'wallet' && 'Confirm Payment'}
                {step === 'pin' && 'Enter PIN'}
                {step === 'success' && 'Payment Receipt'}
                {step === 'failed' && 'Payment Failed'}
              </h1>
              <p className="text-[#64748B] text-xs">
                {step === 'categories' && 'Airtime · Data · Electricity · TV · Utilities'}
                {step === 'airtime' && 'Instant airtime recharge'}
                {step === 'data' && 'Instant data bundles'}
                {step === 'wallet' && 'Choose payment wallet'}
                {step === 'pin' && 'Enter your transaction PIN'}
              </p>
            </div>
          </div>

          <button
            onClick={() => router.push('/app/history?filter=BILL_PAYMENT')}
            className="text-xs font-semibold hover:underline px-2 py-1 transition-colors"
            style={{ color: accentHex }}
          >
            History
          </button>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 pt-4">
        <AnimatePresence mode="wait">
          {/* ══════════════════════════════════════════════════════════════════ */}
          {/* STEP 1: CATEGORIES OVERVIEW (Restored to pristine original state) */}
          {/* ══════════════════════════════════════════════════════════════════ */}
          {step === 'categories' && (
            <motion.div key="cats" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
              <div className="bg-[#15171C] rounded-3xl p-5 border border-white/5 mb-6">
                <p className="text-[#64748B] text-xs font-bold uppercase tracking-widest mb-5 px-1">Utilities & Services</p>
                <div className="grid grid-cols-4 gap-y-6 gap-x-2 sm:gap-x-4">
                  {CATEGORIES.map((cat, i) => {
                    const Icon = cat.icon
                    const isLive = LIVE_CATEGORIES.has(cat.type)
                    return (
                      <motion.button
                        key={cat.type}
                        className="flex flex-col items-center gap-2 group text-center"
                        initial={{ opacity: 0, y: 15 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.02 }}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => {
                          if (!isLive) {
                            setComingSoonCategory(cat.type)
                            return
                          }
                          if (cat.type === 'airtime') setStep('airtime')
                          else if (cat.type === 'data') setStep('data')
                        }}
                      >
                        <div className="relative">
                          <div className="w-12 h-12 rounded-full bg-[#212429] border border-white/5 flex items-center justify-center group-hover:bg-white/10 transition-colors shadow-inner">
                            <Icon size={20} className="text-white" />
                          </div>
                          {isLive && cat.badge && (
                            <span className="absolute -top-1.5 -right-2 px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-[#FF4D6D] text-white shadow-md">
                              {cat.badge}
                            </span>
                          )}
                          {!isLive && (
                            <span className="absolute -top-1.5 -right-2 px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-[#212429] border border-white/15 text-[#94A3B8] shadow-md">
                              Soon
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
              <div className="bg-[#15171C] rounded-3xl p-6 border border-white/5 text-center">
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

          {/* ══════════════════════════════════════════════════════════════════ */}
          {/* STEP 2: AIRTIME PAGE (Matching Image 1) */}
          {/* ══════════════════════════════════════════════════════════════════ */}
          {step === 'airtime' && (
            <motion.div key="airtime" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-4">
              {/* Network Switcher + Phone Number Input Bar (Image 1) */}
              <div className="liquid-glass p-2.5 rounded-2xl flex items-center gap-2.5">
                <button
                  onClick={() => setNetworkModalOpen(true)}
                  className="flex items-center gap-1.5 pl-1.5 pr-2.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 active:scale-95 transition-all flex-shrink-0"
                >
                  <div className="w-7 h-7 rounded-full overflow-hidden flex items-center justify-center bg-black/40 border border-white/10">
                    <img
                      src={NIGERIAN_NETWORKS[selectedNetwork].logo}
                      alt={selectedNetwork}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <ChevronDown size={14} className="text-[#94A3B8]" />
                </button>

                <div className="w-[1px] h-6 bg-white/10 flex-shrink-0" />

                <div className="flex-1 min-w-0">
                  <input
                    type="tel"
                    className="w-full bg-transparent text-white font-medium text-[15px] placeholder:text-[#475569] focus:outline-none tracking-wide"
                    placeholder="080XXXXXXXX"
                    value={formatPhoneDisplay(phoneNumber)}
                    onChange={(e) => handlePhoneChange(e.target.value)}
                  />
                </div>

                <button
                  onClick={openContactPicker}
                  className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 active:scale-95 flex items-center justify-center text-[#94A3B8] hover:text-white flex-shrink-0 transition-colors"
                  title="Choose contact or paste"
                >
                  <User size={16} />
                </button>
              </div>

              {/* Inline phone validation feedback */}
              {phoneNumber && (
                <div className="px-1 text-xs">
                  {!phoneValidation.isValid ? (
                    <p className="text-amber-400 flex items-center gap-1.5">
                      <AlertTriangle size={13} className="flex-shrink-0" />
                      <span>{phoneValidation.error}</span>
                    </p>
                  ) : (
                    <p className="flex items-center gap-1.5" style={{ color: accentHex }}>
                      <CheckCircle size={13} className="flex-shrink-0" />
                      <span>Valid Nigerian number ({selectedNetwork})</span>
                    </p>
                  )}
                </div>
              )}

              {/* "Top up" Card with 6 Preset Boxes (Image 1) */}
              <div className="liquid-glass p-5 rounded-3xl space-y-4">
                <p className="text-white text-sm font-semibold">Top up</p>

                {/* 6 Preset boxes */}
                <div className="grid grid-cols-3 gap-2.5">
                  {AIRTIME_PRESETS.map((p) => {
                    const isSelected = selectedPreset === p
                    return (
                      <button
                        key={p}
                        onClick={() => {
                          setSelectedPreset(p)
                          setAmount(String(p))
                        }}
                        className="h-16 rounded-2xl border text-center flex flex-col items-center justify-center transition-all active:scale-95"
                        style={{
                          background: isSelected ? `rgba(${accentRgb}, 0.12)` : 'rgba(255,255,255,0.03)',
                          borderColor: isSelected ? accentHex : 'rgba(255,255,255,0.06)',
                          boxShadow: isSelected ? `0 0 16px rgba(${accentRgb}, 0.2)` : 'none',
                        }}
                      >
                        <span className="text-white font-inter font-bold text-base tracking-tight">
                          ₦ {p.toLocaleString()}
                        </span>
                      </button>
                    )
                  })}
                </div>

                {/* Custom Amount Row with Pay Button (Image 1) */}
                <div className="pt-2">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 bg-[#181B22] border border-white/10 rounded-2xl px-4 py-3 flex items-center gap-2 focus-within:border-white/25 transition-colors">
                      <span className="text-white/60 font-medium text-sm">₦</span>
                      <input
                        type="number"
                        className="w-full bg-transparent text-white font-semibold text-sm placeholder:text-[#475569] focus:outline-none"
                        placeholder="50 - 500,000"
                        value={amount}
                        onChange={(e) => {
                          setAmount(e.target.value)
                          setSelectedPreset(null)
                        }}
                      />
                    </div>

                    <button
                      onClick={() => handleProceedToPayment()}
                      disabled={!amount || parseFloat(amount) < 50 || !phoneValidation.isValid}
                      className="px-7 py-3.5 rounded-2xl font-bold text-black text-sm disabled:opacity-40 active:scale-95 transition-all shadow-md flex-shrink-0"
                      style={{ background: colors.gradientBg }}
                    >
                      Pay
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* ══════════════════════════════════════════════════════════════════ */}
          {/* STEP 3: DATA PAGE (Matching Image 2) */}
          {/* ══════════════════════════════════════════════════════════════════ */}
          {step === 'data' && (
            <motion.div key="data" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-4">
              {/* Network Switcher + Phone Number Bar */}
              <div className="liquid-glass p-2.5 rounded-2xl flex items-center gap-2.5">
                <button
                  onClick={() => setNetworkModalOpen(true)}
                  className="flex items-center gap-1.5 pl-1.5 pr-2.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 active:scale-95 transition-all flex-shrink-0"
                >
                  <div className="w-7 h-7 rounded-full overflow-hidden flex items-center justify-center bg-black/40 border border-white/10">
                    <img
                      src={NIGERIAN_NETWORKS[selectedNetwork].logo}
                      alt={selectedNetwork}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <ChevronDown size={14} className="text-[#94A3B8]" />
                </button>

                <div className="w-[1px] h-6 bg-white/10 flex-shrink-0" />

                <div className="flex-1 min-w-0">
                  <input
                    type="tel"
                    className="w-full bg-transparent text-white font-medium text-[15px] placeholder:text-[#475569] focus:outline-none tracking-wide"
                    placeholder="080XXXXXXXX"
                    value={formatPhoneDisplay(phoneNumber)}
                    onChange={(e) => handlePhoneChange(e.target.value)}
                  />
                </div>

                <button
                  onClick={openContactPicker}
                  className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 active:scale-95 flex items-center justify-center text-[#94A3B8] hover:text-white flex-shrink-0 transition-colors"
                  title="Choose contact or paste"
                >
                  <User size={16} />
                </button>
              </div>

              {/* Inline phone validation */}
              {phoneNumber && (
                <div className="px-1 text-xs">
                  {!phoneValidation.isValid ? (
                    <p className="text-amber-400 flex items-center gap-1.5">
                      <AlertTriangle size={13} className="flex-shrink-0" />
                      <span>{phoneValidation.error}</span>
                    </p>
                  ) : (
                    <p className="flex items-center gap-1.5 text-xs" style={{ color: accentHex }}>
                      <CheckCircle size={13} className="flex-shrink-0" />
                      <span>Valid Nigerian number ({selectedNetwork})</span>
                    </p>
                  )}
                </div>
              )}

              {/* Data Plans Section (Image 2) */}
              <div className="liquid-glass p-5 rounded-3xl space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-white text-sm font-semibold">Data Plans</p>
                  <span className="text-xs text-[#94A3B8] font-medium">{selectedNetwork} Nigeria</span>
                </div>

                {/* Horizontal Category Tabs (Spacious, dynamically populated from integration) */}
                {planCategories.length > 1 && (
                  <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
                    {planCategories.map((tab) => {
                      const isActive = activeDataTab === tab.id
                      return (
                        <button
                          key={tab.id}
                          type="button"
                          onClick={() => setActiveDataTab(tab.id)}
                          className="shrink-0 px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all flex items-center justify-center cursor-pointer select-none active:scale-95"
                          style={{
                            color: isActive ? '#FFFFFF' : '#94A3B8',
                            background: isActive ? `rgba(${accentRgb}, 0.2)` : 'rgba(255,255,255,0.03)',
                            border: `1px solid ${isActive ? `rgba(${accentRgb}, 0.4)` : 'rgba(255,255,255,0.05)'}`,
                            boxShadow: isActive ? `0 0 12px rgba(${accentRgb}, 0.15)` : 'none',
                          }}
                        >
                          {tab.label}
                        </button>
                      )
                    })}
                  </div>
                )}

                {/* Data Bundles Grid (Image 2) - Naturally flowing, no separate inner scrollbar */}
                {plansLoading ? (
                  <div className="grid grid-cols-3 gap-2.5 py-4">
                    {Array.from({ length: 6 }, (_, i) => (
                      <div key={i} className="h-28 rounded-2xl bg-white/5 animate-pulse" />
                    ))}
                  </div>
                ) : filteredPlans.length === 0 ? (
                  <div className="py-12 text-center text-[#64748B]">
                    <p className="text-xs">No plans available in this category.</p>
                    <button
                      onClick={() => setActiveDataTab('ALL')}
                      className="text-xs font-semibold mt-2 underline"
                      style={{ color: accentHex }}
                    >
                      View all plans
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-2.5 sm:gap-3 pt-1">
                    {filteredPlans.map((plan: any) => {
                      const isSelected = selectedPlan?.code === plan.code
                      return (
                        <button
                          key={plan.code}
                          onClick={() => {
                            setSelectedPlan(plan)
                            handleProceedToPayment(plan)
                          }}
                          className="rounded-2xl p-3.5 flex flex-col items-center justify-between min-h-[114px] text-center border transition-all active:scale-95"
                          style={{
                            background: isSelected ? `rgba(${accentRgb}, 0.12)` : 'rgba(255,255,255,0.03)',
                            borderColor: isSelected ? accentHex : 'rgba(255,255,255,0.06)',
                            boxShadow: isSelected ? `0 0 16px rgba(${accentRgb}, 0.2)` : 'none',
                          }}
                        >
                          {/* Data amount in bold letters (Image 2) */}
                          <span className="font-inter font-extrabold text-white text-base sm:text-lg leading-tight mt-0.5">
                            {formatDataVolume(plan.name)}
                          </span>

                          {/* Validity in smaller text below */}
                          <span className="text-[#94A3B8] text-xs font-medium my-1.5 leading-tight">
                            {plan.validity}
                          </span>

                          {/* Price in clean box */}
                          <div className="w-full py-1 rounded-xl bg-black/40 border border-white/5">
                            <span className="text-white text-xs font-bold font-inter">
                              ₦{plan.amount?.toLocaleString()}
                            </span>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {/* ══════════════════════════════════════════════════════════════════ */}
          {/* STEP 4: WALLET CONFIRMATION */}
          {/* ══════════════════════════════════════════════════════════════════ */}
          {step === 'wallet' && (
            <motion.div key="wallet" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="space-y-4 pt-1">
              <div className="liquid-glass p-5 rounded-3xl space-y-3">
                <p className="text-[#64748B] text-xs font-bold uppercase tracking-wider">Payment Summary</p>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-[#94A3B8]">Service</span>
                    <span className="text-white font-semibold capitalize">
                      {selectedPlan ? `${selectedNetwork} Data (${formatDataVolume(selectedPlan.name)})` : `${selectedNetwork} Airtime`}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#94A3B8]">Recipient</span>
                    <span className="text-white font-medium">{formatPhoneDisplay(phoneNumber)}</span>
                  </div>
                  {selectedPlan && (
                    <div className="flex justify-between">
                      <span className="text-[#94A3B8]">Validity</span>
                      <span className="text-white font-medium">{selectedPlan.validity}</span>
                    </div>
                  )}
                  <div className="flex justify-between pt-2 border-t border-white/8 text-base">
                    <span className="text-white font-semibold">Total Amount</span>
                    <span className="font-bold" style={{ color: accentHex }}>₦{effectiveNgn.toLocaleString()}</span>
                  </div>
                </div>
              </div>

              {/* Wallet Selection */}
              <div className="liquid-glass p-5 rounded-3xl space-y-3">
                <p className="text-[#64748B] text-xs font-bold uppercase tracking-wider">Pay With</p>

                <button
                  onClick={() => {
                    if (realNgn < effectiveNgn) {
                      return toast.error('Insufficient real naira balance in your NGN wallet.')
                    }
                    setSelectedWallet('NGN')
                  }}
                  disabled={realNgn < effectiveNgn}
                  className="w-full rounded-2xl p-4 text-left border transition-all flex items-center gap-3.5 active:scale-98"
                  style={{
                    background: `rgba(${accentRgb}, 0.06)`,
                    borderColor: `rgba(${accentRgb}, 0.3)`,
                  }}
                >
                  <div
                    className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0"
                    style={{ background: `rgba(${accentRgb}, 0.15)`, border: `1px solid rgba(${accentRgb}, 0.25)` }}
                  >
                    <Landmark size={20} style={{ color: accentHex }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-bold text-sm">
                      NGN Wallet <span className="text-xs font-medium" style={{ color: accentHex }}>· Real money</span>
                    </p>
                    <p className="text-[#94A3B8] text-xs mt-0.5">
                      Available: <span className="text-white font-bold">₦{realNgn.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                    </p>
                  </div>
                  <ChevronRight size={18} style={{ color: accentHex }} />
                </button>

                {realNgn < effectiveNgn && (
                  <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-start gap-2.5">
                    <AlertCircle size={15} className="text-amber-400 flex-shrink-0 mt-0.5" />
                    <p className="text-amber-300 text-xs leading-snug">
                      Insufficient real naira balance. Please fund your NGN wallet via bank transfer on the Receive page.
                    </p>
                  </div>
                )}
              </div>

              <button
                onClick={handleConfirmPayment}
                disabled={realNgn < effectiveNgn || biometricBusy}
                className="w-full py-4 rounded-2xl font-bold text-black text-sm disabled:opacity-40 active:scale-98 transition-transform"
                style={{ background: colors.gradientBg }}
              >
                {biometricBusy
                  ? <span className="inline-flex items-center justify-center gap-2"><Loader2 size={16} className="animate-spin" /> Authenticating…</span>
                  : 'Continue'
                }
              </button>
              {!biometricBusy && (
                <p className="text-center text-[#64748B] text-[11px] mt-2 flex items-center justify-center gap-1.5">
                  <span className="text-base leading-none">👆</span> Verify with Face ID / fingerprint, or use your PIN if you prefer.
                </p>
              )}
            </motion.div>
          )}

          {/* ══════════════════════════════════════════════════════════════════ */}
          {/* STEP 5: PIN & BIOMETRICS (fixed overlay — never scrolls) */}
          {/* ══════════════════════════════════════════════════════════════════ */}
          {step === 'pin' && !processing && (
            <motion.div
              key="pin"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-x-0 top-0 z-[60] flex items-center justify-center bg-black/85 backdrop-blur-sm px-5 h-[100dvh]"
            >
              <div className="w-full max-w-sm mx-auto rounded-3xl border border-white/10 bg-[#0C0E13]/95 p-5 sm:p-6 shadow-2xl text-center overflow-hidden">
                <div className="flex items-center justify-between mb-2">
                  <button
                    type="button"
                    onClick={() => setStep('wallet')}
                    className="w-9 h-9 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center text-[#94A3B8] active:scale-95 transition-transform"
                    aria-label="Cancel payment"
                  >
                    <ArrowLeft size={18} />
                  </button>
                  <span className="text-[10px] text-[#64748B] font-bold uppercase tracking-widest">
                    Secure · PIN
                  </span>
                </div>

                <div
                  className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl border mx-auto mb-2 flex items-center justify-center text-xl sm:text-2xl"
                  style={{ background: `rgba(${accentRgb}, 0.12)`, borderColor: `rgba(${accentRgb}, 0.25)` }}
                >
                  🔐
                </div>
                <h3 className="text-white font-bold text-lg">Transaction PIN</h3>
                <p className="text-[#94A3B8] text-xs mt-1 mb-4 sm:mb-5">
                  Enter your 4-digit PIN to authorize ₦{effectiveNgn.toLocaleString()} payment
                </p>

                <PinPad onComplete={executePurchase} accentHex={accentHex} accentRgb={accentRgb} />

                <div className="flex items-center gap-3 my-4 max-w-xs mx-auto">
                  <div className="flex-1 h-px bg-white/10" />
                  <span className="text-[10px] text-[#64748B] uppercase tracking-wider">or</span>
                  <div className="flex-1 h-px bg-white/10" />
                </div>

                <div className="max-w-xs mx-auto">
                  <BiometricApproveButton
                    onApproved={(token) => executePurchase(undefined, token)}
                    accentHex={accentHex}
                    accentRgb={accentRgb}
                    disabled={processing}
                  />
                </div>
              </div>
            </motion.div>
          )}

          {/* Processing (fixed overlay — never scrolls) */}
          {step === 'pin' && processing && (
            <motion.div
              key="processing"
              className="fixed inset-x-0 top-0 z-[60] flex flex-col items-center justify-center text-center bg-black/85 backdrop-blur-sm px-5 h-[100dvh]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              <div className="w-full max-w-sm mx-auto rounded-3xl border border-white/10 bg-[#0C0E13]/95 p-8 sm:p-10 shadow-2xl">
                <Loader2 size={42} className="animate-spin mb-4 mx-auto" style={{ color: accentHex }} />
                <h3 className="text-white font-bold text-base">Processing Order</h3>
                <p className="text-[#64748B] text-xs mt-1">
                  Delivering to {formatPhoneDisplay(phoneNumber)}...
                </p>
              </div>
            </motion.div>
          )}

          {/* ══════════════════════════════════════════════════════════════════ */}
          {/* STEP 6: SUCCESS */}
          {/* ══════════════════════════════════════════════════════════════════ */}
          {step === 'success' && (
            <motion.div key="success" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="py-8 text-center space-y-4">
              <div className="w-20 h-20 rounded-3xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center mx-auto text-emerald-400">
                <CheckCircle size={44} />
              </div>

              <div>
                <h2 className="text-white font-bold text-2xl">Recharge Successful!</h2>
                <p className="text-[#94A3B8] text-xs mt-1">
                  {selectedPlan
                    ? `${formatDataVolume(selectedPlan.name)} ${selectedNetwork} data bundle delivered`
                    : `₦${amount} ${selectedNetwork} airtime credited`}
                </p>
                <p className="text-white font-medium text-sm mt-0.5">{formatPhoneDisplay(phoneNumber)}</p>
              </div>

              {result?.reference && (
                <div className="bg-[#12141A] rounded-2xl p-3 border border-white/8 inline-block max-w-xs text-xs text-[#64748B]">
                  Reference: <span className="text-white font-mono">{result.reference}</span>
                </div>
              )}

              <div className="pt-4 grid grid-cols-2 gap-3 max-w-xs mx-auto">
                <button
                  onClick={reset}
                  className="py-3.5 rounded-2xl text-xs font-bold text-white bg-white/10 active:scale-95"
                >
                  Done
                </button>
                <button
                  onClick={() => router.push('/app/dashboard')}
                  className="py-3.5 rounded-2xl text-xs font-bold text-black active:scale-95"
                  style={{ background: colors.gradientBg }}
                >
                  Dashboard
                </button>
              </div>
            </motion.div>
          )}

          {/* ══════════════════════════════════════════════════════════════════ */}
          {/* STEP 7: FAILED (With Detailed Provider Error Diagnostics) */}
          {/* ══════════════════════════════════════════════════════════════════ */}
          {step === 'failed' && (
            <motion.div key="failed" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="py-8 text-center space-y-4">
              <div className="w-20 h-20 rounded-3xl bg-red-500/15 border border-red-500/30 flex items-center justify-center mx-auto text-red-400">
                <AlertCircle size={44} />
              </div>

              <div>
                <h2 className="text-white font-bold text-2xl">Payment Could Not Complete</h2>
                <p className="text-[#94A3B8] text-xs mt-1">Your wallet was not charged.</p>
              </div>

              <div className="bg-red-500/10 border border-red-500/25 rounded-2xl p-4 max-w-sm mx-auto text-left">
                <div className="flex items-start gap-2.5">
                  <AlertCircle size={16} className="text-red-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-red-300 text-xs font-semibold">Reason:</p>
                    <p className="text-red-200 text-xs mt-0.5 leading-relaxed font-mono">
                      {errorMessage || 'Unknown telecom provider error. Please verify your phone number and network.'}
                    </p>
                  </div>
                </div>
              </div>

              <div className="pt-2 grid grid-cols-2 gap-3 max-w-xs mx-auto">
                <button
                  onClick={() => setStep(selectedPlan ? 'data' : 'airtime')}
                  className="py-3.5 rounded-2xl text-xs font-bold text-white bg-white/10 active:scale-95"
                >
                  Edit Number
                </button>
                <button
                  onClick={() => executePurchase()}
                  className="py-3.5 rounded-2xl text-xs font-bold text-black active:scale-95"
                  style={{ background: colors.gradientBg }}
                >
                  Try Again
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── NETWORK SELECTOR MODAL / SHEET ── */}
      {networkModalOpen && (
        <div
          className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm p-0 sm:p-4"
          onClick={() => setNetworkModalOpen(false)}
        >
          <div
            className="liquid-glass-strong w-full max-w-sm rounded-t-[28px] sm:rounded-3xl p-5 pb-10 sm:pb-5 space-y-4 max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Mobile Sheet Drag Handle */}
            <div className="w-10 h-1 rounded-full bg-white/20 mx-auto sm:hidden -mt-1 mb-1" />

            <div className="flex items-center justify-between pb-2 border-b border-white/8">
              <h3 className="text-white font-bold text-base">Select Network</h3>
              <button
                type="button"
                onClick={() => setNetworkModalOpen(false)}
                className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-[#94A3B8] hover:text-white"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-2">
              {Object.values(NIGERIAN_NETWORKS).map((net) => {
                const isSelected = selectedNetwork === net.code
                return (
                  <button
                    key={net.code}
                    type="button"
                    onClick={() => {
                      changeNetwork(net.code)
                      setNetworkModalOpen(false)
                    }}
                    className="w-full p-3.5 rounded-2xl border flex items-center gap-3.5 text-left transition-all active:scale-98"
                    style={{
                      background: isSelected ? `rgba(${accentRgb}, 0.12)` : 'rgba(255,255,255,0.03)',
                      borderColor: isSelected ? accentHex : 'rgba(255,255,255,0.06)',
                    }}
                  >
                    <div className="w-9 h-9 rounded-xl overflow-hidden flex items-center justify-center bg-black/50 border border-white/10">
                      <img src={net.logo} alt={net.name} className="w-full h-full object-cover" />
                    </div>
                    <div className="flex-1">
                      <p className="text-white font-semibold text-sm">{net.name}</p>
                      <p className="text-[#64748B] text-[11px]">{net.prefixes.slice(0, 4).join(', ')}...</p>
                    </div>
                    {isSelected && <Check size={18} style={{ color: accentHex }} />}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── CONTACT / RECENT NUMBERS MODAL ── */}
      {contactModalOpen && (
        <div
          className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm p-0 sm:p-4"
          onClick={() => setContactModalOpen(false)}
        >
          <div
            className="liquid-glass-strong w-full max-w-sm rounded-t-[28px] sm:rounded-3xl p-5 pb-10 sm:pb-5 space-y-4 max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Mobile Sheet Drag Handle */}
            <div className="w-10 h-1 rounded-full bg-white/20 mx-auto sm:hidden -mt-1 mb-1" />

            <div className="flex items-center justify-between pb-2 border-b border-white/8">
              <h3 className="text-white font-bold text-base">Select Recipient</h3>
              <button
                type="button"
                onClick={() => setContactModalOpen(false)}
                className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-[#94A3B8] hover:text-white"
              >
                <X size={16} />
              </button>
            </div>

            <button
              type="button"
              onClick={async () => {
                try {
                  const text = await navigator.clipboard.readText()
                  if (text) {
                    handlePhoneChange(text)
                    setContactModalOpen(false)
                    toast.success('Pasted from clipboard')
                  }
                } catch {
                  toast.error('Clipboard permission denied')
                }
              }}
              className="w-full p-3 rounded-2xl bg-white/5 border border-white/8 text-left text-xs font-semibold flex items-center justify-between"
              style={{ color: accentHex }}
            >
              <span>Paste from clipboard</span>
              <Sparkles size={15} />
            </button>

            <div className="space-y-1.5">
              <p className="text-[#64748B] text-[11px] font-bold uppercase tracking-wider px-1">
                Recent Numbers
              </p>
              {recentNumbers.length === 0 ? (
                <p className="text-[#64748B] text-xs px-1 py-3">No recent recipients yet</p>
              ) : (
                recentNumbers.map((num) => (
                  <button
                    key={num}
                    type="button"
                    onClick={() => {
                      handlePhoneChange(num)
                      setContactModalOpen(false)
                    }}
                    className="w-full p-3 rounded-xl bg-white/[0.03] border border-white/5 text-left flex items-center justify-between active:scale-98 transition-transform"
                  >
                    <div className="flex items-center gap-2.5">
                      <Clock size={14} className="text-[#64748B]" />
                      <span className="text-white font-mono text-xs">{formatPhoneDisplay(num)}</span>
                    </div>
                    <span className="text-[10px] text-[#64748B]">
                      {detectNetworkFromPhone(num) || ''}
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── COMING SOON MODAL ── */}
      <ComingSoon
        open={!!comingSoonCategory}
        onClose={() => setComingSoonCategory(null)}
        title={COMING_SOON_COPY[comingSoonCategory || 'electricity']?.title || 'Coming soon'}
        subtitle={COMING_SOON_COPY[comingSoonCategory || 'electricity']?.subtitle || 'This category is not live yet.'}
        features={COMING_SOON_COPY[comingSoonCategory || 'electricity']?.features || []}
        eta={COMING_SOON_COPY[comingSoonCategory || 'electricity']?.eta}
        notifyEmail="support@surexend.com"
      />
    </div>
  )
}
