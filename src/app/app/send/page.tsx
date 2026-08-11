'use client'

import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { QrCode, ArrowRight, ArrowLeft, CheckCircle2, Tag, Send, Zap, ShieldCheck, UserCheck } from 'lucide-react'
import Confetti from 'react-confetti'
import toast from 'react-hot-toast'
import { walletAPI } from '@/lib/api'
import { useTheme } from '@/context/ThemeContext'
import { useSearchParams } from 'next/navigation'

const sendSchema = z.object({
  address: z.string().min(3, 'Invalid recipient handle or address'),
  network: z.enum(['POLYGON', 'AVALANCHE', 'ARBITRUM', 'ETHEREUM', 'BASE', 'OPTIMISM', 'SOLANA', 'BSC', 'BEP20', 'ARC', 'SUREX_TAG']),
  amount: z.number().positive('Amount must be positive')
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

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setWindowSize({ width: window.innerWidth, height: window.innerHeight })
    }
  }, [])

  const { register, handleSubmit, formState: { errors }, watch, setValue } = useForm<SendFormValues>({
    resolver: zodResolver(sendSchema),
    defaultValues: { network: sendMode === 'TAG' ? 'SUREX_TAG' : 'POLYGON' }
  })

  const networkFee = sendMode === 'TAG' ? 0.0 : 1.0

  const onSubmitStep1 = (data: { address: string; network: 'POLYGON'|'AVALANCHE'|'ARBITRUM'|'ETHEREUM'|'BASE'|'OPTIMISM'|'SOLANA'|'BSC'|'BEP20'|'SUREX_TAG' }) => {
    setFormData(prev => ({ ...prev, ...data }))
    setStep(2)
  }

  const onSubmitStep2 = (data: { amount: number }) => {
    setFormData(prev => ({ ...prev, ...data }))
    setStep(3)
  }

  const handlePinInput = (num: string) => {
    const emptyIndex = pin.findIndex(p => p === '')
    if (emptyIndex !== -1) {
      const newPin = [...pin]
      newPin[emptyIndex] = num
      setPin(newPin)
      if (emptyIndex === 3) {
        executeSend(newPin.join(''))
      }
    }
  }

  const handlePinDelete = () => {
    const lastFilledIndex = pin.map(p => p !== '').lastIndexOf(true)
    if (lastFilledIndex !== -1) {
      const newPin = [...pin]
      newPin[lastFilledIndex] = ''
      setPin(newPin)
    }
  }

  const executeSend = async (finalPin: string) => {
    setIsLoading(true)
    try {
      await walletAPI.send({
        address: formData.address!,
        amount: formData.amount!,
        network: formData.network === 'SUREX_TAG' ? 'TRC20' : formData.network!,
        pin: finalPin
      })
      setIsSuccess(true)
      setStep(5)
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Transaction failed')
      setPin(['', '', '', '', '', ''])
      setStep(3)
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
          <motion.div key="step1" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -20 }} className="glass-card p-6 space-y-6">
            <div className="border-b border-white/10 pb-4">
              <h2 className="text-xl font-extrabold text-white tracking-tight flex items-center gap-2">
                <Send className="w-5 h-5" style={{ color: colors.primary }} /> Send Stablecoins
              </h2>
              <p className="text-xs text-[#94A3B8] mt-0.5">Transfer USDT/USDC to crypto wallet or SureX Tag</p>
            </div>

            {/* Mode Switcher Tabs */}
            <div className="grid grid-cols-2 gap-2 p-1.5 rounded-2xl bg-white/[0.03] border border-white/10">
              <button
                type="button"
                onClick={() => { setSendMode('CRYPTO'); setValue('network', 'POLYGON') }}
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
                      <Zap className="w-3 h-3" /> Zero Fee
                    </span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-4 top-3.5 font-bold text-gray-400 text-sm">@</span>
                    <input 
                      {...register('address')}
                      type="text"
                      placeholder="e.g. alex_xend"
                      className="w-full pl-9 pr-4 py-3.5 rounded-2xl bg-white/[0.02] border border-white/10 text-white text-sm font-bold focus:outline-none focus:border-purple-500 transition-colors"
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
                    <label className="block text-xs font-semibold text-[#94A3B8] mb-2">Network Protocol</label>
                    <div className="grid grid-cols-2 gap-2">
                      {(['ETHEREUM', 'POLYGON', 'AVALANCHE', 'ARBITRUM', 'BASE', 'OPTIMISM', 'SOLANA', 'BSC', 'ARC'] as const).map((net) => (
                        <button
                          key={net}
                          type="button"
                          onClick={() => setValue('network', net)}
                          className={`p-3 rounded-xl border text-xs font-bold transition-all ${
                            watch('network') === net 
                              ? 'bg-white/10 text-white border-blue-500/50 shadow-md' 
                              : 'bg-white/[0.02] border-white/10 text-[#94A3B8] hover:bg-white/5'
                          }`}
                        >
                          {net}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[#94A3B8] mb-2">Recipient Wallet Address</label>
                    <input 
                      {...register('address')}
                      type="text"
                      placeholder="Paste address (Ethereum, Polygon, Solana, BSC, Base...)"
                      className="w-full px-4 py-3.5 rounded-2xl bg-white/[0.02] border border-white/10 text-white text-xs font-mono focus:outline-none focus:border-blue-500 transition-colors"
                    />
                    {errors.address && <p className="text-red-400 text-xs mt-1">{errors.address.message}</p>}
                  </div>
                </>
              )}

              <button 
                type="submit" 
                className="w-full py-4 rounded-2xl font-bold text-black shadow-lg transition-transform hover:scale-[1.02] flex items-center justify-center gap-2"
                style={{ background: colors.gradientBg }}
              >
                Next: Enter Amount <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          </motion.div>
        )}

        {/* Step 2: Amount */}
        {step === 2 && (
          <motion.div key="step2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="glass-card p-6 space-y-6">
            <button onClick={() => setStep(1)} className="text-[#94A3B8] hover:text-white text-xs font-semibold flex items-center gap-1">
              ← Back
            </button>
            <h2 className="text-xl font-extrabold text-white">Enter Transfer Amount</h2>
            
            <form onSubmit={handleSubmit(onSubmitStep2 as any)} className="space-y-6">
              <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/10">
                <div className="flex justify-between items-center mb-1">
                  <label className="text-xs text-[#94A3B8]">Send Amount (USDC)</label>
                  <button type="button" onClick={() => setValue('amount', 500)} className="text-xs font-bold text-emerald-400">
                    Max: 500 USDC
                  </button>
                </div>
                <div className="flex justify-between items-center">
                  <input 
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    onChange={(e) => setValue('amount', parseFloat(e.target.value))}
                    className="bg-transparent text-3xl font-extrabold text-white w-[60%] focus:outline-none"
                  />
                  <span className="font-bold text-sm text-white bg-white/10 px-3 py-1.5 rounded-xl">USDC</span>
                </div>
              </div>

              <div className="text-xs space-y-2 py-3 px-4 rounded-xl bg-white/[0.02] border border-white/5 text-[#94A3B8]">
                <div className="flex justify-between">
                  <span>Transfer Fee</span>
                  <span className="text-white font-bold">{networkFee === 0 ? 'FREE (SureX Tag)' : '1.00 USDC'}</span>
                </div>
                <div className="flex justify-between border-t border-white/5 pt-2">
                  <span>Recipient Receives</span>
                  <span className="text-emerald-400 font-bold">${((watch('amount') || 0) - networkFee).toFixed(2)} USDT</span>
                </div>
              </div>

              <button 
                type="submit"
                disabled={!(watch('amount') && watch('amount') > networkFee)}
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
          <motion.div key="step3" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="glass-card p-6 space-y-6">
            <button onClick={() => setStep(2)} className="text-[#94A3B8] hover:text-white text-xs font-semibold flex items-center gap-1">
              ← Edit Amount
            </button>
            <h2 className="text-xl font-extrabold text-white">Review & Confirm</h2>

            <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/10 space-y-3 text-xs">
              <div className="flex justify-between py-1 border-b border-white/5">
                <span className="text-[#94A3B8]">Destination Type</span>
                <span className="text-white font-bold">{sendMode === 'TAG' ? 'SureX Tag' : formData.network}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-white/5">
                <span className="text-[#94A3B8]">Recipient</span>
                <span className="text-white font-mono font-bold truncate max-w-[180px]">{sendMode === 'TAG' ? `@${formData.address}` : formData.address}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-white/5">
                <span className="text-[#94A3B8]">Amount</span>
                <span className="text-white font-bold">${formData.amount} USD</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-[#94A3B8]">Total Deducted</span>
                <span className="text-emerald-400 font-extrabold text-sm">${formData.amount} USD</span>
              </div>
            </div>

            <button 
              onClick={() => setStep(4)}
              className="w-full py-4 rounded-2xl font-bold text-black shadow-lg transition-transform hover:scale-[1.02]"
              style={{ background: colors.gradientBg }}
            >
              Confirm & Enter PIN
            </button>
          </motion.div>
        )}

        {/* Step 4: PIN Security */}
        {step === 4 && (
          <motion.div key="step4" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="glass-card p-6 text-center space-y-6">
            <h2 className="text-xl font-extrabold text-white">Security Verification</h2>
            <p className="text-xs text-[#94A3B8]">Enter your 4-digit transaction PIN to authorize sending ${formData.amount} USD</p>

            <div className="flex justify-center gap-3 my-6">
              {pin.map((digit, idx) => (
                <div key={idx} className={`w-10 h-12 rounded-xl border flex items-center justify-center text-xl font-bold ${digit ? 'border-emerald-500 bg-emerald-500/10 text-white' : 'border-white/10 bg-white/5'}`}>
                  {digit ? '•' : ''}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-3 gap-3 max-w-xs mx-auto">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                <button key={num} onClick={() => handlePinInput(num.toString())} className="p-3 rounded-xl bg-white/5 hover:bg-white/10 text-white font-bold text-lg">
                  {num}
                </button>
              ))}
              <button onClick={() => setStep(3)} className="p-3 rounded-xl bg-white/5 text-gray-400 text-xs font-bold">Cancel</button>
              <button onClick={() => handlePinInput('0')} className="p-3 rounded-xl bg-white/5 text-white font-bold text-lg">0</button>
              <button onClick={handlePinDelete} className="p-3 rounded-xl bg-white/5 text-red-400 font-bold text-sm">⌫</button>
            </div>
          </motion.div>
        )}

        {/* Step 5: Success Screen */}
        {step === 5 && (
          <motion.div key="step5" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="glass-card p-8 text-center space-y-6">
            <div className="w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-10 h-10" />
            </div>
            <div>
              <h2 className="text-2xl font-black text-white">Transfer Successful!</h2>
              <p className="text-xs text-[#94A3B8] mt-1">
                Sent ${formData.amount} USDT to {sendMode === 'TAG' ? `@${formData.address}` : formData.address}
              </p>
            </div>
            <button onClick={() => { setStep(1); setPin(['','','','','','']); setIsSuccess(false) }} className="w-full py-3.5 rounded-xl font-bold text-black shadow-lg" style={{ background: colors.gradientBg }}>
              Done / Send Again
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
