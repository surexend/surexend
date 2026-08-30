'use client'

import { useState } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { Rocket, X, Check, Bell, Sparkles } from 'lucide-react'
import toast from 'react-hot-toast'
import { useTheme } from '@/context/ThemeContext'

interface ComingSoonProps {
  open: boolean
  onClose: () => void
  /** Big headline — e.g. "Send to Local Bank Accounts" */
  title: string
  /** One-sentence summary shown below the title. */
  subtitle: string
  /** Short list of what to expect — 3-5 bullets, plain language. */
  features: string[]
  /** Optional ETA line — e.g. "Rolling out in Q3 2026". */
  eta?: string
  /** Where "Notify me" waitlist emails get sent. Falls back to the global contact. */
  notifyEmail?: string
}

export default function ComingSoon({ open, onClose, title, subtitle, features, eta, notifyEmail }: ComingSoonProps) {
  const { colors, variant } = useTheme()
  const isGold = variant === 'gold'
  const reduceMotion = useReducedMotion()
  const [email, setEmail] = useState('')
  const [submitted, setSubmitted] = useState(false)

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error('Enter a valid email')
      return
    }
    try {
      const key = 'surexend_waitlist'
      const list = JSON.parse(localStorage.getItem(key) || '[]') as { email: string; at: string; feature: string }[]
      list.push({ email, at: new Date().toISOString(), feature: title })
      localStorage.setItem(key, JSON.stringify(list))
    } catch { /* ignore */ }
    setSubmitted(true)
    toast.success("You're on the list — we'll email you when it ships.")
  }

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center p-3 sm:p-4 liquid-backdrop">
          <motion.div
            initial={{ opacity: 0, y: 40, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 40, scale: 0.96 }}
            transition={{ type: 'spring', damping: 26, stiffness: 280 }}
            className="relative w-full sm:max-w-md max-h-[88vh] overflow-y-auto liquid-glass-strong rounded-3xl border shadow-2xl"
            style={{ borderColor: isGold ? 'rgba(212, 160, 23, 0.45)' : 'rgba(181, 226, 61, 0.45)' }}
          >
            {/* Decorative gradient halo at top */}
            <div
              className="absolute inset-x-0 top-0 h-36 pointer-events-none"
              style={{ background: `radial-gradient(60% 80% at 50% 0%, rgba(${colors.glowRgb}, 0.22), transparent 70%)` }}
            />
            <div
              className="absolute inset-x-0 top-0 h-[2px] pointer-events-none"
              style={{ background: `linear-gradient(90deg, transparent, rgba(${colors.glowRgb}, 0.85), transparent)` }}
            />

            <div className="relative p-5 sm:p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className="relative w-10 h-10 rounded-xl flex items-center justify-center border shadow-md flex-shrink-0"
                    style={{
                      background: `rgba(${colors.glowRgb}, 0.14)`,
                      borderColor: `rgba(${colors.glowRgb}, 0.35)`,
                      boxShadow: `0 6px 18px rgba(${colors.glowRgb}, 0.15)`,
                    }}
                  >
                    <motion.div
                      animate={reduceMotion ? undefined : { y: [0, -3, 0] }}
                      transition={reduceMotion ? undefined : { duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
                    >
                      <Rocket className="w-5 h-5" style={{ color: colors.primary }} />
                    </motion.div>
                    <span
                      className="absolute -top-1 -right-1 w-3 h-3 rounded-full flex items-center justify-center"
                      style={{ background: colors.primary }}
                    >
                      <Sparkles className="w-2 h-2 text-black" strokeWidth={2.5} />
                    </span>
                  </div>
                  <span
                    className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider border"
                    style={{ color: colors.primary, borderColor: `rgba(${colors.glowRgb}, 0.4)`, background: `rgba(${colors.glowRgb}, 0.1)` }}
                  >
                    Coming soon
                  </span>
                </div>
                <button
                  onClick={onClose}
                  className="p-1.5 rounded-full hover:bg-white/10 text-[#64748B] hover:text-white transition-colors"
                  aria-label="Close"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div>
                <h2 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight leading-snug">{title}</h2>
                <p className="text-xs sm:text-sm text-[#94A3B8] leading-relaxed mt-1.5">{subtitle}</p>
                {eta && (
                  <p className="text-[11px] text-[#64748B] mt-2 inline-flex items-center gap-1.5 font-medium">
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: colors.primary }} />
                    {eta}
                  </p>
                )}
              </div>

              <div className="p-3.5 sm:p-4 rounded-2xl bg-white/[0.03] border border-white/[0.08] space-y-2">
                <p className="text-[10px] uppercase tracking-wider font-bold text-[#64748B]">What to expect</p>
                <ul className="space-y-2">
                  {features.map((f, i) => (
                    <li key={i} className="flex items-start gap-2.5 text-xs sm:text-sm text-white">
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

              {submitted ? (
                <div className="p-3.5 rounded-2xl border border-emerald-500/30 bg-emerald-500/[0.06] flex items-center gap-3">
                  <span className="w-8 h-8 rounded-full flex items-center justify-center bg-emerald-500/20 text-emerald-400 flex-shrink-0">
                    <Check className="w-4 h-4" strokeWidth={3} />
                  </span>
                  <div>
                    <p className="text-xs font-bold text-white">You're on the list</p>
                    <p className="text-[10px] text-[#94A3B8]">We'll email you the moment it goes live.</p>
                  </div>
                </div>
              ) : (
                <form onSubmit={submit} className="space-y-2">
                  <label className="text-[10px] uppercase tracking-wider font-bold text-[#94A3B8] flex items-center gap-1.5">
                    <Bell className="w-3 h-3" /> Notify me when this launches
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="flex-1 px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/10 text-white text-xs sm:text-sm focus:outline-none focus:border-white/30 focus:bg-white/[0.06] transition-colors"
                    />
                    <button
                      type="submit"
                      className="px-4 py-2.5 rounded-xl font-bold text-black text-xs sm:text-sm transition-transform active:scale-[0.97] shadow-lg flex-shrink-0"
                      style={{ background: colors.gradientBg }}
                    >
                      Notify me
                    </button>
                  </div>
                </form>
              )}

              <button
                onClick={onClose}
                className="w-full py-2.5 rounded-xl border border-white/10 bg-white/[0.02] hover:bg-white/[0.06] text-white text-xs sm:text-sm font-semibold transition-colors"
              >
                Got it
              </button>

              {notifyEmail && (
                <p className="text-[10px] text-[#475569] text-center">
                  Questions? <a href={`mailto:${notifyEmail}`} className="underline hover:text-[#94A3B8]">{notifyEmail}</a>
                </p>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
