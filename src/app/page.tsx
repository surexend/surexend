'use client'

import React, { useEffect, useRef, useState } from 'react'
import { motion, useScroll, useTransform, AnimatePresence } from 'framer-motion'
import { useTheme } from '@/context/ThemeContext'
import SurexendLoader from '@/components/SurexendLoader'
import {
  ArrowRight, Send, RefreshCw, Zap, Shield, Users, User, Globe,
  ChevronDown, Check, Star, MessageCircle, X, Menu, Download,
  TrendingUp, Wallet, CreditCard, Smartphone, Lock, Clock,
  BarChart3, Gift, ChevronRight, PlusCircle, Eye
} from 'lucide-react'
import Link from 'next/link'

// ── Animated counter ────────────────────────────────────────────────────
function AnimatedNumber({ value, suffix = '', prefix = '' }: { value: number; suffix?: string; prefix?: string }) {
  const [displayed, setDisplayed] = useState(0)
  const ref = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          let start = 0
          const duration = 2000
          const step = value / (duration / 16)
          const timer = setInterval(() => {
            start += step
            if (start >= value) { setDisplayed(value); clearInterval(timer) }
            else setDisplayed(Math.floor(start))
          }, 16)
          observer.disconnect()
        }
      },
      { threshold: 0.5 }
    )
    if (ref.current) observer.observe(ref.current)
    return () => observer.disconnect()
  }, [value])

  return (
    <span ref={ref}>
      {prefix}{displayed.toLocaleString()}{suffix}
    </span>
  )
}

// ── Feature card ────────────────────────────────────────────────────────
function FeatureCard({
  icon: Icon, title, desc, accent, delay = 0
}: { icon: any; title: string; desc: string; accent: string; delay?: number }) {
  return (
    <motion.div
      className="liquid-glass p-6 group cursor-default"
      style={{ borderColor: `rgba(${accent}, 0.15)` }}
      initial={{ opacity: 0, y: 40 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.6, delay, ease: [0.25, 0.46, 0.45, 0.94] }}
      whileHover={{ y: -6, borderColor: `rgba(${accent}, 0.35)`, boxShadow: `0 20px 60px rgba(${accent}, 0.1)` }}
    >
      <div
        className="w-12 h-12 rounded-xl flex items-center justify-center mb-4"
        style={{ background: `rgba(${accent}, 0.12)`, border: `1px solid rgba(${accent}, 0.2)` }}
      >
        <Icon size={22} style={{ color: `rgb(${accent})` }} />
      </div>
      <h3 className="font-inter font-semibold text-white text-lg mb-2">{title}</h3>
      <p className="text-[#94A3B8] text-sm leading-relaxed">{desc}</p>
    </motion.div>
  )
}

// ── Step card ───────────────────────────────────────────────────────────
function StepCard({ n, title, desc, accent, delay = 0 }: { n: number; title: string; desc: string; accent: string; delay?: number }) {
  return (
    <motion.div
      className="flex gap-5 items-start"
      initial={{ opacity: 0, x: -30 }}
      whileInView={{ opacity: 1, x: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5, delay }}
    >
      <div
        className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 font-inter font-bold text-sm mt-1"
        style={{
          background: `linear-gradient(135deg, rgba(${accent}, 0.3), rgba(${accent}, 0.1))`,
          border: `2px solid rgba(${accent}, 0.4)`,
          color: `rgb(${accent})`,
          boxShadow: `0 0 20px rgba(${accent}, 0.2)`,
        }}
      >
        {n}
      </div>
      <div>
        <h4 className="font-inter font-semibold text-white text-lg mb-1">{title}</h4>
        <p className="text-[#94A3B8] text-sm leading-relaxed">{desc}</p>
      </div>
    </motion.div>
  )
}

// ── Testimonial ─────────────────────────────────────────────────────────
function TestimonialCard({ name, role, country, text, accent, delay = 0 }: {
  name: string; role: string; country: string; text: string; accent: string; delay?: number
}) {
  return (
    <motion.div
      className="liquid-glass p-6 flex flex-col gap-4"
      initial={{ opacity: 0, scale: 0.95 }}
      whileInView={{ opacity: 1, scale: 1 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5, delay }}
    >
      <div className="flex gap-1">
        {Array.from({ length: 5 }, (_, i) => (
          <Star key={i} size={14} fill={`rgb(${accent})`} style={{ color: `rgb(${accent})` }} />
        ))}
      </div>
      <p className="text-[#CBD5E1] text-sm leading-relaxed italic">&ldquo;{text}&rdquo;</p>
      <div className="flex items-center gap-3 pt-2 border-t border-white/5">
        <div
          className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold"
          style={{ background: `rgba(${accent}, 0.2)`, color: `rgb(${accent})` }}
        >
          {name[0]}
        </div>
        <div>
          <p className="text-white text-sm font-semibold">{name}</p>
          <p className="text-[#64748B] text-xs">{role} · {country}</p>
        </div>
      </div>
    </motion.div>
  )
}

// ── FAQ item ────────────────────────────────────────────────────────────
function FAQItem({ q, a, accent }: { q: string; a: string; accent: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div
      className="border-b"
      style={{ borderColor: 'rgba(255,255,255,0.06)' }}
    >
      <button
        className="w-full flex items-center justify-between py-5 text-left group"
        onClick={() => setOpen(!open)}
      >
        <span className="text-white font-medium text-base pr-4 group-hover:text-white/80 transition-colors">{q}</span>
        <motion.div animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.3 }}>
          <ChevronDown size={18} style={{ color: `rgb(${accent})`, flexShrink: 0 }} />
        </motion.div>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="overflow-hidden"
          >
            <p className="text-[#94A3B8] text-sm leading-relaxed pb-5">{a}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════
// LANDING PAGE
// ══════════════════════════════════════════════════════════════════════════

