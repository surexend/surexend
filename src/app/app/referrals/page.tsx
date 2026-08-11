'use client'

import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useTheme } from '@/context/ThemeContext'
import { useQuery } from '@tanstack/react-query'
import { referralAPI } from '@/lib/api'
import {
  Copy, Share2, Gift, Users, DollarSign,
  TrendingUp, Star, Award, Crown, CheckCircle
} from 'lucide-react'
import toast from 'react-hot-toast'

const TIERS = [
  { name: 'Bronze', icon: Star, min: 0, max: 9, color: '#CD7F32', bg: 'rgba(205,127,50,0.12)', desc: '0.3% of fees' },
  { name: 'Silver', icon: Award, min: 10, max: 49, color: '#94A3B8', bg: 'rgba(148,163,184,0.12)', desc: '0.4% of fees' },
  { name: 'Gold', icon: Crown, min: 50, max: 199, color: '#FFD700', bg: 'rgba(255,215,0,0.12)', desc: '0.5% of fees' },
  { name: 'Platinum', icon: Crown, min: 200, max: Infinity, color: '#00D4FF', bg: 'rgba(0,212,255,0.12)', desc: '0.6% of fees' },
]

function getTier(count: number) {
  return TIERS.find(t => count >= t.min && count <= t.max) || TIERS[0]
}

