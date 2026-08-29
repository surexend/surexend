'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import dynamic from 'next/dynamic'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useTheme } from '@/context/ThemeContext'
import { useBackLayer } from '@/context/BackNavigationContext'
import { 
  Home, Send, Repeat, FileText, User, Bell, ArrowUpRight, ArrowDownLeft,
  Smartphone, Building2, FileSpreadsheet, X, Check, ShieldCheck, Zap, Clock, ChevronRight, Fingerprint
} from 'lucide-react'
import toast from 'react-hot-toast'
// Lazy-load the AI widget — it's 24 KB and only needed on demand.
// Loading it eagerly on every page adds parse cost on low-end phones.
const AISupportWidget = dynamic(() => import('@/components/AISupportWidget'), { ssr: false })
const FirebaseMessaging = dynamic(() => import('@/components/FirebaseMessaging'), { ssr: false })
import { notificationsAPI, userAPI } from '@/lib/api'
import { useLite } from '@/lib/lite'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { variant, colors } = useTheme()
  const { lite, toggle: toggleLite } = useLite()
  const router = useRouter()
  const pathname = usePathname()
  const [mounted, setMounted] = useState(false)
  const [showNotifications, setShowNotifications] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const [avatar, setAvatar] = useState<string | null>(null)
  const [notifications, setNotifications] = useState<any[]>([])
  const [profile, setProfile] = useState<any>(null)
  const [isMobile, setIsMobile] = useState(false)
  const [showBioPrompt, setShowBioPrompt] = useState(false)

  // Register notification drawer with back handler
  useBackLayer(showNotifications, () => setShowNotifications(false), 10)

  useEffect(() => {
    let active = true
    userAPI.getProfile().then((p: any) => {
      if (active) setProfile(p || null)
    }).catch(() => {})
    return () => { active = false }
  }, [])

  const fullName = `${profile?.firstName || ''} ${profile?.lastName || ''}`.trim() || 'SureXend User'
  const surexTag = profile?.surexTag || profile?.firstName?.toLowerCase() || 'surex'

  const loadNotifications = useCallback(async () => {
    try {
      const data = await notificationsAPI.getAll()
      setNotifications(data?.notifications || [])
      setUnreadCount(data?.unreadCount ?? 0)
    } catch {
      setNotifications([])
      setUnreadCount(0)
    }
  }, [])

  useEffect(() => {
    loadNotifications()
  }, [loadNotifications])

  useEffect(() => {
    setMounted(true)
    const saved = localStorage.getItem('surexend_user_avatar')
    if (saved) setAvatar(saved)

    // Biometric nudge: only when the device supports WebAuthn, the user hasn't
    // enrolled a passkey yet, and they haven't dismissed the prompt before.
    if (typeof window.PublicKeyCredential !== 'undefined' && !localStorage.getItem('surexend_bio_prompt_dismissed')) {
      setShowBioPrompt(true)
    }

    const token = localStorage.getItem('surexend_access_token')
    if (!token) {
      router.push('/auth/login')
    }

    // Most users are on mobile: keep the background static there — it removes
    // GPU-heavy blur compositing that causes backdrop-filter tearing on phones.
    const mq = window.matchMedia('(max-width: 767px)')
    setIsMobile(mq.matches)
    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [router])

  // Service worker registration + forced update check so stale bundles don't stick
  useEffect(() => {
    if ('serviceWorker' in navigator && window.location.protocol === 'https:') {
      const register = () =>
        navigator.serviceWorker.register('/sw.js').then((reg) => {
          reg.update().catch(() => {})
        }).catch((err) => {
          // Retry once after a short delay (transient network failures)
          console.warn('[SureXend] SW register failed, retrying:', err)
          setTimeout(() => navigator.serviceWorker.register('/sw.js').catch(() => {}), 5000)
        })
      register()
    }
  }, [])

  const navItems = [
    { label: 'Home', icon: Home, href: '/app/dashboard' },
    { label: 'Invoice', icon: FileSpreadsheet, href: '/app/invoice' },
    { label: 'Conversion', icon: Repeat, href: '/app/convert' },
    { label: 'History', icon: Clock, href: '/app/history' },
    { label: 'Profile', icon: User, href: '/app/profile' },
  ]

  const markAllRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, isRead: true })))
    setUnreadCount(0)
    notificationsAPI.markAllRead().catch(() => {})
    toast.success('All notifications marked as read')
  }

  if (!mounted) return null

  return (
    <QueryClientProvider client={queryClient}>
      <div className="flex min-h-dvh-force bg-[var(--app-bg)] relative md:h-dvh-force md:overflow-hidden">
        {/* Ambient morphing mesh background — desktop-only (hidden md:block).
            Pure CSS responsive hiding guarantees mobile browsers NEVER mount
            or render giant filter:blur(60px) animated layers during hydration. */}
        <div className="hidden md:block absolute inset-0 pointer-events-none overflow-hidden" aria-hidden>
          {lite ? (
            <div
              className="absolute inset-0"
              style={{
                backgroundImage: `radial-gradient(58% 40% at 16% 6%, rgba(${colors.glowRgb}, 0.10), transparent 64%), radial-gradient(50% 36% at 88% 94%, rgba(96, 165, 250, 0.08), transparent 62%)`,
              }}
            />
          ) : (
            <>
              <motion.div
                className="absolute rounded-full"
                style={{
                  width: '70vmax',
                  height: '70vmax',
                  borderRadius: '50%',
                  background: `radial-gradient(circle at 30% 30%, rgba(${colors.glowRgb}, 0.10), transparent 60%)`,
                  filter: 'blur(60px)',
                  top: '-15%',
                  left: '-10%',
                  opacity: 0.7,
                  willChange: 'transform',
                }}
                animate={{ x: [0, 40, -20, 0], y: [0, -30, 15, 0] }}
                transition={{ duration: 28, repeat: Infinity, ease: 'easeInOut' }}
              />
              <motion.div
                className="absolute rounded-full"
                style={{
                  width: '60vmax',
                  height: '60vmax',
                  borderRadius: '50%',
                  background: `radial-gradient(circle at 60% 60%, rgba(96, 165, 250, 0.08), transparent 60%)`,
                  filter: 'blur(60px)',
                  bottom: '-15%',
                  right: '-10%',
                  opacity: 0.6,
                  willChange: 'transform',
                }}
                animate={{ x: [0, -30, 20, 0], y: [0, 25, -15, 0] }}
                transition={{ duration: 32, repeat: Infinity, ease: 'easeInOut', delay: 6 }}
              />
            </>
          )}
          {!lite && <div className="absolute inset-0 bg-radial-vignette" />}
        </div>
        {/* Desktop Sidebar */}
        <aside className="hidden md:flex flex-col w-60 md:w-64 h-full border-r border-[rgba(255,255,255,0.06)] bg-[#121419] p-4 flex-shrink-0 z-20 overflow-y-auto">
          <div className="flex items-center gap-2.5 mb-8 px-3 pt-3">
            <img
              src={variant === 'gold' ? '/logo-mark-gold.png' : '/logo-mark-plain.png'}
              alt="SureXend"
              className={`w-7 h-7 object-contain ${variant === 'gold' ? 'gold-logo-glow' : 'lemon-logo-glow'}`}
            />
            <span className="font-extrabold text-base text-white tracking-wider">
              SURE<span style={{ color: colors.primary }}>X</span>END
            </span>
          </div>

          <nav className="flex-1 space-y-1.5">
            {navItems.map((item) => {
              const isActive = pathname === item.href
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  replace
                  className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl transition-all ${
                    isActive 
                      ? `bg-[rgba(255,255,255,0.05)] text-[${colors.primary}] font-bold` 
                      : 'text-[#64748B] hover:text-white hover:bg-[rgba(255,255,255,0.02)]'
                  }`}
                  style={isActive ? { color: colors.primary } : {}}
                >
                  <item.icon className="w-4 h-4" />
                  <span className="text-sm font-medium">{item.label}</span>
                </Link>
              )
            })}
          </nav>

          <div className="p-3 mt-auto">
            {profile?.role === 'ADMIN' && (
              <Link
                href="/admin"
                className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl mb-2 text-[#64748B] hover:text-white hover:bg-[rgba(255,255,255,0.03)] transition-all text-sm"
              >
                <ShieldCheck className="w-4 h-4" />
                <span className="text-sm font-medium">Admin Console</span>
              </Link>
            )}
            <div className="p-3 rounded-xl border border-[rgba(255,255,255,0.05)] bg-[rgba(255,255,255,0.02)] flex items-center gap-3">
              <div className="w-8 h-8 rounded-full overflow-hidden border border-white/20 flex-shrink-0 bg-[#212429]">
                {avatar ? (
                  <img src={avatar} alt="Avatar" className="w-full h-full object-cover" />
                ) : (
                  <img src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80" alt="Avatar" className="w-full h-full object-cover" />
                )}
              </div>
              <div className="truncate">
                <p className="text-xs font-bold text-white truncate">{fullName}</p>
                <p className="text-[10px] text-[#64748B] truncate">@{surexTag}</p>
              </div>
            </div>
          </div>
        </aside>

        {/* Main Content Area — flex column so header is a normal flex item
             (not sticky inside overflow-y-auto, which causes Android Chrome
              compositor layer conflicts and the scanline corruption bug). */}
        <main className="flex-1 min-w-0 flex flex-col min-h-dvh-force max-w-full relative bg-[var(--app-bg)] md:h-dvh-force md:min-h-0">
          {/* Header sits OUTSIDE the scroll container as a flex child.
               No sticky needed — it's pinned by the flex layout. */}
          <header className="flex-shrink-0 h-14 sm:h-16 flex items-center justify-between px-3 sm:px-6 md:px-8 border-b border-white/5 bg-[#000000] z-30">
            <div className="flex items-center gap-2 min-w-0">
              {/* Mobile: logo + wordmark */}
              <div className="md:hidden flex items-center gap-2 min-w-0">
                <img
                  src={variant === 'gold' ? '/logo-mark-gold.png' : '/logo-mark-plain.png'}
                  alt="SureXend"
                  className={`w-6 h-6 object-contain flex-shrink-0 ${variant === 'gold' ? 'gold-logo-glow' : 'lemon-logo-glow'}`}
                />
                <span className="font-extrabold text-sm text-white tracking-wider whitespace-nowrap">
                  SURE<span style={{ color: colors.primary }}>X</span>END
                </span>
              </div>
              {/* Desktop: page title */}
              <div className="hidden md:block min-w-0">
                <h2 className="text-base font-bold text-white capitalize truncate">{pathname.split('/').pop() || 'Dashboard'}</h2>
              </div>
            </div>

            {/* Control cluster — one glass pill, evenly spaced, centred */}
            <div className="flex items-center gap-0.5 sm:gap-1 p-1 rounded-2xl border border-white/10 bg-[rgba(255,255,255,0.03)] shadow-inner">
              {/* Lite mode toggle — uses less data (animations & blur off) */}
              <button
                onClick={toggleLite}
                className={`w-9 h-9 rounded-xl border flex items-center justify-center transition-all duration-300 shadow-md flex-shrink-0 active:scale-95 ${
                  lite ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400' : 'border-white/10 text-[#64748B] hover:text-white hover:bg-white/5'
                }`}
                title={lite ? 'Lite mode ON — tap to restore full effects' : 'Lite mode — uses less data'}
                aria-label="Toggle lite mode"
                aria-pressed={lite}
              >
                <Zap className={`w-4 h-4 ${lite ? 'text-emerald-400' : ''}`} />
              </button>

              {profile?.role === 'ADMIN' && (
                <Link
                  href="/admin"
                  className="w-9 h-9 rounded-xl border border-white/10 hover:bg-white/5 text-amber-400 hover:text-amber-300 transition-colors active:scale-95 flex-shrink-0 flex items-center justify-center"
                  title="Admin Console"
                >
                  <ShieldCheck className="w-4 h-4" />
                </Link>
              )}

              {/* Notification Bell Button with badge & drawer */}
              <button 
                onClick={() => { setShowNotifications(true); loadNotifications() }}
                className="relative w-9 h-9 rounded-xl border border-white/10 hover:bg-white/5 text-[#94A3B8] hover:text-white transition-colors active:scale-95 flex-shrink-0 flex items-center justify-center"
                title="Notifications"
              >
                <Bell className="w-4 h-4" />
                {unreadCount > 0 && (
                  <>
                    <span className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 rounded-full bg-emerald-500 ring-2 ring-[#020203] text-[9px] font-bold text-black flex items-center justify-center">
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  </>
                )}
              </button>
            </div>
          </header>

          {/* Scroll container — completely separate from the header.
                No sticky elements, no GPU layer conflicts. */}
          {/* pb-nav-safe: ensures page content is never hidden behind the
                fixed bottom nav bar (4rem tall) + iOS safe area inset */}
          {/* overflow-x-hidden: overflow-y:auto alone makes overflow-x compute
                to auto, so any page content a few px too wide gives the whole
                shell a horizontal scrollbar — the trigger for the Android
                compositor scanline corruption. Clip it here for EVERY page. */}
          <div className="w-full max-w-full overflow-x-hidden pb-nav-safe md:flex-1 md:overflow-y-auto md:overscroll-none md:pb-0">
            <div className="w-full max-w-full relative">
              {profile && !profile.pinSet && !pathname.includes('/settings/change-pin') && (
                <button
                  onClick={() => router.push('/app/settings/change-pin')}
                  className="mx-3 mt-2 w-[calc(100%-24px)] rounded-2xl p-3 flex items-center gap-3 border border-amber-500/30 bg-amber-500/10 text-left"
                >
                  <ShieldCheck className="w-5 h-5 text-amber-400 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-amber-400">Set up your transaction PIN</p>
                    <p className="text-[10px] text-[#94A3B8] truncate">Required before you can send, convert, pay bills, or withdraw</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-amber-400/70 flex-shrink-0" />
                </button>
              )}
              {showBioPrompt && profile && !profile.passkeysEnabled && !pathname.includes('/settings/biometric') && (
                <div className="mx-3 mt-2 w-[calc(100%-24px)] rounded-2xl p-3 flex items-center gap-3 border border-white/10 bg-gradient-to-r from-[rgba(212,160,23,0.12)] to-[rgba(212,160,23,0.04)] text-left">
                  <div className="w-9 h-9 rounded-xl border border-[rgba(212,160,23,0.4)] bg-[rgba(212,160,23,0.12)] flex items-center justify-center flex-shrink-0">
                    <Fingerprint className="w-5 h-5 text-[#D4A017]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-[#FFD966]">Unlock with your fingerprint</p>
                    <p className="text-[10px] text-[#94A3B8] truncate">Skip the PIN — sign in and approve faster</p>
                  </div>
                  <button
                    onClick={() => router.push('/app/settings/biometric')}
                    className="px-3 py-1.5 rounded-lg text-[11px] font-bold text-black bg-[#FFD966] hover:brightness-110 transition-all active:scale-95 flex-shrink-0"
                  >
                    Set up
                  </button>
                  <button
                    onClick={() => { localStorage.setItem('surexend_bio_prompt_dismissed', '1'); setShowBioPrompt(false) }}
                    className="text-[#64748B] hover:text-white transition-colors p-1 flex-shrink-0"
                    aria-label="Dismiss"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}
              {/* Page container — standard clean React render. Zero motion wrappers
                  or layer promotions on route transitions. */}
              <div key={pathname} className="w-full">
                {children}
              </div>
            </div>
          </div>
        </main>

        {/* Mobile Bottom Navigation Bar */}
        {/* Pure-CSS nav — no Framer Motion. motion.div on every icon caused
            a JS rAF spike on every tap and route change on low-end phones.
            CSS transform + transition is handled entirely by the GPU compositor
            at zero JS cost. */}
        <nav className="md:hidden fixed bottom-0 w-full bg-[#0F1116] border-t border-white/5 px-1 py-1.5 safe-bottom z-50">
          <div className="flex justify-around items-center">
            {navItems.map((item) => {
              const isActive = pathname === item.href
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  replace
                  className={`flex flex-col items-center justify-center py-1 px-3 rounded-xl transition-colors duration-150 ${
                    isActive ? 'text-white font-bold' : 'text-[#64748B]'
                  }`}
                  style={isActive ? { color: colors.primary } : {}}
                >
                  {/* CSS-only scale — zero JS animation overhead */}
                  <div
                    className="relative transition-transform duration-150"
                    style={{ transform: isActive ? 'scale(1.12)' : 'scale(1)' }}
                  >
                    <item.icon className="w-5 h-5 mb-0.5" />
                  </div>
                  <span className="text-[10px] font-semibold tracking-tight">{item.label}</span>
                </Link>
              )
            })}
          </div>
        </nav>

        {/* ── NOTIFICATIONS GLASSMORPHIC DRAWER / MODAL ────────────────── */}
        {createPortal(
          <AnimatePresence>
            {showNotifications && (
              <div className="fixed inset-0 z-[80] flex items-start justify-end p-2 sm:p-4 liquid-backdrop">
                <motion.div
                  initial={{ opacity: 0, x: 50, scale: 0.95 }}
                  animate={{ opacity: 1, x: 0, scale: 1 }}
                  exit={{ opacity: 0, x: 50, scale: 0.95 }}
                  className="liquid-glass-strong w-[94vw] sm:w-96 max-h-[85vh] overflow-y-auto p-4 sm:p-5 relative rounded-3xl shadow-2xl border space-y-4"
                  style={{ borderColor: colors.cardBorder }}
                >
                  <div className="flex items-center justify-between border-b border-white/10 pb-3">
                    <div className="flex items-center gap-2"><Bell className="w-4 h-4 text-emerald-400" /><h3 className="font-bold text-white text-base">Notifications</h3></div>
                    <div className="flex items-center gap-2">
                      <button onClick={markAllRead} className="text-[11px] text-emerald-400 font-semibold hover:underline">Mark read</button>
                      <button onClick={() => setShowNotifications(false)} className="p-1.5 rounded-full hover:bg-white/10 text-gray-400 hover:text-white"><X className="w-4 h-4" /></button>
                    </div>
                  </div>
                  <div className="space-y-2.5">
                    {notifications.length === 0 && <div className="text-center py-10"><Bell className="w-8 h-8 text-[#64748B] mx-auto mb-2 opacity-50" /><p className="text-sm text-[#94A3B8]">No notifications yet</p></div>}
                    {notifications.map((n) => (
                      <div key={n.id} className={`p-3 rounded-2xl border transition-all ${!n.isRead ? 'bg-white/[0.04] border-white/15' : 'bg-white/[0.01] border-white/5 opacity-75'}`}>
                        <div className="flex justify-between items-start mb-1">
                          <h4 className="font-bold text-white text-xs flex items-center gap-1.5">
                            {n.type === 'LOGIN' ? <ShieldCheck className="w-3.5 h-3.5 text-blue-400" /> : n.type === 'SWAP' ? <Repeat className="w-3.5 h-3.5 text-purple-400" /> : n.type === 'SEND' || n.type === 'WITHDRAWAL' ? <ArrowUpRight className="w-3.5 h-3.5 text-amber-400" /> : n.type === 'DEPOSIT' || n.type === 'RECEIVE' ? <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-400" /> : <Bell className="w-3.5 h-3.5 text-[#64748B]" />}
                            {n.title}
                          </h4>
                          <span className="text-[10px] text-[#64748B] flex-shrink-0 ml-2">{new Date(n.createdAt || Date.now()).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                        <p className="text-[11px] text-[#94A3B8] leading-relaxed">{n.body}</p>
                      </div>
                    ))}
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>,
          document.body
        )}
        <AISupportWidget />
        <FirebaseMessaging />
      </div>
    </QueryClientProvider>
  )
}
