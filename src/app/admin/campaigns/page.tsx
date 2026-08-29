'use client'

import React, { useState, useEffect } from 'react'
import { useTheme } from '@/context/ThemeContext'
import { adminAPI } from '@/lib/api'
import { Trophy, Crown, Users, TrendingUp, Clock, DollarSign, Award } from 'lucide-react'

export default function AdminCampaignsPage() {
  const { variant, colors } = useTheme()
  const accentRgb = variant === 'gold' ? '212, 160, 23' : '181, 226, 61'
  const accentHex = variant === 'gold' ? '#D4A017' : '#B5E23D'
  const isGold = variant === 'gold'

  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'all' | '7d'>('all')

  useEffect(() => {
    adminAPI.getCampaignOverview()
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [])

  const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 2 })

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="w-8 h-8 rounded-full border-2 border-white/10 border-t-white/40 animate-spin" />
      </div>
    )
  }

  if (!data) {
    return <p className="text-[#94A3B8] text-sm py-20 text-center">Failed to load campaign data.</p>
  }

  const crypto = data.crypto[tab === 'all' ? 'allTime' : 'last7Days']
  const bills = data.bills[tab === 'all' ? 'allTime' : 'last7Days']

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-extrabold">Campaigns Overview</h1>
        <p className="text-xs text-[#64748B] mt-0.5">Real-time tracking for crypto & bill-payment campaigns</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="liquid-glass p-4 rounded-2xl">
          <p className="text-[10px] uppercase tracking-wider text-[#64748B] font-semibold flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5" style={{ color: accentHex }} /> Total Participants
          </p>
          <p className="text-2xl font-black text-white mt-2">{data.summary.totalUniqueParticipants}</p>
        </div>
        <div className="liquid-glass p-4 rounded-2xl">
          <p className="text-[10px] uppercase tracking-wider text-[#64748B] font-semibold flex items-center gap-1.5">
            <Award className="w-3.5 h-3.5" style={{ color: '#FBBF24' }} /> Golden Users (Top 5)
          </p>
          <p className="text-2xl font-black text-[#FBBF24] mt-2">{data.summary.goldenUsers}</p>
        </div>
        <div className="liquid-glass p-4 rounded-2xl">
          <p className="text-[10px] uppercase tracking-wider text-[#64748B] font-semibold flex items-center gap-1.5">
            <DollarSign className="w-3.5 h-3.5 text-emerald-400" /> Crypto Volume (All Time)
          </p>
          <p className="text-2xl font-black text-emerald-400 mt-2">${fmt(data.crypto.allTime.grandTotal)}</p>
        </div>
        <div className="liquid-glass p-4 rounded-2xl">
          <p className="text-[10px] uppercase tracking-wider text-[#64748B] font-semibold flex items-center gap-1.5">
            <DollarSign className="w-3.5 h-3.5 text-amber-400" /> Bills Volume (All Time)
          </p>
          <p className="text-2xl font-black text-amber-400 mt-2">${fmt(data.bills.allTime.grandTotal)}</p>
        </div>
      </div>

      {/* Time range tabs */}
      <div className="flex flex-wrap justify-center gap-2">
        {(['all', '7d'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="px-4 py-2 rounded-xl text-sm font-semibold transition-colors border"
            style={tab === t
              ? { background: `rgba(${accentRgb}, 0.12)`, borderColor: `rgba(${accentRgb}, 0.4)`, color: accentHex }
              : { background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.08)', color: '#94A3B8' }}
          >
            {t === 'all' ? 'All Time' : 'Last 7 Days'}
          </button>
        ))}
      </div>

      {/* Leaderboards side by side */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Crypto Leaderboard */}
        <div className="liquid-glass rounded-2xl border border-white/10 overflow-hidden">
          <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Trophy className="w-5 h-5" style={{ color: accentHex }} />
              <p className="font-bold text-white text-sm">Crypto Campaign</p>
            </div>
            <span className="text-[10px] text-[#64748B]">{crypto.participants} participants · ${fmt(crypto.grandTotal)} total</span>
          </div>
          <div className="divide-y divide-white/5">
            {crypto.top10.length === 0 ? (
              <div className="p-8 text-center">
                <Users className="w-8 h-8 text-[#334155] mx-auto mb-2" />
                <p className="text-white font-semibold">No activity yet</p>
              </div>
            ) : (
              crypto.top10.map((e: any, i: number) => (
                <div key={e.userId} className="flex items-center gap-3 px-4 py-3">
                  <div className="w-7 flex-shrink-0 flex justify-center">
                    {i === 0 && <Crown className="w-5 h-5 text-[#FBBF24]" />}
                    {i === 1 && <Crown className="w-5 h-5 text-[#C0C0C0]" />}
                    {i === 2 && <Crown className="w-5 h-5 text-[#CD7F32]" />}
                    {i >= 3 && <span className="text-[11px] font-bold text-[#64748B] w-5 text-center">{i + 1}</span>}
                  </div>
                  <div className="w-8 h-8 rounded-full bg-[#212429] border border-white/10 flex items-center justify-center text-[11px] font-black text-white flex-shrink-0">
                    {(e.name || '?').charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-white truncate">{e.name}</p>
                    <p className="text-[10px] text-[#64748B] truncate">@{(e.surexTag || '').replace('@', '')}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-black text-white">${fmt(e.total)}</p>
                    <p className="text-[10px] text-[#64748B]">USD</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Bills Leaderboard */}
        <div className="liquid-glass rounded-2xl border border-white/10 overflow-hidden">
          <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Award className="w-5 h-5 text-amber-400" />
              <p className="font-bold text-white text-sm">Bills Campaign</p>
            </div>
            <span className="text-[10px] text-[#64748B]">{bills.participants} participants · ${fmt(bills.grandTotal)} total</span>
          </div>
          <div className="divide-y divide-white/5">
            {bills.top10.length === 0 ? (
              <div className="p-8 text-center">
                <Users className="w-8 h-8 text-[#334155] mx-auto mb-2" />
                <p className="text-white font-semibold">No activity yet</p>
              </div>
            ) : (
              bills.top10.map((e: any, i: number) => (
                <div key={e.userId} className="flex items-center gap-3 px-4 py-3">
                  <div className="w-7 flex-shrink-0 flex justify-center">
                    {i === 0 && <Crown className="w-5 h-5 text-[#FBBF24]" />}
                    {i === 1 && <Crown className="w-5 h-5 text-[#C0C0C0]" />}
                    {i === 2 && <Crown className="w-5 h-5 text-[#CD7F32]" />}
                    {i >= 3 && <span className="text-[11px] font-bold text-[#64748B] w-5 text-center">{i + 1}</span>}
                  </div>
                  <div className="w-8 h-8 rounded-full bg-[#212429] border border-white/10 flex items-center justify-center text-[11px] font-black text-white flex-shrink-0">
                    {(e.name || '?').charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-white truncate">{e.name}</p>
                    <p className="text-[10px] text-[#64748B] truncate">@{(e.surexTag || '').replace('@', '')}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-black" style={{ color: accentHex }}>{e.sharePct}%</p>
                    <p className="text-[10px] text-[#64748B]">Share</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}