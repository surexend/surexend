'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useTheme } from '@/context/ThemeContext'
import { useRouter, useSearchParams } from 'next/navigation'
import { billsAPI, walletAPI } from '@/lib/api'
import { useQuery } from '@tanstack/react-query'
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

// ── Service Categories ──────────────────────────────────────────────────────
const CATEGORIES = [
  { type: 'airtime', label: 'Airtime', icon: Smartphone, badge: 'Instant' },
  { type: 'data', label: 'Data', icon: Wifi, badge: 'Popular' },
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

// ── Data Plan Categories (Matching Image 2) ────────────────────────────────
const DATA_TABS = [
  { id: 'HOT', label: 'HOT' },
  { id: 'Daily', label: 'Daily' },
  { id: 'Weekly', label: 'Weekly' },
  { id: 'Monthly', label: 'Monthly' },
  { id: 'Extra Night', label: 'Extra Night' },
  { id: 'Broadband', label: 'Broadband' },
  { id: 'ALL', label: 'All' },
]

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
      <div className="flex justify-center gap-3 mb-7">
        {Array.from({ length: 4 }, (_, i) => (
          <div
            key={i}
            className="w-4 h-4 rounded-full border-2 transition-all duration-150"
            style={
              i < pin.length
                ? { background: accentHex, borderColor: accentHex, transform: 'scale(1.15)' }
                : { borderColor: 'rgba(255,255,255,0.2)', background: 'transparent' }
            }
          />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-3 max-w-xs mx-auto">
        {keys.map((k, i) => (
          <button
            key={i}
            disabled={!k}
            className="h-14 rounded-2xl text-xl font-semibold disabled:opacity-0 active:scale-95 transition-transform"
            style={
              k && k !== '⌫'
                ? { background: '#181B22', color: '#fff', border: '1px solid rgba(255,255,255,0.06)' }
                : { background: 'transparent', color: '#94A3B8' }
            }
            onClick={() => k && tap(k)}
          >
            {k}
          </button>
        ))}
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════
// MAIN BILLS PAGE COMPONENT
// ══════════════════════════════════════════════════════════════════════════

export default function BillsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { variant, colors } = useTheme()
  const isGold = variant === 'gold'
  const accentRgb = isGold ? '212, 160, 23' : '181, 226, 61'
  const accentHex = isGold ? '#D4A017' : '#B5E23D'

  // View state: 'categories' | 'airtime' | 'data' | 'wallet' | 'pin' | 'success' | 'failed'
  const [view, setView] = useState<'categories' | 'airtime' | 'data' | 'wallet' | 'pin' | 'success' | 'failed'>('categories')
  const [selectedNetwork, setSelectedNetwork] = useState<NetworkCode>('MTN')
  const [isPorted, setIsPorted] = useState(false)
  const [phoneNumber, setPhoneNumber] = useState('')
  const [amount, setAmount] = useState('')
  const [selectedPreset, setSelectedPreset] = useState<number | null>(null)
  const [selectedPlan, setSelectedPlan] = useState<any>(null)
  const [activeDataTab, setActiveDataTab] = useState('HOT')
  const [networkModalOpen, setNetworkModalOpen] = useState(false)
  const [contactModalOpen, setContactModalOpen] = useState(false)
  const [recentNumbers, setRecentNumbers] = useState<string[]>([])
  const [comingSoonCategory, setComingSoonCategory] = useState<string | null>(null)

  // Transaction execution states
  const [selectedWallet, setSelectedWallet] = useState<'NGN' | 'USD' | null>('NGN')
  const [processing, setProcessing] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [errorMessage, setErrorMessage] = useState<string>('')

  // Load recent numbers from storage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem('surexend_recent_phone_recipients')
      if (saved) {
        setRecentNumbers(JSON.parse(saved).slice(0, 5))
      }
    } catch { /* ignore */ }
  }, [])

  // Auto-open specific category from query parameter if provided (e.g. /app/bills?type=airtime)
  useEffect(() => {
    const type = searchParams.get('type') || searchParams.get('tab')
    if (type === 'airtime') setView('airtime')
    else if (type === 'data') setView('data')
  }, [searchParams])

  // Save recipient to recent storage on success
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
    view !== 'categories' || !!comingSoonCategory || networkModalOpen || contactModalOpen,
    useCallback(() => {
      if (networkModalOpen) setNetworkModalOpen(false)
      else if (contactModalOpen) setContactModalOpen(false)
      else if (comingSoonCategory) setComingSoonCategory(null)
      else if (view === 'pin') setView('wallet')
      else if (view === 'wallet') setView(selectedPlan ? 'data' : 'airtime')
      else if (view === 'airtime' || view === 'data') setView('categories')
      else reset()
    }, [view, comingSoonCategory, networkModalOpen, contactModalOpen, selectedPlan]),
    30
  )

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
    enabled: view === 'airtime',
  })

  // Data plans query
  const { data: rawPlans, isLoading: plansLoading } = useQuery({
    queryKey: ['data-plans', selectedNetwork],
    queryFn: () => billsAPI.getDataPlans(selectedNetwork),
    enabled: view === 'data',
  })

  // Format and group data plans
  const parsedPlans = useMemo(() => {
    if (!rawPlans || !Array.isArray(rawPlans)) return []

    return rawPlans.map((plan: any) => {
      const rawName = String(plan.name || '')
      const validity = String(plan.validity || '30 Days')
      const amount = Number(plan.amount || 0)

      // Clean display volume (e.g., '1.0 GB' -> '1 GB', '500MB' -> '500 MB')
      let volume = rawName
      const match = rawName.match(/(\d+(?:\.\d+)?)\s*(GB|MB|TB)/i)
      if (match) {
        const num = parseFloat(match[1])
        const unit = match[2].toUpperCase()
        volume = `${num % 1 === 0 ? num : num.toFixed(1)} ${unit}`
      }

      // Assign category tags
      const vLower = validity.toLowerCase()
      const nLower = rawName.toLowerCase()

      const isNight = nLower.includes('night') || nLower.includes('midnight') || vLower.includes('night')
      const isBroadband = nLower.includes('broadband') || nLower.includes('router') || (match && match[2].toUpperCase() === 'GB' && parseFloat(match[1]) >= 25)
      const isDaily = (vLower.includes('day') && !vLower.includes('7') && !vLower.includes('14') && !vLower.includes('30')) || vLower.includes('1 day') || vLower.includes('2 day') || vLower.includes('3 day')
      const isWeekly = vLower.includes('week') || vLower.includes('7 day') || vLower.includes('14 day')
      const isMonthly = vLower.includes('month') || vLower.includes('30 day') || vLower.includes('60 day') || vLower.includes('90 day')

      // HOT flag for popular bundles
      const isHot =
        (volume === '1 GB' && (isDaily || isWeekly)) ||
        (volume === '2.5 GB') ||
        (volume === '500 MB') ||
        (volume === '3.5 GB') ||
        (volume === '2 GB' && isMonthly) ||
        (volume === '7 GB') ||
        (volume === '10 GB')

      return {
        ...plan,
        displayVolume: volume,
        displayValidity: validity,
        amount,
        isHot,
        isDaily,
        isWeekly,
        isMonthly,
        isNight,
        isBroadband,
      }
    })
  }, [rawPlans])

  // Filter plans based on active tab
  const filteredPlans = useMemo(() => {
    if (!parsedPlans.length) return []
    if (activeDataTab === 'ALL') return parsedPlans
    if (activeDataTab === 'HOT') {
      const hot = parsedPlans.filter((p) => p.isHot)
      return hot.length >= 3 ? hot : parsedPlans.slice(0, 9)
    }
    if (activeDataTab === 'Daily') return parsedPlans.filter((p) => p.isDaily)
    if (activeDataTab === 'Weekly') return parsedPlans.filter((p) => p.isWeekly)
    if (activeDataTab === 'Monthly') return parsedPlans.filter((p) => p.isMonthly)
    if (activeDataTab === 'Extra Night') return parsedPlans.filter((p) => p.isNight)
    if (activeDataTab === 'Broadband') return parsedPlans.filter((p) => p.isBroadband)
    return parsedPlans
  }, [parsedPlans, activeDataTab])

  // Phone validation status
  const phoneValidation = useMemo(() => {
    return validateNigerianPhone(phoneNumber, selectedNetwork, isPorted)
  }, [phoneNumber, selectedNetwork, isPorted])

  // Auto-detect network when typing phone number
  const handlePhoneChange = (val: string) => {
    setPhoneNumber(val)
    const detected = detectNetworkFromPhone(val)
    if (detected && detected !== selectedNetwork && !isPorted) {
      setSelectedNetwork(detected)
    }
  }

  // Contact Picker API or fallback modal
  const openContactPicker = async () => {
    if (typeof window !== 'undefined' && 'contacts' in navigator && 'ContactsManager' in window) {
      try {
        const contacts = await (navigator as any).contacts.select(['tel'], { multiple: false })
        if (contacts && contacts[0]?.tel?.[0]) {
          handlePhoneChange(contacts[0].tel[0])
          return
        }
      } catch {
        // Fallback to in-app contact modal
      }
    }
    setContactModalOpen(true)
  }

  // Effective NGN price
  const effectiveNgn = useMemo(() => {
    if (view === 'data' && selectedPlan) {
      return selectedPlan.amount || 0
    }
    return parseFloat(amount) || 0
  }, [view, selectedPlan, amount])

  // Proceed to wallet picker
  const handleProceedToPayment = () => {
    if (!phoneNumber) {
      return toast.error('Please enter a phone number')
    }
    if (!phoneValidation.isValid) {
      return toast.error(phoneValidation.error || 'Please enter a valid 11-digit Nigerian phone number')
    }
    if (view === 'airtime') {
      const amt = parseFloat(amount)
      if (!amt || amt < 50) {
        return toast.error('Minimum airtime amount is ₦50')
      }
      if (amt > 500000) {
        return toast.error('Maximum airtime amount is ₦500,000')
      }
    } else if (view === 'data' && !selectedPlan) {
      return toast.error('Please select a data bundle')
    }

    setView('wallet')
  }

  // Execute purchase with PIN or Biometrics
  const executePurchase = async (pin?: string, passkeyToken?: string) => {
    setProcessing(true)
    setErrorMessage('')
    setView('pin')

    try {
      const payload: any = {
        type: view === 'data' ? 'data' : 'airtime',
        provider: selectedNetwork,
        recipient: phoneValidation.normalized || phoneNumber,
        pin,
        passkeyToken,
        portedNumber: isPorted,
      }

      if (view === 'data' && selectedPlan) {
        payload.planCode = selectedPlan.code
        payload.amount = selectedPlan.amount
      } else {
        payload.amount = parseFloat(amount)
      }

      const res = await billsAPI.purchase(payload)
      setResult(res)
      saveRecentNumber(payload.recipient)
      setView('success')
    } catch (err: any) {
      const msg =
        err?.response?.data?.message ||
        err?.message ||
        'Purchase could not be processed. Your wallet was not charged.'
      setErrorMessage(msg)
      toast.error(msg)
      setView('failed')
    } finally {
      setProcessing(false)
    }
  }

  const reset = () => {
    setView('categories')
    setAmount('')
    setSelectedPreset(null)
    setSelectedPlan(null)
    setResult(null)
    setErrorMessage('')
  }

  return (
    <div className="min-h-screen bg-[#000000] text-white pb-28 select-none">
      {/* ── TOP HEADER ── */}
      <div className="sticky top-0 z-30 bg-[#000000]/95 border-b border-white/8">
        <div className="max-w-md mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            {view !== 'categories' ? (
              <button
                onClick={() => {
                  if (view === 'pin') setView('wallet')
                  else if (view === 'wallet') setView(selectedPlan ? 'data' : 'airtime')
                  else if (view === 'success' || view === 'failed') reset()
                  else setView('categories')
                }}
                className="w-9 h-9 rounded-xl bg-white/5 flex items-center justify-center active:scale-95 transition-transform"
                aria-label="Back"
              >
                <ArrowLeft size={18} className="text-white" />
              </button>
            ) : null}

            <h1 className="font-bold text-base tracking-tight text-white">
              {view === 'categories' && 'Pay Bills'}
              {view === 'airtime' && 'Airtime'}
              {view === 'data' && 'Mobile Data'}
              {view === 'wallet' && 'Confirm Payment'}
              {view === 'pin' && 'Enter PIN'}
              {view === 'success' && 'Payment Receipt'}
              {view === 'failed' && 'Payment Failed'}
            </h1>
          </div>

          {/* History link matching Image 1 & 2 */}
          <button
            onClick={() => router.push('/app/history?filter=BILL_PAYMENT')}
            className="text-xs font-semibold text-[#10B981] hover:underline px-2 py-1"
          >
            History
          </button>
        </div>
      </div>

      <div className="max-w-md mx-auto px-4 pt-3">
        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* VIEW 1: CATEGORIES OVERVIEW */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        {view === 'categories' && (
          <div>
            <div className="bg-[#12141A] rounded-3xl p-5 border border-white/8 mb-5">
              <p className="text-[#64748B] text-[11px] font-bold uppercase tracking-widest mb-4 px-1">
                Utilities & Services
              </p>
              <div className="grid grid-cols-4 gap-y-6 gap-x-2">
                {CATEGORIES.map((cat) => {
                  const Icon = cat.icon
                  const isLive = LIVE_CATEGORIES.has(cat.type)
                  return (
                    <button
                      key={cat.type}
                      className="flex flex-col items-center gap-2 group text-center active:scale-95 transition-transform"
                      onClick={() => {
                        if (cat.type === 'airtime') setView('airtime')
                        else if (cat.type === 'data') setView('data')
                        else setComingSoonCategory(cat.type)
                      }}
                    >
                      <div className="relative">
                        <div className="w-13 h-13 rounded-2xl bg-[#1A1E26] border border-white/8 flex items-center justify-center group-hover:border-white/20 transition-colors">
                          <Icon size={22} className="text-white" />
                        </div>
                        {isLive && cat.badge && (
                          <span className="absolute -top-1.5 -right-2 px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-[#10B981] text-black">
                            {cat.badge}
                          </span>
                        )}
                        {!isLive && (
                          <span className="absolute -top-1.5 -right-2 px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-[#1A1E26] border border-white/15 text-[#94A3B8]">
                            Soon
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] font-medium text-[#94A3B8] group-hover:text-white transition-colors line-clamp-1">
                        {cat.label}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Quick Recharge Promo Card */}
            <div className="bg-[#12141A] rounded-3xl p-5 border border-white/8 flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center flex-shrink-0">
                <Zap className="w-6 h-6" />
              </div>
              <div className="flex-1">
                <h4 className="font-semibold text-white text-sm">Instant Delivery</h4>
                <p className="text-[#64748B] text-xs leading-relaxed mt-0.5">
                  Top up Airtime & Data directly with real naira from your bank-funded wallet.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* VIEW 2: AIRTIME & DATA (Unified Network & Phone Input Bar) */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        {(view === 'airtime' || view === 'data') && (
          <div className="space-y-4">
            {/* ── Network Switcher + Phone Number Input Bar (Matching Image 1 & 2) ── */}
            <div className="bg-[#14171E] rounded-2xl p-2 border border-white/10 flex items-center gap-2">
              {/* Network Dropdown Selector */}
              <button
                onClick={() => setNetworkModalOpen(true)}
                className="flex items-center gap-1.5 pl-1 pr-2 py-1 rounded-xl bg-white/5 hover:bg-white/10 active:scale-95 transition-all flex-shrink-0"
              >
                <div className="w-7 h-7 rounded-full overflow-hidden flex items-center justify-center bg-black/40 border border-white/15">
                  <img
                    src={NIGERIAN_NETWORKS[selectedNetwork].logo}
                    alt={selectedNetwork}
                    className="w-full h-full object-cover"
                  />
                </div>
                <ChevronDown size={14} className="text-[#94A3B8]" />
              </button>

              {/* Vertical divider */}
              <div className="w-[1px] h-6 bg-white/15 flex-shrink-0" />

              {/* Phone number input */}
              <div className="flex-1 min-w-0">
                <input
                  type="tel"
                  className="w-full bg-transparent text-white font-medium text-[15px] placeholder:text-[#475569] focus:outline-none tracking-wide"
                  placeholder="080XXXXXXXX"
                  value={formatPhoneDisplay(phoneNumber)}
                  onChange={(e) => handlePhoneChange(e.target.value)}
                />
              </div>

              {/* Contact Picker / History Icon */}
              <button
                onClick={openContactPicker}
                className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 active:scale-95 flex items-center justify-center text-[#94A3B8] hover:text-white flex-shrink-0 transition-colors"
                title="Choose contact or paste"
              >
                <User size={16} />
              </button>
            </div>

            {/* Inline validation / network mismatch warning */}
            {phoneNumber && (
              <div className="px-1 text-xs">
                {!phoneValidation.isValid ? (
                  <p className="text-amber-400 flex items-center gap-1.5">
                    <AlertTriangle size={13} className="flex-shrink-0" />
                    <span>{phoneValidation.error}</span>
                  </p>
                ) : phoneValidation.isMismatch ? (
                  <div className="flex items-center justify-between text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2">
                    <span className="text-[11px] leading-tight">{phoneValidation.warning}</span>
                    <button
                      onClick={() => {
                        if (phoneValidation.detectedNetwork) {
                          setSelectedNetwork(phoneValidation.detectedNetwork)
                        }
                      }}
                      className="ml-2 text-[10px] font-bold text-amber-400 underline flex-shrink-0"
                    >
                      Switch
                    </button>
                  </div>
                ) : (
                  <p className="text-emerald-400 flex items-center gap-1.5">
                    <CheckCircle size={13} className="flex-shrink-0" />
                    <span>Valid {selectedNetwork} number</span>
                    {isPorted && <span className="text-[#94A3B8] text-[10px]">(Ported)</span>}
                  </p>
                )}
              </div>
            )}

            {/* ── AIRTIME PAGE: 6 Preset Boxes + Custom Amount + Pay Button ── */}
            {view === 'airtime' && (
              <div className="bg-[#12141A] rounded-3xl p-4 border border-white/8 space-y-4">
                <p className="text-white text-sm font-semibold">Top up</p>

                {/* 6 Preset boxes (Image 1) */}
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
                          background: isSelected ? 'rgba(16,185,129,0.12)' : '#181B22',
                          borderColor: isSelected ? '#10B981' : 'rgba(255,255,255,0.06)',
                        }}
                      >
                        <span className="text-white font-bold text-base tracking-tight">
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

                    {/* Pay Button */}
                    <button
                      onClick={handleProceedToPayment}
                      disabled={!amount || parseFloat(amount) < 50 || !phoneValidation.isValid}
                      className="px-6 py-3.5 rounded-2xl font-bold text-black text-sm disabled:opacity-40 active:scale-95 transition-all shadow-md flex-shrink-0"
                      style={{ background: '#10B981' }}
                    >
                      Pay
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ── DATA PAGE: Category Tabs + Bundle Grid (Image 2) ── */}
            {view === 'data' && (
              <div className="bg-[#12141A] rounded-3xl p-4 border border-white/8 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-white text-sm font-semibold">Data Plans</p>
                  <span className="text-[11px] text-[#94A3B8] font-medium">{selectedNetwork}</span>
                </div>

                {/* Horizontal Category Tabs (Image 2) */}
                <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
                  {DATA_TABS.map((tab) => {
                    const isActive = activeDataTab === tab.id
                    return (
                      <button
                        key={tab.id}
                        onClick={() => setActiveDataTab(tab.id)}
                        className="px-3.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all flex flex-col items-center gap-1"
                        style={{
                          color: isActive ? '#10B981' : '#94A3B8',
                          background: isActive ? 'rgba(16,185,129,0.08)' : 'transparent',
                        }}
                      >
                        <span>{tab.label}</span>
                        {isActive && <div className="w-4 h-0.5 bg-[#10B981] rounded-full" />}
                      </button>
                    )
                  })}
                </div>

                {/* Data Bundles Grid (Image 2) */}
                {plansLoading ? (
                  <div className="grid grid-cols-3 gap-2.5 py-4">
                    {Array.from({ length: 6 }, (_, i) => (
                      <div key={i} className="h-28 rounded-2xl bg-white/5 animate-pulse" />
                    ))}
                  </div>
                ) : filteredPlans.length === 0 ? (
                  <div className="py-12 text-center text-[#64748B]">
                    <p className="text-xs">No plans found in this category.</p>
                    <button
                      onClick={() => setActiveDataTab('ALL')}
                      className="text-xs font-semibold text-emerald-400 mt-2 underline"
                    >
                      View all plans
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-2.5 max-h-[58vh] overflow-y-auto pr-1">
                    {filteredPlans.map((plan: any) => {
                      const isSelected = selectedPlan?.code === plan.code
                      return (
                        <button
                          key={plan.code}
                          onClick={() => {
                            setSelectedPlan(plan)
                            handleProceedToPayment()
                          }}
                          className="rounded-2xl p-2.5 flex flex-col items-center justify-between min-h-[108px] text-center border transition-all active:scale-95"
                          style={{
                            background: isSelected ? 'rgba(16,185,129,0.12)' : '#181B22',
                            borderColor: isSelected ? '#10B981' : 'rgba(255,255,255,0.06)',
                          }}
                        >
                          {/* Data amount in bold letters (Image 2) */}
                          <span className="font-extrabold text-white text-base leading-tight mt-1">
                            {plan.displayVolume}
                          </span>

                          {/* Validity in smaller text below */}
                          <span className="text-[#94A3B8] text-[10px] leading-tight my-1">
                            {plan.displayValidity}
                          </span>

                          {/* Price badge in box */}
                          <div className="w-full py-1 rounded-lg bg-black/40 border border-white/5">
                            <span className="text-white text-xs font-bold">
                              ₦{plan.amount?.toLocaleString()}
                            </span>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* VIEW 3: WALLET CONFIRMATION */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        {view === 'wallet' && (
          <div className="space-y-4 pt-2">
            <div className="bg-[#12141A] rounded-3xl p-5 border border-white/8 space-y-3">
              <p className="text-[#64748B] text-xs font-bold uppercase tracking-wider">Payment Summary</p>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-[#94A3B8]">Service</span>
                  <span className="text-white font-semibold capitalize">
                    {selectedPlan ? `${selectedNetwork} Data (${selectedPlan.displayVolume})` : `${selectedNetwork} Airtime`}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#94A3B8]">Recipient</span>
                  <span className="text-white font-medium">{formatPhoneDisplay(phoneNumber)}</span>
                </div>
                {selectedPlan && (
                  <div className="flex justify-between">
                    <span className="text-[#94A3B8]">Validity</span>
                    <span className="text-white font-medium">{selectedPlan.displayValidity}</span>
                  </div>
                )}
                <div className="flex justify-between pt-2 border-t border-white/8 text-base">
                  <span className="text-white font-semibold">Total Amount</span>
                  <span className="text-emerald-400 font-bold">₦{effectiveNgn.toLocaleString()}</span>
                </div>
              </div>
            </div>

            {/* Wallet Selection */}
            <div className="bg-[#12141A] rounded-3xl p-5 border border-white/8 space-y-3">
              <p className="text-[#64748B] text-xs font-bold uppercase tracking-wider">Pay With</p>

              <button
                onClick={() => {
                  setSelectedWallet('NGN')
                  setView('pin')
                }}
                className="w-full rounded-2xl p-4 text-left border transition-all flex items-center gap-3.5 active:scale-98"
                style={{
                  background: 'rgba(16,185,129,0.06)',
                  borderColor: 'rgba(16,185,129,0.3)',
                }}
              >
                <div className="w-11 h-11 rounded-2xl bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center flex-shrink-0">
                  <Landmark size={20} className="text-emerald-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white font-bold text-sm">NGN Wallet <span className="text-emerald-400 text-xs">· Real money</span></p>
                  <p className="text-[#94A3B8] text-xs mt-0.5">
                    Available: <span className="text-white font-bold">₦{realNgn.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                  </p>
                </div>
                <ChevronRight size={18} className="text-emerald-400" />
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
              onClick={() => {
                if (realNgn < effectiveNgn) {
                  return toast.error('Insufficient real naira balance in your NGN wallet.')
                }
                setView('pin')
              }}
              disabled={realNgn < effectiveNgn}
              className="w-full py-4 rounded-2xl font-bold text-black text-sm disabled:opacity-40 active:scale-98 transition-transform"
              style={{ background: '#10B981' }}
            >
              Continue to PIN
            </button>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* VIEW 4: PIN PAD & BIOMETRICS */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        {view === 'pin' && !processing && (
          <div className="pt-2 text-center">
            <div className="w-14 h-14 rounded-2xl bg-white/5 border border-white/10 mx-auto mb-3 flex items-center justify-center text-2xl">
              🔐
            </div>
            <h3 className="text-white font-bold text-lg">Transaction PIN</h3>
            <p className="text-[#64748B] text-xs mt-1 mb-6">
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
        )}

        {/* Processing state */}
        {view === 'pin' && processing && (
          <div className="py-24 flex flex-col items-center justify-center text-center">
            <Loader2 size={42} className="animate-spin text-[#10B981] mb-4" />
            <h3 className="text-white font-bold text-base">Processing Order</h3>
            <p className="text-[#64748B] text-xs mt-1">
              Delivering {selectedPlan ? selectedPlan.displayVolume : `₦${effectiveNgn}`} to {formatPhoneDisplay(phoneNumber)}...
            </p>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* VIEW 5: SUCCESS */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        {view === 'success' && (
          <div className="py-8 text-center space-y-4">
            <div className="w-20 h-20 rounded-3xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center mx-auto text-emerald-400">
              <CheckCircle size={44} />
            </div>

            <div>
              <h2 className="text-white font-bold text-2xl">Recharge Successful!</h2>
              <p className="text-[#94A3B8] text-xs mt-1">
                {selectedPlan
                  ? `${selectedPlan.displayVolume} ${selectedNetwork} data bundle delivered`
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
                style={{ background: '#10B981' }}
              >
                Dashboard
              </button>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* VIEW 6: FAILED (With Detailed Error Diagnostics) */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        {view === 'failed' && (
          <div className="py-8 text-center space-y-4">
            <div className="w-20 h-20 rounded-3xl bg-red-500/15 border border-red-500/30 flex items-center justify-center mx-auto text-red-400">
              <AlertCircle size={44} />
            </div>

            <div>
              <h2 className="text-white font-bold text-2xl">Payment Could Not Complete</h2>
              <p className="text-[#94A3B8] text-xs mt-1">
                Your wallet was not charged.
              </p>
            </div>

            {/* Exact provider error message */}
            <div className="bg-red-500/10 border border-red-500/25 rounded-2xl p-4 max-w-sm mx-auto text-left">
              <div className="flex items-start gap-2.5">
                <AlertCircle size={16} className="text-red-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-red-300 text-xs font-semibold">Reason:</p>
                  <p className="text-red-200 text-xs mt-0.5 leading-relaxed font-mono">
                    {errorMessage || 'Unknown telecom provider error. Please check your phone number and network.'}
                  </p>
                </div>
              </div>
            </div>

            <div className="pt-2 grid grid-cols-2 gap-3 max-w-xs mx-auto">
              <button
                onClick={() => setView(selectedPlan ? 'data' : 'airtime')}
                className="py-3.5 rounded-2xl text-xs font-bold text-white bg-white/10 active:scale-95"
              >
                Edit Number
              </button>
              <button
                onClick={() => executePurchase()}
                className="py-3.5 rounded-2xl text-xs font-bold text-black active:scale-95"
                style={{ background: '#10B981' }}
              >
                Try Again
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── NETWORK SELECTOR MODAL / SHEET ── */}
      {networkModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 p-0 sm:p-4">
          <div className="w-full max-w-sm bg-[#151820] border border-white/10 rounded-t-3xl sm:rounded-3xl p-5 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-white/8">
              <h3 className="text-white font-bold text-base">Select Network</h3>
              <button
                onClick={() => setNetworkModalOpen(false)}
                className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-[#94A3B8]"
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
                    onClick={() => {
                      setSelectedNetwork(net.code)
                      setNetworkModalOpen(false)
                    }}
                    className="w-full p-3.5 rounded-2xl border flex items-center gap-3.5 text-left transition-all active:scale-98"
                    style={{
                      background: isSelected ? 'rgba(16,185,129,0.08)' : '#181B22',
                      borderColor: isSelected ? '#10B981' : 'rgba(255,255,255,0.06)',
                    }}
                  >
                    <div className="w-9 h-9 rounded-xl overflow-hidden flex items-center justify-center bg-black/50 border border-white/10">
                      <img src={net.logo} alt={net.name} className="w-full h-full object-cover" />
                    </div>
                    <div className="flex-1">
                      <p className="text-white font-semibold text-sm">{net.name}</p>
                      <p className="text-[#64748B] text-[11px]">{net.prefixes.slice(0, 4).join(', ')}...</p>
                    </div>
                    {isSelected && <Check size={18} className="text-[#10B981]" />}
                  </button>
                )
              })}
            </div>

            {/* Ported Number Toggle */}
            <div className="pt-2 border-t border-white/8">
              <label className="flex items-center justify-between cursor-pointer p-1">
                <div>
                  <p className="text-white text-xs font-semibold">Ported Number</p>
                  <p className="text-[#64748B] text-[11px]">Number was moved to another network</p>
                </div>
                <input
                  type="checkbox"
                  checked={isPorted}
                  onChange={(e) => setIsPorted(e.target.checked)}
                  className="w-4 h-4 rounded text-emerald-500 focus:ring-0 focus:ring-offset-0 bg-white/10 border-white/20"
                />
              </label>
            </div>
          </div>
        </div>
      )}

      {/* ── CONTACT / RECENT NUMBERS MODAL ── */}
      {contactModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 p-0 sm:p-4">
          <div className="w-full max-w-sm bg-[#151820] border border-white/10 rounded-t-3xl sm:rounded-3xl p-5 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-white/8">
              <h3 className="text-white font-bold text-base">Select Recipient</h3>
              <button
                onClick={() => setContactModalOpen(false)}
                className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-[#94A3B8]"
              >
                <X size={16} />
              </button>
            </div>

            {/* Paste from clipboard */}
            <button
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
              className="w-full p-3 rounded-2xl bg-white/5 border border-white/8 text-left text-xs font-semibold text-emerald-400 flex items-center justify-between"
            >
              <span>Paste from clipboard</span>
              <Sparkles size={15} />
            </button>

            {/* Recent Numbers */}
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
                    onClick={() => {
                      handlePhoneChange(num)
                      setContactModalOpen(false)
                    }}
                    className="w-full p-3 rounded-xl bg-[#181B22] border border-white/6 text-left flex items-center justify-between active:scale-98 transition-transform"
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

      {/* ── COMING SOON MODAL FOR UNWIRED CATEGORIES ── */}
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
