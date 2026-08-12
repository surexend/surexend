'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { Eye, EyeOff, Send, Download, Repeat, Smartphone, ArrowUpRight, ArrowDownLeft, Clock, TrendingUp, TrendingDown, Coins, Activity, Building2, PlusCircle, Landmark, X, ChevronRight, Copy, Tag, Sparkles, Trophy } from 'lucide-react'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { walletAPI, transactionAPI } from '@/lib/api'
import { useTheme } from '@/context/ThemeContext'
import VerifiedCheckmark from '@/components/VerifiedCheckmark'
import toast from 'react-hot-toast'

// Market data for USDT and USDC
const cryptoMarketData = {
  USDT: {
    symbol: 'USDT',
    name: 'Tether USD',
    currentPrice: 1.0004,
    change24h: 0.04,
    high24h: 1.0018,
    low24h: 0.9982,
    volume24h: '42.5M',
    data: [
      { time: '10:25:40', value: 1.0001 },
      { time: '10:25:52', value: 1.0005 },
      { time: '10:26:01', value: 1.0002 },
      { time: '10:26:15', value: 1.0008 },
      { time: '10:26:22', value: 1.0004 },
      { time: '10:26:33', value: 1.0012 },
      { time: '10:26:43', value: 1.0009 },
      { time: '10:26:55', value: 1.0004 },
      { time: '10:27:04', value: 1.0007 },
      { time: '10:27:12', value: 1.0002 },
      { time: '10:27:23', value: 1.0011 },
      { time: '10:27:32', value: 1.0005 },
      { time: '10:27:40', value: 1.0008 },
      { time: '10:27:47', value: 1.0015 },
      { time: '10:27:55', value: 1.0004 },
    ]
  },
  USDC: {
    symbol: 'USDC',
    name: 'USD Coin',
    currentPrice: 0.9998,
    change24h: -0.02,
    high24h: 1.0005,
    low24h: 0.9975,
    volume24h: '28.1M',
    data: [
      { time: '10:25:40', value: 0.9999 },
      { time: '10:25:52', value: 0.9996 },
      { time: '10:26:01', value: 1.0001 },
      { time: '10:26:15', value: 0.9994 },
      { time: '10:26:22', value: 0.9998 },
      { time: '10:26:33', value: 1.0002 },
      { time: '10:26:43', value: 0.9997 },
      { time: '10:26:55', value: 0.9998 },
      { time: '10:27:04', value: 1.0000 },
      { time: '10:27:12', value: 0.9995 },
      { time: '10:27:23', value: 1.0003 },
      { time: '10:27:32', value: 0.9996 },
      { time: '10:27:40', value: 0.9999 },
      { time: '10:27:47', value: 1.0004 },
      { time: '10:27:55', value: 0.9998 },
    ]
  }
}



