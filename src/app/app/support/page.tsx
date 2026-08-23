'use client'

import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useTheme } from '@/context/ThemeContext'
import { supportAPI } from '@/lib/api'
import {
  MessageCircle, Send, X, Minimize2, Maximize2,
  Bot, User, Clock, ChevronRight, Headphones,
  RefreshCw, AlertCircle, CheckCircle
} from 'lucide-react'
import toast from 'react-hot-toast'

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
function MessageBubble({ msg, accentHex, accentRgb }: {
  msg: Message; accentHex: string; accentRgb: string
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
                  animate={{ y: [0, -5, 0] }}
                  transition={{ duration: 0.6, delay: i * 0.1, repeat: Infinity }} />
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
  const { variant, colors } = useTheme()
  const isGold = variant === 'gold'
  const accentRgb = isGold ? '212, 160, 23' : '181, 226, 61'
  const accentHex = isGold ? '#D4A017' : '#B5E23D'

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

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

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

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  return (
    <div className="min-h-screen bg-[#07080B] pb-32 flex flex-col">
      {/* Header */}
      <div className="px-4 pt-6 pb-4 max-w-2xl mx-auto w-full">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-white font-inter font-bold text-xl mb-1">Support</h1>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-[#10B981]" />
              <p className="text-[#10B981] text-xs font-medium">AI Support Active · 24/7</p>
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
          <div className="flex-1 overflow-y-auto space-y-0 mb-4" style={{ maxHeight: 'calc(100vh - 380px)', minHeight: 300 }}>
            {messages.map(msg => (
              <MessageBubble key={msg.id} msg={msg} accentHex={accentHex} accentRgb={accentRgb} />
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
                      animate={{ rotate: 360 }} transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }} />
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
          <div className="bg-[#121419] rounded-2xl p-5 border border-white/5 text-center py-16">
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
        </div>
      )}
    </div>
  )
}
