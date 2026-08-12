'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'react-hot-toast'
import { useTheme } from '@/context/ThemeContext'
import { 
  Home, Send, Repeat, FileText, User, Bell, ArrowUpRight, ArrowDownLeft,
  Smartphone, Building2, FileSpreadsheet, X, Check, ShieldCheck, Zap, Clock
} from 'lucide-react'
import toast from 'react-hot-toast'
import AISupportWidget from '@/components/AISupportWidget'
import { notificationsAPI } from '@/lib/api'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { variant, colors, toggleVariant } = useTheme()
  const router = useRouter()
  const pathname = usePathname()
  const [mounted, setMounted] = useState(false)
  const [showNotifications, setShowNotifications] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const [avatar, setAvatar] = useState<string | null>(null)
  const [notifications, setNotifications] = useState<any[]>([])

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

    const token = localStorage.getItem('surexend_access_token')
    if (!token) {
      router.push('/auth/login')
    }
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
      <Toaster position="top-center" toastOptions={{ style: { background: '#0F1629', color: '#fff', border: '1px solid rgba(255,255,255,0.1)' } }} />
      <div className="flex h-screen overflow-hidden bg-[var(--app-bg)] relative">
        {/* Desktop Sidebar */}
        <aside className="hidden md:flex flex-col w-60 md:w-64 h-full border-r border-[rgba(255,255,255,0.06)] bg-[#0F1629] p-4 flex-shrink-0 z-20 overflow-y-auto">
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
            <div className="p-3 rounded-xl border border-[rgba(255,255,255,0.05)] bg-[rgba(255,255,255,0.02)] flex items-center gap-3">
              <div className="w-8 h-8 rounded-full overflow-hidden border border-white/20 flex-shrink-0 bg-[#1E2738]">
                {avatar ? (
                  <img src={avatar} alt="Avatar" className="w-full h-full object-cover" />
                ) : (
                  <img src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80" alt="Avatar" className="w-full h-full object-cover" />
                )}
              </div>
              <div className="truncate">
                <p className="text-xs font-bold text-white truncate">Alex Johnson</p>
                <p className="text-[10px] text-[#64748B] truncate">@alex_xend</p>
              </div>
            </div>
          </div>
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 flex flex-col h-screen overflow-y-auto w-full max-w-full relative bg-[var(--app-bg)]">
          {/* Header */}
          <header className="h-14 sm:h-16 flex items-center justify-between px-3 sm:px-6 md:px-8 border-b border-white/5 bg-[#0A0F1E] sticky top-0 z-30">
            <div className="md:hidden flex items-center gap-2">
              <img
                src={variant === 'gold' ? '/logo-mark-gold.png' : '/logo-mark-plain.png'}
                alt="SureXend"
                className={`w-7 h-7 object-contain ${variant === 'gold' ? 'gold-logo-glow' : 'lemon-logo-glow'}`}
              />
              <span className="font-extrabold text-sm text-white tracking-wider">
                SURE<span style={{ color: colors.primary }}>X</span>END
              </span>
            </div>
            <div className="hidden md:block">
              <h2 className="text-base font-bold text-white capitalize">{pathname.split('/').pop() || 'Dashboard'}</h2>
            </div>
            <div className="flex items-center gap-2 sm:gap-3">
              {/* Theme Toggle Button */}
              <button
                onClick={toggleVariant}
                className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold border transition-all duration-300 shadow-md"
                style={{
                  background: variant === 'gold' ? 'rgba(212, 160, 23, 0.15)' : 'rgba(181, 226, 61, 0.15)',
                  borderColor: variant === 'gold' ? 'rgba(212, 160, 23, 0.4)' : 'rgba(181, 226, 61, 0.4)',
                  color: colors.primary,
                }}
                title="Switch Brand Theme (Gold / Lemon)"
              >
                <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: colors.primary }}></span>
                <span>{variant === 'gold' ? '🟡 Gold' : '🟢 Lemon'}</span>
              </button>

              {/* Notification Bell Button with badge & drawer */}
              <button 
                onClick={() => { setShowNotifications(true); loadNotifications() }}
                className="relative p-2 rounded-xl hover:bg-white/5 text-[#94A3B8] hover:text-white transition-colors active:scale-95"
                title="Notifications"
              >
                <Bell className="w-5 h-5" />
                {unreadCount > 0 && (
                  <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-[#0A0F1E]"></span>
                )}
              </button>
            </div>
          </header>

          <div className="flex-1 w-full max-w-full relative">
            <AnimatePresence mode="wait">
              <motion.div
                key={pathname}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.15 }}
                className="w-full"
              >
                {children}
              </motion.div>
            </AnimatePresence>
          </div>
        </main>

        {/* Mobile Bottom Navigation Bar */}
        <nav className="md:hidden fixed bottom-0 w-full bg-[#0D1322]/95 backdrop-blur-md border-t border-white/5 px-1 py-1.5 safe-bottom z-50">
          <div className="flex justify-around items-center">
            {navItems.map((item) => {
              const isActive = pathname === item.href
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex flex-col items-center justify-center py-1 px-3 rounded-xl transition-all ${
                    isActive ? 'text-white font-bold' : 'text-[#64748B]'
                  }`}
                  style={isActive ? { color: colors.primary } : {}}
                >
                  <motion.div
                    animate={isActive ? { scale: 1.1 } : { scale: 1 }}
                    className="relative"
                  >
                    <item.icon className="w-5 h-5 mb-0.5" />
                  </motion.div>
                  <span className="text-[10px] font-semibold tracking-tight">{item.label}</span>
                </Link>
              )
            })}
          </div>
        </nav>

        {/* ── NOTIFICATIONS GLASSMORPHIC DRAWER / MODAL ────────────────── */}
        <AnimatePresence>
          {showNotifications && (
            <div className="fixed inset-0 z-50 flex items-start justify-end p-2 sm:p-4 bg-black/75 backdrop-blur-md">
              <motion.div
                initial={{ opacity: 0, x: 50, scale: 0.95 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: 50, scale: 0.95 }}
                className="glass-card w-[94vw] sm:w-96 max-h-[85vh] overflow-y-auto p-4 sm:p-5 relative rounded-3xl shadow-2xl border space-y-4"
                style={{ borderColor: colors.cardBorder }}
              >
                <div className="flex items-center justify-between border-b border-white/10 pb-3">
                  <div className="flex items-center gap-2">
                    <Bell className="w-4 h-4 text-emerald-400" />
                    <h3 className="font-bold text-white text-base">Notifications</h3>
                  </div>
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={markAllRead} 
                      className="text-[11px] text-emerald-400 font-semibold hover:underline"
                    >
                      Mark read
                    </button>
                    <button 
                      onClick={() => setShowNotifications(false)} 
                      className="p-1.5 rounded-full hover:bg-white/10 text-gray-400 hover:text-white"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="space-y-2.5">
                  {notifications.length === 0 && (
                    <div className="text-center py-10">
                      <Bell className="w-8 h-8 text-[#64748B] mx-auto mb-2 opacity-50" />
                      <p className="text-sm text-[#94A3B8]">No notifications yet</p>
                    </div>
                  )}
                  {notifications.map((n) => (
                    <div 
                      key={n.id}
                      className={`p-3 rounded-2xl border transition-all ${
                        !n.isRead 
                          ? 'bg-white/[0.04] border-white/15' 
                          : 'bg-white/[0.01] border-white/5 opacity-75'
                      }`}
                    >
                      <div className="flex justify-between items-start mb-1">
                        <h4 className="font-bold text-white text-xs flex items-center gap-1.5">
                          {n.type === 'LOGIN' ? <ShieldCheck className="w-3.5 h-3.5 text-blue-400" /> : <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-400" />}
                          {n.title}
                        </h4>
                        <span className="text-[10px] text-[#64748B] flex-shrink-0 ml-2">
                          {new Date(n.createdAt || Date.now()).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <p className="text-[11px] text-[#94A3B8] leading-relaxed">{n.body}</p>
                    </div>
                  ))}
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
        <AISupportWidget />
      </div>
    </QueryClientProvider>
  )
}
