'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { QrCode, ArrowRight, ArrowLeft, CheckCircle2, Tag, Send, Zap, ShieldCheck, UserCheck } from 'lucide-react'
import Confetti from 'react-confetti'
import toast from 'react-hot-toast'
import { walletAPI } from '@/lib/api'
import { useTheme } from '@/context/ThemeContext'
import BiometricApproveButton from '@/components/BiometricApproveButton'
import { useSearchParams } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useBackHandler } from '@/context/BackHandlerContext'

// Funds live on Arc (native USDC). The recipient picks the network they want
// to receive on — the backend handles delivery automatically (native when both
// sides are on Arc, cross-network otherwise), so there is only ever one
// network choice on this screen.
const SEND_NETWORKS = ['ARC', 'POLYGON', 'AVALANCHE', 'ARBITRUM', 'ETHEREUM', 'BASE', 'OPTIMISM', 'SOLANA', 'MONAD'] as const

const sendSchema = z.object({
  address: z.string().min(3, 'Invalid recipient handle or address'),
  network: z.enum(['POLYGON', 'AVALANCHE', 'ARBITRUM', 'ETHEREUM', 'BASE', 'OPTIMISM', 'SOLANA', 'MONAD', 'BSC', 'BEP20', 'ARC', 'SUREX_TAG']),
  amount: z.number().positive('Amount must be positive').optional()
})

type SendFormValues = z.infer<typeof sendSchema>