export default function LandingPage() {
  const { variant, colors } = useTheme()
  const [menuOpen, setMenuOpen] = useState(false)
  const [showLoader, setShowLoader] = useState(true)
  const [scrolled, setScrolled] = useState(false)
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches
  )
  const { scrollY } = useScroll()
  const heroOpacity = useTransform(scrollY, [0, 400], [1, 0])
  const heroScale = useTransform(scrollY, [0, 400], [1, 0.95])

  // Theme-dependent values
  const isGold = variant === 'gold'
  const accentRgb = isGold ? '212, 160, 23' : '181, 226, 61'
  const accentHex = isGold ? '#D4A017' : '#B5E23D'
  const accentLight = isGold ? '#FFD700' : '#D4FF4A'
  const btnClass = isGold ? 'btn-gold' : 'btn-lemon'
  const btnOutlineClass = isGold ? 'btn-outline-gold' : 'btn-outline-lemon'
  const gradientText = isGold ? 'gradient-text-gold' : 'gradient-text-lemon'

  useEffect(() => {
    const timer = setTimeout(() => setShowLoader(false), 2800)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    const unsub = scrollY.on('change', v => setScrolled(v > 20))
    return unsub
  }, [scrollY])

  // Keep the landing page static on phones: the animated blur orbs and the
  // sticky-nav backdrop-filter tear into glitchy bands on Android Chrome.
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)')
    setIsMobile(mq.matches)
    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  const navLinks = ['Features', 'How It Works', 'Security', 'Pricing', 'Support']
  const stats = [
    { val: 50000, suffix: '+', label: 'Active Users' },
    { val: 120, prefix: '$', suffix: 'M+', label: 'Processed' },
    { val: 15, suffix: '+', label: 'African Countries' },
    { val: 99.9, suffix: '%', label: 'Uptime' },
  ]
  const features = [
    { icon: Send, title: 'Instant Transfers', desc: 'Send USDC to anyone in Africa or worldwide. Instant settlement, zero delays.', delay: 0 },
    { icon: RefreshCw, title: 'Crypto to Bank', desc: 'Convert your stablecoins to naira, cedi, shillings, or any African currency — directly to your bank account.', delay: 0.1 },
    { icon: Smartphone, title: 'Airtime & Data', desc: 'Top up any Nigerian network — MTN, Airtel, Glo, 9mobile. Expanding to all of Africa.', delay: 0.2 },
    { icon: CreditCard, title: 'Pay Bills', desc: 'Electricity, DSTV, GOtv, water bills — pay everything in seconds from your stablecoin wallet.', delay: 0.3 },
    { icon: TrendingUp, title: 'Live Rates', desc: 'Real-time exchange rates. Always know exactly what you\'ll receive before you convert.', delay: 0.4 },
    { icon: Gift, title: 'Earn Referrals', desc: 'Invite friends and earn from every transaction they make. Watch your passive income grow.', delay: 0.5 },
    { icon: Shield, title: 'Bank-Level Security', desc: '2FA, biometric PIN, encrypted storage, and real-time fraud detection protect every transaction.', delay: 0.6 },
    { icon: BarChart3, title: 'Rich History', desc: 'Filter transactions by day, week, month, or year. Download PDF statements anytime.', delay: 0.7 },
  ]
  const steps = [
    { title: 'Create your account', desc: 'Sign up in under 2 minutes. Email, phone, done. No lengthy forms.' },
    { title: 'Verify your identity (KYC)', desc: 'Quick, Africa-native identity verification. Supports NIN, Ghana Card, Kenyan ID, and more.' },
    { title: 'Deposit USDC', desc: 'Receive your unique wallet address. Send stablecoins from any exchange — Binance, Bybit, OKX.' },
    { title: 'Spend like cash', desc: 'Send money, pay bills, convert to fiat, buy airtime. Your crypto is now everyday money.' },
  ]
  const testimonials = [
    { name: 'Adaeze O.', role: 'Freelancer', country: 'Lagos, Nigeria', text: 'I get paid in USDC from my clients abroad. SureXend lets me pay my rent and buy data without ever visiting a bank. This is the future.' },
    { name: 'Kwame A.', role: 'E-commerce Seller', country: 'Accra, Ghana', text: 'Converting crypto to GHS used to take 2 days on P2P. With SureXend it hits my account in minutes. Changed my business completely.' },
    { name: 'Fatima M.', role: 'Remote Worker', country: 'Nairobi, Kenya', text: 'The referral program alone is paying my internet bill every month. And paying bills with USDC? Absolute game changer.' },
  ]
  const faqs = [
    { q: 'What cryptocurrencies does SureXend support?', a: 'SureXend supports USDC (Circle) on leading networks. USDC is pegged to the US Dollar, so your balance never loses value to crypto volatility.' },
    { q: 'Which African countries can I withdraw to?', a: 'We currently support bank withdrawals to Nigeria, Ghana, Kenya, South Africa, Uganda, Tanzania, Rwanda, and Senegal, with more countries being added monthly.' },
    { q: 'How long does a crypto-to-bank withdrawal take?', a: 'Most withdrawals complete within 5–15 minutes. In rare cases of bank delays, it can take up to 2 hours. We always show you the estimated time before you confirm.' },
    { q: 'Is my money safe?', a: 'Yes. We use bank-level AES-256 encryption, mandatory 2FA for withdrawals, and real-time fraud detection. We never hold your private keys — your wallet is non-custodial for incoming crypto.' },
    { q: 'Do I need to download an app?', a: 'No download required. SureXend is a Progressive Web App — you access it through your browser and can install it on your home screen for a native app experience. Works on iOS, Android, and desktop.' },
    { q: 'How does the referral program work?', a: 'You earn a percentage of the transaction fees generated by every user you refer. The more active your referrals, the more you earn. Earnings are credited to your wallet monthly.' },
  ]

  return (
    <>
      {/* ── Full-screen loading animation ─────────────────────────────── */}
      <AnimatePresence>
        {showLoader && (
          <SurexendLoader fullScreen duration={1000} />
        )}
      </AnimatePresence>

      <div id="app-shell" data-page-loaded className="min-h-screen bg-[#000000]">

        {/* ── Navigation ─────────────────────────────────────────────── */}
        <motion.nav
          className="fixed top-0 left-0 right-0 z-50 transition-all duration-300"
          style={{
            background: scrolled ? 'rgba(8, 9, 12, 0.92)' : 'transparent',
            backdropFilter: scrolled && !isMobile ? 'blur(20px)' : 'none',
            WebkitBackdropFilter: scrolled && !isMobile ? 'blur(20px)' : 'none',
            borderBottom: scrolled ? '1px solid rgba(255,255,255,0.06)' : 'none',
          }}
          initial={{ y: -80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0, duration: 0.5 }}
        >
          <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
            {/* Logo */}
            <Link href="/" className="flex items-center gap-2.5 group">
              <img
                src={isGold ? '/logo-mark-gold.png' : '/logo-mark-plain.png'}
                alt="SureXend"
                className={`w-8 h-8 object-contain transition-transform group-hover:scale-105 ${isGold ? 'gold-logo-glow' : ''}`}
                style={{
                  filter: isGold
                    ? 'brightness(1.25) drop-shadow(0 0 12px rgba(252, 211, 77, 0.9)) drop-shadow(0 0 25px rgba(212, 160, 23, 0.7))'
                    : 'invert(1) sepia(0.5) saturate(6) hue-rotate(30deg) brightness(1.1) drop-shadow(0 0 8px rgba(181, 226, 61, 0.4))'
                }}
              />
              <span className="font-inter font-bold text-white text-lg tracking-wide">
                SURE<span style={{ color: accentHex }}>X</span>END
              </span>
            </Link>

            {/* Desktop nav */}
            <div className="hidden md:flex items-center gap-8">
              {navLinks.map(link => (
                <a
                  key={link}
                  href={`#${link.toLowerCase().replace(/ /g, '-')}`}
                  className="text-[#94A3B8] text-sm hover:text-white transition-colors duration-200"
                >
                  {link}
                </a>
              ))}
            </div>

            {/* CTA buttons */}
            <div className="hidden md:flex items-center gap-3">
              <Link href="/auth/login">
                <button className={`${btnOutlineClass} px-5 py-2 rounded-xl text-sm font-semibold`}>
                  Log In
                </button>
              </Link>
              <Link href="/auth/register">
                <button className={`${btnClass} px-5 py-2 rounded-xl text-sm`}>
                  Get Started
                </button>
              </Link>
            </div>

            {/* Mobile header controls */}
            <div className="flex items-center gap-2 md:hidden">
              <button
                className="p-2 rounded-lg text-white"
                style={{ background: 'rgba(255,255,255,0.06)' }}
                onClick={() => setMenuOpen(!menuOpen)}
              >
                {menuOpen ? <X size={20} /> : <Menu size={20} />}
              </button>
            </div>
          </div>

          {/* Mobile menu */}
          <AnimatePresence>
            {menuOpen && (
              <motion.div
                className="md:hidden bg-[#121419] border-t border-white/5"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.3 }}
              >
                <div className="px-4 py-4 flex flex-col gap-1">
                  {navLinks.map(link => (
                    <a
                      key={link}
                      href={`#${link.toLowerCase().replace(/ /g, '-')}`}
                      className="text-[#94A3B8] py-3 text-sm border-b border-white/5 hover:text-white transition-colors"
                      onClick={() => setMenuOpen(false)}
                    >
                      {link}
                    </a>
                  ))}
                  <div className="flex gap-3 pt-4">
                    <Link href="/auth/login" className="flex-1">
                      <button className={`${btnOutlineClass} w-full py-3 rounded-xl text-sm font-semibold`}>Log In</button>
                    </Link>
                    <Link href="/auth/register" className="flex-1">
                      <button className={`${btnClass} w-full py-3 rounded-xl text-sm`}>Get Started</button>
                    </Link>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.nav>

        {/* ── Hero Section ───────────────────────────────────────────── */}
        <section className="relative min-h-screen min-h-dvh-force flex flex-col items-center justify-center px-4 sm:px-6 pt-20 pb-16 overflow-hidden">
          {/* Background effects */}
          <div className="absolute inset-0 pointer-events-none">
            <div
              className="absolute inset-0"
              style={{
                background: `radial-gradient(ellipse 80% 60% at 50% 0%, rgba(${accentRgb}, 0.18), transparent 70%)`,
              }}
            />
            {/* Floating orbs — soft radial glows (no blur filter on phones) */}
            {isMobile ? (
              <>
                <div
                  className="absolute rounded-full"
                  style={{
                    width: 400, height: 400,
                    top: '10%', left: '-10%',
                    background: `radial-gradient(circle, rgba(${accentRgb}, 0.12), transparent 70%)`,
                  }}
                />
                <div
                  className="absolute rounded-full"
                  style={{
                    width: 300, height: 300,
                    bottom: '20%', right: '-5%',
                    background: `radial-gradient(circle, rgba(${accentRgb}, 0.09), transparent 70%)`,
                  }}
                />
              </>
            ) : (
              <>
                <motion.div
                  className="absolute rounded-full blur-3xl"
                  style={{
                    width: 400, height: 400,
                    top: '10%', left: '-10%',
                    background: `rgba(${accentRgb}, 0.08)`,
                  }}
                  animate={{ x: [0, 30, 0], y: [0, -20, 0] }}
                  transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
                />
                <motion.div
                  className="absolute rounded-full blur-3xl"
                  style={{
                    width: 300, height: 300,
                    bottom: '20%', right: '-5%',
                    background: `rgba(${accentRgb}, 0.06)`,
                  }}
                  animate={{ x: [0, -20, 0], y: [0, 30, 0] }}
                  transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut', delay: 2 }}
                />
              </>
            )}
          </div>

          <motion.div
            className="relative z-10 flex flex-col items-center text-center max-w-5xl mx-auto"
            style={isMobile ? {} : { opacity: heroOpacity, scale: heroScale }}
          >
            {/* Badge */}
            <motion.div
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full mb-8"
              style={{
                background: `rgba(${accentRgb}, 0.1)`,
                border: `1px solid rgba(${accentRgb}, 0.25)`,
              }}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1, duration: 0.5 }}
            >
              <span className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: accentHex }} />
              <span className="text-xs font-semibold tracking-wide" style={{ color: accentHex }}>
                Africa&apos;s Premier Stablecoin Platform
              </span>
            </motion.div>

            {/* Headline */}
            <motion.h1
              className="font-inter font-black text-white leading-[1.1] mb-6"
              style={{ fontSize: 'clamp(2.5rem, 7vw, 5rem)' }}
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.6 }}
            >
              Your Crypto,
              <br />
              <span className={gradientText}> Finally Useful </span>
              <br />
              in Africa
            </motion.h1>

            {/* Subheadline */}
            <motion.p
              className="text-[#94A3B8] max-w-2xl mb-10 leading-relaxed"
              style={{ fontSize: 'clamp(1rem, 2.5vw, 1.2rem)' }}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.5 }}
            >
              Send USDC to anyone. Withdraw to any African bank. Pay bills, buy airtime, and spend your stablecoins like the cash in your pocket — instantly.
            </motion.p>

            {/* CTA buttons */}
            <motion.div
              className="flex flex-col xs:flex-row gap-4 w-full xs:w-auto mb-12"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4, duration: 0.5 }}
            >
              <Link href="/auth/login">
                <button
                  className={`${btnClass} flex items-center justify-center gap-2 px-8 py-4 rounded-2xl text-base w-full xs:w-auto`}
                >
                  Launch App <ArrowRight size={18} />
                </button>
              </Link>
              <button
                className={`${btnOutlineClass} flex items-center justify-center gap-2 px-8 py-4 rounded-2xl text-base`}
                onClick={() => document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' })}
              >
                See How It Works
              </button>
            </motion.div>

            {/* Trust indicators */}
            <motion.div
              className="flex flex-wrap items-center justify-center gap-6"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5, duration: 0.5 }}
            >
              {['No Download Needed', 'Instant Withdrawals', '24/7 Support', 'Bank-Level Security'].map(text => (
                <div key={text} className="flex items-center gap-2 text-[#94A3B8] text-sm font-medium">
                  <Check size={15} style={{ color: accentHex }} />
                  {text}
                </div>
              ))}
            </motion.div>
          </motion.div>

            {/* Floating phone mockup — PIXEL-FAITHFUL replica of the real
                dashboard. Everything inside is plain divs/SVG: no images, no
                filters, no animations on mobile. Desktop gets a slow float. */}
            <motion.div
              className="mt-12 sm:mt-16 relative w-full max-w-[340px] mx-auto z-20"
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.6 }}
            >
            <div className="relative mx-auto select-none w-full">
              {/* Ambient glow — radial only, zero filters */}
              <div
                className="absolute -inset-8 -z-10 pointer-events-none"
                style={{ background: `radial-gradient(ellipse 62% 55% at 50% 46%, rgba(${accentRgb}, 0.22), transparent 70%)` }}
              />

              {/* Physical side buttons */}
              <div className="absolute -left-[2px] top-[124px] h-6 w-[3px] rounded-l-md bg-gradient-to-b from-[#5a5a5e] to-[#232325]" />
              <div className="absolute -left-[2px] top-[164px] h-12 w-[3px] rounded-l-md bg-gradient-to-b from-[#5a5a5e] to-[#232325]" />
              <div className="absolute -left-[2px] top-[224px] h-12 w-[3px] rounded-l-md bg-gradient-to-b from-[#5a5a5e] to-[#232325]" />
              <div className="absolute -right-[2px] top-[188px] h-20 w-[3px] rounded-r-md bg-gradient-to-b from-[#5a5a5e] to-[#232325]" />

              {/* Titanium body */}
              <div
                className="relative rounded-[56px] p-[10px]"
                style={{
                  background: 'linear-gradient(145deg, #3b3b3f 0%, #0d0d0f 26%, #4a4a4e 50%, #0d0d0f 74%, #3b3b3f 100%)',
                  boxShadow: `0 50px 100px rgba(0,0,0,0.85), 0 12px 40px rgba(0,0,0,0.6), 0 0 90px rgba(${accentRgb}, 0.14), inset 0 0 0 1px rgba(255,255,255,0.14), inset 0 2px 3px rgba(255,255,255,0.2)`,
                }}
              >
                {/* Inner black bezel */}
                <div className="rounded-[47px] bg-black p-[3px]">
                  {/* Screen */}
                  <div
                    className="relative rounded-[44px] bg-[#000000] overflow-hidden border border-white/10 flex flex-col select-none w-full"
                    style={{ height: 672 }}
                  >
                    {/* Dynamic Island */}
                    <div className="absolute top-[14px] left-1/2 -translate-x-1/2 w-[104px] h-[30px] bg-black rounded-full z-40 flex items-center justify-end pr-3.5">
                      <div className="w-[13px] h-[13px] rounded-full bg-[#0d0d10] ring-1 ring-white/[0.08] flex items-center justify-center">
                        <div className="w-[5px] h-[5px] rounded-full bg-[#17181d]" />
                      </div>
                    </div>

                    {/* ── Screen content: the REAL dashboard ── */}
                    <div className="flex-1 px-3.5 pt-[50px] pb-2 space-y-2 overflow-hidden">

                      {/* Status bar */}
                      <div className="flex justify-between items-center px-1.5">
                        <span className="text-[11px] font-semibold text-white tracking-wide">9:41</span>
                        <div className="flex items-center gap-1.5">
                          {/* Cellular */}
                          <svg width="15" height="10" viewBox="0 0 15 10" fill="none">
                            <rect x="0" y="6" width="2.5" height="4" rx="0.8" fill="#fff" />
                            <rect x="4" y="4" width="2.5" height="6" rx="0.8" fill="#fff" />
                            <rect x="8" y="2" width="2.5" height="8" rx="0.8" fill="#fff" />
                            <rect x="12" y="0" width="2.5" height="10" rx="0.8" fill="#fff" opacity="0.4" />
                          </svg>
                          {/* WiFi */}
                          <svg width="14" height="10" viewBox="0 0 14 10" fill="none">
                            <path d="M7 9.5L1 3.5C2.5 2 4.6 1 7 1s4.5 1 6 2.5L7 9.5z" fill="#fff" />
                          </svg>
                          {/* Battery */}
                          <svg width="22" height="11" viewBox="0 0 22 11" fill="none">
                            <rect x="0.5" y="0.5" width="18" height="10" rx="3" stroke="#fff" strokeOpacity="0.4" />
                            <rect x="2" y="2" width="15" height="7" rx="1.8" fill="#34D399" />
                            <path d="M20.5 3.5v4c1-0.3 1.5-1.1 1.5-2s-0.5-1.7-1.5-2z" fill="#fff" fillOpacity="0.4" />
                          </svg>
                        </div>
                      </div>

                      {/* User bar — mirrors the dashboard's welcome bar */}
                      <div className="flex items-center justify-between gap-2 py-1.5 px-2.5 rounded-xl border border-white/10 bg-white/[0.03]">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-8 h-8 rounded-full flex-shrink-0 bg-gradient-to-tr from-[#10B981] to-[#3B82F6] flex items-center justify-center text-[10px] font-extrabold text-white shadow-md">
                            AO
                          </div>
                          <div className="min-w-0">
                            <p className="text-[7.5px] text-[#64748B] font-bold uppercase tracking-wider leading-none mb-[3px]">Welcome back</p>
                            <div className="flex items-center gap-1">
                              <span className="text-[11px] font-extrabold text-white leading-none">Adaeze</span>
                              <span className="w-3 h-3 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: `rgba(${accentRgb}, 0.2)`, border: `1px solid rgba(${accentRgb}, 0.5)` }}>
                                <Check size={7} style={{ color: accentHex }} strokeWidth={3.5} />
                              </span>
                            </div>
                          </div>
                        </div>
                        <span
                          className="px-2 py-1 rounded-full text-[7.5px] font-extrabold flex-shrink-0 whitespace-nowrap"
                          style={{ background: `rgba(${accentRgb}, 0.15)`, border: `1px solid rgba(${accentRgb}, 0.4)`, color: accentHex }}
                        >
                          ★ Top 5 Leaderboard
                        </span>
                      </div>

                      {/* Rates ticker */}
                      <div className="w-full overflow-hidden bg-white/[0.02] border border-white/5 rounded-lg py-1 px-2.5 flex items-center text-[8px] whitespace-nowrap">
                        <span className="text-[#94A3B8] font-medium">USDC/USD <strong className="text-white">$1.0000</strong> <span className="text-emerald-400">pegged</span></span>
                        <span className="mx-2 w-px h-2.5 bg-white/10" />
                        <span className="text-[#94A3B8] font-medium">NGN/USD <strong className="text-white">₦1,598</strong> <span className="text-[#64748B]">live</span></span>
                        <span className="mx-2 w-px h-2.5 bg-white/10" />
                        <span className="text-[#94A3B8] font-medium">GHS/USD <strong className="text-white">₵13.50</strong> <span className="text-[#64748B]">live</span></span>
                      </div>

                      {/* Balance card — mirrors the dual-wallet card */}
                      <div
                        className="rounded-2xl p-3.5 relative overflow-hidden"
                        style={{
                          background: `linear-gradient(150deg, rgba(${accentRgb}, 0.16), rgba(255,255,255,0.02) 65%)`,
                          border: `1px solid rgba(${accentRgb}, 0.28)`,
                        }}
                      >
                        <div className="absolute inset-x-0 top-0 h-[2px]" style={{ background: `linear-gradient(90deg, transparent, rgba(${accentRgb}, 0.7), transparent)` }} />
                        {/* Wallet tabs */}
                        <div className="flex items-center gap-1.5 mb-2.5">
                          <span className="px-2.5 py-1 rounded-lg text-[8.5px] font-bold text-white bg-white/10 border border-white/20">💵 USD Wallet</span>
                          <span className="px-2.5 py-1 rounded-lg text-[8.5px] font-bold text-[#64748B] border border-white/5">🏦 Local Wallet</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-[8.5px] font-medium text-[#64748B]">USD Crypto Balance (USDC)</span>
                          <Eye size={10} className="text-[#64748B]" />
                        </div>
                        <div className="text-white font-extrabold text-[26px] tracking-tight leading-tight mt-0.5">$2,458.90</div>
                        <p className="text-[8px] text-[#475569] font-medium leading-snug mt-0.5">Deposited via crypto (USDC). Convert to get local currency.</p>

                        {/* Actions — Fund / Send / Receive / Bills, uniform monochrome */}
                        <div className="grid grid-cols-4 gap-1.5 pt-2.5 mt-1.5 border-t border-white/[0.06]">
                          {[
                            { icon: PlusCircle, label: 'Fund' },
                            { icon: Send, label: 'Send' },
                            { icon: Download, label: 'Receive' },
                            { icon: Smartphone, label: 'Bills' },
                          ].map((a) => (
                            <div key={a.label} className="flex flex-col items-center gap-1">
                              <div
                                className="w-9 h-9 rounded-xl flex items-center justify-center bg-white/[0.06] border border-white/10"
                              >
                                <a.icon size={14} className="text-white" />
                              </div>
                              <span className="text-[8px] font-semibold text-white">{a.label}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Market card — mirrors the live market chart */}
                      <div className="rounded-2xl p-3 bg-white/[0.03] border border-white/5">
                        <div className="flex items-center justify-between mb-2">
                          <span
                            className="px-2 py-1 rounded-lg text-[8px] font-bold flex items-center gap-1 bg-white/10 border border-white/20"
                            style={{ color: accentHex }}
                          >
                            USDC/NGN <ChevronDown size={8} />
                          </span>
                          <div className="flex items-center gap-0.5 bg-[#15171C] p-0.5 rounded-lg border border-white/5">
                            {['1D', '1W', '1M', '1Y'].map((tf, i) => (
                              <span key={tf} className={`px-1.5 py-0.5 rounded-md text-[7.5px] font-bold ${i === 0 ? 'bg-white/10 text-white' : 'text-[#64748B]'}`}>{tf}</span>
                            ))}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[15px] font-extrabold text-white tracking-tight">₦1,598.00</span>
                          <span className="text-[7px] font-bold px-1.5 py-0.5 rounded-md bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 flex items-center gap-0.5">
                            <span className="w-1 h-1 rounded-full bg-emerald-400" /> Live
                          </span>
                        </div>
                        <p className="text-[7.5px] text-[#64748B] mt-0.5 font-medium">USD Coin · 1 USD = ₦1,598.00 NGN</p>
                        {/* Sparkline */}
                        <svg viewBox="0 0 300 60" className="w-full h-[46px] mt-1" preserveAspectRatio="none">
                          <defs>
                            <linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor={accentHex} stopOpacity="0.28" />
                              <stop offset="100%" stopColor={accentHex} stopOpacity="0" />
                            </linearGradient>
                          </defs>
                          <path d="M0,46 C18,42 30,50 46,44 C62,38 74,30 92,34 C110,38 124,46 142,38 C160,30 176,18 198,24 C220,30 238,36 258,22 C274,12 288,14 300,10 L300,60 L0,60 Z" fill="url(#sparkFill)" />
                          <path d="M0,46 C18,42 30,50 46,44 C62,38 74,30 92,34 C110,38 124,46 142,38 C160,30 176,18 198,24 C220,30 238,36 258,22 C274,12 288,14 300,10" fill="none" stroke={accentHex} strokeWidth="1.8" strokeLinecap="round" />
                          <circle cx="300" cy="10" r="2.5" fill={accentHex} />
                        </svg>
                      </div>

                      {/* Cash flow — mirrors Money In vs Money Out */}
                      <div className="rounded-2xl p-3 bg-white/[0.03] border border-white/5">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[9px] font-bold text-white">Cash Flow Movement</span>
                          <div className="flex items-center gap-2 text-[7px] text-[#94A3B8] font-medium">
                            <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> In</span>
                            <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-red-400" /> Out</span>
                          </div>
                        </div>
                        {[
                          { d: 'Mon', in: 82, out: 38 },
                          { d: 'Tue', in: 54, out: 62 },
                          { d: 'Wed', in: 91, out: 30 },
                          { d: 'Thu', in: 47, out: 55 },
                        ].map((r) => (
                          <div key={r.d} className="flex items-center gap-2 mb-[3px]">
                            <span className="text-[7px] text-[#64748B] font-semibold w-5">{r.d}</span>
                            <div className="flex-1 h-[7px] rounded-full bg-white/[0.04] overflow-hidden flex">
                              <div className="h-full bg-emerald-400/80 rounded-l-full" style={{ width: `${r.in}%` }} />
                              <div className="h-full bg-red-400/70" style={{ width: `${r.out}%` }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Bottom nav — mirrors the app's tab bar */}
                    <div className="bg-[#0F1116] border-t border-white/10 px-5 pt-2 pb-1.5 flex justify-between items-center">
                      {[
                        { icon: Wallet, label: 'Home', active: true },
                        { icon: Send, label: 'Send' },
                        { icon: RefreshCw, label: 'Convert' },
                        { icon: CreditCard, label: 'Bills' },
                        { icon: User, label: 'Profile' },
                      ].map((t) => (
                        <div key={t.label} className="flex flex-col items-center gap-0.5" style={t.active ? { color: accentHex } : { color: '#64748B' }}>
                          <t.icon size={15} strokeWidth={t.active ? 2.4 : 2} />
                          <span className="text-[7.5px] font-semibold">{t.label}</span>
                        </div>
                      ))}
                    </div>
                    {/* Home indicator */}
                    <div className="bg-[#0F1116] pb-2 flex justify-center">
                      <div className="w-[100px] h-[3.5px] rounded-full bg-white/25" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
            </motion.div>

          {/* Scroll indicator below hero content */}
          <motion.div
            className="mt-12 flex flex-col items-center gap-2 cursor-pointer opacity-80 hover:opacity-100 transition-opacity z-20"
            animate={{ y: [0, 8, 0] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
            onClick={() => document.getElementById('stats-ticker')?.scrollIntoView({ behavior: 'smooth' })}
          >
            <span className="text-[#64748B] text-[11px] font-semibold tracking-widest uppercase">Scroll Down</span>
            <ChevronDown size={16} className="text-[#64748B]" />
          </motion.div>
        </section>

        {/* ── Stats ticker ───────────────────────────────────────────── */}
        <section id="stats-ticker" className="py-12 border-y relative z-10" style={{ borderColor: `rgba(${accentRgb}, 0.1)`, background: `rgba(${accentRgb}, 0.03)` }}>
          <div className="max-w-7xl mx-auto px-4 sm:px-6">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-8">
              {stats.map(({ val, suffix, prefix, label }, i) => (
                <motion.div
                  key={label}
                  className="text-center"
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1, duration: 0.5 }}
                >
                  <p className={`font-inter font-black text-3xl sm:text-4xl mb-1 ${gradientText}`}>
                    <AnimatedNumber value={val} suffix={suffix} prefix={prefix} />
                  </p>
                  <p className="text-[#64748B] text-sm">{label}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Features Section ───────────────────────────────────────── */}
        <section id="features" className="py-24 px-4 sm:px-6">
          <div className="max-w-7xl mx-auto">
            <motion.div
              className="text-center mb-16"
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
            >
              <p className="text-sm font-semibold tracking-widest uppercase mb-4" style={{ color: accentHex }}>
                Everything You Need
              </p>
              <h2 className="font-inter font-black text-white mb-4" style={{ fontSize: 'clamp(2rem, 4vw, 3rem)' }}>
                One App. All of Africa.
              </h2>
              <p className="text-[#94A3B8] max-w-xl mx-auto">
                We built the financial layer Africa was missing. Every feature designed for real-world usage, not just speculation.
              </p>
            </motion.div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {features.map(f => (
                <FeatureCard key={f.title} {...f} accent={accentRgb} />
              ))}
            </div>
          </div>
        </section>

        {/* ── How It Works ───────────────────────────────────────────── */}
        <section id="how-it-works" className="py-24 px-4 sm:px-6">
          <div className="max-w-7xl mx-auto">
            <div className="grid lg:grid-cols-2 gap-16 items-center">
              <div>
                <motion.p
                  className="text-sm font-semibold tracking-widest uppercase mb-4"
                  style={{ color: accentHex }}
                  initial={{ opacity: 0 }}
                  whileInView={{ opacity: 1 }}
                  viewport={{ once: true }}
                >
                  Get Started in Minutes
                </motion.p>
                <motion.h2
                  className="font-inter font-black text-white mb-12"
                  style={{ fontSize: 'clamp(1.8rem, 3vw, 2.5rem)' }}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                >
                  From zero to spending<br />crypto in 4 steps
                </motion.h2>
                <div className="flex flex-col gap-8">
                  {steps.map((s, i) => (
                    <StepCard key={s.title} n={i + 1} {...s} accent={accentRgb} delay={i * 0.15} />
                  ))}
                </div>
                <motion.div
                  className="mt-10"
                  initial={{ opacity: 0 }}
                  whileInView={{ opacity: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.6 }}
                >
                  <Link href="/auth/register">
                    <button className={`${btnClass} flex items-center gap-2 px-8 py-4 rounded-2xl text-base`}>
                      Start Now — Free <ArrowRight size={18} />
                    </button>
                  </Link>
                </motion.div>
              </div>

              {/* Decorative side panel */}
              {/* Live Conversion & Bill Payment cards (Visible on BOTH Mobile & Desktop) */}
              <motion.div
                className="flex flex-col gap-4 mt-8 lg:mt-0 w-full"
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.7 }}
              >
                {/* Live conversion card */}
                <div className="liquid-glass p-6 border border-white/10 rounded-2xl relative overflow-hidden">
                  <div className="flex justify-between items-center mb-4">
                    <span className="text-xs font-bold text-[#64748B] tracking-wider uppercase">Live Conversion</span>
                  </div>
                  <div className="flex items-center justify-between my-2">
                    <div>
                      <p className="text-xs text-[#94A3B8] mb-1">You send</p>
                      <p className="font-inter font-bold text-2xl text-white">100 USDC</p>
                    </div>
                    <motion.div
                      className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center"
                      style={{ color: accentHex }}
                      animate={{ rotate: 360 }}
                      transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
                    >
                      <RefreshCw size={18} />
                    </motion.div>
                    <div className="text-right">
                      <p className="text-xs text-[#94A3B8] mb-1">They receive</p>
                      <p className="font-inter font-bold text-2xl" style={{ color: accentHex }}>₦159,800</p>
                    </div>
                  </div>
                  <div
                    className="mt-4 pt-4 text-xs flex justify-between items-center text-[#94A3B8]"
                    style={{ borderTop: `1px solid rgba(${accentRgb}, 0.15)` }}
                  >
                    <span>Rate: <span style={{ color: accentHex }} className="font-semibold">1 USDC = ₦1,598 NGN</span></span>
                    <span className="text-[11px] text-[#64748B] flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-[#10B981] animate-pulse" /> Updated 2s ago
                    </span>
                  </div>
                </div>

                {/* Bill payment activity card */}
                <div className="liquid-glass p-6 border border-white/10 rounded-2xl">
                  <div className="flex justify-between items-center mb-4">
                    <span className="text-xs font-bold text-[#64748B] tracking-wider uppercase">Bill Payment</span>
                  </div>
                  <div className="space-y-3.5">
                    <div className="flex items-center justify-between text-sm py-1 border-b border-white/5">
                      <div className="flex items-center gap-2 text-white font-medium">
                        <span className="text-[#10B981] font-bold">✓</span> MTN Airtime · 08012345678
                      </div>
                      <span className="text-white font-semibold">-₦1,000</span>
                    </div>
                    <div className="flex items-center justify-between text-sm py-1 border-b border-white/5">
                      <div className="flex items-center gap-2 text-white font-medium">
                        <span className="text-[#10B981] font-bold">✓</span> DSTV Compact · 7045231892
                      </div>
                      <span className="text-white font-semibold">-₦14,500</span>
                    </div>
                    <div className="flex items-center justify-between text-sm py-1">
                      <div className="flex items-center gap-2 text-white font-medium">
                        <span className="text-[#F59E0B]">⏳</span> EKEDC · 45123001
                      </div>
                      <span className="text-white font-semibold">-₦8,000</span>
                    </div>
                  </div>
                </div>
              </motion.div>
            </div>
          </div>
        </section>

        {/* ── Security Section ───────────────────────────────────────── */}
        <section id="security" className="py-24 px-4 sm:px-6">
          <div className="max-w-7xl mx-auto">
            <div
              className="rounded-3xl p-8 sm:p-12 relative overflow-hidden"
              style={{
                background: `linear-gradient(135deg, rgba(${accentRgb}, 0.08) 0%, rgba(${accentRgb}, 0.02) 100%)`,
                border: `1px solid rgba(${accentRgb}, 0.2)`,
              }}
            >
              <div
                className="absolute top-0 right-0 w-96 h-96 rounded-full -z-0"
                style={{ background: `radial-gradient(circle, rgba(${accentRgb}, 0.10), transparent 70%)` }}
              />
              <div className="relative z-10">
                <div className="text-center mb-12">
                  <p className="text-sm font-semibold tracking-widest uppercase mb-4" style={{ color: accentHex }}>Built for Trust</p>
                  <h2 className="font-inter font-black text-white mb-4" style={{ fontSize: 'clamp(1.8rem, 3vw, 2.5rem)' }}>
                    Bank-Level Security.<br />Crypto-Native Speed.
                  </h2>
                </div>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {[
                    { icon: Lock, title: '2FA on All Withdrawals', desc: 'One-time password (OTP) verification required for every withdrawal.' },
                    { icon: Shield, title: 'AES-256 Encryption', desc: 'All sensitive data encrypted at rest and in transit.' },
                    { icon: Clock, title: 'Real-Time Fraud Detection', desc: 'AI-powered anomaly detection flags suspicious activity instantly.' },
                    { icon: Globe, title: 'Identity Verification', desc: 'Verify once to unlock higher transaction limits. Your funds stay protected with bank-grade security.' },
                    { icon: Users, title: 'Audit Logs', desc: 'Every action logged with IP, device, and timestamp. Full audit trail.' },
                    { icon: Check, title: 'NDPR & GDPR Compliant', desc: 'Fully compliant with Nigerian data protection regulations and GDPR.' },
                  ].map(({ icon: Icon, title, desc }, i) => (
                    <motion.div
                      key={title}
                      className="flex gap-4"
                      initial={{ opacity: 0, y: 20 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true }}
                      transition={{ delay: i * 0.1 }}
                    >
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5"
                        style={{ background: `rgba(${accentRgb}, 0.12)` }}
                      >
                        <Icon size={18} style={{ color: accentHex }} />
                      </div>
                      <div>
                        <h4 className="font-semibold text-white text-sm mb-1">{title}</h4>
                        <p className="text-[#94A3B8] text-xs leading-relaxed">{desc}</p>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Testimonials ───────────────────────────────────────────── */}
        <section className="py-24 px-4 sm:px-6">
          <div className="max-w-7xl mx-auto">
            <motion.div
              className="text-center mb-16"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
            >
              <p className="text-sm font-semibold tracking-widest uppercase mb-4" style={{ color: accentHex }}>Real Users, Real Stories</p>
              <h2 className="font-inter font-black text-white" style={{ fontSize: 'clamp(1.8rem, 3vw, 2.5rem)' }}>
                Africa is already spending smarter
              </h2>
            </motion.div>
            <div className="grid sm:grid-cols-3 gap-6">
              {testimonials.map((t, i) => (
                <TestimonialCard key={t.name} {...t} accent={accentRgb} delay={i * 0.15} />
              ))}
            </div>
          </div>
        </section>

        {/* ── Referral teaser ────────────────────────────────────────── */}
        <section className="py-24 px-4 sm:px-6">
          <div className="max-w-4xl mx-auto">
            <motion.div
              className="rounded-3xl p-8 sm:p-12 text-center relative overflow-hidden"
              style={{
                background: colors.gradientBg,
              }}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
            >
              <div className="absolute inset-0 pointer-events-none">
                <div className="absolute inset-0 opacity-20"
                  style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' viewBox=\'0 0 60 60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'none\' fill-rule=\'evenodd\'%3E%3Cg fill=\'%23000000\' fill-opacity=\'0.1\'%3E%3Ccircle cx=\'30\' cy=\'30\' r=\'1\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")' }}
                />
              </div>
              <div className="relative z-10">
                <motion.div
                  className="text-5xl mb-4"
                  animate={{ rotate: [0, 10, -10, 0] }}
                  transition={{ duration: 3, repeat: Infinity }}
                >
                  🎁
                </motion.div>
                <h2 className="font-inter font-black text-black mb-4 text-3xl sm:text-5xl">Earn While They Spend</h2>
                <p className="text-black/70 mb-8 max-w-lg mx-auto">Refer friends to SureXend and earn a percentage of every transaction fee they pay. The more active your network, the more you earn — forever.</p>
                <Link href="/auth/register"><button className="bg-black text-white px-8 py-4 rounded-2xl font-bold flex items-center gap-2 mx-auto">Start Earning <Gift size={18} /></button></Link>
              </div>
            </motion.div>
          </div>
        </section>

        {/* ── Learn hub — internal links to the SEO/GEO guides ────────── */}
        <section className="py-24 px-4 sm:px-6 border-t" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-12">
              <p className="text-sm font-semibold tracking-widest uppercase mb-4" style={{ color: accentHex }}>Learn</p>
              <h2 className="font-inter font-black text-white mb-4" style={{ fontSize: 'clamp(1.8rem, 3vw, 2.5rem)' }}>
                Guides to make your crypto useful
              </h2>
              <p className="text-[#94A3B8] max-w-xl mx-auto">
                Plain-English how-tos on selling USDC for naira, buying airtime with crypto and cashing out across Africa.
              </p>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
              {[
                { href: '/convert-usdc-to-naira', label: 'Convert USDC to naira', desc: 'Sell USDC at a live rate, no P2P vendors.' },
                { href: '/buy-airtime-with-crypto', label: 'Buy airtime with crypto', desc: 'MTN, Airtel, GLO & 9mobile from your balance.' },
                { href: '/send-money-to-nigeria', label: 'Send money to Nigeria', desc: 'Cheaper than bank transfers, arrives in minutes.' },
                { href: '/pay-bills-with-crypto', label: 'Pay bills with crypto', desc: 'Electricity, DSTV, data and water with USDC.' },
                { href: '/withdraw-usdc-to-bank', label: 'Withdraw USDC to bank', desc: 'Naira in your bank in minutes via instant transfer.' },
                { href: '/blog/how-to-sell-usdc-for-naira', label: 'Sell USDC for naira: guide', desc: 'Step-by-step walkthrough with safety tips.' },
                { href: '/blog/buy-airtime-with-crypto', label: 'Buy airtime with crypto: guide', desc: 'The 2026 guide to top-ups with stablecoin.' },
                { href: '/blog/crypto-to-bank-account-africa', label: 'Crypto to bank in Africa', desc: 'Nigeria, Kenya, Ghana & South Africa cashout.' },
                { href: '/nigeria', label: 'SureXend in Nigeria', desc: 'USDC to naira, airtime, bills & bank withdrawal.' },
              ].map(({ href, label, desc }) => (
                <Link
                  key={href}
                  href={href}
                  className="group rounded-2xl border border-white/10 bg-white/[0.02] p-5 hover:border-[rgba(212,160,23,0.4)] hover:bg-white/[0.05] transition-all"
                >
                  <p className="text-sm font-bold text-white group-hover:text-[#FFD966] transition-colors">{label}</p>
                  <p className="text-xs text-[#64748B] mt-1.5 leading-relaxed">{desc}</p>
                  <span className="inline-block mt-3 text-[11px] font-bold" style={{ color: accentHex }}>Read guide →</span>
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* ── FAQ ────────────────────────────────────────────────────── */}
        <section id="faq" className="py-24 px-4 sm:px-6 border-t" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
          <div className="max-w-3xl mx-auto">
            <motion.div
              className="text-center mb-12"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
            >
              <p className="text-sm font-semibold tracking-widest uppercase mb-4" style={{ color: accentHex }}>Answers</p>
              <h2 className="font-inter font-black text-white mb-4" style={{ fontSize: 'clamp(1.8rem, 3vw, 2.5rem)' }}>
                Frequently Asked Questions
              </h2>
              <p className="text-[#94A3B8] max-w-xl mx-auto">Everything about buying airtime with crypto, converting USDC to naira, and paying bills with stablecoins in Africa.</p>
            </motion.div>
            <div className="flex flex-col gap-3">
              {[
                { q: 'What is SureXend?', a: 'SureXend is a stablecoin spending platform for Africa. It lets you send money, buy airtime and data, pay electricity and TV bills, and convert USDC to local currencies and bank accounts — your crypto finally useful as everyday money.' },
                { q: 'How do I buy airtime with crypto (USDC) in Nigeria?', a: 'Deposit USDC into your SureXend wallet, go to Bills, and choose Airtime. Top up any Nigerian network instantly — MTN, Airtel, Glo, and 9mobile — directly from your stablecoin balance. No card or bank transfer needed.' },
                { q: 'Can I sell USDC and withdraw to my Nigerian bank account?', a: 'Yes. Convert your USDC or USDC to naira inside SureXend and withdraw to any Nigerian bank account. Funds move fast and you always see the live rate before you confirm.' },
                { q: 'Can I pay electricity and TV bills with crypto?', a: 'Yes. Pay electricity bills for IKEDC, EKEDC, AEDC, PHEDC, BEDC and more, plus DSTV, GOtv, StarTimes and internet subscriptions (Smile, Spectranet, Swift) — all settled from your USDC balance.' },
                { q: 'How fast are crypto to naira conversions?', a: 'Conversions and transfers are near-instant. You lock in the live rate at the moment of confirmation and your recipient receives the funds in minutes, not days.' },
                { q: 'Which cryptocurrencies and countries does SureXend support?', a: 'SureXend supports USDC on leading networks. The platform is built for Africa and is expanding across Nigeria, Ghana, Kenya and more countries.' },
              ].map(({ q, a }, i) => (
                <motion.details
                  key={q}
                  className="liquid-glass rounded-2xl border border-white/10 open:border-white/20 group"
                  style={{ borderColor: `rgba(${accentRgb}, 0.15)` }}
                  initial={{ opacity: 0, y: 24 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.06 }}
                >
                  <summary className="flex items-center justify-between cursor-pointer select-none list-none px-5 py-4">
                    <span className="text-white font-semibold text-sm sm:text-base">{q}</span>
                    <ChevronDown size={18} className="text-[#64748B] group-open:rotate-180 transition-transform flex-shrink-0" style={{ color: accentHex }} />
                  </summary>
                  <p className="px-5 pb-5 text-[#94A3B8] text-sm leading-relaxed">{a}</p>
                </motion.details>
              ))}
            </div>
          </div>
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{
              __html: JSON.stringify({
                '@context': 'https://schema.org',
                '@type': 'FAQPage',
                mainEntity: [
                  { '@type': 'Question', name: 'What is SureXend?', acceptedAnswer: { '@type': 'Answer', text: 'SureXend is a stablecoin spending platform for Africa. It lets you send money, buy airtime and data, pay electricity and TV bills, and convert USDC to local currencies and bank accounts.' } },
                  { '@type': 'Question', name: 'How do I buy airtime with crypto (USDC) in Nigeria?', acceptedAnswer: { '@type': 'Answer', text: 'Deposit USDC into your SureXend wallet, go to Bills, and choose Airtime. Top up MTN, Airtel, Glo, and 9mobile instantly from your stablecoin balance.' } },
                  { '@type': 'Question', name: 'Can I sell USDC and withdraw to my Nigerian bank account?', acceptedAnswer: { '@type': 'Answer', text: 'Yes. Convert your USDC or USDC to naira inside SureXend and withdraw to any Nigerian bank account with a live rate before you confirm.' } },
                  { '@type': 'Question', name: 'Can I pay electricity and TV bills with crypto?', acceptedAnswer: { '@type': 'Answer', text: 'Yes. Pay IKEDC, EKEDC, AEDC, PHEDC, BEDC electricity bills plus DSTV, GOtv, StarTimes and internet subscriptions from your USDC balance.' } },
                  { '@type': 'Question', name: 'How fast are crypto to naira conversions?', acceptedAnswer: { '@type': 'Answer', text: 'Conversions and transfers are near-instant. You lock in the live rate at confirmation and funds arrive in minutes.' } },
                  { '@type': 'Question', name: 'Which cryptocurrencies and countries does SureXend support?', acceptedAnswer: { '@type': 'Answer', text: 'SureXend supports USDC on leading networks and is expanding across Nigeria, Ghana, Kenya and more African countries.' } },
                ],
              }),
            }}
          />
        </section>

        <footer className="border-t py-16 px-4 sm:px-6 relative z-10" style={{ borderColor: 'rgba(255,255,255,0.06)', background: 'rgba(0,0,0,0.2)' }}>
          <div className="max-w-7xl mx-auto">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-10 mb-12">
              <div className="col-span-2 sm:col-span-1">
                <div className="flex items-center gap-3 mb-4">
                  <img
                    src={isGold ? '/logo-mark-gold.png' : '/logo-mark-plain.png'}
                    alt="SureXend"
                    className={`w-9 h-9 object-contain ${isGold ? 'gold-logo-glow' : 'lemon-logo-glow'}`}
                    style={{
                      filter: isGold
                        ? 'brightness(1.25) drop-shadow(0 0 12px rgba(252, 211, 77, 0.9)) drop-shadow(0 0 25px rgba(212, 160, 23, 0.7))'
                        : 'invert(1) sepia(0.5) saturate(6) hue-rotate(30deg) brightness(1.1) drop-shadow(0 0 8px rgba(181, 226, 61, 0.4))'
                    }}
                  />
                  <span className="font-inter font-bold text-white text-lg">SURE<span style={{ color: accentHex }}>X</span>END</span>
                </div>
                <p className="text-[#64748B] text-sm leading-relaxed">Africa&apos;s premier stablecoin spending platform. Your crypto, finally useful.</p>
              </div>
              {[
                { title: 'Product', links: ['Features', 'Security', 'Pricing', 'Referrals'] },
                { title: 'Company', links: ['About Us', 'Blog', 'Careers', 'Contact'] },
                { title: 'Legal', links: ['Privacy Policy', 'Terms of Service', 'Cookie Policy', 'AML Policy', 'NDPR Notice'] },
              ].map(({ title, links }) => (
                <div key={title}>
                  <p className="font-semibold text-white text-sm mb-4">{title}</p>
                  <ul className="space-y-2">
                    {links.map(link => <li key={link}><a href="#" className="text-[#64748B] text-sm hover:text-white transition-colors">{link}</a></li>)}
                  </ul>
                </div>
              ))}
            </div>
            <div className="border-t border-white/5 pt-8 flex flex-col sm:flex-row justify-between items-center gap-4">
              <p className="text-[#64748B] text-xs">© 2026 SureXend. All rights reserved.</p>
              <p className="text-[#64748B] text-xs">Regulated financial services. Transactions protected by 256-bit encryption.</p>
            </div>
          </div>
        </footer>

        {/* ── Floating support chat button ────────────────────────────── */}
        <motion.button
          className="fixed bottom-6 right-6 z-40 w-14 h-14 rounded-full flex items-center justify-center shadow-2xl no-print"
          style={{
            background: colors.gradientBg,
            boxShadow: `0 0 30px rgba(${accentRgb}, 0.4)`,
          }}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          animate={{
            boxShadow: [
              `0 0 20px rgba(${accentRgb}, 0.3)`,
              `0 0 40px rgba(${accentRgb}, 0.6)`,
              `0 0 20px rgba(${accentRgb}, 0.3)`,
            ],
          }}
          transition={{ duration: 3, repeat: Infinity }}
          initial={{ opacity: 0, scale: 0 }}
          whileInView={{ opacity: 1, scale: 1 }}
          aria-label="Open support chat"
        >
          <MessageCircle size={24} className="text-black" />
        </motion.button>
      </div>
    </>
  )
}