export default function DashboardPage() {
  const { variant, colors } = useTheme()
  const [showBalance, setShowBalance] = useState(true)
  // 'USD' = crypto wallet (USDC/USDT), 'LOCAL' = local currency wallet (NGN/GHS/etc)
  const [walletView, setWalletView] = useState<'USD' | 'LOCAL'>('USD')
  const [selectedCrypto, setSelectedCrypto] = useState<'USDT' | 'USDC'>('USDC')
  const [timeframe, setTimeframe] = useState<'1D' | '1W' | '1M' | '1Y'>('1D')
  const [showSendModal, setShowSendModal] = useState(false)
  const [showFundModal, setShowFundModal] = useState(false)
  const [showVBAModal, setShowVBAModal] = useState(false)
  const [copiedVBA, setCopiedVBA] = useState(false)
  const [avatar, setAvatar] = useState<string | null>(null)

  useEffect(() => {
    const saved = localStorage.getItem('surexend_user_avatar')
    if (saved) setAvatar(saved)
  }, [])

  const currentCrypto = cryptoMarketData[selectedCrypto]

  const { data: balanceData, isLoading: isLoadingBalance } = useQuery({
    queryKey: ['balance'],
    queryFn: walletAPI.getBalance,
    retry: false
  })

  const copyVBA = () => {
    navigator.clipboard.writeText('9824018420')
    setCopiedVBA(true)
    toast.success('Account number copied!')
    setTimeout(() => setCopiedVBA(false), 2000)
  }

  const { data: txData, isLoading: isLoadingTx } = useQuery({
    queryKey: ['recentTransactions'],
    queryFn: () => transactionAPI.getHistory({ limit: 100 }),
    retry: false
  })

  const list = Array.isArray(txData) ? txData : (txData?.transactions || [])

  const txTypeLabel: Record<string, string> = {
    SEND: 'Send',
    RECEIVE: 'Receive',
    CONVERT: 'Convert',
    BILL_PAYMENT: 'Bill Payment',
    REFERRAL_EARNING: 'Referral Rewards',
  }

  // Real 7-day cash flow (Money In vs Money Out) computed from transactions
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
      const amt = Number(tx.amount) || 0
      const type = (tx.type || '').toUpperCase()
      const isOut = type === 'SEND' || type === 'BILL_PAYMENT'
      if (isOut) result[idx].moneyOut += amt
      else result[idx].moneyIn += amt
    }
    return result
  }, [list])

  const totalIn = cashFlowData.reduce((s, d) => s + d.moneyIn, 0)
  const totalOut = cashFlowData.reduce((s, d) => s + d.moneyOut, 0)

  return (
    <div className="w-full max-w-full overflow-x-hidden px-4 py-4 sm:p-6 md:p-8 max-w-5xl mx-auto space-y-6 pb-36 sm:pb-32">
      {/* 🟢 SLEEK SINGLE-LINE FINTECH USER BAR */}
      <div className="flex items-center justify-between py-2 px-3.5 rounded-xl glass-card border border-white/10 text-xs">
        <div className="flex items-center gap-2 truncate">
          <div className="w-8 h-8 rounded-full overflow-hidden border border-white/20 flex-shrink-0 shadow-md bg-[#1E2738]">
            {avatar ? (
              <img src={avatar} alt="Avatar" className="w-full h-full object-cover" />
            ) : (
              <img src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80" alt="Avatar" className="w-full h-full object-cover" />
            )}
          </div>
          <div className="flex items-center gap-1 truncate">
            <span className="font-extrabold text-white truncate text-xs sm:text-sm">Welcome back, Alex</span>
            <VerifiedCheckmark size={16} variant={variant} />
          </div>
          <span className="hidden sm:inline text-[#64748B]">•</span>
          <span className="hidden sm:inline text-[#94A3B8] font-mono font-bold">@alex_xend</span>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <span 
            className="px-2 py-0.5 rounded-full text-[10px] font-extrabold border flex items-center gap-1 shadow-sm"
            style={{
              background: variant === 'gold' ? 'rgba(212, 160, 23, 0.15)' : 'rgba(181, 226, 61, 0.15)',
              borderColor: variant === 'gold' ? 'rgba(212, 160, 23, 0.4)' : 'rgba(181, 226, 61, 0.4)',
              color: colors.primary,
            }}
          >
            ✓ Tier 2 Verified
          </span>
          <Link href="/app/invoice" className="hidden xs:flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-white/5 hover:bg-white/10 text-white text-[11px] font-semibold border border-white/10">
            <Sparkles className="w-3 h-3 text-blue-400" /> EU Invoice
          </Link>
        </div>
      </div>

      {/* Live rates ticker */}
      <div className="w-full overflow-hidden bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)] rounded-lg py-1.5 flex items-center">
        <motion.div 
          className="flex whitespace-nowrap text-xs text-[#94A3B8] gap-8 px-4"
          animate={{ x: [0, -400] }}
          transition={{ repeat: Infinity, duration: 15, ease: 'linear' }}
        >
          <span>USDC/NGN: <strong className="text-white">₦1,500.00</strong> <span className="text-[#10B981]">+0.4%</span></span>
          <span>USDT/NGN: <strong className="text-white">₦1,498.50</strong> <span className="text-[#10B981]">+0.2%</span></span>
          <span>BTC/USD: <strong className="text-white">$67,473.54</strong> <span className="text-[#10B981]">+2.1%</span></span>
          <span>ETH/USD: <strong className="text-white">$3,420.10</strong> <span className="text-[#EF4444]">-0.8%</span></span>
          <span>SOL/USD: <strong className="text-white">$145.80</strong> <span className="text-[#10B981]">+5.4%</span></span>
        </motion.div>
      </div>

      {/* Balance Card */}
      <motion.div 
        className="glass-card p-4 sm:p-6 relative overflow-hidden"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-white/5 to-transparent rounded-full blur-3xl -z-10 pointer-events-none" />

        {/* ── Dual Wallet Balance Card ── */}
        <div className="flex justify-between items-start mb-4">
          <div className="flex-1 min-w-0">
            {/* Wallet toggle tabs */}
            <div className="flex items-center gap-1.5 mb-3">
              <button
                onClick={() => setWalletView('USD')}
                className={`px-3 py-1 rounded-lg text-[11px] font-bold transition-all border ${
                  walletView === 'USD'
                    ? 'text-white bg-white/10 border-white/20'
                    : 'text-[#64748B] bg-transparent border-white/5 hover:text-white'
                }`}
              >
                💵 USD Wallet
              </button>
              <button
                onClick={() => setWalletView('LOCAL')}
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
              {walletView === 'USD' ? 'USD Crypto Balance (USDC / USDT)' : 'Local Currency Balance (NGN)'}
              <button onClick={() => setShowBalance(!showBalance)} className="hover:text-white transition-colors">
                {showBalance ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </p>

            <div className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight mt-1">
              {isLoadingBalance ? (
                <div className="h-9 w-40 skeleton rounded-lg" />
              ) : showBalance ? (
                walletView === 'USD'
                  ? `$${(balanceData?.usdBalance ?? 2450.75).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                  : `₦${(balanceData?.ngnBalance ?? 185000).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
              ) : '••••••••'}
            </div>

            {showBalance && (
              <p className="text-[11px] text-[#475569] mt-1 font-medium">
                {walletView === 'USD'
                  ? 'Deposited via crypto (USDC/USDT). Convert on Convert tab to get local currency.'
                  : 'Deposited via local bank transfer. Convert on Convert tab to get USD.'}
              </p>
            )}
          </div>
        </div>

        {/* Action Buttons: 4 Primary Actions in Order (Fund, Send, Receive, Bills) */}
        <div className="grid grid-cols-4 gap-2 sm:gap-4 pt-2">
          {/* 1. FUND */}
          <button 
            onClick={() => setShowFundModal(true)} 
            className="group flex flex-col items-center gap-1.5 sm:gap-2"
          >
            <div 
              className="w-11 h-11 sm:w-14 sm:h-14 rounded-2xl flex items-center justify-center group-hover:scale-105 transition-all shadow-lg"
              style={{
                background: variant === 'gold' ? 'rgba(212, 160, 23, 0.15)' : 'rgba(181, 226, 61, 0.15)',
                border: `1px solid ${variant === 'gold' ? 'rgba(212, 160, 23, 0.35)' : 'rgba(181, 226, 61, 0.35)'}`,
                boxShadow: `0 0 15px rgba(${colors.glowRgb}, 0.25)`
              }}
            >
              <PlusCircle className="w-5 h-5 sm:w-6 sm:h-6" style={{ color: colors.primary }} />
            </div>
            <span className="text-xs font-semibold text-white group-hover:text-[var(--text)] transition-colors text-center">Fund</span>
          </button>

          {/* 2. SEND */}
          <button 
            onClick={() => setShowSendModal(true)} 
            className="group flex flex-col items-center gap-1.5 sm:gap-2"
          >
            <div 
              className="w-11 h-11 sm:w-14 sm:h-14 rounded-2xl flex items-center justify-center group-hover:scale-105 transition-all shadow-lg"
              style={{
                background: 'rgba(59, 130, 246, 0.15)',
                border: '1px solid rgba(59, 130, 246, 0.35)',
                boxShadow: '0 0 15px rgba(59, 130, 246, 0.2)'
              }}
            >
              <Send className="w-5 h-5 sm:w-6 sm:h-6 text-blue-400" />
            </div>
            <span className="text-xs font-semibold text-white group-hover:text-blue-400 transition-colors text-center">Send</span>
          </button>

          {/* 3. RECEIVE */}
          <Link href="/app/receive" className="group flex flex-col items-center gap-1.5 sm:gap-2">
            <div 
              className="w-11 h-11 sm:w-14 sm:h-14 rounded-2xl flex items-center justify-center group-hover:scale-105 transition-all shadow-lg"
              style={{
                background: 'rgba(245, 158, 11, 0.15)',
                border: '1px solid rgba(245, 158, 11, 0.35)',
                boxShadow: '0 0 15px rgba(245, 158, 11, 0.2)'
              }}
            >
              <Download className="w-5 h-5 sm:w-6 sm:h-6 text-amber-400" />
            </div>
            <span className="text-xs font-semibold text-white group-hover:text-amber-400 transition-colors text-center">Receive</span>
          </Link>

          {/* 4. BILLS */}
          <Link href="/app/bills" className="group flex flex-col items-center gap-1.5 sm:gap-2">
            <div 
              className="w-11 h-11 sm:w-14 sm:h-14 rounded-2xl flex items-center justify-center group-hover:scale-105 transition-all shadow-lg"
              style={{
                background: 'rgba(139, 92, 246, 0.15)',
                border: '1px solid rgba(139, 92, 246, 0.35)',
                boxShadow: '0 0 15px rgba(139, 92, 246, 0.2)'
              }}
            >
              <Smartphone className="w-5 h-5 sm:w-6 sm:h-6 text-purple-400" />
            </div>
            <span className="text-xs font-semibold text-white group-hover:text-purple-400 transition-colors text-center">Bills</span>
          </Link>
        </div>
      </motion.div>

      {/* 🟢 BIG MARKET CRYPTO LIVE CHART (USDT / USDC) */}
      <motion.div 
        className="glass-card p-4 sm:p-6 relative overflow-hidden"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.2 }}
      >
        {/* Top bar with crypto selector tabs & timeframes */}
        <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 mb-4 pb-4 border-b border-white/5">
          <div className="flex items-center gap-2">
            <span className="text-xs text-[#64748B] font-medium mr-1">Market:</span>
            {(['USDC', 'USDT'] as const).map((crypto) => (
              <button
                key={crypto}
                onClick={() => setSelectedCrypto(crypto)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                  selectedCrypto === crypto
                    ? 'bg-white/10 text-white border border-white/20 shadow-lg'
                    : 'text-[#64748B] hover:text-white hover:bg-white/5'
                }`}
                style={selectedCrypto === crypto ? { color: colors.primary } : {}}
              >
                <Coins className="w-3.5 h-3.5" />
                {crypto}/USD
              </button>
            ))}
          </div>

          {/* Timeframes */}
          <div className="flex items-center gap-1 bg-[#121827] p-1 rounded-xl border border-white/5 self-start sm:self-auto">
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
                ${currentCrypto.currentPrice.toFixed(4)}
              </span>
              <span className={`text-xs font-bold px-2 py-0.5 rounded-md flex items-center gap-0.5 ${
                currentCrypto.change24h >= 0 
                  ? 'bg-[rgba(16,185,129,0.15)] text-[#10B981] border border-[rgba(16,185,129,0.2)]'
                  : 'bg-[rgba(239,68,68,0.15)] text-[#EF4444] border border-[rgba(239,68,68,0.2)]'
              }`}>
                {currentCrypto.change24h >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                {currentCrypto.change24h >= 0 ? '+' : ''}{currentCrypto.change24h}%
              </span>
            </div>
            <p className="text-xs text-[#64748B] mt-0.5 font-medium">{currentCrypto.name} Live Rate</p>
          </div>

          <div className="flex items-center gap-4 text-xs text-[#64748B]">
            <div>
              <p className="text-[10px] uppercase tracking-wider">24h High</p>
              <p className="text-white font-semibold">${currentCrypto.high24h.toFixed(4)}</p>
            </div>
            <div className="w-px h-6 bg-white/10" />
            <div>
              <p className="text-[10px] uppercase tracking-wider">24h Low</p>
              <p className="text-white font-semibold">${currentCrypto.low24h.toFixed(4)}</p>
            </div>
            <div className="w-px h-6 bg-white/10" />
            <div>
              <p className="text-[10px] uppercase tracking-wider">24h Volume</p>
              <p className="text-white font-semibold">{currentCrypto.volume24h}</p>
            </div>
          </div>
        </div>

        {/* Large Market Chart */}
        <div className="h-64 sm:h-72 w-full pt-2">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={currentCrypto.data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="cryptoMarketGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={colors.primary} stopOpacity={0.45} />
                  <stop offset="100%" stopColor={colors.primary} stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="time" stroke="#64748B" fontSize={10} tickLine={false} axisLine={false} dy={5} />
              <YAxis 
                domain={['dataMin - 0.001', 'dataMax + 0.001']} 
                stroke="#64748B" 
                fontSize={10} 
                tickLine={false} 
                axisLine={false} 
                tickFormatter={(val) => `$${val.toFixed(4)}`} 
              />
              <Tooltip 
                cursor={{ stroke: '#3B82F6', strokeDasharray: '4 4', strokeWidth: 1.5 }}
                content={({ active, payload }: any) => {
                  if (active && payload && payload.length) {
                    return (
                      <div className="bg-[#181F32] border border-white/10 p-3 rounded-xl shadow-2xl backdrop-blur-md">
                        <p className="font-bold text-white text-sm">${payload[0].value?.toFixed(4)}</p>
                        <p className="text-[10px] text-[#94A3B8] mt-0.5">{selectedCrypto}/USD · {payload[0].payload.time}</p>
                      </div>
                    )
                  }
                  return null
                }}
              />
              <Area 
                type="monotone" 
                dataKey="value" 
                stroke={colors.primary} 
                strokeWidth={2.5} 
                fill="url(#cryptoMarketGradient)" 
                activeDot={{ r: 6, fill: colors.primary, stroke: '#ffffff', strokeWidth: 2 }}
                animationDuration={1800}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </motion.div>

      {/* 📊 SECOND ROW: CASH FLOW (MONEY IN vs MONEY OUT) & REFERRALS */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Money In vs Money Out Cash Flow Chart */}
        <motion.div 
          className="glass-card p-4 sm:p-5 relative overflow-hidden"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.25 }}
        >
          <div className="flex flex-wrap justify-between items-center mb-4 gap-2">
            <div>
              <h3 className="font-semibold text-white text-base flex items-center gap-2">
                <Activity className="w-4 h-4 text-[#10B981]" /> Cash Flow Movement
              </h3>
              <p className="text-[11px] text-[#64748B]">Money In vs. Money Out (7 Days)</p>
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
          <div className="grid grid-cols-2 gap-3 mb-3 bg-[#121827] p-3 rounded-xl border border-white/5">
            <div>
              <p className="text-[10px] text-[#64748B] uppercase tracking-wider">Total Money In</p>
              <p className="text-sm font-bold text-[#10B981]">+${totalIn.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
            </div>
            <div>
              <p className="text-[10px] text-[#64748B] uppercase tracking-wider">Total Money Out</p>
              <p className="text-sm font-bold text-[#EF4444]">-${totalOut.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
            </div>
          </div>

          <div className="h-52 w-full pt-1">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={cashFlowData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="inflowGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10B981" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#10B981" stopOpacity={0.0} />
                  </linearGradient>
                  <linearGradient id="outflowGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#EF4444" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#EF4444" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="day" stroke="#64748B" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis stroke="#64748B" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(v) => `$${v}`} />
                <Tooltip 
                  cursor={{ stroke: '#3B82F6', strokeDasharray: '4 4' }}
                  content={({ active, payload }: any) => {
                    if (active && payload && payload.length) {
                      return (
                        <div className="bg-[#181F32] border border-white/10 p-3 rounded-xl shadow-2xl">
                          <p className="text-xs font-bold text-white mb-1.5">{payload[0]?.payload?.day}</p>
                          <p className="text-xs text-[#10B981] font-semibold">Money In: +${payload[0]?.value}</p>
                          <p className="text-xs text-[#EF4444] font-semibold mt-0.5">Money Out: -${payload[1]?.value}</p>
                        </div>
                      )
                    }
                    return null
                  }}
                />
                <Area type="monotone" dataKey="moneyIn" stroke="#10B981" strokeWidth={2.5} fill="url(#inflowGradient)" />
                <Area type="monotone" dataKey="moneyOut" stroke="#EF4444" strokeWidth={2.5} fill="url(#outflowGradient)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
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
                  <Trophy className="w-3 h-3" /> Peak Referral Rewards
                </span>
                <h3 className="font-extrabold text-white text-lg tracking-tight mt-1.5">Invite & Earn USD Cashbacks</h3>
              </div>
              <span className="text-2xl font-black text-amber-400 font-mono">$128.50</span>
            </div>

            <p className="text-xs text-[#94A3B8] leading-relaxed">
              Earn <strong className="text-white">0.3% fee cashback</strong> on every transaction made by your invited friends. Instant automatic wallet payout!
            </p>

            <div className="grid grid-cols-2 gap-2 pt-1 text-xs">
              <div className="p-2.5 rounded-xl bg-white/[0.03] border border-white/5">
                <p className="text-[10px] text-[#64748B] uppercase">Active Invites</p>
                <p className="font-extrabold text-white text-sm mt-0.5">12 Friends</p>
              </div>
              <div className="p-2.5 rounded-xl bg-white/[0.03] border border-white/5">
                <p className="text-[10px] text-[#64748B] uppercase">Lifetime Earned</p>
                <p className="font-extrabold text-emerald-400 text-sm mt-0.5">$128.50 USD</p>
              </div>
            </div>
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
        className="glass-card p-5"
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
              const isSend = typeUpper === 'SEND' || typeUpper === 'BILL_PAYMENT'
              const isReceive = typeUpper === 'RECEIVE' || typeUpper === 'REFERRAL_EARNING'
              return (
                <Link
                  key={tx.id}
                  href="/app/history"
                  className="flex items-center justify-between p-3 rounded-xl bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.04)] hover:bg-[rgba(255,255,255,0.04)] transition-all"
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                      isSend ? 'bg-red-500/10 text-red-400' : isReceive ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'
                    }`}>
                      {isSend ? <ArrowUpRight className="w-5 h-5" /> : isReceive ? <ArrowDownLeft className="w-5 h-5" /> : <Repeat className="w-5 h-5" />}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-white capitalize">{txTypeLabel[typeUpper] || tx.type}</p>
                      <p className="text-xs text-[#64748B]">{new Date(tx.createdAt || tx.date || Date.now()).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
                    </div>
                  </div>

                  <div className="text-right">
                    <p className={`text-sm font-bold ${isSend ? 'text-red-400' : isReceive ? 'text-emerald-400' : 'text-amber-400'}`}>
                      {isSend ? '-' : '+'}${tx.amount} {tx.currency && tx.currency !== 'USDT' ? tx.currency : 'USD'}
                    </p>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium capitalize ${
                      (tx.status || '').toUpperCase() === 'COMPLETED' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                    }`}>
                      {tx.status}
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
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/75 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="glass-card w-[94vw] max-w-md max-h-[85vh] overflow-y-auto p-5 sm:p-6 relative rounded-3xl shadow-2xl border"
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

                {/* Option 3: Bank Account Withdrawal */}
                <Link
                  href="/app/withdraw"
                  onClick={() => setShowSendModal(false)}
                  className="group flex items-center justify-between p-3.5 sm:p-4 rounded-2xl border border-white/10 bg-white/[0.02] hover:bg-white/[0.06] hover:border-emerald-500/40 transition-all duration-300"
                >
                  <div className="flex items-center gap-3 sm:gap-4">
                    <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 group-hover:scale-110 transition-transform flex-shrink-0">
                      <Building2 className="w-5 h-5 sm:w-6 sm:h-6" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-white text-sm sm:text-base group-hover:text-emerald-400 transition-colors">
                        Send to Local Bank Account
                      </h4>
                      <p className="text-[11px] sm:text-xs text-[#94A3B8] leading-relaxed mt-0.5">
                        Send funds directly to any local bank account (NGN, GHS, KES, ZAR and more)
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

      {/* FUND CHOICE MODAL */}
      <AnimatePresence>
        {showFundModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="glass-card w-[94vw] max-w-md max-h-[85vh] overflow-y-auto p-5 sm:p-6 relative rounded-3xl shadow-2xl border"
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
                {/* PRIMARY OPTION 1: Deposit Local Currency (Virtual Bank Transfer) */}
                <div
                  onClick={() => { setShowFundModal(false); setShowVBAModal(true) }}
                  className="group flex items-center justify-between p-3.5 sm:p-4 rounded-2xl border border-emerald-500/40 bg-emerald-500/[0.04] hover:bg-emerald-500/[0.08] transition-all duration-300 relative cursor-pointer"
                >
                  <div className="flex items-center gap-3 sm:gap-4">
                    <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 group-hover:scale-110 transition-transform flex-shrink-0">
                      <Landmark className="w-5 h-5 sm:w-6 sm:h-6" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-bold text-white text-sm sm:text-base text-emerald-400 transition-colors">
                          Deposit Local Currency (Bank Transfer)
                        </h4>
                      </div>
                      <p className="text-[11px] sm:text-xs text-[#94A3B8] leading-relaxed mt-0.5">
                        Get your dedicated NGN Virtual Account details for instant bank transfers
                      </p>
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-emerald-400 group-hover:translate-x-1 transition-all flex-shrink-0" />
                </div>

                {/* OPTION 2: Deposit Crypto (USDT / USDC) */}
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
                        Deposit Crypto (USDT / USDC)
                      </h4>
                      <p className="text-[11px] sm:text-xs text-[#94A3B8] leading-relaxed mt-0.5">
                        Get deposit addresses for Ethereum, Polygon, Solana, BSC, Base, and other chains
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

      {/* ── VIRTUAL BANK ACCOUNT MODAL (Local Currency Deposit) ── */}
      <AnimatePresence>
        {showVBAModal && (
          <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, y: 60 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 60 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="glass-card w-full sm:w-[420px] rounded-t-3xl sm:rounded-3xl p-5 pb-8 sm:p-6 border border-emerald-500/30 shadow-2xl space-y-4"
            >
              {/* Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
                    <Landmark className="w-5 h-5 text-emerald-400" />
                  </div>
                  <div>
                    <h3 className="font-bold text-white text-base">Fund via Bank Transfer</h3>
                    <p className="text-xs text-[#64748B]">Transfer to your dedicated account</p>
                  </div>
                </div>
                <button onClick={() => setShowVBAModal(false)} className="p-2 rounded-full hover:bg-white/10 text-[#64748B] hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Account Details */}
              <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/8 space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] text-[#64748B] uppercase tracking-wider font-bold">Bank</span>
                  <span className="text-sm font-bold text-emerald-400">Wema Bank / Moniepoint</span>
                </div>
                <div className="h-px bg-white/5" />
                <div className="flex justify-between items-center">
                  <span className="text-[10px] text-[#64748B] uppercase tracking-wider font-bold">Account Number</span>
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-black text-white font-mono tracking-widest">9824018420</span>
                    <button
                      onClick={copyVBA}
                      className="p-1.5 rounded-lg bg-white/8 hover:bg-white/15 text-[#94A3B8] hover:text-white transition-colors"
                    >
                      {copiedVBA
                        ? <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                        : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div className="h-px bg-white/5" />
                <div className="flex justify-between items-center">
                  <span className="text-[10px] text-[#64748B] uppercase tracking-wider font-bold">Account Name</span>
                  <span className="text-sm font-bold text-white">SureXend / Alex Johnson</span>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-amber-500/8 border border-amber-500/20 flex items-start gap-2">
                <span className="text-amber-400 text-base flex-shrink-0">⚡</span>
                <p className="text-[11px] text-[#94A3B8] leading-relaxed">
                  Transfer any amount in <strong className="text-white">Naira (NGN)</strong> to this account. Funds will credit your <strong className="text-white">Local Wallet</strong> within minutes. <em className="text-amber-400">These funds stay in NGN — use the Convert tab to move to USD.</em>
                </p>
              </div>

              <button
                onClick={copyVBA}
                className="w-full py-3.5 rounded-2xl font-bold text-black flex items-center justify-center gap-2 shadow-xl transition-all active:scale-[0.98]"
                style={{ background: 'linear-gradient(135deg, #10B981, #059669)' }}
              >
                <Copy className="w-4 h-4" />
                {copiedVBA ? 'Account Number Copied!' : 'Copy Account Number'}
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}
