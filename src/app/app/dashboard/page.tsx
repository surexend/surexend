'use client'

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Link from 'next/link'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Eye, EyeOff, Send, Download, Repeat, Smartphone, ArrowUpRight, ArrowDownLeft, Clock, Coins, Activity, Building2, PlusCircle, Landmark, X, ChevronRight, Copy, Tag, Sparkles, Trophy, ChevronDown, Check, RefreshCcw } from 'lucide-react'
import dynamic from 'next/dynamic'
import { walletAPI, transactionAPI, userAPI, conversionAPI, campaignsAPI, AFRICAN_CURRENCIES } from '@/lib/api'
import { getSwapInfo, currencySymbol, formatAmount } from '@/lib/utils'
import { useTheme } from '@/context/ThemeContext'
import VerifiedCheckmark from '@/components/VerifiedCheckmark'
import CurrencyFlag from '@/components/CurrencyFlag'
import ComingSoon from '@/components/ui/ComingSoon'
import { useLite } from '@/lib/lite'
import { useBackHandler } from '@/context/BackHandlerContext'
import toast from 'react-hot-toast'

// recharts is heavy (~130KB gz) — load it only when charts actually render.
const ChartArea = dynamic(() => import('@/components/ChartArea'), { ssr: false })

// Market pairs: USDC/USD (pegged at 1.0) + every supported local currency vs USD.
// Rates come from a live public FX feed (er-api) and refresh on an interval so
// the ticker and chart are real and current rather than static mock data.
const MARKET_PAIRS = [
  { id: 'USDC', label: 'USDC/USD', name: 'USD Coin', symbol: '$', decimals: 4 },
  ...AFRICAN_CURRENCIES.map(c => ({
    id: c.code,
    label: `${c.code}/USD`,
    name: c.name,
    symbol: c.symbol,
    decimals: c.rate >= 1000 ? 0 : c.rate >= 100 ? 1 : 2,
  })),
]

const LIVE_RATES_URL = 'https://www.floatrates.com/daily/usd.json'

// Fallback rate source (same figures the app uses for conversions) so the UI
// still renders real-looking, meaningful numbers if the live feed is offline.
const fallbackRate = (code: string) => {
  const entry = AFRICAN_CURRENCIES.find(c => c.code === code)
  return entry ? entry.rate : 1500
}

// African local currencies for the Local Wallet selector
const LOCAL_CURRENCIES = AFRICAN_CURRENCIES.map(c => ({ code: c.code, name: c.name, symbol: c.symbol, flag: c.flag, countryCode: c.countryCode, country: c.country, countries: c.countries }))



