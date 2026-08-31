'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTheme } from '@/context/ThemeContext'
import { referralAPI } from '@/lib/api'
import {
  Award, Check, Copy, Crown, Gift, RefreshCw, Share2,
  Sparkles, Star, TrendingUp, UserPlus, Users,
} from 'lucide-react'
import toast from 'react-hot-toast'

const TIERS = [
  { name: 'Bronze', icon: Star, min: 0, max: 9, color: '#D69E6B', rate: 0.3 },
  { name: 'Silver', icon: Award, min: 10, max: 49, color: '#CBD5E1', rate: 0.4 },
  { name: 'Gold', icon: Crown, min: 50, max: 199, color: '#FFD966', rate: 0.5 },
  { name: 'Platinum', icon: Sparkles, min: 200, max: Infinity, color: '#67E8F9', rate: 0.6 },
]

function getTier(count: number) {
  return TIERS.find((tier) => count >= tier.min && count <= tier.max) || TIERS[0]
}

export default function ReferralsPage() {
  const { variant, colors } = useTheme()
  const accentRgb = variant === 'gold' ? '212, 160, 23' : '181, 226, 61'
  const [copied, setCopied] = useState<'code' | 'link' | null>(null)
  const [activeTab, setActiveTab] = useState<'overview' | 'people' | 'earnings'>('overview')

  const statsQuery = useQuery({ queryKey: ['referral-stats'], queryFn: referralAPI.getStats, retry: 1 })
  const peopleQuery = useQuery({
    queryKey: ['referrals', 1, 50],
    queryFn: () => referralAPI.getReferrals(1, 50),
    enabled: activeTab === 'people',
  })
  const earningsQuery = useQuery({
    queryKey: ['referral-earnings'],
    queryFn: referralAPI.getEarnings,
    enabled: activeTab === 'earnings',
  })

  const stats = statsQuery.data
  const code = stats?.referralCode || ''
  const link = stats?.referralLink || (code ? `https://surexend.com/ref/${code}` : '')
  const total = stats?.totalReferrals || 0
  const tier = getTier(total)
  const nextTier = TIERS[TIERS.indexOf(tier) + 1]
  const progress = nextTier ? Math.min(100, ((total - tier.min) / (nextTier.min - tier.min)) * 100) : 100
  const TierIcon = tier.icon

  const copy = async (value: string, type: 'code' | 'link') => {
    if (!value) return
    await navigator.clipboard.writeText(value)
    setCopied(type)
    toast.success(type === 'code' ? 'Referral code copied' : 'Invite link copied')
    window.setTimeout(() => setCopied(null), 1800)
  }

  const share = async () => {
    if (!link) return
    const shareData = {
      title: 'Join me on SureXend',
      text: `Use my SureXend invite code ${code} when you create your account.`,
      url: link,
    }
    if (navigator.share) await navigator.share(shareData).catch(() => {})
    else await copy(link, 'link')
  }

  if (statsQuery.isLoading) {
    return <div className="min-h-[65vh] grid place-items-center"><RefreshCw className="w-6 h-6 animate-spin text-[#94A3B8]" /></div>
  }

  if (statsQuery.isError) {
    return (
      <div className="max-w-lg mx-auto px-4 py-20 text-center">
        <div className="w-12 h-12 mx-auto rounded-2xl bg-red-500/10 text-red-400 grid place-items-center mb-4"><Gift className="w-5 h-5" /></div>
        <h1 className="text-white font-bold">Referral details are unavailable</h1>
        <p className="text-sm text-[#64748B] mt-1">Your account data was not replaced with demo information. Try again when the connection is restored.</p>
        <button onClick={() => statsQuery.refetch()} className="mt-5 px-4 py-2.5 rounded-xl bg-white/10 text-white text-sm font-semibold">Try again</button>
      </div>
    )
  }

  return (
    <div className="w-full max-w-3xl mx-auto px-3 py-4 sm:p-6 md:p-8 pb-28 sm:pb-32 space-y-5">
      <header className="flex items-end justify-between gap-4 border-b border-white/5 pb-4">
        <div>
          <p className="text-[10px] uppercase tracking-[0.18em] font-bold" style={{ color: colors.primary }}>Invite program</p>
          <h1 className="text-white text-xl sm:text-2xl font-extrabold mt-1">Grow your circle</h1>
          <p className="text-[#94A3B8] text-xs sm:text-sm mt-1">Share your unique invite. New registrations appear here automatically.</p>
        </div>
        <div className="hidden sm:grid w-11 h-11 rounded-2xl place-items-center border border-white/10 bg-white/[0.04]">
          <UserPlus className="w-5 h-5" style={{ color: colors.primary }} />
        </div>
      </header>

      <section className="relative overflow-hidden rounded-[28px] border border-white/15 bg-white/[0.065] p-4 sm:p-6 shadow-2xl backdrop-blur-2xl">
        <div className="absolute inset-x-0 top-0 h-px" style={{ background: `linear-gradient(90deg, transparent, rgba(${accentRgb}, .8), transparent)` }} />
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] text-[#94A3B8] font-medium">Your invite code</p>
            <button onClick={() => copy(code, 'code')} className="mt-1 flex items-center gap-2 text-left group">
              <span className="font-mono text-2xl sm:text-3xl font-black text-white tracking-wider">{code}</span>
              {copied === 'code' ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4 text-[#64748B] group-hover:text-white" />}
            </button>
          </div>
          <div className="px-2.5 py-1.5 rounded-full border text-[10px] font-bold flex items-center gap-1.5" style={{ color: tier.color, borderColor: `${tier.color}55`, background: `${tier.color}14` }}>
            <TierIcon className="w-3 h-3" /> {tier.name}
          </div>
        </div>

        <div className="mt-5 rounded-2xl border border-white/10 bg-black/25 p-2 flex items-center gap-2">
          <p className="min-w-0 flex-1 truncate px-2 text-xs text-[#CBD5E1] font-mono">{link}</p>
          <button onClick={() => copy(link, 'link')} title="Copy invite link" className="w-10 h-10 rounded-xl bg-white/10 hover:bg-white/15 grid place-items-center text-white flex-shrink-0">
            {copied === 'link' ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
          </button>
          <button onClick={share} title="Share invite" className="w-10 h-10 rounded-xl grid place-items-center text-black flex-shrink-0" style={{ background: colors.primary }}>
            <Share2 className="w-4 h-4" />
          </button>
        </div>
      </section>

      {stats?.campaign && (
        <section className="relative overflow-hidden rounded-2xl border border-emerald-500/25 bg-emerald-500/[0.06] p-4 sm:p-5">
          <div className="absolute -right-7 -top-7 w-28 h-28 rounded-full bg-emerald-400/10 blur-2xl" />
          <div className="relative flex gap-3"><div className="w-10 h-10 rounded-xl grid place-items-center bg-emerald-500/15 border border-emerald-500/25"><Gift className="w-5 h-5 text-emerald-400" /></div><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-3"><div><p className="text-sm font-extrabold text-white">Invite {stats.campaign.requiredReferrals}, receive {stats.campaign.reward} {stats.campaign.currency}</p><p className="text-[11px] text-[#94A3B8] mt-0.5">Only active, attributed referrals count toward this one-time campaign reward.</p></div><span className="text-sm font-black text-emerald-400 whitespace-nowrap">{stats.campaign.completedReferrals}/{stats.campaign.requiredReferrals}</span></div><div className="mt-3 h-2 rounded-full bg-black/25 overflow-hidden"><div className="h-full rounded-full bg-emerald-400 transition-all" style={{ width: `${Math.min(100, (stats.campaign.completedReferrals / stats.campaign.requiredReferrals) * 100)}%` }} /></div><p className={`mt-2 text-[11px] font-semibold ${stats.campaign.status === 'PAID' ? 'text-emerald-300' : stats.campaign.eligible ? 'text-amber-300' : 'text-[#94A3B8]'}`}>{stats.campaign.status === 'PAID' ? `${stats.campaign.reward} ${stats.campaign.currency} has been sent to your wallet.` : stats.campaign.status === 'PENDING' || stats.campaign.status === 'PROCESSING' ? `Your ${stats.campaign.reward} ${stats.campaign.currency} payout is being securely processed.` : stats.campaign.eligible ? `You qualify for ${stats.campaign.reward} ${stats.campaign.currency}. Your reward is queued for secure payout.` : `${stats.campaign.remainingReferrals} more active referral${stats.campaign.remainingReferrals === 1 ? '' : 's'} to qualify.`}</p></div></div>
        </section>
      )}

      <section className="grid grid-cols-3 gap-2 sm:gap-3">
        {[
          ['Invited', total, Users, '#E2E8F0'],
          ['Active', stats?.activeReferrals || 0, TrendingUp, '#34D399'],
          ['Earned', `${Number(stats?.totalEarned || 0).toFixed(2)}`, Gift, colors.primary],
        ].map(([label, value, Icon, color]) => (
          <div key={String(label)} className="min-w-0 rounded-2xl border border-white/10 bg-white/[0.035] p-3 sm:p-4">
            <Icon className="w-4 h-4 mb-3" style={{ color: String(color) }} />
            <p className="text-lg sm:text-2xl font-black text-white truncate">{value}</p>
            <p className="text-[10px] sm:text-xs text-[#64748B]">{label}{label === 'Earned' ? ' USDC' : ''}</p>
          </div>
        ))}
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/[0.025] p-4">
        <div className="flex justify-between text-xs mb-2"><span className="text-white font-semibold">{tier.name} tier · {tier.rate}% of eligible fees</span><span className="text-[#64748B]">{nextTier ? `${nextTier.min - total} to ${nextTier.name}` : 'Top tier'}</span></div>
        <div className="h-1.5 rounded-full bg-white/10 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${progress}%`, background: colors.primary }} /></div>
      </section>

      <div className="grid grid-cols-3 border-b border-white/10">
        {([['overview', 'How it works'], ['people', 'Invited people'], ['earnings', 'Earnings']] as const).map(([key, label]) => (
          <button key={key} onClick={() => setActiveTab(key)} className={`relative py-3 text-xs font-semibold ${activeTab === key ? 'text-white' : 'text-[#64748B]'}`}>
            {label}
            {activeTab === key && <span className="absolute inset-x-3 bottom-0 h-0.5 rounded-full" style={{ background: colors.primary }} />}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && (
        <div className="divide-y divide-white/5 rounded-2xl border border-white/10 bg-white/[0.025] px-4">
          {[
            ['Share your personal invite', 'Friends open the link and your code is attached to registration automatically.'],
            ['Registration is attributed', 'As soon as their account is created, they appear in your invited people list.'],
            ['Eligible activity earns rewards', 'Referral earnings are credited to your wallet and recorded in your earnings history.'],
          ].map(([title, body], index) => (
            <div key={title} className="flex gap-3 py-4">
              <span className="w-7 h-7 rounded-full border border-white/10 bg-white/5 grid place-items-center text-[11px] font-bold text-white flex-shrink-0">{index + 1}</span>
              <div><p className="text-sm font-semibold text-white">{title}</p><p className="text-xs text-[#64748B] mt-1 leading-relaxed">{body}</p></div>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'people' && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.025] overflow-hidden">
          {peopleQuery.isLoading ? <div className="py-12 grid place-items-center"><RefreshCw className="w-5 h-5 animate-spin text-[#64748B]" /></div> :
          peopleQuery.isError ? <div className="p-6 text-center text-xs text-red-300">Could not load invited users.</div> :
          !peopleQuery.data?.referrals?.length ? (
            <div className="py-12 px-6 text-center"><Users className="w-7 h-7 mx-auto text-[#475569]" /><p className="text-white text-sm font-semibold mt-3">No invited users yet</p><p className="text-xs text-[#64748B] mt-1">Share your link. New signups will appear here.</p></div>
          ) : peopleQuery.data.referrals.map((person: any) => (
            <div key={person.id} className="flex items-center gap-3 p-4 border-b border-white/5 last:border-0">
              <div className="w-9 h-9 rounded-full bg-white/10 grid place-items-center text-xs font-bold text-white">{person.firstName?.[0]}{person.lastName?.[0]}</div>
              <div className="min-w-0 flex-1"><p className="text-sm text-white font-semibold truncate">{person.firstName} {person.lastName}</p><p className="text-[11px] text-[#64748B]">Joined {new Date(person.joinedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</p></div>
              <div className="text-right"><p className="text-xs font-semibold text-emerald-400">{Number(person.earnings || 0).toFixed(2)} USDC</p><p className="text-[10px] text-[#64748B]">{person.isActive ? 'Active' : 'Inactive'}</p></div>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'earnings' && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.025] overflow-hidden">
          {earningsQuery.isLoading ? <div className="py-12 grid place-items-center"><RefreshCw className="w-5 h-5 animate-spin text-[#64748B]" /></div> :
          earningsQuery.isError ? <div className="p-6 text-center text-xs text-red-300">Could not load earnings history.</div> :
          !earningsQuery.data?.length ? (
            <div className="py-12 px-6 text-center"><TrendingUp className="w-7 h-7 mx-auto text-[#475569]" /><p className="text-white text-sm font-semibold mt-3">No referral earnings yet</p><p className="text-xs text-[#64748B] mt-1">Completed rewards will be listed by month.</p></div>
          ) : earningsQuery.data.map((row: any) => (
            <div key={row.month} className="flex items-center justify-between p-4 border-b border-white/5 last:border-0">
              <p className="text-sm text-white font-medium">{new Date(`${row.month}-01T00:00:00`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</p>
              <p className="text-sm text-emerald-400 font-bold">+{Number(row.amount || 0).toFixed(2)} USDC</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
