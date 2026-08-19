'use client'

import React, { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useTheme } from '@/context/ThemeContext'
import { X, Send, Bot, Sparkles, RefreshCw, ShieldCheck, Download, KeyRound } from 'lucide-react'
import toast from 'react-hot-toast'
import { walletAPI, billsAPI, transactionAPI, supportAPI, conversionAPI } from '@/lib/api'
import { renderReceiptCanvas, downloadReceiptFile } from '@/lib/receipt'
import BiometricApproveButton from '@/components/BiometricApproveButton'

interface AssistantAction {
  type: 'send' | 'bill' | 'convert' | 'receipt' | null
  params: Record<string, any>
}

interface Msg {
  id: string
  sender: 'ai' | 'user'
  kind: 'text' | 'action' | 'result'
  text?: string
  action?: AssistantAction
  ref?: string
  time: string
}

interface ActionResult { ok: boolean; text: string; ref?: string }

const QUICK_QUESTIONS = [
  'How do I convert USD to Naira?',
  'How do European Invoices work?',
  'What are the withdrawal fees?',
  'How do I deposit local currency?',
  'Send 50 USDC to Chidi',
  'Pay my DSTV bill',
  'Download my receipt',
]

const SEND_NETWORKS = ['ARC', 'ETHEREUM', 'POLYGON', 'AVALANCHE', 'ARBITRUM', 'BASE', 'OPTIMISM', 'SOLANA', 'MONAD', 'BSC', 'BEP20']
const BILL_TYPES = ['airtime', 'data', 'electricity', 'tv', 'cable', 'internet', 'water']
const CONVERT_FROM = ['USD', 'USDC']
const CONVERT_TO = ['NGN', 'GHS', 'KES', 'ZAR', 'UGX', 'TZS', 'EGP', 'MAD', 'ETB', 'RWF', 'XAF', 'XOF']

const now = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