export default function SendPage() {
  const { variant, colors } = useTheme()
  const searchParams = useSearchParams()
  const initialType = searchParams.get('type') === 'tag' ? 'TAG' : 'CRYPTO'

  const [sendMode, setSendMode] = useState<'CRYPTO' | 'TAG'>(initialType)
  const [step, setStep] = useState(1)
  const [formData, setFormData] = useState<Partial<SendFormValues>>({})
  const [pin, setPin] = useState(['', '', '', ''])
  const [isLoading, setIsLoading] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)
  const [windowSize, setWindowSize] = useState({ width: 1200, height: 800 })
  const queryClient = useQueryClient()

  // Back handler for multi-step form
  useBackHandler(
    useCallback(() => {
      if (step > 1) {
        setStep(prev => prev - 1)
        return true
      }
      if (isSuccess) {
        setIsSuccess(false)
        return true
      }
      return false
    }, [step, isSuccess]),
    30
  )

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setWindowSize({ width: window.innerWidth, height: window.innerHeight })
    }
  }, [])

  const { data: balanceData, isFetching } = useQuery({
    queryKey: ['sendBalance'],
    queryFn: walletAPI.getBalance,
    retry: false,
    staleTime: 30000,
  })
  const sendableBalance = Math.max(0, (balanceData?.usdBalance ?? 0) - (balanceData?.lockedBalance ?? 0))

  const { register, handleSubmit, formState: { errors }, watch, setValue } = useForm<SendFormValues>({
    resolver: zodResolver(sendSchema),
    defaultValues: { network: sendMode === 'TAG' ? 'SUREX_TAG' : 'ARC' }
  })

  const networkFee = 0.0

  const formNetwork = sendMode === 'TAG' ? 'SUREX_TAG' : (watch('network') || 'POLYGON')
  const amount = watch('amount') || 0
  // Circle's CCTP forwarder charges a relay fee on cross-network sends; it is
  // deducted at mint time so the app shows it and charges it from the user's
  // balance (the send amount is bumped to compensate so the recipient still
  // receives the full amount).
  const { data: feeData, isFetching: feeLoading } = useQuery({
    queryKey: ['cctpFee', formNetwork, amount],
    queryFn: () => walletAPI.getCctpFee({ destinationNetwork: formNetwork, amount }),
    enabled: sendMode === 'CRYPTO' && formNetwork !== 'ARC' && amount > 0,
    staleTime: 30000
  })
  const cctpFee = (formNetwork === 'ARC' || formNetwork === 'SUREX_TAG') ? 0 : (feeData?.fee ?? 0)
  const totalDeducted = amount + cctpFee

  const onSubmitStep1 = (data: { address: string; network: 'POLYGON'|'AVALANCHE'|'ARBITRUM'|'ETHEREUM'|'BASE'|'OPTIMISM'|'SOLANA'|'MONAD'|'BSC'|'BEP20'|'SUREX_TAG' }) => {
    setFormData(prev => ({ ...prev, ...data }))
    setStep(2)
  }

  const onSubmitStep2 = (data: { amount?: number }) => {
    const amt = Number(data.amount)
    if (!amt || amt <= 0) {
      toast.error('Enter a valid amount')
      return
    }
    const total = amt + cctpFee
    if (total > sendableBalance) {
      toast.error(`Insufficient balance. This send needs ${total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDC including a ${cctpFee.toFixed(2)} USDC network fee`)
      return
    }
    setFormData(prev => ({ ...prev, amount: amt }))
    setStep(3)
  }

  // 4-digit PIN flow only — the backend enforces exactly 4 digits. `emptyIndex`
  // reaching slot 3 means all four are filled, so fire the send exactly once.
  const handlePinInput = (num: string) => {
    if (isLoading) return
    const emptyIndex = pin.findIndex(p => p === '')
    if (emptyIndex === -1) return
    const newPin = [...pin]
    newPin[emptyIndex] = num
    setPin(newPin)
    if (emptyIndex === 3) {
      executeSend(newPin.join(''))
    }
  }

  const handlePinDelete = () => {
    if (isLoading) return
    const lastFilledIndex = pin.map(p => p !== '').lastIndexOf(true)
    if (lastFilledIndex !== -1) {
      const newPin = [...pin]
      newPin[lastFilledIndex] = ''
      setPin(newPin)
    }
  }

  const executeSend = async (finalPin?: string, passkeyToken?: string) => {
    setIsLoading(true)
    try {
      await walletAPI.send({
        address: formData.address!,
        amount: formData.amount!,
        network: sendMode === 'TAG' ? 'SUREX_TAG' : formData.network!,
        pin: finalPin,
        passkeyToken,
      })
      setIsSuccess(true)
      setStep(5)
      queryClient.invalidateQueries({ queryKey: ['sendBalance'] })
    } catch (error: any) {
      const message = error.response?.data?.message || 'Transaction failed'
      toast.error(message)
      // Reset to a fresh 4-digit PIN and stay on the same step.
      setPin(['', '', '', ''])
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="w-full max-w-full overflow-x-hidden px-3 py-4 sm:p-6 md:p-8 max-w-lg mx-auto min-h-[80vh] flex flex-col pt-2 pb-28 sm:pb-36">
      {isSuccess && <Confetti width={windowSize.width} height={windowSize.height} recycle={false} numberOfPieces={300} />}

      <AnimatePresence mode="wait">
        {/* Step 1: Recipient Address or SureX Tag */}
        {step === 1 && (
          <motion.div key="step1" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -20 }} className="liquid-glass p-6 space-y-6">
            <div className="border-b border-white/10 pb-4">
              <h2 className="text-xl font-extrabold text-white tracking-tight flex items-center gap-2">
                <Send className="w-5 h-5" style={{ color: colors.primary }} /> Send Stablecoins
              </h2>
              <p className="text-xs text-[#94A3B8] mt-0.5">Transfer USDC to crypto wallet or SureX Tag</p>
            </div>

            {/* Mode Switcher Tabs */}
            <div className="grid grid-cols-2 gap-2 p-1.5 rounded-2xl bg-white/[0.03] border border-white/10">
              <button
                type="button"
                onClick={() => { setSendMode('CRYPTO'); setValue('network', 'ARC') }}
                className={`py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                  sendMode === 'CRYPTO' ? 'bg-white/10 text-white border border-white/15 shadow-md' : 'text-[#94A3B8] hover:text-white'
                }`}
                style={sendMode === 'CRYPTO' ? { color: colors.primary } : {}}
              >
                <Send className="w-3.5 h-3.5" /> Crypto Wallet
              </button>

              <button
                type="button"
                onClick={() => { setSendMode('TAG'); setValue('network', 'SUREX_TAG') }}
                className={`py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                  sendMode === 'TAG' ? 'bg-white/10 text-white border border-white/15 shadow-md' : 'text-[#94A3B8] hover:text-white'
                }`}
                style={sendMode === 'TAG' ? { color: colors.primary } : {}}
              >
                <Tag className="w-3.5 h-3.5" /> Xend Tag (@tag)
              </button>
            </div>

            <form onSubmit={handleSubmit(onSubmitStep1 as any)} className="space-y-5">
              {sendMode === 'TAG' ? (
                <div>
                  <label className="block text-xs font-semibold text-[#94A3B8] mb-2 flex items-center justify-between">
                    <span>Recipient Xend Tag (@username)</span>
                    <span className="text-[10px] text-emerald-400 font-bold flex items-center gap-1">
                      <Zap className="w-3 h-3" /> Zero Fee · Instant
                    </span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 font-bold text-gray-400 text-sm">@</span>
                    <input
                      {...register('address')}
                      type="text"
                      autoCapitalize="none"
                      autoCorrect="off"
                      placeholder="alex_xend"
                      className="w-full pl-9 pr-4 py-3.5 rounded-2xl bg-white/[0.03] border border-white/10 text-white text-sm font-bold focus:outline-none focus:border-white/30 focus:bg-white/[0.05] transition-colors"
                    />
                  </div>
                  {errors.address && <p className="text-red-400 text-xs mt-1">{errors.address.message}</p>}
                  <p className="text-[11px] text-[#64748B] mt-1.5">
                    Peer-to-peer transfers using Xend tags are processed instantly with zero network fees.
                  </p>
                </div>
              ) : (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-[#94A3B8] mb-2">Receiving Network</label>
                    {/* ARC featured — native, zero fee, where the funds live */}
                    <button
                      type="button"
                      onClick={() => setValue('network', 'ARC')}
                      className={`w-full p-3.5 rounded-2xl border mb-2 flex items-center justify-between transition-all ${
                        watch('network') === 'ARC'
                          ? 'bg-white/10 border-white/25'
                          : 'bg-white/[0.02] border-white/10'
                      }`}
                    >
                      <span className="flex items-center gap-2.5">
                        <span className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: `rgba(16,185,129,0.12)`, border: '1px solid rgba(16,185,129,0.3)' }}>
                          <Zap className="w-4 h-4 text-emerald-400" />
                        </span>
                        <span className="text-left">
                          <span className="block text-xs font-bold text-white">ARC</span>
                          <span className="block text-[10px] text-emerald-400 font-semibold">Recommended · Zero fee</span>
                        </span>
                      </span>
                      {watch('network') === 'ARC' && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                    </button>
                    <div className="grid grid-cols-4 gap-1.5">
                      {SEND_NETWORKS.filter(n => n !== 'ARC').map((net) => (
                        <button
                          key={net}
                          type="button"
                          onClick={() => setValue('network', net)}
                          className={`py-2.5 rounded-xl border text-[10px] font-bold transition-all active:scale-95 ${
                            watch('network') === net
                              ? 'bg-white/10 text-white border-blue-500/50'
                              : 'bg-white/[0.02] border-white/10 text-[#94A3B8]'
                          }`}
                        >
                          {net}
                        </button>
                      ))}
                    </div>
                    <p className="text-[11px] text-[#64748B] mt-1.5">
                      Cross-network sends use Circle CCTP — the recipient gets the full amount, relay fee deducted from your balance.
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[#94A3B8] mb-2">Recipient Wallet Address</label>
                    <input
                      {...register('address')}
                      type="text"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      placeholder="Paste wallet address"
                      className="w-full px-4 py-3.5 rounded-2xl bg-white/[0.03] border border-white/10 text-white text-xs font-mono focus:outline-none focus:border-white/30 focus:bg-white/[0.05] transition-colors"
                    />
                    {errors.address && <p className="text-red-400 text-xs mt-1">{errors.address.message}</p>}
                  </div>
                </>
              )}

              <button
                type="submit"
                className="w-full py-4 rounded-2xl font-bold text-black shadow-lg transition-transform active:scale-[0.98] hover:scale-[1.02] flex items-center justify-center gap-2"
                style={{ background: colors.gradientBg }}
              >
                Next: Enter Amount <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          </motion.div>
        )}

        {/* Step 2: Amount */}
        {step === 2 && (
          <motion.div key="step2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="liquid-glass p-6 space-y-6">
            <button onClick={() => setStep(1)} className="text-[#94A3B8] hover:text-white text-xs font-semibold flex items-center gap-1">
              ← Back
            </button>
            <h2 className="text-xl font-extrabold text-white">Enter Transfer Amount</h2>
            
            <form onSubmit={handleSubmit(onSubmitStep2 as any)} className="space-y-6">
              <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/10">
                <div className="flex justify-between items-center mb-1">
                  <label className="text-xs text-[#94A3B8]">Send Amount (USDC)</label>
                  <button
                    type="button"
                    onClick={() => setValue('amount', sendableBalance)}
                    className="text-xs font-bold text-emerald-400"
                  >
                    Max: {sendableBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDC
                  </button>
                </div>
                <div className="flex justify-between items-center">
                  <input 
                    type="text"
                    inputMode="decimal"
                    placeholder="0.00"
                    onChange={(e) => setValue('amount', parseFloat(e.target.value) || 0)}
                    className="bg-transparent text-4xl font-extrabold text-white w-[60%] focus:outline-none placeholder:text-[#334155]"
                  />
                  <span className="font-bold text-sm text-white bg-white/10 px-3 py-1.5 rounded-xl">USDC</span>
                </div>
              </div>

              <div className="text-xs space-y-2 py-3 px-4 rounded-xl bg-white/[0.02] border border-white/5 text-[#94A3B8]">
                <div className="flex justify-between">
                  <span>Receiving Network</span>
                  <span className="text-white font-bold">{formNetwork}</span>
                </div>
                <div className="flex justify-between">
                  <span>Recipient Receives</span>
                  <span className="text-emerald-400 font-bold">${amount.toFixed(2)} USDC</span>
                </div>
                {formNetwork !== 'ARC' && formNetwork !== 'SUREX_TAG' && (
                  <>
                    <div className="flex justify-between">
                      <span>Network Fee (CCTP)</span>
                      <span className="text-amber-400 font-bold">{feeLoading ? '—' : `$${cctpFee.toFixed(2)} USDC`}</span>
                    </div>
                    <div className="flex justify-between border-t border-white/5 pt-2">
                      <span>Total Deducted</span>
                      <span className="text-white font-bold">${(amount + cctpFee).toFixed(2)} USDC</span>
                    </div>
                  </>
                )}
              </div>

              <button 
                type="submit"
                disabled={!((watch('amount') ?? 0) > networkFee)}
                className="w-full py-4 rounded-2xl font-bold text-black shadow-lg transition-transform hover:scale-[1.02] disabled:opacity-50"
                style={{ background: colors.gradientBg }}
              >
                Review Transfer
              </button>
            </form>
          </motion.div>
        )}

        {/* Step 3: Review */}
        {step === 3 && (
          <motion.div key="step3" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="liquid-glass p-6 space-y-6">
            <button onClick={() => setStep(2)} className="text-[#94A3B8] hover:text-white text-xs font-semibold flex items-center gap-1">
              ← Edit Amount
            </button>
            <h2 className="text-xl font-extrabold text-white">Review & Confirm</h2>

            {/* Recipient hero */}
            <div className="p-4 rounded-2xl border border-white/10 flex items-center gap-3" style={{ background: `linear-gradient(150deg, rgba(255,255,255,0.05), rgba(255,255,255,0.015))` }}>
              <div className="w-11 h-11 rounded-full flex-shrink-0 flex items-center justify-center border border-white/15 bg-white/[0.04]">
                {sendMode === 'TAG'
                  ? <Tag className="w-5 h-5" style={{ color: colors.primary }} />
                  : <Send className="w-5 h-5 text-blue-400" />}
              </div>
              <div className="min-w-0">
                <p className="text-[10px] text-[#64748B] font-semibold uppercase tracking-wider">Sending to</p>
                <p className="text-sm font-extrabold text-white truncate">{sendMode === 'TAG' ? `@${formData.address}` : `${formData.address?.slice(0, 10)}…${formData.address?.slice(-8)}`}</p>
                <p className="text-[10px] text-[#94A3B8] font-medium">{sendMode === 'TAG' ? 'SureX Tag · Instant · Zero fee' : `Receiving on ${formData.network}`}</p>
              </div>
            </div>

            {/* Amount hero */}
            <div className="text-center py-2">
              <p className="text-[9px] uppercase tracking-[0.25em] text-[#64748B] font-bold mb-1">You're sending</p>
              <p className="text-4xl font-black text-white tracking-tight">${Number(formData.amount || 0).toFixed(2)}</p>
            </div>

            <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/10 space-y-3 text-xs">
              {formData.network && formData.network !== 'ARC' && formData.network !== 'SUREX_TAG' && (
                <div className="flex justify-between py-1 border-b border-white/5">
                  <span className="text-[#94A3B8]">Network Fee (CCTP)</span>
                  <span className="text-amber-400 font-bold">${(cctpFee).toFixed(2)} USD</span>
                </div>
              )}
              <div className="flex justify-between py-1">
                <span className="text-[#94A3B8]">Total Deducted</span>
                <span className="text-emerald-400 font-extrabold text-sm">${(Number(formData.amount || 0) + cctpFee).toFixed(2)} USD</span>
              </div>
            </div>

            <button
              onClick={() => setStep(4)}
              className="w-full py-4 rounded-2xl font-bold text-black shadow-lg transition-transform active:scale-[0.98] hover:scale-[1.02]"
              style={{ background: colors.gradientBg }}
            >
              Confirm & Enter PIN
            </button>
          </motion.div>
        )}

        {/* Step 4: PIN Security */}
        {step === 4 && (
          <motion.div key="step4" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="liquid-glass p-6 text-center space-y-6">
            <h2 className="text-xl font-extrabold text-white">Security Verification</h2>
            <p className="text-xs text-[#94A3B8]">Enter your 4-digit transaction PIN to authorize sending ${formData.amount} USD{cctpFee > 0 ? ` + $${cctpFee.toFixed(2)} network fee` : ''} (${(Number(formData.amount || 0) + cctpFee).toFixed(2)} USD total)</p>

            <div className="flex justify-center gap-3.5 my-6">
              {pin.map((digit, idx) => (
                <motion.div
                  key={idx}
                  animate={{ scale: digit ? 1 : 0.92 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 25 }}
                  className={`w-11 h-[52px] rounded-2xl border flex items-center justify-center text-xl font-bold transition-colors ${digit ? 'border-emerald-500/60 bg-emerald-500/10 text-white' : 'border-white/10 bg-white/[0.03]'}`}
                >
                  {digit ? '•' : ''}
                </motion.div>
              ))}
            </div>

            <div className="grid grid-cols-3 gap-3 max-w-xs mx-auto">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                <button
                  key={num}
                  onClick={() => handlePinInput(num.toString())}
                  disabled={isLoading}
                  className="py-4 rounded-2xl border border-white/10 bg-white/[0.04] hover:bg-white/10 active:scale-90 active:bg-white/[0.08] transition-all text-white font-extrabold text-lg disabled:opacity-40 select-none"
                >
                  {num}
                </button>
              ))}
              <button onClick={() => setStep(3)} disabled={isLoading} className="py-4 rounded-2xl bg-transparent border border-white/10 text-gray-400 text-xs font-bold active:scale-90 transition-transform disabled:opacity-40">Cancel</button>
              <button onClick={() => handlePinInput('0')} disabled={isLoading} className="py-4 rounded-2xl border border-white/10 bg-white/[0.04] hover:bg-white/10 active:scale-90 transition-all text-white font-extrabold text-lg disabled:opacity-40 select-none">0</button>
              <button onClick={handlePinDelete} disabled={isLoading} className="py-4 rounded-2xl border border-white/10 bg-transparent text-red-400 font-bold text-sm active:scale-90 transition-transform disabled:opacity-40">⌫</button>
            </div>

            {isLoading && (
              <div className="flex items-center justify-center gap-2 text-emerald-400 text-xs font-bold">
                <span className="w-3.5 h-3.5 rounded-full border-2 border-emerald-400/30 border-t-emerald-400 animate-spin" />
                Authorizing transfer…
              </div>
            )}

            <div className="flex items-center gap-3 my-2">
              <div className="flex-1 h-px bg-white/5"></div>
              <span className="text-[10px] text-[#64748B] uppercase tracking-wider">or</span>
              <div className="flex-1 h-px bg-white/5"></div>
            </div>
            <BiometricApproveButton onApproved={(token) => executeSend(undefined, token)} disabled={isLoading} />
          </motion.div>
        )}

        {/* Step 5: Success Screen */}
        {step === 5 && (
          <motion.div key="step5" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="liquid-glass p-8 text-center space-y-6">
            <div className="w-20 h-20 rounded-full bg-emerald-500/15 border border-emerald-500/40 flex items-center justify-center mx-auto shadow-[0_0_40px_rgba(16,185,129,0.25)]">
              <CheckCircle2 className="w-11 h-11 text-emerald-400" strokeWidth={2.2} />
            </div>
            <div>
              <h2 className="text-2xl font-black text-white">Transfer Successful!</h2>
              <p className="text-3xl font-extrabold mt-3 tracking-tight" style={{ color: colors.primary }}>
                ${Number(formData.amount || 0).toFixed(2)}
              </p>
              <p className="text-xs text-[#94A3B8] mt-1.5 flex items-center justify-center gap-1.5 min-w-0">
                <span>sent to</span>
                <span className="font-bold text-white truncate max-w-[200px]">{sendMode === 'TAG' ? `@${formData.address}` : `${formData.address?.slice(0, 8)}…${formData.address?.slice(-6)}`}</span>
              </p>
            </div>
            <button onClick={() => { setStep(1); setPin(['','','','']); setIsSuccess(false) }} className="w-full py-3.5 rounded-xl font-bold text-black shadow-lg active:scale-[0.98] transition-transform" style={{ background: colors.gradientBg }}>
              Done / Send Again
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
