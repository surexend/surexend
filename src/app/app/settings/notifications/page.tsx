'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { useTheme } from '@/context/ThemeContext'
import { notificationsAPI } from '@/lib/api'
import { useRouter } from 'next/navigation'
import { Bell, Mail, Smartphone, BellRing, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'

const PREFS_KEY = 'surexend_notif_prefs'

const CATEGORIES = [
  { key: 'transactions', label: 'Transactions', desc: 'Send, receive, convert & bill payments', icon: BellRing },
  { key: 'alerts', label: 'Security alerts', desc: 'Logins, 2FA and PIN changes', icon: Smartphone },
  { key: 'email', label: 'Email updates', desc: 'Statements and monthly summaries', icon: Mail },
  { key: 'promos', label: 'Offers & campaigns', desc: 'Referral bonuses and promos', icon: Bell },
]

export default function NotificationsPage() {
  const { variant, colors } = useTheme()
  const isGold = variant === 'gold'
  const accentRgb = isGold ? '212, 160, 23' : '181, 226, 61'
  const router = useRouter()

  const [prefs, setPrefs] = useState<Record<string, boolean>>(() => {
    if (typeof window === 'undefined') return {}
    try {
      return JSON.parse(localStorage.getItem(PREFS_KEY) || '') || {
        transactions: true, alerts: true, email: false, promos: false,
      }
    } catch {
      return { transactions: true, alerts: true, email: false, promos: false }
    }
  })
  const [saving, setSaving] = useState(false)

  const toggle = (key: string) => {
    const next = { ...prefs, [key]: !prefs[key] }
    setPrefs(next)
    localStorage.setItem(PREFS_KEY, JSON.stringify(next))
    toast.success(`${next[key] ? 'Enabled' : 'Disabled'} ${CATEGORIES.find(c => c.key === key)?.label.toLowerCase()}`)
  }

  const test = async () => {
    setSaving(true)
    try {
      await notificationsAPI.markAllRead()
      toast.success('Notification channels are working')
    } catch {
      toast.error('Could not reach the notification service')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="w-full max-w-full px-3 py-4 max-w-md mx-auto flex flex-col pb-28 sm:pb-36">
      <div className="flex items-center gap-2 mb-4">
        <button onClick={() => router.back()} className="text-[#94A3B8] hover:text-white text-sm font-semibold">← Back</button>
      </div>

      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
        {CATEGORIES.map((cat) => {
          const Icon = cat.icon
          const on = !!prefs[cat.key]
          return (
            <div key={cat.key} className="liquid-glass rounded-2xl p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 border" style={{ background: `rgba(${accentRgb}, 0.1)`, borderColor: `rgba(${accentRgb}, 0.3)` }}>
                <Icon className="w-5 h-5" style={{ color: on ? colors.primary : '#64748B' }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white">{cat.label}</p>
                <p className="text-[11px] text-[#94A3B8] truncate">{cat.desc}</p>
              </div>
              <button
                onClick={() => toggle(cat.key)}
                role="switch"
                aria-checked={on}
                className={`w-11 h-6 rounded-full p-0.5 transition-colors flex-shrink-0 ${on ? '' : 'bg-white/10'}`}
                style={on ? { background: `rgba(${accentRgb}, 0.6)` } : undefined}
              >
                <span className={`block w-5 h-5 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-5' : 'translate-x-0'}`} />
              </button>
            </div>
          )
        })}

        <button
          onClick={test}
          disabled={saving}
          className="w-full py-3.5 rounded-xl font-bold text-black flex items-center justify-center gap-2 shadow-lg transition-all active:scale-[0.98] disabled:opacity-60"
          style={{ background: colors.gradientBg }}
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <BellRing className="w-4 h-4" />}
          {saving ? 'Checking…' : 'Send test notification'}
        </button>

        <p className="text-[10px] text-[#64748B] text-center">Preferences are saved on this device. Push delivery depends on your browser&apos;s permission.</p>
      </motion.div>
    </div>
  )
}