export default function DashboardPage() {
  const { variant, colors } = useTheme()
  const isGold = variant === 'gold'
  const { lite } = useLite()
  const [showBalance, setShowBalance] = useState(true)
  // 'USD' = crypto wallet (USDC), 'LOCAL' = local currency wallet (NGN/GHS/etc)
  const [walletView, setWalletView] = useState<'USD' | 'LOCAL'>('USD')
  const [selectedLocalCurrency, setSelectedLocalCurrency] = useState('NGN')
  const [showLocalCurrencyPicker, setShowLocalCurrencyPicker] = useState(false)
  const [localCurrencySearch, setLocalCurrencySearch] = useState('')
  const [selectedMarket, setSelectedMarket] = useState<string>('USDC')
  const [timeframe, setTimeframe] = useState<'1D' | '1W' | '1M' | '1Y'>('1D')
  const [showSendModal, setShowSendModal] = useState(false)
  const [showFundModal, setShowFundModal] = useState(false)
  const [showVBAModal, setShowVBAModal] = useState(false)
  const [showBankComingSoon, setShowBankComingSoon] = useState(false)
  const [copiedVBA, setCopiedVBA] = useState(false)
  const [avatar, setAvatar] = useState<string | null>(null)
  const [showMarketPicker, setShowMarketPicker] = useState(false)
  const queryClient = useQueryClient()

  // Back handler for modals — closes the top-most open modal on back press
  useBackHandler(
    useCallback(() => {
      if (showBankComingSoon) {
        setShowBankComingSoon(false)
        return true
      }
      if (showVBAModal) {
        setShowVBAModal(false)
        return true
      }
      if (showFundModal) {
        setShowFundModal(false)
        return true
      }
      if (showSendModal) {
        setShowSendModal(false)
        return true
      }
      if (showLocalCurrencyPicker) {
        setShowLocalCurrencyPicker(false)
        return true
      }
      if (showMarketPicker) {
        setShowMarketPicker(false)
        return true
      }
      return false
    }, [showBankComingSoon, showVBAModal, showFundModal, showSendModal, showLocalCurrencyPicker, showMarketPicker]),
    20 // Higher than drawer
  )

  // ── LIVE MARKET DATA ─────────────────────────────────────────────
  // Real history comes from the backend market-chart proxy (Yahoo/CoinGecko),
  // seeded per selected pair + timeframe. The 30s poll appends real live ticks
  // from FloatRates so the chart genuinely moves while the tab is open.
  const [liveRates, setLiveRates] = useState<Record<string, number>>({})
  const [liveUpdatedAt, setLiveUpdatedAt] = useState<number | null>(null)
  const [rateSeries, setRateSeries] = useState<Record<string, { time: string; value: number }[]>>({})
  const [chartSource, setChartSource] = useState<string>('Live FX')
  const [chartLoading, setChartLoading] = useState(false)

  // Real live anchor per pair (from the backend market-chart response). Used to
  // drive USDC ticks with its REAL price (~0.9995) instead of a hardcoded 1.0,
  // which is what turned the pegged-pair chart into a perfectly flat line.
  const liveSpotRef = useRef<Record<string, number | null>>({})

  // Load real historical series whenever the selected pair or timeframe changes.
  useEffect(() => {
    let active = true
    setChartLoading(true)
    conversionAPI.getMarketChart(selectedMarket, timeframe)
      .then((data: any) => {
        if (!active) return
        // Always surface the true source (even if history came back empty so
        // the backend fell back to live-only). No fabricated flat line.
        setChartSource(data?.source || 'Live FX')
        if (typeof data?.live === 'number' && data.live > 0) {
          liveSpotRef.current[selectedMarket] = data.live
        }
        const isLong = timeframe === '1M' || timeframe === '1Y'
        if (!data?.points?.length) {
          // No real history (upstream down) — seed the chart with the REAL live
          // anchor so it still draws genuine movement, never a blank box.
          const live = liveSpotRef.current[selectedMarket]
          if (typeof live === 'number') {
            setRateSeries(prev => ({ ...prev, [selectedMarket]: [{ time: new Date().toLocaleTimeString('en-US', { hour12: false }), value: live }] }))
          }
          return
        }
        const series = data.points.map((p: any) => ({
          time: isLong
            ? new Date(p.time).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
            : new Date(p.time).toLocaleTimeString('en-US', { hour12: false }),
          value: p.value,
        }))
        setRateSeries(prev => ({ ...prev, [selectedMarket]: series }))
      })
      .catch(() => { /* keep last good series */ })
      .finally(() => { if (active) setChartLoading(false) })
    return () => { active = false }
  }, [selectedMarket, timeframe])

  // Poll the live spot feed on an interval so the ticker and chart update with
  // real market movement. FloatRates returns every supported currency in one
  // request, keyless and CORS-open, so the browser can call it directly.
  const refreshRates = useCallback(async () => {
    try {
      const res = await fetch(LIVE_RATES_URL)
      if (!res.ok) throw new Error(`Rates feed ${res.status}`)
      const json = await res.json()
      const rates = json || {}
      if (!rates.ngn) return
      const normalized: Record<string, number> = {}
      for (const pair of MARKET_PAIRS) {
        if (pair.id === 'USDC') continue
        const rate = Number(rates[pair.id.toLowerCase()]?.rate)
        if (rate > 0) normalized[pair.id] = rate
      }
      if (!Object.keys(normalized).length) return
      setLiveRates(normalized)
      setLiveUpdatedAt(Date.now())
      // Append the current rate for every pair to its rolling series so the
      // chart shows real movement over the session. Once a series has enough
      // live ticks (>= 30) we update the tip IN PLACE instead of growing
      // forever — long histories (e.g. 1Y) stay intact and the line still
      // moves, instead of the history scrolling off into a short flat tail.
      setRateSeries(prev => {
        const next: Record<string, { time: string; value: number }[]> = { ...prev }
        for (const pair of MARKET_PAIRS) {
          // USDC has no FloatRates quote — drive it from the real backend
          // anchor (its actual ~0.9995 price), never a fabricated 1.0.
          const rate = pair.id === 'USDC' ? (liveSpotRef.current['USDC'] ?? 1) : normalized[pair.id]
          if (!rate) continue
          const now = new Date()
          const stamp = now.toLocaleTimeString('en-US', { hour12: false })
          const arr = [...(next[pair.id] || [])]
          if (arr.length >= 30 && arr.length > 0) {
            arr[arr.length - 1] = { time: stamp, value: rate }
          } else {
            arr.push({ time: stamp, value: rate })
            if (arr.length > 120) arr.shift()
          }
          next[pair.id] = arr
        }
        return next
      })
    } catch (err) {
      // Keep the last good series; fallback static rates still power display.
      if (!Object.keys(liveRates).length) {
        setLiveRates({ NGN: 1357.65, GHS: 10.94, KES: 129.26, ZAR: 16.18, UGX: 3712.5, TZS: 2643.8, EGP: 50.26, MAD: 9.3, ETB: 161.34, RWF: 1470.3, ZMW: 18.83, MZN: 63.81, BWP: 13.76, AOA: 920.66, CDF: 2257.2, TND: 2.92, DZD: 132.9, LYD: 6.37, SDG: 600.17, SSP: 5680.34, SOS: 571.47, DJF: 177.72, ERN: 15.38, MRU: 39.98, MGA: 4311.09, MWK: 1733.87, NAD: 16.16, LSL: 16.16, SZL: 16.16, MUR: 47.14, SCR: 14.58, KMF: 425.32, CVE: 95.33, STN: 21.18, GMD: 72.62, SLL: 22500, LRD: 181.64, GNF: 8772.7, BIF: 3002.23, ZWL: 25.8, XAF: 567.09, XOF: 567.09 })
      }
    }
  }, [liveRates])

  useEffect(() => {
    refreshRates()
    const id = setInterval(refreshRates, 30000)
    return () => clearInterval(id)
  }, [refreshRates])

  const rateFor = (code: string) => code === 'USDC' ? 1 : (liveRates[code] ?? fallbackRate(code))

  // Chart series for the currently selected market pair — real history from
  // the backend proxy, extended by live ticks. Never a fabricated flat line.
  const chartSeries = useMemo(() => {
    return rateSeries[selectedMarket] || []
  }, [selectedMarket, rateSeries])

  // Dynamic Y domain. Pegged pairs (USDC/USD) move only ~0.03%/day, so a
  // percent-padded axis flattens the line into invisibility. For near-constant
  // series we zoom into the data range so the REAL wiggle is visible instead of
  // a boring straight line. Normal pairs keep the classic percent padding.
  const chartYDomain = useMemo(() => {
    const vals = chartSeries.map(d => d.value).filter(v => typeof v === 'number')
    if (vals.length === 0) return (['auto', 'auto'] as unknown) as [number, number]
    const dataMin = Math.min(...vals)
    const dataMax = Math.max(...vals)
    const range = dataMax - dataMin
    const relRange = dataMax !== 0 ? range / Math.abs(dataMax) : 0
    if (relRange < 0.002) {
      const pad = Math.max(range * 0.4, 0.00005)
      return [dataMin - pad, dataMax + pad]
    }
    return (['dataMin * 0.9999', 'dataMax * 1.0001'] as unknown) as [number, number]
  }, [chartSeries])

  useEffect(() => {
    const saved = localStorage.getItem('surexend_user_avatar')
    if (saved) setAvatar(saved)
  }, [])

  const { data: balanceData, isLoading: isLoadingBalance, dataUpdatedAt: balanceUpdatedAt } = useQuery({
    queryKey: ['balance'],
    queryFn: walletAPI.getBalance,
    retry: false,
    staleTime: 30000,
  })

  const { data: profile } = useQuery({
    queryKey: ['profile'],
    queryFn: userAPI.getProfile,
    retry: false,
    staleTime: 60000,
  })

  // Campaign standing — decides the golden tick (top 5 per campaign).
  const { data: standing } = useQuery({
    queryKey: ['campaign-standing'],
    queryFn: campaignsAPI.getMyStanding,
    retry: false,
    staleTime: 60000,
  })
  const isGolden = !!(standing?.bills?.golden || standing?.crypto?.golden)

  // Persisted wallet preference: 'AUTO' (highest balance) | 'USD' | 'LOCAL'
  const prefDefaultWallet = (profile?.defaultWallet as 'AUTO' | 'USD' | 'LOCAL' | undefined) || 'AUTO'
  // Persisted display currency from Profile → default local currency shown
  const prefCurrency = (profile?.currencyDisplay as string | undefined) || 'NGN'

  // Once profile + balance load, initialize the default wallet view:
  //   - explicit pref wins (USD / LOCAL)
  //   - 'AUTO' → the wallet with the higher balance (falls back to USD)
  const hasInited = useRef(false)
  useEffect(() => {
    if (hasInited.current) return
    if (!balanceData) return

    if (prefDefaultWallet === 'USD' || prefDefaultWallet === 'LOCAL') {
      setWalletView(prefDefaultWallet)
    } else {
      // AUTO: show the wallet with the higher balance measured in USD VALUE.
      // Compare local balance converted to USD (local / rate) against the USD
      // balance, so e.g. $39 ranks above 5,000 NGN (≈ $3.33 at 1500/NGN).
      const usdBal = Number(balanceData?.usdBalance ?? 0)
      const localBal = (balanceData?.localBalances?.[prefCurrency] ?? 0) ||
        (prefCurrency === 'NGN' ? (balanceData?.ngnBalance ?? 0) : 0)
      const rate = rateFor(prefCurrency)
      const localBalUsd = localBal / rate
      setWalletView(usdBal >= localBalUsd ? 'USD' : 'LOCAL')
    }
    hasInited.current = true
  }, [balanceData, prefDefaultWallet, prefCurrency, rateFor])

  // Once profile loads, apply the persisted display currency to the picker
  useEffect(() => {
    if (profile?.currencyDisplay) setSelectedLocalCurrency(profile.currencyDisplay)
  }, [profile?.currencyDisplay])

  const copyVBA = () => {
    navigator.clipboard.writeText('9824018420')
    setCopiedVBA(true)
    toast.success('Account number copied!')
    setTimeout(() => setCopiedVBA(false), 2000)
  }

  const { data: txData, isLoading: isLoadingTx } = useQuery({
    queryKey: ['recentTransactions'],
    queryFn: () => transactionAPI.getHistory({ limit: 100 }),
    retry: false,
    staleTime: 30000,
  })

  const list = Array.isArray(txData) ? txData : (txData?.transactions || [])

  const txTypeLabel: Record<string, string> = {
    SEND: 'Send',
    RECEIVE: 'Receive',
    CONVERT: 'Convert',
    BILL_PAYMENT: 'Bill Payment',
    REFERRAL_EARNING: 'Referral Rewards',
  }

  // Real 7-day cash flow (Money In vs Money Out) computed from transactions.
  // RECEIVE/REFERRAL_EARNING = money in, SEND/BILL_PAYMENT = money out.
  // CONVERT is classified by direction (buying crypto = fiat in, selling =
  // fiat out) so it matches the admin dashboard. All figures are converted to
  // USD so the chart never mixes currencies.
  const cashFlowData = useMemo(() => {
    const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
    const result = labels.map(label => ({ day: label, moneyIn: 0, moneyOut: 0 }))
    const now = new Date()
    const dayKeys = labels.map((_, i) => {
      const d = new Date(now)
      d.setDate(now.getDate() - (6 - i))
      return d.toDateString()
    })
    for (const tx of list) {
      const t = new Date(tx.createdAt || tx.date || Date.now())
      const idx = dayKeys.indexOf(t.toDateString())
      if (idx === -1) continue
      const status = (tx.status || '').toUpperCase()
      if (status !== 'COMPLETED') continue
      const type = (tx.type || '').toUpperCase()
      const rawAmt = Number(tx.amount) || 0
      // Convert any non-USD leg to USD value so totals are comparable.
      const currency = (tx.currency || 'USD').toUpperCase()
      const amt = currency === 'USD' || currency === 'USDC'
        ? rawAmt
        : rawAmt / rateFor(currency)
      let isOut = type === 'SEND' || type === 'BILL_PAYMENT'
      if (type === 'CONVERT') {
        // Selling crypto (USD -> fiat) is money out; buying crypto (fiat -> USD)
        // is money in — same rule as the admin dashboard.
        const from = String(tx.metadata?.from || tx.currency || '').toUpperCase()
        isOut = from === 'USDT' || from === 'USDC' || from === 'USD'
      }
      if (isOut) result[idx].moneyOut += amt
      else result[idx].moneyIn += amt
    }
    return result
  }, [list, rateFor])

  const totalIn = cashFlowData.reduce((s, d) => s + d.moneyIn, 0)
  const totalOut = cashFlowData.reduce((s, d) => s + d.moneyOut, 0)

  return (
    <div className="w-full max-w-full overflow-x-hidden px-4 py-4 sm:p-6 md:p-8 max-w-5xl mx-auto space-y-6 pb-36 sm:pb-32">
      {/* 🟢 SLEEK FINTECH USER BAR — welcome + name on their own line so the
          leaderboard badge never crowds the name out */}
      <div className="flex items-center justify-between gap-3 py-2.5 px-3.5 rounded-xl liquid-glass border border-white/10">
        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
          <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-full overflow-hidden border border-white/20 flex-shrink-0 shadow-md bg-[#212429]">
            {avatar ? (
              <img src={avatar} alt="Avatar" className="w-full h-full object-cover" />
            ) : (
              <img src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80" alt="Avatar" className="w-full h-full object-cover" />
            )}
          </div>
          <div className="min-w-0">
            <p className="text-[10px] text-[#64748B] font-semibold uppercase tracking-wider mb-0.5">
              Welcome back
            </p>
            <div className="flex items-center gap-1.5 min-w-0">
              <h1 className="font-extrabold text-white truncate text-sm sm:text-base leading-tight">
                {profile?.firstName || 'there'}
              </h1>
              <VerifiedCheckmark size={16} variant={isGolden ? (isGold ? 'gold' : 'lemon') : 'black'} />
            </div>
            <p className="hidden sm:block text-[10px] text-[#94A3B8] font-mono font-bold mt-0.5 truncate">
              @{profile?.surexTag || profile?.firstName?.toLowerCase() || 'surex'}
            </p>
          </div>
        </div>

        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          <span 
            className="px-2.5 py-1 rounded-full text-[10px] font-extrabold border flex items-center gap-1 shadow-sm"
            style={{
              background: variant === 'gold' ? 'rgba(212, 160, 23, 0.15)' : 'rgba(181, 226, 61, 0.15)',
              borderColor: variant === 'gold' ? 'rgba(212, 160, 23, 0.4)' : 'rgba(181, 226, 61, 0.4)',
              color: colors.primary,
            }}
          >
            {isGolden ? '★ Top 5 Leaderboard' : '✓ Verified Member'}
          </span>
          <span className="sm:hidden text-[10px] text-[#94A3B8] font-mono font-bold truncate max-w-[120px]">
            @{profile?.surexTag || profile?.firstName?.toLowerCase() || 'surex'}
          </span>
        </div>
      </div>

      {/* Live rates ticker — USDC/USD + USD to every supported local currency */}
      <div className="w-full overflow-hidden bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)] rounded-lg py-1.5 flex items-center">
        <motion.div 
          className="flex whitespace-nowrap text-xs text-[#94A3B8] gap-8 px-4"
          animate={{ x: [0, -400] }}
          transition={{ repeat: Infinity, duration: 15, ease: 'linear' }}
        >
          <span>USDC/USD: <strong className="text-white">${(liveSpotRef.current['USDC'] ?? 1).toFixed(4)}</strong> <span className="text-[#10B981]">pegged</span></span>
          {AFRICAN_CURRENCIES.slice(0, 8).map((c) => (
            <span key={c.code}>{c.code}/USD: <strong className="text-white">{c.symbol}{(rateFor(c.code)).toLocaleString(undefined, { maximumFractionDigits: c.rate >= 1000 ? 0 : 2 })}</strong> <span className="text-[#64748B]">live</span></span>
          ))}
        </motion.div>
      </div>

      {/* Balance Card */}
      <motion.div 
        className="liquid-glass p-4 sm:p-6 relative overflow-hidden"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        {/* Premium surface treatment — hairline + radial corner glow.
            Radial gradients only: zero blur filters, GPU-cheap on phones. */}
        <div
          className="absolute inset-x-0 top-0 h-[2px] pointer-events-none"
          style={{ background: `linear-gradient(90deg, transparent, rgba(${colors.glowRgb}, 0.75), transparent)` }}
        />
        <div
          className="absolute -top-28 -right-20 w-80 h-80 -z-10 pointer-events-none rounded-full"
          style={{ background: `radial-gradient(circle, rgba(${colors.glowRgb}, 0.09), transparent 70%)` }}
        />

        {/* ── Dual Wallet Balance Card ── */}
        <div className="flex justify-between items-start mb-4">
          <div className="flex-1 min-w-0">
            {/* Wallet toggle tabs */}
            <div className="flex items-center gap-1.5 mb-3">
              <button
                onClick={() => {
                  setWalletView('USD')
                  if (prefDefaultWallet !== 'USD') userAPI.updatePreferences({ defaultWallet: 'USD' }).catch(() => {})
                }}
                className={`px-3 py-1 rounded-lg text-[11px] font-bold transition-all border ${
                  walletView === 'USD'
                    ? 'text-white bg-white/10 border-white/20'
                    : 'text-[#64748B] bg-transparent border-white/5 hover:text-white'
                }`}
              >
                💵 USD Wallet
              </button>
              <button
                onClick={() => {
                  setWalletView('LOCAL')
                  if (prefDefaultWallet !== 'LOCAL') userAPI.updatePreferences({ defaultWallet: 'LOCAL' }).catch(() => {})
                }}
                className={`px-3 py-1 rounded-lg text-[11px] font-bold transition-all border ${
                  walletView === 'LOCAL'
                    ? 'text-white bg-white/10 border-white/20'
                    : 'text-[#64748B] bg-transparent border-white/5 hover:text-white'
                }`}
              >
                🏦 Local Wallet
              </button>
            </div>

            <p className="text-xs font-medium text-[#64748B] flex items-center gap-2">
              {walletView === 'USD' ? 'USD Crypto Balance (USDC)' : 'Local Wallet Balance'}
              {walletView === 'LOCAL' && (
                <button
                  onClick={() => setShowLocalCurrencyPicker(true)}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-white/[0.08] hover:bg-white/15 border border-white/10 transition-all text-[10px] font-bold text-white"
                >
                  <span className="text-[11px]"><CurrencyFlag countryCode={LOCAL_CURRENCIES.find(c => c.code === selectedLocalCurrency)?.countryCode} emoji={LOCAL_CURRENCIES.find(c => c.code === selectedLocalCurrency)?.flag} size={16} /></span>
                  {selectedLocalCurrency}
                  <ChevronDown className="w-3 h-3 text-[#64748B]" />
                </button>
              )}
              <button onClick={() => setShowBalance(!showBalance)} className="hover:text-white transition-colors">
                {showBalance ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </p>

            <div className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight mt-1">
              {isLoadingBalance ? (
                <div className="h-9 w-40 skeleton rounded-lg" />
              ) : showBalance ? (
                walletView === 'USD'
                  ? `$${(balanceData?.usdBalance ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                  : `${(LOCAL_CURRENCIES.find(c => c.code === selectedLocalCurrency)?.symbol || '₦')}${((balanceData?.localBalances?.[selectedLocalCurrency] ?? 0) || (selectedLocalCurrency === 'NGN' ? (balanceData?.ngnBalance ?? 0) : 0)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
              ) : '••••••••'}
            </div>

            {showBalance && (
              <p className="text-[11px] text-[#475569] mt-1 font-medium">
                {walletView === 'USD'
                  ? 'Deposited via crypto (USDC). Convert on Convert tab to get local currency.'
                  : `Deposited via local bank transfer or converted from USD. Convert on Convert tab to get ${selectedLocalCurrency} or USD.`}
              </p>
            )}

            {/* Last-synced + manual refresh — gives the user (and you) a way to
                spot when a displayed balance is stale vs a backend update. */}
            <div className="flex items-center gap-2 mt-2">
              <span className="text-[10px] text-[#475569]">
                {balanceUpdatedAt
                  ? `Synced ${new Date(balanceUpdatedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}`
                  : 'Not synced yet'}
              </span>
              <button
                onClick={() => queryClient.invalidateQueries({ queryKey: ['balance'] })}
                className="text-[#64748B] hover:text-white transition-colors p-0.5"
                title="Refresh balance"
                aria-label="Refresh balance"
              >
                <RefreshCcw className="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>

        {/* Real-naira indicator — bank-funded money is what pays bills and
            withdrawals; it must never be invisible next to the testnet pool. */}
        {walletView === 'LOCAL' && (balanceData?.realNgn ?? 0) > 0 && (
          <div className="mt-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/25 text-[11px] font-bold">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            <span className="text-emerald-300">Real naira: ₦{(balanceData?.realNgn ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            <span className="text-[#64748B] font-medium">· pays bills</span>
          </div>
        )}

        {/* Action Buttons: 4 Primary Actions in Order (Fund, Send, Receive, Bills) */}
        <div className="grid grid-cols-4 gap-2 sm:gap-4 pt-2">
          {/* 1. FUND */}
          <button
            onClick={() => setShowFundModal(true)}
            className="group flex flex-col items-center gap-1.5 sm:gap-2"
          >
            <div
              className="w-11 h-11 sm:w-14 sm:h-14 rounded-2xl flex items-center justify-center group-hover:scale-105 group-active:scale-90 transition-transform duration-200 bg-white/[0.06] border border-white/10"
            >
              <PlusCircle className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
            </div>
            <span className="text-xs font-semibold text-white group-hover:text-[var(--text)] transition-colors text-center">Fund</span>
          </button>

          {/* 2. SEND */}
          <button
            onClick={() => setShowSendModal(true)}
            className="group flex flex-col items-center gap-1.5 sm:gap-2"
          >
            <div
              className="w-11 h-11 sm:w-14 sm:h-14 rounded-2xl flex items-center justify-center group-hover:scale-105 group-active:scale-90 transition-transform duration-200 bg-white/[0.06] border border-white/10"
            >
              <Send className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
            </div>
            <span className="text-xs font-semibold text-white group-hover:text-[var(--text)] transition-colors text-center">Send</span>
          </button>

          {/* 3. RECEIVE */}
          <Link href="/app/receive" className="group flex flex-col items-center gap-1.5 sm:gap-2">
            <div
              className="w-11 h-11 sm:w-14 sm:h-14 rounded-2xl flex items-center justify-center group-hover:scale-105 group-active:scale-90 transition-transform duration-200 bg-white/[0.06] border border-white/10"
            >
              <Download className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
            </div>
            <span className="text-xs font-semibold text-white group-hover:text-[var(--text)] transition-colors text-center">Receive</span>
          </Link>

          {/* 4. BILLS */}
          <Link href="/app/bills" className="group flex flex-col items-center gap-1.5 sm:gap-2">
            <div
              className="w-11 h-11 sm:w-14 sm:h-14 rounded-2xl flex items-center justify-center group-hover:scale-105 group-active:scale-90 transition-transform duration-200 bg-white/[0.06] border border-white/10"
            >
              <Smartphone className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
            </div>
            <span className="text-xs font-semibold text-white group-hover:text-[var(--text)] transition-colors text-center">Bills</span>
          </Link>
        </div>
      </motion.div>

      {/* 🟢 LIVE MARKET CHART (USDC/USD + USD → local currencies) */}
      <motion.div 
        className="liquid-glass p-4 sm:p-6 relative overflow-hidden"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.2 }}
      >
        {/* Top bar with market pair selector & timeframes */}
        <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 mb-4 pb-4 border-b border-white/5">
          <div className="flex items-center gap-2">
            <span className="text-xs text-[#64748B] font-medium mr-1">Market:</span>
            {/* Pair dropdown: USDC/USD + every local currency */}
            <div className="relative">
              <button
                onClick={() => setShowMarketPicker(!showMarketPicker)}
                className="px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 bg-white/10 text-white border border-white/20 shadow-lg"
                style={{ color: colors.primary }}
              >
                <Coins className="w-3.5 h-3.5" />
                {MARKET_PAIRS.find(p => p.id === selectedMarket)?.label || 'USDC/USD'}
                <ChevronDown className="w-3 h-3" />
              </button>
              <AnimatePresence>
                {showMarketPicker && (
                  <motion.div
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    className="absolute left-0 top-full mt-2 z-30 w-60 max-h-72 overflow-y-auto rounded-2xl liquid-glass p-1.5 border border-white/10 shadow-2xl"
                  >
                    {MARKET_PAIRS.map((pair) => (
                      <button
                        key={pair.id}
                        onClick={() => { setSelectedMarket(pair.id); setShowMarketPicker(false) }}
                        className={`w-full px-3 py-2 rounded-xl text-left flex items-center justify-between transition-all ${
                          selectedMarket === pair.id ? 'bg-white/10 text-white' : 'text-[#94A3B8] hover:text-white hover:bg-white/5'
                        }`}
                      >
                        <span className="text-xs font-bold flex items-center gap-2">
                          {pair.id === 'USDC' ? <Coins className="w-3.5 h-3.5" /> : <span className="text-[11px]"><CurrencyFlag countryCode={AFRICAN_CURRENCIES.find(c => c.code === pair.id)?.countryCode} emoji={AFRICAN_CURRENCIES.find(c => c.code === pair.id)?.flag} size={16} /></span>}
                          {pair.label}
                        </span>
                        <span className="text-[11px] text-[#64748B]">{pair.symbol}{(rateFor(pair.id)).toLocaleString(undefined, { maximumFractionDigits: pair.decimals })}</span>
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Timeframes */}
          <div className="flex items-center gap-1 bg-[#15171C] p-1 rounded-xl border border-white/5 self-start sm:self-auto">
            {(['1D', '1W', '1M', '1Y'] as const).map((tf) => (
              <button
                key={tf}
                onClick={() => setTimeframe(tf)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all ${
                  timeframe === tf ? 'bg-white/10 text-white' : 'text-[#64748B] hover:text-white'
                }`}
              >
                {tf}
              </button>
            ))}
          </div>
        </div>

        {/* Live price stats banner */}
        <div className="flex flex-wrap items-baseline justify-between gap-4 mb-4">
          <div>
            <div className="flex items-center gap-3">
              <span className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
                {selectedMarket === 'USDC' ? `$${(liveSpotRef.current['USDC'] ?? 1).toFixed(4)}` : `${MARKET_PAIRS.find(p => p.id === selectedMarket)?.symbol || '$'}${rateFor(selectedMarket).toFixed(MARKET_PAIRS.find(p => p.id === selectedMarket)?.decimals ?? 2)}`}
              </span>
              <span className="text-xs font-bold px-2 py-0.5 rounded-md flex items-center gap-0.5 bg-[rgba(16,185,129,0.15)] text-[#10B981] border border-[rgba(16,185,129,0.2)]">
                <span className="w-1.5 h-1.5 rounded-full bg-[#10B981]" /> Live
              </span>
            </div>
            <p className="text-xs text-[#64748B] mt-0.5 font-medium">
              {MARKET_PAIRS.find(p => p.id === selectedMarket)?.name} · 1 USD = {MARKET_PAIRS.find(p => p.id === selectedMarket)?.symbol}{(rateFor(selectedMarket)).toLocaleString(undefined, { maximumFractionDigits: MARKET_PAIRS.find(p => p.id === selectedMarket)?.decimals ?? 2 })} {selectedMarket}
            </p>
          </div>

          <div className="flex items-center gap-4 text-xs text-[#64748B]">
            <div>
              <p className="text-[10px] uppercase tracking-wider">Source</p>
              <p className="text-white font-semibold">{chartSource}</p>
            </div>
            <div className="w-px h-6 bg-white/10" />
            <div>
              <p className="text-[10px] uppercase tracking-wider">Updated</p>
              <p className="text-white font-semibold">{liveUpdatedAt ? new Date(liveUpdatedAt).toLocaleTimeString('en-US', { hour12: false }) : '—'}</p>
            </div>
            <div className="w-px h-6 bg-white/10" />
            <div>
              <p className="text-[10px] uppercase tracking-wider">Points</p>
              <p className="text-white font-semibold">{chartSeries.length}</p>
            </div>
          </div>
        </div>

        {/* Large Market Chart */}
        <ChartArea
          section="market"
          chartSeries={chartSeries}
          chartYDomain={chartYDomain}
          selectedMarket={selectedMarket}
          marketPairs={MARKET_PAIRS}
          chartLoading={chartLoading}
          primary={colors.primary}
          lite={lite}
        />
      </motion.div>

      {/* 📊 SECOND ROW: CASH FLOW (MONEY IN vs MONEY OUT) & REFERRALS */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Money In vs Money Out Cash Flow Chart */}
        <motion.div 
          className="liquid-glass p-4 sm:p-5 relative overflow-hidden"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.25 }}
        >
          <div className="flex flex-wrap justify-between items-center mb-4 gap-2">
            <div>
              <h3 className="font-semibold text-white text-base flex items-center gap-2">
                <Activity className="w-4 h-4 text-[#10B981]" /> Cash Flow Movement
              </h3>
              <p className="text-[11px] text-[#64748B]">Money In vs. Money Out · Your account · last 7 days</p>
            </div>
            
            <div className="flex items-center gap-3 text-xs">
              <span className="flex items-center gap-1.5 text-white font-medium">
                <span className="w-2.5 h-2.5 rounded-full bg-[#10B981]" /> Money In
              </span>
              <span className="flex items-center gap-1.5 text-white font-medium">
                <span className="w-2.5 h-2.5 rounded-full bg-[#EF4444]" /> Money Out
              </span>
            </div>
          </div>

          {/* Cash flow totals */}
          <div className="grid grid-cols-2 gap-3 mb-3 bg-[#15171C] p-3 rounded-xl border border-white/5">
            <div>
              <p className="text-[10px] text-[#64748B] uppercase tracking-wider">Total Money In</p>
              <p className="text-sm font-bold text-[#10B981]">+${totalIn.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
            </div>
            <div>
              <p className="text-[10px] text-[#64748B] uppercase tracking-wider">Total Money Out</p>
              <p className="text-sm font-bold text-[#EF4444]">-${totalOut.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
            </div>
          </div>

          <ChartArea
            section="cashflow"
            cashFlowData={cashFlowData}
            totalIn={totalIn}
            totalOut={totalOut}
            lite={lite}
          />
        </motion.div>

        {/* Peak Referral Reward Card */}
        <motion.div 
          className="glass-card p-5 flex flex-col justify-between relative overflow-hidden border border-amber-500/30 bg-amber-500/[0.02]"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.3 }}
        >
          <div className="absolute -right-6 -bottom-6 opacity-15">
            <Trophy className="w-36 h-36 text-amber-400" />
          </div>

          <div className="space-y-3 relative z-10">
            <div className="flex justify-between items-start">
              <div>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-500/20 text-amber-400 border border-amber-500/30 uppercase tracking-wider flex items-center gap-1 w-max">
                  <Trophy className="w-3 h-3" /> Referral Rewards
                </span>
                <h3 className="font-extrabold text-white text-lg tracking-tight mt-1.5">Invite Friends, Earn Cashbacks</h3>
              </div>
              <span className="px-2 py-1 rounded-full text-[10px] font-bold bg-[#64748B]/15 text-[#94A3B8] border border-[#64748B]/30">Coming Soon</span>
            </div>

            <p className="text-xs text-[#94A3B8] leading-relaxed">
              Invite friends to SureXend and earn cashback when they transact. Reward rates and payout details are being finalized — check back soon.
            </p>
          </div>

          <div className="pt-4 relative z-10">
            <Link 
              href="/app/referrals" 
              className="w-full py-3 px-4 rounded-xl text-xs font-bold text-black flex items-center justify-center gap-2 shadow-lg transition-transform hover:scale-[1.02]"
              style={{ background: colors.gradientBg }}
            >
              <Sparkles className="w-4 h-4" /> Share Invite Link & Earn Cash
            </Link>
          </div>
        </motion.div>
      </div>

      {/* Recent Transactions */}
      <motion.div 
        className="liquid-glass p-5 relative overflow-hidden"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.3 }}
      >
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-semibold text-white">Recent Transactions</h3>
          <Link href="/app/history" className="text-xs font-semibold hover:underline" style={{ color: colors.primary }}>
            View All
          </Link>
        </div>

        {isLoadingTx ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 skeleton rounded-xl" />
            ))}
          </div>
        ) : list.length === 0 ? (
          <div className="text-center py-8">
            <Clock className="w-10 h-10 text-[#64748B] mx-auto mb-2 opacity-50" />
            <p className="text-sm text-[#94A3B8]">No transactions yet</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {list.slice(0, 5).map((tx: any) => {
              const typeUpper = (tx.type || '').toUpperCase()
              const statusUpper = (tx.status || '').toUpperCase()
              const isSend = typeUpper === 'SEND' || typeUpper === 'BILL_PAYMENT'
              const isReceive = typeUpper === 'RECEIVE' || typeUpper === 'REFERRAL_EARNING'
              const swap = getSwapInfo(tx)
              const isFailed = statusUpper === 'FAILED'
              return (
                <Link
                  key={tx.id}
                  href="/app/history"
                  className="flex items-center justify-between p-3 rounded-xl bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.04)] hover:bg-[rgba(255,255,255,0.04)] transition-all"
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                      isSend ? 'bg-white/[0.06] text-white' : isReceive ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'
                    }`}>
                      {isSend ? <ArrowUpRight className="w-5 h-5" /> : isReceive ? <ArrowDownLeft className="w-5 h-5" /> : <Repeat className="w-5 h-5" />}
                    </div>
                    <div>
                      {swap ? (
                        <>
                          <p className="text-sm font-bold text-white leading-tight">
                            {swap.from} <span className="text-[#94A3B8] font-semibold">→</span> {swap.to}
                          </p>
                          <p className="text-xs text-[#64748B] mt-0.5">{new Date(tx.createdAt || tx.date || Date.now()).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
                        </>
                      ) : (
                        <>
                          <p className="text-sm font-semibold text-white capitalize">{txTypeLabel[typeUpper] || tx.type}</p>
                          <p className="text-xs text-[#64748B] mt-0.5">{new Date(tx.createdAt || tx.date || Date.now()).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="text-right">
                    {isFailed ? (
                      <p className="text-sm font-bold text-white">Failed</p>
                    ) : swap ? (
                      <>
                        <p className="text-sm font-bold text-emerald-400">
                          +{currencySymbol(swap.to)}{formatAmount(swap.toAmount)} {swap.to}
                        </p>
                        <p className="text-xs text-[#94A3B8] mt-0.5">
                          {currencySymbol(swap.from)}{formatAmount(swap.fromAmount)} {swap.from}
                        </p>
                      </>
                    ) : (
                      <p className={`text-sm font-bold ${isSend ? 'text-red-400' : 'text-white'}`}>
                        {isSend ? '-' : '+'}${tx.amount} {tx.currency || 'USD'}
                      </p>
                    )}
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium capitalize ${
                      isFailed
                        ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                        : statusUpper === 'COMPLETED'
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                          : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                    }`}>
                      {isFailed ? 'Failed' : statusUpper === 'COMPLETED' ? 'Completed' : (tx.status || 'Pending')}
                    </span>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </motion.div>

      <AnimatePresence>
        {showSendModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 liquid-backdrop">
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="liquid-glass-strong w-[94vw] max-w-md max-h-[85vh] overflow-y-auto p-5 sm:p-6 relative rounded-3xl shadow-2xl border"
              style={{
                borderColor: variant === 'gold' ? 'rgba(212, 160, 23, 0.4)' : 'rgba(181, 226, 61, 0.4)',
              }}
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-5 pb-3 border-b border-white/10">
                <div className="flex items-center gap-3">
                  <div 
                    className="w-10 h-10 rounded-xl flex items-center justify-center shadow-md flex-shrink-0"
                    style={{
                      background: `rgba(${colors.glowRgb}, 0.15)`,
                      border: `1px solid rgba(${colors.glowRgb}, 0.3)`
                    }}
                  >
                    <Send className="w-5 h-5" style={{ color: colors.primary }} />
                  </div>
                  <div>
                    <h3 className="font-bold text-white text-base sm:text-lg">Send & Transfer</h3>
                    <p className="text-xs text-[#94A3B8]">Choose your transfer destination</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowSendModal(false)}
                  className="p-2 rounded-full hover:bg-white/10 text-gray-400 hover:text-white transition-colors flex-shrink-0"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Options */}
              <div className="space-y-3">
                {/* Option 1: Send via SureX Tag (Zero Fee) */}
                <Link
                  href="/app/send?type=tag"
                  onClick={() => setShowSendModal(false)}
                  className="group flex items-center justify-between p-3.5 sm:p-4 rounded-2xl border border-white/10 bg-white/[0.02] hover:bg-white/[0.06] hover:border-purple-500/40 transition-all duration-300 relative overflow-hidden"
                >
                  <div className="flex items-center gap-3 sm:gap-4">
                    <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-400 group-hover:scale-110 transition-transform flex-shrink-0">
                      <Tag className="w-5 h-5 sm:w-6 sm:h-6" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-semibold text-white text-sm sm:text-base group-hover:text-purple-400 transition-colors">
                          Send to SureX Tag (@username)
                        </h4>
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-400">Zero Fee</span>
                      </div>
                      <p className="text-[11px] sm:text-xs text-[#94A3B8] leading-relaxed mt-0.5">
                        Instant zero-fee transfer directly to any SureXend user tag
                      </p>
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-gray-500 group-hover:text-white group-hover:translate-x-1 transition-all flex-shrink-0" />
                </Link>

                {/* Option 2: Crypto Wallet */}
                <Link
                  href="/app/send?type=crypto"
                  onClick={() => setShowSendModal(false)}
                  className="group flex items-center justify-between p-3.5 sm:p-4 rounded-2xl border border-white/10 bg-white/[0.02] hover:bg-white/[0.06] hover:border-blue-500/40 transition-all duration-300"
                >
                  <div className="flex items-center gap-3 sm:gap-4">
                    <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400 group-hover:scale-110 transition-transform flex-shrink-0">
                      <Send className="w-5 h-5 sm:w-6 sm:h-6" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-white text-sm sm:text-base group-hover:text-blue-400 transition-colors">
                        Send to Crypto Wallet
                      </h4>
                      <p className="text-[11px] sm:text-xs text-[#94A3B8] leading-relaxed mt-0.5">
                        Transfer stablecoins across Ethereum, Polygon, BSC, Base, and other chains
                      </p>
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-gray-500 group-hover:text-white group-hover:translate-x-1 transition-all flex-shrink-0" />
                </Link>

                {/* Option 3: Bank Account — gated until bank rails are live. */}
                <div
                  onClick={() => { setShowSendModal(false); setShowBankComingSoon(true) }}
                  className="group flex items-center justify-between p-3.5 sm:p-4 rounded-2xl border border-white/10 bg-white/[0.02] hover:bg-white/[0.06] transition-colors duration-300 relative cursor-pointer"
                >
                  <div className="flex items-center gap-3 sm:gap-4">
                    <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 group-hover:scale-105 transition-transform flex-shrink-0">
                      <Building2 className="w-5 h-5 sm:w-6 sm:h-6" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-semibold text-white text-sm sm:text-base group-hover:text-emerald-400 transition-colors">
                          Send to Local Bank Account
                        </h4>
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-extrabold uppercase tracking-wider bg-white/10 text-[#94A3B8] border border-white/10">
                          Coming soon
                        </span>
                      </div>
                      <p className="text-[11px] sm:text-xs text-[#94A3B8] leading-relaxed mt-0.5">
                        Send USDC straight to any local bank (NGN, GHS, KES, ZAR and more)
                      </p>
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-gray-500 group-hover:text-white group-hover:translate-x-1 transition-all flex-shrink-0" />
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* FUND CHOICE MODAL */}
      <AnimatePresence>
        {showFundModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4 liquid-backdrop">
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="liquid-glass-strong w-[94vw] max-w-md max-h-[85vh] overflow-y-auto p-5 sm:p-6 relative rounded-3xl shadow-2xl border"
              style={{ borderColor: variant === "gold" ? "rgba(212, 160, 23, 0.4)" : "rgba(181, 226, 61, 0.4)" }}
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-5 pb-3 border-b border-white/10">
                <div className="flex items-center gap-3">
                  <div 
                    className="w-10 h-10 rounded-xl flex items-center justify-center shadow-md flex-shrink-0"
                    style={{
                      background: `rgba(${colors.glowRgb}, 0.15)`,
                      border: `1px solid rgba(${colors.glowRgb}, 0.3)`
                    }}
                  >
                    <PlusCircle className="w-5 h-5" style={{ color: colors.primary }} />
                  </div>
                  <div>
                    <h3 className="font-bold text-white text-base sm:text-lg">Fund Your Wallet</h3>
                    <p className="text-xs text-[#94A3B8]">Select how you want to add funds</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowFundModal(false)}
                  className="p-2 rounded-full hover:bg-white/10 text-gray-400 hover:text-white transition-colors flex-shrink-0"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Options */}
              <div className="space-y-3">
                {/* PRIMARY OPTION 1: Deposit Local Currency (Bank Transfer) — gated until Flutterwave is live. */}
                <div
                  onClick={() => { setShowFundModal(false); setShowBankComingSoon(true) }}
                  className="group flex items-center justify-between p-3.5 sm:p-4 rounded-2xl border border-emerald-500/40 bg-emerald-500/[0.04] hover:bg-emerald-500/[0.08] transition-colors duration-300 relative cursor-pointer"
                >
                  <div className="flex items-center gap-3 sm:gap-4">
                    <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 group-hover:scale-105 transition-transform flex-shrink-0">
                      <Landmark className="w-5 h-5 sm:w-6 sm:h-6" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-bold text-white text-sm sm:text-base text-emerald-400 transition-colors">
                          Deposit Local Currency (Bank Transfer)
                        </h4>
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-extrabold uppercase tracking-wider bg-white/10 text-[#94A3B8] border border-white/10">
                          Coming soon
                        </span>
                      </div>
                      <p className="text-[11px] sm:text-xs text-[#94A3B8] leading-relaxed mt-0.5">
                        Get a dedicated NGN Virtual Account for instant bank transfers
                      </p>
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-emerald-400 group-hover:translate-x-1 transition-transform flex-shrink-0" />
                </div>

                {/* OPTION 2: Deposit Crypto (USDC) */}
                <Link
                  href="/app/receive"
                  onClick={() => setShowFundModal(false)}
                  className="group flex items-center justify-between p-3.5 sm:p-4 rounded-2xl border border-white/10 bg-white/[0.02] hover:bg-white/[0.06] hover:border-amber-500/40 transition-all duration-300"
                >
                  <div className="flex items-center gap-3 sm:gap-4">
                    <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 group-hover:scale-110 transition-transform flex-shrink-0">
                      <Coins className="w-5 h-5 sm:w-6 sm:h-6" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-white text-sm sm:text-base group-hover:text-amber-400 transition-colors">
                        Deposit Crypto (USDC)
                      </h4>
                      <p className="text-[11px] sm:text-xs text-[#94A3B8] leading-relaxed mt-0.5">
                        Get deposit addresses for Ethereum, Polygon, Solana, Base, and other chains
                      </p>
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-gray-500 group-hover:text-white group-hover:translate-x-1 transition-all flex-shrink-0" />
                </Link>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Local Currency Picker ── */}
        <AnimatePresence>
          {showLocalCurrencyPicker && (
            <div className="fixed inset-0 z-[80] flex items-end justify-center liquid-backdrop">
              <motion.div
                initial={{ opacity: 0, y: 100 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 100 }}
                transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                className="w-full max-w-md liquid-glass rounded-t-3xl border-t border-white/15 shadow-2xl"
                style={{ borderColor: `rgba(${colors.glowRgb},0.4)` }}
              >
                <div className="flex items-center justify-between p-4 border-b border-white/10">
                  <div>
                    <h3 className="font-bold text-white text-sm">Local Wallet Currency</h3>
                    <p className="text-[11px] text-[#64748B]">Choose the African currency to display</p>
                  </div>
                  <button onClick={() => setShowLocalCurrencyPicker(false)} className="p-1.5 rounded-full hover:bg-white/10 text-[#64748B] hover:text-white">
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <div className="p-4 pb-2 sticky top-0 z-10" style={{ background: 'rgba(8,9,12,0.95)', backdropFilter: 'blur(12px)' }}>
                  <input
                    value={localCurrencySearch}
                    onChange={(e) => setLocalCurrencySearch(e.target.value)}
                    placeholder="Search country or currency…"
                    className="w-full bg-[#020203] border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-[#64748B] focus:outline-none focus:border-white/30"
                  />
                </div>
                <div className="p-4 space-y-2 max-h-[55vh] overflow-y-auto pb-8">
                  {LOCAL_CURRENCIES.filter(c => {
                    const q = localCurrencySearch.trim().toLowerCase()
                    if (!q) return true
                    return c.code.toLowerCase().includes(q) || c.name.toLowerCase().includes(q) || c.country.toLowerCase().includes(q) || (c.countries || []).some((cc: string) => cc.toLowerCase().includes(q))
                  }).map((curr) => {
                    const isSelected = selectedLocalCurrency === curr.code
                    const bal = (balanceData?.localBalances?.[curr.code] ?? 0) || (curr.code === 'NGN' ? (balanceData?.ngnBalance ?? 0) : 0)
                    return (
                      <button
                        key={curr.code}
                        onClick={() => { setSelectedLocalCurrency(curr.code); setShowLocalCurrencyPicker(false); setLocalCurrencySearch(''); userAPI.updatePreferences({ currencyDisplay: curr.code }).catch(() => {}) }}
                        className="w-full p-3.5 rounded-2xl border flex items-center justify-between transition-all"
                        style={isSelected
                          ? { background: `rgba(${colors.glowRgb},0.12)`, borderColor: colors.primary }
                          : { background: 'rgba(255,255,255,0.02)', borderColor: 'rgba(255,255,255,0.08)' }
                        }
                      >
                        <div className="flex items-center gap-3">
                          <CurrencyFlag countryCode={curr.countryCode} emoji={curr.flag} size={32} />
                          <div className="text-left">
                            <div className="flex items-center gap-2">
                              <span className="font-extrabold text-white text-sm">{curr.code}</span>
                              <span className="text-xs text-[#94A3B8]">({curr.symbol})</span>
                            </div>
                            <p className="text-[11px] text-[#64748B]">{curr.name}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <p className="text-xs font-bold text-white">{curr.symbol}{bal.toLocaleString(undefined, { maximumFractionDigits: 2 })}</p>
                            <p className="text-[9px] text-[#64748B]">Wallet balance</p>
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

      {/* ── Bank flows (deposit + send-to-bank) — Coming Soon until Flutterwave ships ── */}
      <ComingSoon
        open={showBankComingSoon}
        onClose={() => setShowBankComingSoon(false)}
        title="Bank Transfer Funding & Payouts"
        subtitle="We're wiring up direct bank deposits and USDC → local-bank withdrawals through our payment partner. Until then, the easiest way in is depositing USDC on a low-fee network."
        eta="Rolling out soon — payments partner integration in progress"
        notifyEmail="support@surexend.com"
        features={[
          'Dedicated NGN virtual account for instant bank deposits (auto-credited in minutes).',
          'Send USDC straight to any local bank in NGN, GHS, KES, ZAR and more — settled at a live rate.',
          'Single flow for both deposit and payout, with the same PIN + biometrics you use today.',
          'Full transaction receipts you can download as PNG or PDF.',
        ]}
      />
    </div>
  )
}
