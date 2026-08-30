'use client'

import { useState, useRef, useEffect, type KeyboardEvent } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { useTheme } from '@/context/ThemeContext'
import { supportAPI } from '@/lib/api'
import { useQuery } from '@tanstack/react-query'
import {
  Send, Bot, Headphones,
  Mail, ShieldCheck, MessageSquareText
} from 'lucide-react'

// ── Message types ──────────────────────────────────────────────────────────
interface Message {
  id: string
  role: 'USER' | 'AI' | 'HUMAN'
  content: string
  timestamp: Date
  isLoading?: boolean
}

// ── AI suggested replies (quick replies) ──────────────────────────────────
const QUICK_REPLIES = [
  'How do I withdraw to my bank?',
  'Why is my transaction pending?',
  'How does the referral program work?',
  'How to buy airtime with USDC?',
  'What are the fees?',
  'How do I verify my account (KYC)?',
]

// ── Message bubble ─────────────────────────────────────────────────────────
function MessageBubble({ msg, accentHex, accentRgb, reduceMotion }: {
  msg: Message; accentHex: string; accentRgb: string; reduceMotion: boolean
}) {
  const isUser = msg.role === 'USER'
  const isHuman = msg.role === 'HUMAN'

  return (
    <motion.div
      className={`flex gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'} mb-4`}
      initial={{ opacity: 0, y: 10, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', damping: 20 }}
    >
      {/* Avatar */}
      {!isUser && (
        <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-auto"
          style={isHuman
            ? { background: 'rgba(16,185,129,0.15)' }
            : { background: `rgba(${accentRgb}, 0.15)` }}>
          {isHuman
            ? <Headphones size={14} style={{ color: '#10B981' }} />
            : <Bot size={14} style={{ color: accentHex }} />
          }
        </div>
      )}

      <div className={`max-w-[78%] ${isUser ? 'items-end' : 'items-start'} flex flex-col gap-1`}>
        {!isUser && (
          <p className="text-[#64748B] text-[10px] ml-1">
            {isHuman ? '👤 Support Agent' : '🤖 SureXend AI'}
          </p>
        )}
        <div
          className="px-4 py-3 rounded-2xl text-sm leading-relaxed"
          style={isUser ? {
            background: `rgba(${accentRgb}, 0.2)`,
            color: '#fff',
            borderBottomRightRadius: 6,
          } : {
            background: '#121419',
            border: '1px solid rgba(255,255,255,0.06)',
            color: '#E2E8F0',
            borderBottomLeftRadius: 6,
          }}
        >
          {msg.isLoading ? (
            <div className="flex gap-1.5 items-center py-0.5">
              {[0, 1, 2].map(i => (
                <motion.div key={i} className="w-1.5 h-1.5 rounded-full bg-[#64748B]"
                  animate={reduceMotion ? undefined : { y: [0, -5, 0] }}
                  transition={reduceMotion ? undefined : { duration: 0.6, delay: i * 0.1, repeat: Infinity }} />
              ))}
            </div>
          ) : (
            msg.content
          )}
        </div>
        <p className="text-[#64748B] text-[10px] mx-1">
          {msg.timestamp.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
        </p>
      </div>
    </motion.div>
  )
}

// ── Support page ───────────────────────────────────────────────────────────
export default function SupportPage() {
  const { variant } = useTheme()
  const isGold = variant === 'gold'
  const accentRgb = isGold ? '212, 160, 23' : '181, 226, 61'
  const accentHex = isGold ? '#D4A017' : '#B5E23D'
  const reduceMotion = useReducedMotion()

  const [messages, setMessages] = useState<Message[]>([
    {
      id: '0',
      role: 'AI',
      content: "Hi! 👋 I'm SureXend AI Support, available 24/7. I can help you with transactions, account issues, conversions, bill payments, and more. How can I help you today?",
      timestamp: new Date(),
    }
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [sessionId] = useState(() => Math.random().toString(36).slice(2))
  const [escalated, setEscalated] = useState(false)
  const [showQuickReplies, setShowQuickReplies] = useState(true)
  const [activeView, setActiveView] = useState<'chat' | 'tickets'>('chat')
  const bottomRef = useRef<HTMLDivElement>(null)

  const { data: ticketsData, isLoading: ticketsLoading } = useQuery({
    queryKey: ['supportTickets'],
    queryFn: supportAPI.getTickets,
    staleTime: 30000,
  })
  const tickets = Array.isArray(ticketsData)
    ? ticketsData
    : Array.isArray((ticketsData as any)?.tickets)
      ? (ticketsData as any).tickets
      : []

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth' })
  }, [messages, reduceMotion])

  const sendMessage = async (text?: string) => {
    const messageText = text || input.trim()
    if (!messageText || loading) return

    setInput('')
    setShowQuickReplies(false)

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'USER',
      content: messageText,
      timestamp: new Date(),
    }

    const loadingMsg: Message = {
      id: Date.now().toString() + '-loading',
      role: 'AI',
      content: '',
      timestamp: new Date(),
      isLoading: true,
    }

    setMessages(prev => [...prev, userMsg, loadingMsg])
    setLoading(true)

    try {
      const { response, escalate } = await supportAPI.chat({
        message: messageText,
        sessionId,
      })

      setMessages(prev => prev.filter(m => !m.isLoading).concat({
        id: Date.now().toString() + '-ai',
        role: 'AI',
        content: response,
        timestamp: new Date(),
      }))

      if (escalate && !escalated) {
        setEscalated(true)
        setTimeout(() => {
          setMessages(prev => [...prev, {
            id: 'escalate',
            role: 'HUMAN',
            content: "A human support agent has been notified and will join this conversation shortly. Our response time is typically within 2 hours during business hours. Your ticket has been created automatically. 🙏",
            timestamp: new Date(),
          }])
        }, 1000)
      }
    } catch {
      setMessages(prev => prev.filter(m => !m.isLoading).concat({
        id: Date.now().toString() + '-err',
        role: 'AI',
        content: "I'm having trouble connecting right now. Please try again in a moment, or reach us at support@surexend.com.",
        timestamp: new Date(),
      }))
    } finally {
      setLoading(false)
    }
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  return (
    <div className="min-h-screen bg-[#000000] pb-32 flex flex-col">
      {/* Header */}
      <div className="px-4 pt-6 pb-4 max-w-2xl mx-auto w-full space-y-4">
        <div className="liquid-glass rounded-3xl border border-white/10 p-5 overflow-hidden relative">
          <div className="absolute inset-x-0 top-0 h-[2px]" style={{ background: `linear-gradient(90deg, transparent, rgba(${accentRgb}, 0.8), transparent)` }} />
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-white font-bold text-2xl tracking-tight">Support</h1>
              <p className="text-sm text-[#94A3B8] mt-1">Get help fast, escalate serious issues clearly, and keep a written record of what happened.</p>
            </div>
            <span className="px-2.5 py-1 rounded-full text-[10px] font-bold border whitespace-nowrap bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
              AI live 24/7
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-5">
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
              <Mail className="w-4 h-4 text-white mb-2" />
              <p className="text-[10px] uppercase tracking-wider font-extrabold text-[#64748B]">Human support</p>
              <p className="text-sm font-semibold text-white mt-1">support@surexend.com</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
              <ShieldCheck className="w-4 h-4 text-emerald-400 mb-2" />
              <p className="text-[10px] uppercase tracking-wider font-extrabold text-[#64748B]">Escalation</p>
              <p className="text-sm font-semibold text-white mt-1">Risk issues can be flagged</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
              <MessageSquareText className="w-4 h-4" style={{ color: accentHex }} />
              <p className="text-[10px] uppercase tracking-wider font-extrabold text-[#64748B]">Records</p>
              <p className="text-sm font-semibold text-white mt-1">Chat + ticket trail</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tab switch */}
      <div className="max-w-2xl mx-auto w-full px-4 mb-4">
        <div className="flex gap-1 bg-[#121419] p-1 rounded-xl border border-white/5">
          {[
            { key: 'chat', label: '💬 Chat' },
            { key: 'tickets', label: '🎫 Tickets' },
          ].map(tab => (
            <button
              key={tab.key}
              className="flex-1 py-2.5 rounded-lg text-sm font-medium transition-all"
              style={activeView === tab.key ? {
                background: `rgba(${accentRgb}, 0.15)`,
                color: accentHex,
              } : { color: '#64748B' }}
              onClick={() => setActiveView(tab.key as any)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {activeView === 'chat' ? (
        <div className="flex-1 flex flex-col max-w-2xl mx-auto w-full px-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
            {[
              { title: 'Pending transfer', desc: 'Ask about a stuck transaction or missing update.' },
              { title: 'KYC & profile', desc: 'Get help with verification, tags, and profile settings.' },
              { title: 'Rates & bills', desc: 'Understand conversions, fees, and supported bill flows.' },
            ].map((item) => (
              <button
                key={item.title}
                type="button"
                onClick={() => sendMessage(item.title)}
                className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-left hover:bg-white/[0.05] transition-colors"
              >
                <p className="text-sm font-bold text-white">{item.title}</p>
                <p className="text-xs text-[#94A3B8] mt-1.5 leading-relaxed">{item.desc}</p>
              </button>
            ))}
          </div>

          {/* AI status banner */}
          {escalated && (
            <motion.div
              className="mb-4 p-3 rounded-xl flex items-center gap-3"
              style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)' }}
              initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
            >
              <Headphones size={16} style={{ color: '#10B981' }} />
              <p className="text-[#10B981] text-xs flex-1">Human agent notified — response within 2 hours</p>
            </motion.div>
          )}

          {/* Messages area */}
          <div className="flex-1 overflow-y-auto space-y-0 mb-4 rounded-3xl border border-white/8 bg-white/[0.02] px-3 py-3" style={{ maxHeight: 'calc(100vh - 430px)', minHeight: 300 }}>
            {messages.map(msg => (
              <MessageBubble key={msg.id} msg={msg} accentHex={accentHex} accentRgb={accentRgb} reduceMotion={!!reduceMotion} />
            ))}

            {/* Quick replies */}
            {showQuickReplies && (
              <motion.div
                className="mt-2"
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              >
                <p className="text-[#64748B] text-xs mb-3 ml-11">Common questions:</p>
                <div className="flex flex-wrap gap-2 ml-11">
                  {QUICK_REPLIES.map(qr => (
                    <button
                      key={qr}
                      className="px-3 py-2 rounded-xl text-xs border transition-all hover:border-opacity-50"
                      style={{
                        background: `rgba(${accentRgb}, 0.06)`,
                        color: accentHex,
                        border: `1px solid rgba(${accentRgb}, 0.2)`,
                      }}
                      onClick={() => sendMessage(qr)}
                    >
                      {qr}
                    </button>
                  ))}
                </div>
              </motion.div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input area */}
          <div className="pb-4">
            <div
              className="flex items-end gap-3 p-3 rounded-2xl border"
              style={{ background: '#121419', borderColor: 'rgba(255,255,255,0.08)' }}
            >
              <textarea
                className="flex-1 bg-transparent text-white text-sm resize-none outline-none placeholder-[#64748B] max-h-32"
                placeholder="Type your message..."
                rows={1}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                onInput={e => {
                  const el = e.target as HTMLTextAreaElement
                  el.style.height = 'auto'
                  el.style.height = Math.min(el.scrollHeight, 128) + 'px'
                }}
              />
              <motion.button
                className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 disabled:opacity-40"
                style={{
                  background: input.trim() ? `rgba(${accentRgb}, 0.2)` : 'rgba(255,255,255,0.05)',
                  color: input.trim() ? accentHex : '#64748B',
                }}
                whileTap={{ scale: 0.9 }}
                onClick={() => sendMessage()}
                disabled={!input.trim() || loading}
              >
                {loading
                  ? <motion.div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full"
                      animate={reduceMotion ? undefined : { rotate: 360 }} transition={reduceMotion ? undefined : { duration: 0.8, repeat: Infinity, ease: 'linear' }} />
                  : <Send size={16} />
                }
              </motion.button>
            </div>
            <p className="text-[#64748B] text-[10px] text-center mt-2">
              SureXend AI · Responses may not always be perfect · Human escalation available
            </p>
          </div>
        </div>
      ) : (
        <div className="max-w-2xl mx-auto w-full px-4">
          <div className="bg-[#121419] rounded-3xl p-5 border border-white/5">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div>
                <h3 className="text-white font-semibold text-lg">Tickets</h3>
                <p className="text-[#64748B] text-sm">Escalated conversations and support follow-ups.</p>
              </div>
              <button
                className="px-4 py-2 rounded-xl text-sm font-semibold"
                style={{ background: `rgba(${accentRgb}, 0.12)`, color: accentHex }}
                onClick={() => setActiveView('chat')}
              >
                Open chat
              </button>
            </div>

            {ticketsLoading ? (
              <div className="space-y-3 py-2">
                {Array.from({ length: 3 }, (_, i) => <div key={i} className="h-20 rounded-2xl skeleton" />)}
              </div>
            ) : tickets.length === 0 ? (
              <div className="text-center py-16">
                <div className="text-5xl mb-4">🎫</div>
                <h3 className="text-white font-semibold mb-2">No open tickets</h3>
                <p className="text-[#64748B] text-sm mb-6 max-w-xs mx-auto">
                  Use the chat to get instant help. A ticket is automatically created if escalated to a human agent.
                </p>
                <button
                  className="px-6 py-3 rounded-xl text-sm font-semibold"
                  style={{ background: `rgba(${accentRgb}, 0.12)`, color: accentHex }}
                  onClick={() => setActiveView('chat')}
                >
                  Start a Chat
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {tickets.map((ticket: any) => (
                  <div key={ticket.id} className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-bold text-white">{ticket.subject}</p>
                        <p className="text-xs text-[#94A3B8] mt-1">{ticket.category} · {ticket.status}</p>
                      </div>
                      <span className="text-[11px] text-[#64748B] whitespace-nowrap">{ticket.date || '—'}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
