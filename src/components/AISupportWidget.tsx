'use client'

import React, { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useTheme } from '@/context/ThemeContext'
import { MessageSquare, X, Send, Bot, User, Sparkles, HelpCircle, ChevronRight, RefreshCw, Zap } from 'lucide-react'
import toast from 'react-hot-toast'

interface Message {
  id: string
  sender: 'ai' | 'user'
  text: string
  time: string
}

const QUICK_QUESTIONS = [
  'How do I convert USD to Naira?',
  'How do European Invoices work?',
  'What are the withdrawal fees?',
  'How do I deposit local currency?'
]

const AI_KNOWLEDGE_BASE: Record<string, string> = {
  naira: 'To convert USD to Naira (NGN), tap the **Conversion** tab in the bottom navigation. Enter your USD amount, select NGN as the recipient currency, choose your saved bank account, and confirm with your 4-digit PIN. Funds arrive in under 2 minutes!',
  invoice: 'SureXend Invoices allow you to accept payments from Europe (SEPA EUR, GBP, CHF, PLN, SEK, etc.). You can generate an invoice for clients worldwide. When your client pays into the generated IBAN, funds auto-convert to your USD wallet balance!',
  fee: 'SureXend charges zero fees on internal Xend Tag P2P transfers. Crypto withdrawals & fiat conversion fees are capped at 1.2% with live transparent rate display before you confirm.',
  deposit: 'You can fund your account in 2 ways:\n1. **Deposit Local Currency**: Use your dedicated Virtual Bank Account for direct NGN transfers.\n2. **Deposit Crypto**: Copy your USDC/USDT deposit address or scan the QR code under the Deposit section.',
  default: 'I am your 24/7 SureXend AI Assistant! I can help you with conversions, local bank deposits, international invoices, bill payments, or security. How can I assist you today?'
}