// ══════════════════════════════════════════════════════════════════════════
// Action card — the confirmation gate. The AI can only ever PROPOSE; the user
// reviews the editable fields, then approves with their PIN. Execution always
// goes through the normal guarded endpoints (wallets/send PinGuard,
// bills/purchase) with an X-Txn-Source: chat audit header.
// ══════════════════════════════════════════════════════════════════════════
function ActionCard({
  action,
  accentRgb,
  variant,
  accentHex,
  onDone,
  onBusy,
}: {
  action: AssistantAction
  accentRgb: string
  variant: 'gold' | 'lemon'
  accentHex: string
  onDone: (r: ActionResult) => void
  onBusy: (busy: boolean) => void
}) {
  const [form, setForm] = useState<Record<string, any>>({ ...action.params })
  const [pinOpen, setPinOpen] = useState(false)
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)
  const [pinError, setPinError] = useState('')

  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }))

  const isSend = action.type === 'send'
  const isBill = action.type === 'bill'
  const isConvert = action.type === 'convert'
  const isReceipt = action.type === 'receipt'

  const valid =
    (isSend && form.to && Number(form.amount) > 0 && SEND_NETWORKS.includes(form.network)) ||
    (isBill && form.type && form.provider && form.recipient && Number(form.amount) > 0) ||
    (isConvert && form.from && form.to && form.from !== form.to && Number(form.amount) > 0)

  const inputCls = 'w-full px-3 py-2 rounded-xl bg-white/[0.05] border border-white/10 text-white text-xs focus:outline-none focus:border-emerald-500 transition-colors'
  const labelCls = 'text-[10px] text-[#64748B] font-semibold uppercase tracking-wide mb-1 block'

  const run = async (passkeyToken?: string) => {
    if (!passkeyToken && (!pin || pin.length !== 4)) { setPinError('Enter your 4-digit PIN'); return }
    setPinError('')
    setBusy(true)
    onBusy(true)
    try {
      if (isSend) {
        const r = await walletAPI.send(
          { address: form.to, amount: Number(form.amount), network: form.network, pin, passkeyToken },
          { 'X-Txn-Source': 'chat' },
        )
        onDone({ ok: true, text: `Sent ${Number(form.amount).toLocaleString()} USDC to ${form.to}. Reference: ${r.reference}`, ref: r.reference })
      } else if (isBill) {
        const r = await billsAPI.purchase(
          { type: form.type, provider: form.provider, recipient: form.recipient, amount: Number(form.amount), pin, passkeyToken },
          { 'X-Txn-Source': 'chat' },
        )
        onDone({ ok: true, text: `${String(form.provider).toUpperCase()} ${form.type} of ${Number(form.amount).toLocaleString()} paid to ${form.recipient}. Reference: ${r.reference}`, ref: r.reference })
      } else if (isConvert) {
        const r = await conversionAPI.execute(
          { from: form.from, to: form.to, amount: Number(form.amount), pin, passkeyToken },
          { 'X-Txn-Source': 'chat' },
        )
        onDone({ ok: true, text: `Converted ${Number(form.amount).toLocaleString()} ${form.from} to ${form.to}${r.receiveAmount ? ` (${Number(r.receiveAmount).toLocaleString()} ${form.to})` : ''}. Reference: ${r.reference}`, ref: r.reference })
      }
      setPin('')
      setPinOpen(false)
    } catch (e: any) {
      const msg = e?.response?.data?.message || e?.message || 'Transaction failed. Please try again.'
      if (String(msg).toLowerCase().includes('pin')) setPinError(msg)
      else onDone({ ok: false, text: msg })
    } finally {
      setBusy(false)
      onBusy(false)
    }
  }

  const downloadLatest = async (format: 'png' | 'pdf') => {
    setBusy(true)
    onBusy(true)
    try {
      const data = await transactionAPI.getHistory({ limit: 1 })
      const tx = data?.transactions?.[0]
      if (!tx) throw new Error('No transaction found yet.')
      await document.fonts.ready
      const canvas = await renderReceiptCanvas({ tx, variant, accentHex })
      const slug = (tx.reference || tx.id || 'receipt').replace(/[^a-zA-Z0-9_-]/g, '')
      await downloadReceiptFile(canvas, slug, format)
      onDone({ ok: true, text: `Receipt downloaded as ${format.toUpperCase()}.` })
    } catch (e: any) {
      onDone({ ok: false, text: e?.message || 'Could not generate the receipt. Please try again.' })
    } finally {
      setBusy(false)
      onBusy(false)
    }
  }

  return (
    <div className="mt-2 rounded-2xl border border-white/10 bg-[#0A0F1E]/80 overflow-hidden">
      <div className="px-3 py-2 flex items-center gap-2 border-b border-white/5">
        <ShieldCheck className="w-3.5 h-3.5" style={{ color: `rgb(${accentRgb})` }} />
        <span className="text-[10px] font-bold uppercase tracking-wider text-gray-300">
          {isSend ? 'Send Crypto' : isBill ? 'Pay Bill' : isConvert ? 'Convert' : 'Receipt'}
        </span>
        <span className="ml-auto text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">PIN required</span>
      </div>

      <div className="p-3 space-y-2">
        {isConvert && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <span className={labelCls}>From</span>
                <select className={inputCls} value={form.from || 'USD'} onChange={e => set('from', e.target.value)}>
                  {CONVERT_FROM.map(c => <option key={c} value={c} className="bg-[#0A0F1E]">{c}</option>)}
                </select>
              </div>
              <div>
                <span className={labelCls}>To</span>
                <select className={inputCls} value={form.to || 'NGN'} onChange={e => set('to', e.target.value)}>
                  {CONVERT_TO.map(c => <option key={c} value={c} className="bg-[#0A0F1E]">{c}</option>)}
                </select>
              </div>
            </div>
            <div>
              <span className={labelCls}>Amount</span>
              <input className={inputCls} type="number" min="0" value={form.amount || ''} onChange={e => set('amount', e.target.value)} placeholder="0.00" />
            </div>
          </>
        )}

        {isReceipt && (
          <p className="text-[11px] text-gray-400">Download the receipt for your most recent transaction.</p>
        )}

        {isSend && (
          <>
            <div>
              <span className={labelCls}>Recipient address</span>
              <input className={inputCls} value={form.to || ''} onChange={e => set('to', e.target.value)} placeholder="0x… or Xend tag" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <span className={labelCls}>Amount (USDC)</span>
                <input className={inputCls} type="number" min="0" value={form.amount || ''} onChange={e => set('amount', e.target.value)} placeholder="0.00" />
              </div>
              <div>
                <span className={labelCls}>Network</span>
                <select className={inputCls} value={form.network || 'POLYGON'} onChange={e => set('network', e.target.value)}>
                  {SEND_NETWORKS.map(n => <option key={n} value={n} className="bg-[#0A0F1E]">{n}</option>)}
                </select>
              </div>
            </div>
          </>
        )}

        {isBill && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <span className={labelCls}>Bill type</span>
                <select className={inputCls} value={form.type || ''} onChange={e => set('type', e.target.value)}>
                  {BILL_TYPES.map(t => <option key={t} value={t} className="bg-[#0A0F1E]">{t}</option>)}
                </select>
              </div>
              <div>
                <span className={labelCls}>Provider</span>
                <input className={inputCls} value={form.provider || ''} onChange={e => set('provider', e.target.value)} placeholder="e.g. mtn" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <span className={labelCls}>Recipient</span>
                <input className={inputCls} value={form.recipient || ''} onChange={e => set('recipient', e.target.value)} placeholder="Phone / meter no." />
              </div>
              <div>
                <span className={labelCls}>Amount</span>
                <input className={inputCls} type="number" min="0" value={form.amount || ''} onChange={e => set('amount', e.target.value)} placeholder="0.00" />
              </div>
            </div>
          </>
        )}

        {isReceipt ? (
          <div className="flex gap-2">
            <button
              onClick={() => downloadLatest('png')}
              disabled={busy}
              className="flex-1 py-2 rounded-xl bg-white/[0.06] border border-white/10 text-[11px] font-bold text-white flex items-center justify-center gap-1.5 disabled:opacity-50 transition-colors hover:bg-white/10"
            >
              <Download className="w-3.5 h-3.5" /> PNG
            </button>
            <button
              onClick={() => downloadLatest('pdf')}
              disabled={busy}
              className="flex-1 py-2 rounded-xl bg-white/[0.06] border border-white/10 text-[11px] font-bold text-white flex items-center justify-center gap-1.5 disabled:opacity-50 transition-colors hover:bg-white/10"
            >
              <Download className="w-3.5 h-3.5" /> PDF
            </button>
          </div>
        ) : (
          <button
            onClick={() => { if (valid) { setPinOpen(true); setPin(''); setPinError('') } }}
            disabled={!valid || busy}
            className="w-full py-2 rounded-xl text-[11px] font-bold text-black disabled:opacity-40 transition-transform active:scale-95"
            style={{ background: `rgb(${accentRgb})` }}
          >
            {busy ? 'Processing…' : 'Confirm & authorize with PIN'}
          </button>
        )}

        {pinOpen && !isReceipt && (
          <div className="rounded-xl bg-black/40 border border-white/10 p-3 space-y-2">
            <div className="flex items-center gap-2">
              <KeyRound className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-[10px] text-gray-300 font-semibold">Enter your 4-digit transaction PIN</span>
            </div>
            <div className="flex gap-2">
              <input
                type="password"
                inputMode="numeric"
                maxLength={4}
                autoFocus
                value={pin}
                onChange={e => setPin(e.target.value.replace(/\D/g, ''))}
                onKeyDown={e => e.key === 'Enter' && run()}
                className="flex-1 px-3 py-2 rounded-xl bg-white/[0.05] border border-emerald-500/30 text-white text-sm tracking-[0.4em] text-center focus:outline-none focus:border-emerald-500"
                placeholder="••••"
              />
              <button
                onClick={() => run()}
                disabled={busy}
                className="px-4 rounded-xl bg-emerald-500 text-black text-xs font-bold disabled:opacity-50 transition-transform active:scale-95"
              >
                {busy ? '…' : 'Go'}
              </button>
            </div>
            {pinError && <p className="text-[10px] text-red-400">{pinError}</p>}
            <div className="flex items-center gap-2 pt-1">
              <div className="flex-1 h-px bg-white/10"></div>
              <span className="text-[9px] text-[#64748B] uppercase tracking-wider">or</span>
              <div className="flex-1 h-px bg-white/10"></div>
            </div>
            <BiometricApproveButton onApproved={(token) => run(token)} accentRgb={accentRgb} disabled={busy} label="Use Face ID or fingerprint" />
          </div>
        )}
      </div>
    </div>
  )
}

