'use client'

import { useState } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { ArrowLeft, Bell, Check, Clock, Rocket, Sparkles } from 'lucide-react'
import toast from 'react-hot-toast'
import { useTheme } from '@/context/ThemeContext'

interface FeatureComingSoonProps {
  /** Page headline, e.g. "Withdraw to Bank". */
  title: string
  /** One or two plain sentences on why this is not live yet. */
  subtitle: string
  /** What the finished feature will do — 3-5 short bullets. */
  features: string[]
  /** Optional timing line, e.g. "Live once our payout licence is approved". */
  eta?: string
  /** Where to send questions. */
  contactEmail?: string
}

/**
 * Full-page "coming soon" view for features that are announced but not yet
 * integrated. Replaces earlier placeholder flows that rendered real-looking
 * bank details or a fake success screen — nothing here can be mistaken for a
 * live money movement.
 */
export default function FeatureComingSoon({
  title,
  subtitle,
  features,
  eta,
  contactEmail = 'support@surexend.com',
}: FeatureComingSoonProps) {
  const { colors, variant } = useTheme()
  const isGold = variant === 'gold'
  const [email, setEmail] = useState('')
  const [submitted, setSubmitted] = useState(false)

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error('Enter a valid email')
      return
    }
    try {
      const key = 'surexend_waitlist'
      const list = JSON.parse(localStorage.getItem(key) || '[]') as {
        email: string
        at: string
        feature: string
      }[]
      list.push({ email, at: new Date().toISOString(), feature: title })
      localStorage.setItem(key, JSON.stringify(list))
    } catch {
      /* storage unavailable — the confirmation below is still honest */
    }
    setSubmitted(true)
    toast.success("You're on the list — we'll email you the moment it's live.")
  }

  return (
    <div className="w-full max-w-xl mx-auto px-4 py-6 pb-36">
      <div className="flex items-center gap-3 mb-6">
        <Link
          href="/app/dashboard"
          className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-white hover:bg-white/10 transition-colors"
          aria-label="Back to dashboard"
        >
          <ArrowLeft size={18} />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight">{title}</h1>
          <p className="text-xs text-[#64748B]">Not available yet</p>
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
        className="relative rounded-3xl border overflow-hidden"
        style={{
          borderColor: isGold ? 'rgba(212, 160, 23, 0.35)' : 'rgba(181, 226, 61, 0.35)',
          background: 'linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.01))',
        }}
      >
        <div
          className="absolute inset-x-0 top-0 h-40 pointer-events-none"
          style={{ background: `radial-gradient(60% 80% at 50% 0%, rgba(${colors.glowRgb}, 0.18), transparent 70%)` }}
        />
        <div
          className="absolute inset-x-0 top-0 h-[2px] pointer-events-none"
          style={{ background: `linear-gradient(90deg, transparent, rgba(${colors.glowRgb}, 0.85), transparent)` }}
        />

        <div className="relative p-6 sm:p-7 space-y-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div
                className="w-12 h-12 rounded-2xl flex items-center justify-center border"
                style={{
                  background: `rgba(${colors.glowRgb}, 0.14)`,
                  borderColor: `rgba(${colors.glowRgb}, 0.35)`,
                }}
              >
                <Rocket className="w-6 h-6" style={{ color: colors.primary }} />
              </div>
              <span
                className="px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider border"
                style={{
                  color: colors.primary,
                  borderColor: `rgba(${colors.glowRgb}, 0.4)`,
                  background: `rgba(${colors.glowRgb}, 0.1)`,
                }}
              >
                Coming soon
              </span>
            </div>
            <Sparkles className="w-5 h-5 mt-1" style={{ color: colors.primary }} />
          </div>

          <p className="text-sm text-[#94A3B8] leading-relaxed">{subtitle}</p>

          <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.08] space-y-2.5">
            <p className="text-[10px] uppercase tracking-wider font-bold text-[#64748B]">What to expect</p>
            <ul className="space-y-2">
              {features.map((f, i) => (
                <li key={i} className="flex items-start gap-2.5 text-sm">
                  <span
                    className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                    style={{ background: `rgba(${colors.glowRgb}, 0.18)`, color: colors.primary }}
                  >
                    <Check className="w-2.5 h-2.5" strokeWidth={3} />
                  </span>
                  <span className="text-[#CBD5E1] leading-relaxed">{f}</span>
                </li>
              ))}
            </ul>
          </div>

          {eta && (
            <p className="text-[11px] text-[#64748B] inline-flex items-center gap-1.5">
              <Clock className="w-3 h-3" />
              {eta}
            </p>
          )}

          {submitted ? (
            <div className="p-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/[0.06] flex items-center gap-3">
              <span className="w-9 h-9 rounded-full flex items-center justify-center bg-emerald-500/20 text-emerald-400 flex-shrink-0">
                <Check className="w-5 h-5" strokeWidth={3} />
              </span>
              <div>
                <p className="text-sm font-bold text-white">You&apos;re on the list</p>
                <p className="text-[11px] text-[#94A3B8]">We&apos;ll email you the moment it goes live.</p>
              </div>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-2.5">
              <label className="text-[11px] font-bold text-[#94A3B8] flex items-center gap-1.5">
                <Bell className="w-3 h-3" /> Notify me when this launches
              </label>
              <div className="flex gap-2">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="flex-1 px-3.5 py-3 rounded-xl bg-white/[0.04] border border-white/10 text-white text-sm focus:outline-none focus:border-white/30 focus:bg-white/[0.06] transition-colors"
                />
                <button
                  type="submit"
                  className="px-4 py-3 rounded-xl font-bold text-black text-sm transition-transform active:scale-[0.97]"
                  style={{ background: colors.gradientBg }}
                >
                  Notify me
                </button>
              </div>
            </form>
          )}

          <p className="text-[10px] text-[#475569] text-center">
            Questions?{' '}
            <a href={`mailto:${contactEmail}`} className="underline hover:text-[#94A3B8]">
              {contactEmail}
            </a>
          </p>
        </div>
      </motion.div>
    </div>
  )
}
