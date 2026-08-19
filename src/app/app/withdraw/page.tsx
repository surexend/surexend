'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useTheme } from '@/context/ThemeContext'
import { ArrowLeft, Building2, CheckCircle2, ChevronRight, AlertCircle, Loader2, ShieldCheck, ArrowUpRight, DollarSign } from 'lucide-react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { useQuery } from '@tanstack/react-query'
import { walletAPI, AFRICAN_CURRENCIES } from '@/lib/api'
import CurrencyFlag from '@/components/CurrencyFlag'
import BiometricApproveButton from '@/components/BiometricApproveButton'

// ── Fiat Options (all African countries) ──────────────────────────────────
const FIAT_CURRENCIES = AFRICAN_CURRENCIES.map(c => ({ code: c.code, name: c.name, flag: c.flag, symbol: c.symbol, rate: c.rate, countryCode: c.countryCode }))

// ── Saved Bank Accounts Mock ────────────────────────────────────────────────
const SAVED_BANKS = [
  { id: '1', bankName: 'Access Bank', accountNumber: '0123456789', accountName: 'SUREXEND USER', code: '044' },
  { id: '2', bankName: 'GTBank', accountNumber: '0987654321', accountName: 'SUREXEND USER', code: '058' },
]

// ── PIN Pad Component ───────────────────────────────────────────────────────
function PinPad({ onComplete, accentHex, accentRgb }: {
  onComplete: (pin: string) => void; accentHex: string; accentRgb: string
}) {
  const [pin, setPin] = useState('')
  const keys = ['1','2','3','4','5','6','7','8','9','','0','⌫']

  const tap = (k: string) => {
    if (k === '⌫') setPin(p => p.slice(0, -1))
    else if (pin.length < 4) {
      const next = pin + k
      setPin(next)
      if (next.length === 4) setTimeout(() => onComplete(next), 150)
    }
  }

  return (
    <div>
      <div className="flex justify-center gap-3 mb-8">
        {Array.from({ length: 4 }, (_, i) => (
          <motion.div key={i}
            className="w-4 h-4 rounded-full border-2 transition-all"
            style={i < pin.length
              ? { background: accentHex, borderColor: accentHex }
              : { borderColor: 'rgba(255,255,255,0.2)', background: 'transparent' }}
            animate={i < pin.length ? { scale: [1, 1.3, 1] } : {}}
            transition={{ duration: 0.15 }}
          />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-4 max-w-xs mx-auto">
        {keys.map((k, i) => (
          <motion.button
            key={i} disabled={!k}
            className="h-14 rounded-2xl text-xl font-semibold disabled:opacity-0"
            style={k && k !== '⌫'
              ? { background: 'rgba(255,255,255,0.06)', color: '#fff' }
              : { background: 'transparent', color: '#94A3B8' }}
            whileTap={k ? { scale: 0.9, background: `rgba(${accentRgb}, 0.15)` } : {}}
            onClick={() => k && tap(k)}
          >
            {k}
          </motion.button>
        ))}
      </div>
    </div>
  )
}

export default function WithdrawPage() {
  const { variant, colors } = useTheme()
  const isGold = variant === 'gold'
  const accentRgb = isGold ? '212, 160, 23' : '181, 226, 61'
  const accentHex = isGold ? '#D4A017' : '#B5E23D'

  const [step, setStep] = useState<'form' | 'bank' | 'pin' | 'success'>('form')
  const [selectedFiat, setSelectedFiat] = useState(FIAT_CURRENCIES[0])
  const [amountUsdt, setAmountUsdt] = useState('')
  const [selectedBank, setSelectedBank] = useState<any>(SAVED_BANKS[0])
  const [isProcessing, setIsProcessing] = useState(false)

  const { data: balanceData } = useQuery({
    queryKey: ['balance'],
    queryFn: walletAPI.getBalance,
  })
  const availableUsdt = balanceData?.usdBalance ?? 0

  const numUsdt = parseFloat(amountUsdt) || 0
  const feeUsdt = 0.50
  const netUsdt = Math.max(0, numUsdt - feeUsdt)
  const fiatAmount = netUsdt * selectedFiat.rate

  const handleNext = () => {
    if (numUsdt < 5) {
      toast.error('Minimum withdrawal is 5 USDC')
      return
    }
    if (numUsdt > availableUsdt) {
      toast.error('Insufficient USDC balance')
      return
    }
    setStep('bank')
  }

  const handleExecute = (_pin?: string, _passkeyToken?: string) => {
    setIsProcessing(true)
    setTimeout(() => {
      setIsProcessing(false)
      setStep('success')
    }, 1500)
  }

  return (
    <div className="w-full max-w-xl mx-auto px-4 py-6 pb-36">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link href="/app/dashboard" className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-white hover:bg-white/10 transition-colors">
          <ArrowLeft size={18} />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight">Withdraw to Bank</h1>
          <p className="text-xs text-[#64748B]">Convert USDC to local currency & payout to your bank</p>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {/* STEP 1: AMOUNT & FIAT SELECTOR */}
        {step === 'form' && (
          <motion.div key="form" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-5">
            {/* Currency selector */}
            <div className="bg-[#121827] p-4 rounded-2xl border border-white/5 space-y-3">
              <label className="text-xs font-semibold text-[#94A3B8] uppercase tracking-wider">Select Payout Country & Currency</label>
              <div className="grid grid-cols-2 gap-2">
                {FIAT_CURRENCIES.map((fiat) => (
                  <button
                    key={fiat.code}
                    onClick={() => setSelectedFiat(fiat)}
                    className={`p-3 rounded-xl border text-left flex items-center gap-3 transition-all ${
                      selectedFiat.code === fiat.code
                        ? 'bg-white/10 border-white/20 text-white shadow-md'
                        : 'bg-white/[0.02] border-white/5 text-[#94A3B8] hover:text-white'
                    }`}
                  >
                    <CurrencyFlag countryCode={fiat.countryCode} emoji={fiat.flag} size={24} />
                    <div>
                      <p className="font-bold text-sm text-white">{fiat.code}</p>
                      <p className="text-[10px] text-[#64748B]">{fiat.name}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Amount Input */}
            <div className="bg-[#121827] p-5 rounded-2xl border border-white/5 space-y-3">
              <div className="flex justify-between items-center text-xs font-semibold text-[#94A3B8]">
                <span>Withdraw Amount (USDC)</span>
                <span>Available: <strong className="text-white">{availableUsdt.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDC</strong></span>
              </div>
              <div className="relative">
                <input
                  type="number"
                  placeholder="0.00"
                  value={amountUsdt}
                  onChange={(e) => setAmountUsdt(e.target.value)}
                  className="w-full bg-[#0A0F1E] border border-white/10 rounded-xl px-4 py-3.5 text-2xl font-bold text-white focus:outline-none focus:border-white/30"
                />
                <button
                  onClick={() => setAmountUsdt(availableUsdt.toFixed(2))}
                  className="absolute right-3 top-1/2 -translate-y-1/2 px-2.5 py-1 rounded-lg text-xs font-bold bg-white/10 text-white hover:bg-white/20"
                >
                  MAX
                </button>
              </div>

              {/* Conversion Preview */}
              {numUsdt > 0 && (
                <div className="pt-3 border-t border-white/5 space-y-2 text-xs">
                  <div className="flex justify-between text-[#94A3B8]">
                    <span>Exchange Rate</span>
                    <span className="text-white font-medium">1 USDC = {selectedFiat.symbol}{selectedFiat.rate.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-[#94A3B8]">
                    <span>Network Fee</span>
                    <span className="text-white font-medium">{feeUsdt} USDC</span>
                  </div>
                  <div className="flex justify-between text-sm font-bold pt-2 border-t border-white/5">
                    <span className="text-white">You Receive</span>
                    <span style={{ color: accentHex }}>{selectedFiat.symbol}{fiatAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                </div>
              )}
            </div>

            <button
              onClick={handleNext}
              disabled={numUsdt <= 0}
              className="w-full py-4 rounded-2xl font-bold text-base transition-all disabled:opacity-40 shadow-lg"
              style={{ background: accentHex, color: '#0F1629' }}
            >
              Continue to Select Bank
            </button>
          </motion.div>
        )}

        {/* STEP 2: SELECT BANK ACCOUNT */}
        {step === 'bank' && (
          <motion.div key="bank" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-5">
            <div className="bg-[#121827] p-5 rounded-2xl border border-white/5 space-y-4">
              <h3 className="font-bold text-white text-sm">Select Destination Bank Account</h3>
              
              <div className="space-y-2.5">
                {SAVED_BANKS.map((bank) => (
                  <button
                    key={bank.id}
                    onClick={() => setSelectedBank(bank)}
                    className={`w-full p-4 rounded-xl border text-left flex items-center justify-between transition-all ${
                      selectedBank?.id === bank.id
                        ? 'bg-white/10 border-white/30 text-white'
                        : 'bg-white/[0.02] border-white/5 text-[#94A3B8] hover:text-white'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center">
                        <Building2 className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <p className="font-bold text-sm text-white">{bank.bankName}</p>
                        <p className="text-xs text-[#64748B]">{bank.accountNumber} · {bank.accountName}</p>
                      </div>
                    </div>
                    {selectedBank?.id === bank.id && <CheckCircle2 className="w-5 h-5" style={{ color: accentHex }} />}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setStep('form')}
                className="flex-1 py-3.5 rounded-xl border border-white/10 text-white font-semibold text-sm hover:bg-white/5"
              >
                Back
              </button>
              <button
                onClick={() => setStep('pin')}
                className="flex-[2] py-3.5 rounded-xl font-bold text-sm shadow-lg"
                style={{ background: accentHex, color: '#0F1629' }}
              >
                Confirm & Enter PIN
              </button>
            </div>
          </motion.div>
        )}

        {/* STEP 3: SECURITY PIN */}
        {step === 'pin' && (
          <motion.div key="pin" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-6 text-center">
            <div className="bg-[#121827] p-6 rounded-2xl border border-white/5">
              <ShieldCheck className="w-12 h-12 mx-auto mb-3" style={{ color: accentHex }} />
              <h2 className="text-lg font-bold text-white">Enter Transaction PIN</h2>
              <p className="text-xs text-[#64748B] mt-1 mb-6">Authorize withdrawal of {selectedFiat.symbol}{fiatAmount.toLocaleString()} to {selectedBank.bankName}</p>
              
              {isProcessing ? (
                <div className="py-12 flex flex-col items-center gap-3">
                  <Loader2 className="w-8 h-8 animate-spin" style={{ color: accentHex }} />
                  <p className="text-sm font-semibold text-white">Processing payout via Flutterwave...</p>
                </div>
              ) : (
                <>
                  <PinPad onComplete={handleExecute} accentHex={accentHex} accentRgb={accentRgb} />
                  <div className="flex items-center gap-3 my-3">
                    <div className="flex-1 h-px bg-white/5"></div>
                    <span className="text-[10px] text-[#64748B] uppercase tracking-wider">or</span>
                    <div className="flex-1 h-px bg-white/5"></div>
                  </div>
                  <BiometricApproveButton onApproved={(token) => handleExecute(undefined, token)} accentHex={accentHex} accentRgb={accentRgb} disabled={isProcessing} />
                </>
              )}
            </div>
          </motion.div>
        )}

        {/* STEP 4: SUCCESS */}
        {step === 'success' && (
          <motion.div key="success" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="text-center space-y-6 py-6">
            <div className="w-20 h-20 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center mx-auto text-emerald-400">
              <CheckCircle2 size={48} />
            </div>

            <div>
              <h2 className="text-2xl font-bold text-white">Withdrawal Submitted!</h2>
              <p className="text-sm text-[#94A3B8] mt-1">Your payout of <strong className="text-white">{selectedFiat.symbol}{fiatAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong> is processing.</p>
              <p className="text-xs text-[#64748B] mt-2">Funds usually arrive in your bank account in 2 to 5 minutes.</p>
            </div>

            <Link
              href="/app/dashboard"
              className="inline-block px-8 py-3.5 rounded-2xl font-bold text-sm shadow-lg"
              style={{ background: accentHex, color: '#0F1629' }}
            >
              Return to Dashboard
            </Link>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
