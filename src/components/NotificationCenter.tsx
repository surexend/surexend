'use client'

import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { useRouter } from 'next/navigation'
import { ArrowDownLeft, ArrowUpRight, Bell, CheckCheck, Gift, Megaphone, Repeat, ShieldCheck, Sparkles, X } from 'lucide-react'
import { notificationsAPI } from '@/lib/api'

type Props = {
  open: boolean
  notifications: any[]
  unreadCount: number
  onClose: () => void
  onNotificationsChange: (items: any[]) => void
  onUnreadCountChange: (count: number) => void
}

function visual(type = '') {
  switch (type.toUpperCase()) {
    case 'SEND': case 'WITHDRAWAL': return [ArrowUpRight, '#FBBF24', 'rgba(251,191,36,.12)'] as const
    case 'DEPOSIT': case 'RECEIVE': return [ArrowDownLeft, '#34D399', 'rgba(52,211,153,.12)'] as const
    case 'SWAP': case 'CONVERT': return [Repeat, '#C084FC', 'rgba(192,132,252,.12)'] as const
    case 'LOGIN': case 'SECURITY': return [ShieldCheck, '#60A5FA', 'rgba(96,165,250,.12)'] as const
    case 'REFERRAL': return [Gift, '#F472B6', 'rgba(244,114,182,.12)'] as const
    case 'PROMO': case 'BROADCAST': return [Megaphone, '#FB923C', 'rgba(251,146,60,.12)'] as const
    default: return [Sparkles, '#CBD5E1', 'rgba(203,213,225,.10)'] as const
  }
}

function relativeTime(value: string) {
  const seconds = Math.floor((Date.now() - new Date(value).getTime()) / 1000)
  if (seconds < 60) return 'Now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d`
  return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export default function NotificationCenter({ open, notifications, unreadCount, onClose, onNotificationsChange, onUnreadCountChange }: Props) {
  const router = useRouter()
  if (typeof document === 'undefined') return null

  const markAll = () => {
    onNotificationsChange(notifications.map((item) => ({ ...item, isRead: true })))
    onUnreadCountChange(0)
    notificationsAPI.markAllRead().catch(() => {})
  }

  const select = (item: any) => {
    if (!item.isRead) {
      onNotificationsChange(notifications.map((entry) => entry.id === item.id ? { ...entry, isRead: true } : entry))
      onUnreadCountChange(Math.max(0, unreadCount - 1))
      notificationsAPI.markRead(item.id).catch(() => {})
    }
    const destination = item.data?.url || item.data?.href
    if (typeof destination === 'string' && destination.startsWith('/')) {
      onClose()
      router.push(destination)
    }
  }

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-[90] bg-black/45 backdrop-blur-sm sm:flex sm:items-start sm:justify-end sm:p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
          <motion.section role="dialog" aria-modal="true" aria-label="Notifications" initial={{ opacity: 0, y: 40, scale: .98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 30, scale: .98 }} transition={{ type: 'spring', damping: 28, stiffness: 320 }} className="absolute inset-x-0 bottom-0 max-h-[88dvh] overflow-hidden rounded-t-[28px] border border-white/15 bg-[rgba(18,20,25,.82)] shadow-[0_-24px_80px_rgba(0,0,0,.55)] backdrop-blur-[32px] sm:static sm:w-[410px] sm:max-h-[calc(100dvh-2rem)] sm:rounded-[26px]">
            <div className="sm:hidden w-10 h-1 rounded-full bg-white/20 mx-auto mt-2.5" />
            <header className="flex items-center justify-between gap-3 px-4 sm:px-5 py-4 border-b border-white/10">
              <div className="flex items-center gap-3 min-w-0">
                <div className="relative w-10 h-10 rounded-2xl border border-white/10 bg-white/[0.07] grid place-items-center"><Bell className="w-[18px] h-[18px] text-white" />{unreadCount > 0 && <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-emerald-400 text-[9px] font-black text-black grid place-items-center ring-2 ring-[#121419]">{unreadCount > 99 ? '99+' : unreadCount}</span>}</div>
                <div><h2 className="text-[17px] font-bold text-white">Notifications</h2><p className="text-[11px] text-[#64748B] mt-0.5">{unreadCount ? `${unreadCount} unread update${unreadCount === 1 ? '' : 's'}` : 'You are all caught up'}</p></div>
              </div>
              <div className="flex items-center gap-1">{unreadCount > 0 && <button onClick={markAll} title="Mark all as read" className="w-9 h-9 rounded-xl grid place-items-center text-[#94A3B8] hover:text-white hover:bg-white/10"><CheckCheck className="w-4 h-4" /></button>}<button onClick={onClose} title="Close" className="w-9 h-9 rounded-xl grid place-items-center text-[#94A3B8] hover:text-white hover:bg-white/10"><X className="w-4 h-4" /></button></div>
            </header>
            <div className="overflow-y-auto overscroll-contain max-h-[calc(88dvh-86px)] sm:max-h-[calc(100dvh-7.5rem)] px-2 py-2">
              {notifications.length === 0 ? <div className="px-6 py-16 text-center"><div className="w-14 h-14 mx-auto rounded-[20px] border border-white/10 bg-white/[0.04] grid place-items-center"><Bell className="w-6 h-6 text-[#475569]" /></div><p className="text-sm font-semibold text-white mt-4">Nothing new</p><p className="text-xs text-[#64748B] mt-1">Account activity and important updates will appear here.</p></div> : notifications.map((item) => {
                const [Icon, color, bg] = visual(item.type)
                return <button key={item.id} onClick={() => select(item)} className={`relative w-full text-left flex gap-3 rounded-2xl px-3 py-3.5 transition-colors ${item.isRead ? 'hover:bg-white/[0.035]' : 'bg-white/[0.055] hover:bg-white/[0.08]'}`}>{!item.isRead && <span className="absolute left-1.5 top-1/2 -translate-y-1/2 w-1 h-7 rounded-full bg-emerald-400" />}<div className="w-10 h-10 rounded-2xl flex-shrink-0 grid place-items-center border border-white/[0.07]" style={{ background: bg }}><Icon className="w-[18px] h-[18px]" style={{ color }} /></div><div className="min-w-0 flex-1 pt-0.5"><div className="flex items-start justify-between gap-3"><p className={`text-[13px] leading-snug truncate ${item.isRead ? 'font-medium text-[#CBD5E1]' : 'font-bold text-white'}`}>{item.title}</p><time className="text-[10px] text-[#64748B] flex-shrink-0">{relativeTime(item.createdAt)}</time></div><p className="text-[11px] text-[#94A3B8] leading-relaxed mt-1 line-clamp-2">{item.body}</p></div></button>
              })}
            </div>
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>, document.body
  )
}