export default function AISupportWidget() {
  const { variant, colors } = useTheme()
  const [isOpen, setIsOpen] = useState(false)
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      sender: 'ai',
      text: 'Hello! 👋 I am your 24/7 SureXend Assistant. How can I help you today?',
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
  ])
  const [isTyping, setIsTyping] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const isGold = variant === 'gold'
  const accentRgb = isGold ? '212, 160, 23' : '181, 226, 61'

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, isOpen])

  const handleSend = (textToSend?: string) => {
    const query = (textToSend || input).trim()
    if (!query) return

    const userMsg: Message = {
      id: Date.now().toString(),
      sender: 'user',
      text: query,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }

    setMessages(prev => [...prev, userMsg])
    if (!textToSend) setInput('')
    setIsTyping(true)

    // Simulate AI response logic
    setTimeout(() => {
      const lower = query.toLowerCase()
      let aiText = AI_KNOWLEDGE_BASE.default

      if (lower.includes('naira') || lower.includes('convert') || lower.includes('rate')) {
        aiText = AI_KNOWLEDGE_BASE.naira
      } else if (lower.includes('invoice') || lower.includes('europe') || lower.includes('iban') || lower.includes('sepa')) {
        aiText = AI_KNOWLEDGE_BASE.invoice
      } else if (lower.includes('fee') || lower.includes('charge')) {
        aiText = AI_KNOWLEDGE_BASE.fee
      } else if (lower.includes('deposit') || lower.includes('fund') || lower.includes('bank')) {
        aiText = AI_KNOWLEDGE_BASE.deposit
      }

      const aiMsg: Message = {
        id: (Date.now() + 1).toString(),
        sender: 'ai',
        text: aiText,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }

      setMessages(prev => [...prev, aiMsg])
      setIsTyping(false)
    }, 800)
  }

  return (
    <>
      {/* 🟢 FLOATING AI SUPPORT TRIGGER BUTTON */}
      <motion.button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-20 right-4 z-40 w-12 h-12 rounded-full flex items-center justify-center text-black font-extrabold shadow-2xl transition-all border border-white/20 active:scale-95 md:bottom-6 md:right-6"
        style={{
          background: colors.gradientBg,
          boxShadow: `0 0 25px rgba(${accentRgb}, 0.6), inset 0 2px 4px rgba(255,255,255,0.4)`
        }}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        title="24/7 AI Support Assistant"
      >
        <Bot className="w-6 h-6 text-black" />
        <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-emerald-500 ring-2 ring-[#0A0F1E] animate-pulse" />
      </motion.button>

      {/* 💬 CHAT MODAL DRAWER */}
      <AnimatePresence>
        {isOpen && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 liquid-backdrop">
            <motion.div
              initial={{ opacity: 0, y: 100, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 100, scale: 0.95 }}
              className="w-full sm:w-[420px] h-[85vh] sm:h-[600px] max-h-[90vh] liquid-glass-strong border border-white/10 rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden relative"
            >
              {/* Header */}
              <div className="p-4 border-b border-white/10 flex items-center justify-between bg-black/40">
                <div className="flex items-center gap-3">
                  <div 
                    className="w-10 h-10 rounded-2xl flex items-center justify-center text-black font-extrabold shadow-md"
                    style={{ background: colors.gradientBg }}
                  >
                    <Bot className="w-6 h-6 text-black" />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-white text-sm flex items-center gap-1.5">
                      SureXend AI Assistant
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 font-bold border border-emerald-500/20">
                        24/7 Online
                      </span>
                    </h3>
                    <p className="text-[11px] text-[#94A3B8]">Ask any question about transfers, bills & rates</p>
                  </div>
                </div>

                <button
                  onClick={() => setIsOpen(false)}
                  className="p-2 rounded-full hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Messages Body */}
              <div className="flex-1 p-4 overflow-y-auto space-y-4">
                {messages.map((m) => (
                  <div
                    key={m.id}
                    className={`flex ${m.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[85%] p-3.5 rounded-2xl text-xs leading-relaxed ${
                        m.sender === 'user'
                          ? 'bg-emerald-500/20 text-emerald-100 border border-emerald-500/30 rounded-tr-none'
                          : 'bg-white/[0.04] text-gray-200 border border-white/10 rounded-tl-none'
                      }`}
                    >
                      <p className="whitespace-pre-line">{m.text}</p>
                      <span className="text-[9px] text-[#64748B] block mt-1 text-right">{m.time}</span>
                    </div>
                  </div>
                ))}

                {isTyping && (
                  <div className="flex justify-start">
                    <div className="bg-white/[0.04] border border-white/10 p-3 rounded-2xl text-xs text-gray-400 flex items-center gap-2">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-400" />
                      <span>AI is thinking...</span>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Quick Prompt Suggestions */}
              <div className="p-2 border-t border-white/5 bg-black/20 flex gap-2 overflow-x-auto no-scrollbar">
                {QUICK_QUESTIONS.map((q, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSend(q)}
                    className="px-3 py-1.5 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-[11px] text-gray-300 font-medium whitespace-nowrap transition-all flex items-center gap-1"
                  >
                    <Sparkles className="w-3 h-3 text-amber-400" /> {q}
                  </button>
                ))}
              </div>

              {/* Input Bar */}
              <div className="p-3 border-t border-white/10 bg-[#0A0F1E] flex items-center gap-2">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                  placeholder="Type your question..."
                  className="flex-1 py-3 px-4 rounded-xl bg-white/[0.04] border border-white/10 text-white text-xs focus:outline-none focus:border-emerald-500 transition-colors"
                />
                <button
                  onClick={() => handleSend()}
                  disabled={!input.trim()}
                  className="p-3 rounded-xl font-bold text-black shadow-md disabled:opacity-40 transition-transform active:scale-95"
                  style={{ background: colors.gradientBg }}
                >
                  <Send className="w-4 h-4 text-black" />
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  )
}
