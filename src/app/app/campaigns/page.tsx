'use client'

import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { campaignsAPI, userAPI } from '@/lib/api'
import { useTheme } from '@/context/ThemeContext'
import { Trophy, Medal, Crown, Users, ReceiptText, ArrowLeft } from 'lucide-react'
import VerifiedCheckmark from '@/components/VerifiedCheckmark'

const RANGES: { key: 'day' | '7d' | '30d' | '365d' | 'all'; label: string }[] = [
  { key: 'day', label: 'Today' },
  { key: '7d', label: '7 Days' },
  { key: '30d', label: '30 Days' },
  { key: '365d', label: '365 Days' },
  { key: 'all', label: 'All Time' },
]

export default function CampaignsPage() {
  const { variant, colors } = useTheme()
  const isGold = variant === 'gold'
  const accentRgb = isGold ? '212, 160, 23' : '181, 226, 61'
  const accentHex = isGold ? '#D4A017' : '#B5E23D'
  const [type, setType] = useState<'bills' | 'crypto'>('crypto')
  const [range, setRange] = useState<'day' | '7d' | '30d' | '365d' | 'all'>('all')

  const { data: lb, isLoading } = useQuery({
    queryKey: ['campaign-leaderboard', type, range],
    queryFn: () => campaignsAPI.getLeaderboard(type, range),
  })

  const { data: profile } = useQuery({
    queryKey: ['profile'],
    queryFn: userAPI.getProfile,
    retry: false,
  })
  const myId = profile?.id

  const entries = lb?.entries || []
  const golden = new Set(lb?.goldenUserIds || [])

  const rankIcon = (rank: number) => {
    if (rank === 1) return <Crown className="w-4 h-4 text-[#FBBF24]" />
    if (rank === 2) return <Crown className="w-4 h-4 text-[#C0C0C0]" />
    if (rank === 3) return <Crown className="w-4 h-4 text-[#CD7F32]" />
    return <span className="text-[11px] font-bold text-[#64748B] w-4 text-center">{rank}</span>
  }

  return (
    <div className="w-full max-w-full overflow-x-hidden max-w-2xl mx-auto px-3 py-4 sm:p-6 md:p-8 space-y-5 pb-28 sm:pb-36">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => window.history.back()}
          className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-[#94A3B8] hover:text-white hover:bg-white/10 transition-all active:scale-95"
        >
          <ArrowLeft size={17} />
        </button>
        <div>
          <h1 className="text-white font-extrabold text-lg flex items-center gap-2">
            <Trophy className="w-5 h-5" style={{ color: colors.primary }} /> Leaderboard
          </h1>
          <p className="text-[11px] text-[#64748B]">Top movers this campaign — real numbers only</p>
        </div>
      </div>

      {/* Campaign tabs */}
      <div className="grid grid-cols-2 gap-2">
        {([
          { key: 'crypto', label: 'Crypto', icon: Trophy, desc: 'Total USD moved (send, receive, convert)' },
          { key: 'bills', label: 'Bills', icon: ReceiptText, desc: 'Share of all real bill payments' },
        ] as const).map((t) => {
          const active = type === t.key
          const Icon = t.icon
          return (
            <button
              key={t.key}
              onClick={() => setType(t.key)}
              className={`rounded-2xl p-4 text-left border ${
                active
                  ? 'bg-amber-500/10 border-amber-500/40 text-amber-400'
                  : 'bg-white/[0.03] border-white/10 text-[#94A3B8]'
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <Icon className={`w-4 h-4 ${active ? 'text-amber-400' : 'text-[#64748B]'}`} />
                <span className={`text-sm font-bold ${active ? 'text-white' : 'text-[#94A3B8]'}`}>{t.label}</span>
              </div>
              <p className="text-[10px] text-[#64748B] leading-snug">{t.desc}</p>
            </button>
          )
        })}
      </div>

      {/* Range pills — wrapped flex row with zero transition classes to prevent Webview layer leaks */}
      <div className="flex flex-wrap justify-center gap-1.5">
        {RANGES.map((r) => {
          const active = range === r.key
          return (
            <button
              key={r.key}
              onClick={() => setRange(r.key)}
              className={`px-3.5 py-1.5 rounded-full text-[11px] font-bold border ${
                active
                  ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                  : 'bg-white/[0.03] border-white/10 text-[#94A3B8]'
              }`}
            >
              {r.label}
            </button>
          )
        })}
      </div>

      {/* Leaderboard */}
      <div className="bg-[#121419] rounded-2xl border border-white/10 overflow-hidden min-h-[300px]">
        <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
          <p className="text-[11px] font-bold uppercase tracking-wider text-[#64748B]">
            {type === 'crypto' ? 'Total USD moved' : 'Share of all real bills'}
          </p>
          <span className="text-[10px] text-[#94A3B8]">{entries.length} participants</span>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 rounded-full border-2 border-white/10 border-t-white/40 animate-spin" />
          </div>
        ) : entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center px-6">
            <Users className="w-8 h-8 text-[#334155] mb-3" />
            <p className="text-white font-semibold text-sm">No activity yet</p>
            <p className="text-[#64748B] text-xs mt-1">
              {type === 'crypto' ? 'Send, receive or convert to climb the crypto leaderboard.' : 'Pay a bill with real naira to claim your share.'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {entries.map((e: any, i: number) => {
              const isMe = myId && e.userId === myId
              const top = golden.has(e.userId)
              return (
                <div
                  key={e.userId}
                  className={`flex items-center gap-3 px-4 py-3 ${isMe ? 'bg-white/[0.04]' : ''}`}
                >
                  <div className="w-7 flex-shrink-0 flex justify-center">{rankIcon(e.rank)}</div>
                  <div className="w-9 h-9 rounded-full bg-[#212429] border border-white/10 flex items-center justify-center text-[11px] font-black text-white flex-shrink-0">
                    {(e.name || '?').charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-bold text-white truncate">{e.name}</p>
                      {top && <VerifiedCheckmark size={13} variant={isGold ? 'gold' : 'lemon'} />}
                      {isMe && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-white/10 text-white font-bold flex-shrink-0">You</span>}
                    </div>
                    <p className="text-[10px] text-[#64748B] truncate">
                      {e.surexTag ? `@${e.surexTag}` : ''}
                      {top && <span className="text-[#D4A017] ml-1 font-bold">★ Top 5</span>}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    {type === 'crypto' ? (
                      <p className="text-sm font-black text-white">${e.total.toLocaleString(undefined, { maximumFractionDigits: 2 })}</p>
                    ) : (
                      <p className="text-sm font-black" style={{ color: accentHex }}>{e.sharePct}%</p>
                    )}
                    {type === 'crypto' && <p className="text-[10px] text-[#64748B]">USD</p>}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <p className="text-[10px] text-[#64748B] text-center px-6 leading-relaxed">
        {type === 'crypto'
          ? 'Crypto total = completed sends, receives & conversions (all converted to USD).'
          : 'Your share = your real-naira bill spend ÷ everyone\u2019s total. All shares add up to 100%. The top 5 in each campaign earn the golden tick.'}
      </p>
    </div>
  )
}