export default function AISupportWidget() {
  const { variant, colors } = useTheme()
  const [isOpen, setIsOpen] = useState(false)
  const [input, setInput] = useState('')
  const [executing, setExecuting] = useState(false)
  const [messages, setMessages] = useState<Msg[]>([
    {
      id: '1',
      sender: 'ai',
      kind: 'text',
      text: 'Hello! 👋 I am your 24/7 SureXend Assistant. I can answer questions, and with your approval (PIN) I can help send crypto, pay bills and download receipts. How can I help?',
      time: now(),
    },
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

  const handleActionDone = (r: ActionResult) => {
    setMessages(prev => [...prev, {
      id: Date.now().toString(),
      sender: 'ai',
      kind: r.ok && r.ref ? 'result' : 'text',
      text: r.text,
      ref: r.ref,
      time: now(),
    }])
  }

  const handleSend = async (textToSend?: string) => {
    const query = (textToSend || input).trim()
    if (!query || isTyping) return

    const history = messages
      .filter(m => m.text)
      .map(m => ({ role: m.sender === 'ai' ? 'AI' : 'USER', content: m.text as string }))
      .slice(-10)

    setMessages(prev => [...prev, { id: Date.now().toString(), sender: 'user', kind: 'text', text: query, time: now() }])
    if (!textToSend) setInput('')
    setIsTyping(true)

    try {
      const res = await supportAPI.chat({ message: query, history })
      const action: AssistantAction | undefined = res?.action?.type ? res.action : undefined
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        sender: 'ai',
        kind: action ? 'action' : 'text',
        text: res?.response || 'Here is what I found. How can I help further?',
        action,
        time: now(),
      }])
    } catch {
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        sender: 'ai',
        kind: 'text',
        text: 'I could not reach the assistant right now. Please check your connection and try again.',
        time: now(),
      }])
    } finally {
      setIsTyping(false)
    }
  }

  const downloadLatest = async () => {
    try {
      const data = await transactionAPI.getHistory({ limit: 1 })
      const tx = data?.transactions?.[0]
      if (!tx) throw new Error('No transaction found yet.')
      await document.fonts.ready
      const accentHex = isGold ? '#C8960C' : '#B5E23D'
      const canvas = await renderReceiptCanvas({ tx, variant: variant as any, accentHex })
      const slug = (tx.reference || tx.id || 'receipt').replace(/[^a-zA-Z0-9_-]/g, '')
      await downloadReceiptFile(canvas, slug, 'png')
      toast.success('Receipt downloaded')
    } catch {
      toast.error('No transaction found to download.')
    }
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
                    <p className="text-[11px] text-[#94A3B8]">Answers, sends, bills & receipts — PIN-protected</p>
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
                  <div key={m.id} className={`flex ${m.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[90%] ${m.kind === 'action' ? 'w-full' : ''}`}>
                      <div
                        className={`p-3.5 rounded-2xl text-xs leading-relaxed ${
                          m.sender === 'user'
                            ? 'bg-emerald-500/20 text-emerald-100 border border-emerald-500/30 rounded-tr-none'
                            : 'bg-white/[0.04] text-gray-200 border border-white/10 rounded-tl-none'
                        }`}
                      >
                        {m.text && <p className="whitespace-pre-line">{m.text}</p>}
                        {m.kind === 'result' && m.ref && (
                          <button
                            onClick={downloadLatest}
                            className="mt-2 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/[0.06] border border-white/10 text-[10px] font-bold text-emerald-300 hover:bg-white/10 transition-colors"
                          >
                            <Download className="w-3 h-3" /> Download receipt
                          </button>
                        )}
                        <span className="text-[9px] text-[#64748B] block mt-1 text-right">{m.time}</span>
                      </div>
                      {m.kind === 'action' && m.action && (
                        <ActionCard
                          action={m.action}
                          accentRgb={accentRgb}
                          variant={variant as 'gold' | 'lemon'}
                          accentHex={isGold ? '#C8960C' : '#B5E23D'}
                          onDone={handleActionDone}
                          onBusy={setExecuting}
                        />
                      )}
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
                    disabled={executing}
                    className="px-3 py-1.5 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-[11px] text-gray-300 font-medium whitespace-nowrap transition-all flex items-center gap-1 disabled:opacity-40"
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
                  placeholder="Ask anything, or try: 'send 50 USDC to Chidi'"
                  className="flex-1 py-3 px-4 rounded-xl bg-white/[0.04] border border-white/10 text-white text-xs focus:outline-none focus:border-emerald-500 transition-colors"
                />
                <button
                  onClick={() => handleSend()}
                  disabled={!input.trim() || executing}
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