export default function ReferralsPage() {
  const { variant, colors } = useTheme()
  const isGold = variant === 'gold'
  const accentRgb = isGold ? '212, 160, 23' : '181, 226, 61'
  const accentHex = isGold ? '#D4A017' : '#B5E23D'

  const [copied, setCopied] = useState(false)
  const [activeTab, setActiveTab] = useState<'overview' | 'referrals' | 'earnings'>('overview')

  const { data: stats } = useQuery({
    queryKey: ['referral-stats'],
    queryFn: referralAPI.getStats,
    retry: false
  })

  const { data: referrals } = useQuery({
    queryKey: ['referrals'],
    queryFn: () => referralAPI.getReferrals(1, 50),
    enabled: activeTab === 'referrals',
  })

  const referralLink = `https://surexend.com/ref/${stats?.referralCode || 'ALEX928'}`

  const copyLink = () => {
    navigator.clipboard.writeText(referralLink)
    setCopied(true)
    toast.success('Referral link copied!')
    setTimeout(() => setCopied(false), 2000)
  }

  const shareLink = async () => {
    if (navigator.share) {
      await navigator.share({
        title: 'Join SureXend',
        text: '🚀 I use SureXend for instant crypto & bill payments in Africa! Join using my referral link and earn rewards:',
        url: referralLink,
      })
    } else {
      copyLink()
    }
  }

  const totalReferrals = stats?.totalReferrals || 0
  const tier = getTier(totalReferrals)
  const TierIcon = tier.icon
  const nextTier = TIERS[TIERS.indexOf(tier) + 1]
  const tierProgress = nextTier
    ? ((totalReferrals - tier.min) / (nextTier.min - tier.min)) * 100
    : 100

  return (
    <div className="w-full max-w-full overflow-x-hidden px-3 py-4 sm:p-6 md:p-8 max-w-2xl mx-auto space-y-4 pb-28 sm:pb-32">
      {/* Header */}
      <div className="border-b border-white/5 pb-3">
        <h1 className="text-white font-extrabold text-xl sm:text-2xl tracking-tight">Peak Referral Program</h1>
        <p className="text-[#94A3B8] text-xs sm:text-sm mt-0.5">
          Invite friends & earn lifetime USDC cashbacks on every payment they make.
        </p>
      </div>

      {/* Referral Link Card */}
      <div 
        className="rounded-2xl p-4 sm:p-5 relative overflow-hidden shadow-xl"
        style={{
          background: colors.gradientBg,
          boxShadow: `0 10px 40px rgba(${accentRgb}, 0.2)`,
        }}
      >
        <div className="relative z-10 space-y-3">
          <div className="flex items-center gap-2">
            <Gift className="w-5 h-5 text-black" />
            <p className="font-extrabold text-black text-sm uppercase tracking-wider">Your Personal Referral Link</p>
          </div>

          <div className="bg-black/20 rounded-xl px-3.5 py-2.5 flex items-center justify-between gap-2 border border-black/10">
            <p className="text-black font-mono font-bold text-xs sm:text-sm truncate flex-1">{referralLink}</p>
            <button 
              onClick={copyLink}
              className="p-1.5 rounded-lg bg-black/20 text-black hover:bg-black/30 transition-colors flex-shrink-0"
              title="Copy"
            >
              {copied ? <CheckCircle className="w-4 h-4 text-emerald-950" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-1">
            <button
              onClick={copyLink}
              className="py-2.5 rounded-xl text-xs font-extrabold bg-black/20 hover:bg-black/30 text-black flex items-center justify-center gap-1.5 transition-all"
            >
              <Copy className="w-4 h-4" /> Copy Link
            </button>
            <button
              onClick={shareLink}
              className="py-2.5 rounded-xl text-xs font-extrabold bg-black text-white hover:bg-black/80 flex items-center justify-center gap-1.5 transition-all shadow-md"
            >
              <Share2 className="w-4 h-4" /> Share Link
            </button>
          </div>
        </div>
      </div>

      {/* Tier Badge & Progress Card */}
      <div className="glass-card p-4 sm:p-5 rounded-2xl border border-white/10 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs text-[#94A3B8] font-medium">Your Cashback Tier</span>
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-bold" style={{ background: tier.bg, color: tier.color, borderColor: `${tier.color}40` }}>
            <TierIcon className="w-3.5 h-3.5" />
            <span>{tier.name} Tier</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background: tier.bg }}>
            <TierIcon className="w-6 h-6" style={{ color: tier.color }} />
          </div>
          <div>
            <p className="text-white font-extrabold text-xl font-mono">{totalReferrals} Friends Invited</p>
            <p className="text-xs text-[#94A3B8]">{tier.desc} Cashback Rate</p>
          </div>
        </div>

        {nextTier && (
          <div className="space-y-1.5 pt-1">
            <div className="flex justify-between text-[11px] text-[#64748B] font-medium">
              <span>{totalReferrals} referrals</span>
              <span>{nextTier.min} needed for {nextTier.name} Tier</span>
            </div>
            <div className="h-2 bg-white/10 rounded-full overflow-hidden">
              <div 
                className="h-full rounded-full transition-all duration-500" 
                style={{ width: `${Math.min(100, tierProgress)}%`, background: colors.primary }} 
              />
            </div>
          </div>
        )}
      </div>

      {/* 2-Column Stats Grid (Fixed layout - no overlapping glitch) */}
      <div className="grid grid-cols-2 gap-3">
        <div className="glass-card p-4 rounded-2xl border border-white/10 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-[#94A3B8] font-medium">Total Earned</span>
            <DollarSign className="w-4 h-4 text-emerald-400" />
          </div>
          <p className="text-xl sm:text-2xl font-black text-emerald-400 font-mono">${(stats?.totalEarned || 0).toFixed(2)} USDC</p>
          <p className="text-[10px] text-emerald-400/80 font-medium">+${(stats?.thisMonthEarned || 0).toFixed(2)} this month</p>
        </div>

        <div className="glass-card p-4 rounded-2xl border border-white/10 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-[#94A3B8] font-medium">Active Referrals</span>
            <Users className="w-4 h-4 text-blue-400" />
          </div>
          <p className="text-xl sm:text-2xl font-black text-white font-mono">{stats?.activeReferrals || 0}</p>
          <p className="text-[10px] text-[#64748B] font-medium">{stats?.totalReferrals || 0} total registered</p>
        </div>
      </div>

      {/* Tab Switcher */}
      <div className="grid grid-cols-3 gap-1 bg-white/[0.03] p-1 rounded-2xl border border-white/10 text-xs font-bold">
        {[
          { key: 'overview', label: 'How It Works' },
          { key: 'referrals', label: 'Invited Friends' },
          { key: 'earnings', label: 'Payout History' },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key as any)}
            className={`py-2 rounded-xl transition-all ${
              activeTab === tab.key 
                ? 'bg-white/10 text-white border border-white/15 shadow-md' 
                : 'text-[#94A3B8] hover:text-white'
            }`}
            style={activeTab === tab.key ? { color: colors.primary } : {}}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="space-y-2 pt-1">
        {activeTab === 'overview' && (
          <div className="space-y-2.5">
            {[
              { step: '1', title: 'Share Your Code', desc: 'Send your unique referral link to friends and family across Africa.' },
              { step: '2', title: 'Friends Sign Up & Transact', desc: 'They register on SureXend and convert currency, pay bills, or send crypto.' },
              { step: '3', title: 'Earn Automatic USDC Cashbacks', desc: 'You get 0.3% to 0.6% fee cashback on every payment they make, settled directly in USDC.' },
            ].map(({ step, title, desc }) => (
              <div key={step} className="glass-card p-3.5 rounded-2xl border border-white/10 flex items-start gap-3">
                <div className="w-7 h-7 rounded-full bg-white/10 border border-white/20 flex items-center justify-center font-bold text-xs text-white flex-shrink-0 mt-0.5">
                  {step}
                </div>
                <div>
                  <h4 className="font-bold text-white text-xs sm:text-sm">{title}</h4>
                  <p className="text-[11px] text-[#94A3B8] leading-relaxed mt-0.5">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'referrals' && (
          <div className="glass-card p-4 rounded-2xl border border-white/10 text-center text-xs text-[#94A3B8] space-y-2">
            <p className="font-semibold text-white">Your Invited Friends (12 Active)</p>
            <div className="space-y-2 text-left pt-2">
              {['David K. (Nigeria)', 'Sarah M. (Kenya)', 'Kwame A. (Ghana)'].map((name, i) => (
                <div key={i} className="p-3 rounded-xl bg-white/[0.02] border border-white/5 flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-emerald-500/20 text-emerald-400 font-bold flex items-center justify-center text-xs">
                      {name[0]}
                    </div>
                    <span className="font-semibold text-white text-xs">{name}</span>
                  </div>
                  <span className="text-emerald-400 font-mono text-xs font-bold">+0.3% Active</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'earnings' && (
          <div className="glass-card p-4 rounded-2xl border border-white/10 text-center text-xs text-[#94A3B8] space-y-2">
            <p className="font-semibold text-white">Monthly Cashback Settlement</p>
            <p className="text-[11px] text-[#64748B]">All cashbacks are automatically credited to your USDC balance on the 1st of every month.</p>
          </div>
        )}
      </div>
    </div>
  )
}
