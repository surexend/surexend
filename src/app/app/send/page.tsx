'use client'

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { QrCode, ArrowRight, ArrowLeft, CheckCircle2, Tag, Send, Zap, ShieldCheck, UserCheck, Loader2, Clipboard } from 'lucide-react'
import QRScannerModal, { ScannedQRResult, parseScannedCryptoURI } from '@/components/QRScannerModal'
import Confetti from 'react-confetti'
import toast from 'react-hot-toast'
import { AFRICAN_CURRENCIES, walletAPI } from '@/lib/api'
import { currencySymbol, formatAmount } from '@/lib/utils'
import { useTheme } from '@/context/ThemeContext'
import BiometricApproveButton from '@/components/BiometricApproveButton'
import PinKeypad from '@/components/PinKeypad'
import { useBiometricApproval } from '@/hooks/useBiometricApproval'
import SendFromPicker, { SendFromBadge, SendFromAsset, sendFromAssetName } from '@/components/SendFromPicker'
import { useRouter, useSearchParams } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useBackLayer } from '@/context/BackNavigationContext'

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
  const isGold = variant === 'gold'
  const router = useRouter()
  const searchParams = useSearchParams()
  const initialType = searchParams.get('type') === 'tag' ? 'TAG' : 'CRYPTO'

  const [sendMode, setSendMode] = useState<'CRYPTO' | 'TAG'>(initialType)
  const [tagCurrency, setTagCurrency] = useState('USDC')
  const [step, setStep] = useState(1)
  const [formData, setFormData] = useState<Partial<SendFormValues>>({})
  const [isLoading, setIsLoading] = useState(false)
  // Shown by the shared PinKeypad (shakes + clears the dots) when a send is
  // rejected, so the user can immediately re-enter a PIN.
  const [pinError, setPinError] = useState<string | null>(null)
  const [isSuccess, setIsSuccess] = useState(false)
  const [showQRScanner, setShowQRScanner] = useState(false)
  const [windowSize, setWindowSize] = useState({ width: 1200, height: 800 })
  const queryClient = useQueryClient()

  // Back handler for multi-step form & modal
  useBackLayer(
    showQRScanner || step > 1 || isSuccess,
    useCallback(() => {
      if (showQRScanner) {
        setShowQRScanner(false)
        return
      }
      if (isSuccess) {
        router.replace('/app/dashboard')
        return
      }
      if (step > 1) {
        setStep(prev => prev - 1)
      }
    }, [showQRScanner, step, isSuccess, router]),
    30
  )

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setWindowSize({ width: window.innerWidth, height: window.innerHeight })
    }
  }, [])

  // Lock page scroll while the secure PIN overlay is up (same as bills): the
  // overlay is `fixed inset-0 h-[100dvh]`, and locking the body scroll is
  // belt-and-braces so the page can't slide underneath on small screens. We
  // only toggle `overflow`, not `position`, to keep the scroll position.
  useEffect(() => {
    if (step !== 4) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [step])

  const { data: balanceData, isLoading: balanceLoading } = useQuery({
    queryKey: ['sendBalance'],
    queryFn: walletAPI.getBalance,
    retry: false,
    staleTime: 30000,
  })
  const localBalances = useMemo(() => balanceData?.localBalances || {}, [balanceData])
  const usdSendableBalance = Math.max(0, (balanceData?.usdBalance ?? 0) - (balanceData?.lockedBalance ?? 0))
  // Balances a SureX Tag transfer can leave from: the spendable USDC amount
  // plus every locally held African currency. USDC is the only internally
  // transferable digital asset — never advertise others (e.g. USDT).
  const tagTransferAssets = useMemo<SendFromAsset[]>(
    () => [
      { code: 'USDC', label: 'USDC', name: 'USDC', balance: usdSendableBalance, kind: 'digital' },
      ...AFRICAN_CURRENCIES
        .map((currency) => ({
          ...currency,
          label: currency.code,
          balance: Math.max(0, Number(localBalances[currency.code] || 0)),
          kind: 'local' as const,
        }))
        .filter((currency) => currency.balance > 0),
    ],
    [usdSendableBalance, localBalances]
  )
  // Keep the "Send from" selection spendable: when the chosen balance is empty
  // and another held balance can fund the transfer, move the selection to it.
  // Zero-balance sources are not selectable in the picker.
  useEffect(() => {
    if (balanceLoading) return
    const funded = tagTransferAssets.filter((asset) => asset.balance > 0)
    if (funded.length === 0) return
    const current = tagTransferAssets.find((asset) => asset.code === tagCurrency)
    if (!current || current.balance <= 0) setTagCurrency(funded[0].code)
  }, [tagTransferAssets, tagCurrency, balanceLoading])
  const selectedTagAsset =
    tagTransferAssets.find((asset) => asset.code === tagCurrency) ||
    tagTransferAssets[0] ||
    { code: 'USDC', label: 'USDC', name: 'USDC', balance: usdSendableBalance, kind: 'digital' as const }
  const transferCurrency = sendMode === 'TAG' ? selectedTagAsset.code : 'USDC'
  const sendableBalance = sendMode === 'TAG' ? selectedTagAsset.balance : usdSendableBalance
  const formatTransferAmount = (value: number, currency = transferCurrency) => {
    const code = currency.toUpperCase()
    const symbol = ['USD', 'USDC', 'USDT'].includes(code) ? '$' : currencySymbol(code)
    return `${symbol}${formatAmount(value)} ${code}`
  }

  const { register, handleSubmit, formState: { errors }, watch, setValue } = useForm<SendFormValues>({
    resolver: zodResolver(sendSchema),
    defaultValues: { network: sendMode === 'TAG' ? 'SUREX_TAG' : 'ARC' }
  })

  const handleScanResult = useCallback((result: ScannedQRResult) => {
    if (result.address) {
      if (result.network === 'SUREX_TAG' || result.address.startsWith('@')) {
        setSendMode('TAG')
        setValue('network', 'SUREX_TAG')
        setValue('address', result.address.replace(/^@/, ''), { shouldValidate: true })
      } else {
        setSendMode('CRYPTO')
        setValue('address', result.address, { shouldValidate: true })
        if (result.network && SEND_NETWORKS.includes(result.network as any)) {
          setValue('network', result.network as any)
        }
      }
      if (result.amount) {
        const amt = parseFloat(result.amount)
        if (!isNaN(amt) && amt > 0) {
          setValue('amount', amt)
        }
      }
    }
  }, [setValue])

  useEffect(() => {
    const addr = searchParams.get('address')
    const net = searchParams.get('network')
    if (addr) {
      if (initialType === 'TAG') {
        setValue('address', addr.replace(/^@/, ''), { shouldValidate: true })
      } else {
        setValue('address', addr, { shouldValidate: true })
        if (net && SEND_NETWORKS.includes(net as any)) {
          setValue('network', net as any)
        }
      }
    }
  }, [searchParams, initialType, setValue])

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
    const total = sendMode === 'CRYPTO' ? amt + cctpFee : amt
    if (total > sendableBalance) {
      const feeNote = sendMode === 'CRYPTO' && cctpFee > 0 ? ` including a ${cctpFee.toFixed(2)} USDC network fee` : ''
      toast.error(`Insufficient balance. This send needs ${formatTransferAmount(total)}${feeNote}.`)
      return
    }
    setFormData(prev => ({ ...prev, amount: amt }))
    setStep(3)
  }

  // 4-digit PIN entry lives in the shared <PinKeypad> (step 4); it manages its
  // own digits and calls `executeSend` once all four are entered.

  const executeSend = async (finalPin?: string, passkeyToken?: string) => {
    setIsLoading(true)
    setPinError(null)
    try {
      await walletAPI.send({
        address: formData.address!,
        amount: formData.amount!,
        network: sendMode === 'TAG' ? 'SUREX_TAG' : formData.network!,
        currency: transferCurrency,
        pin: finalPin,
        passkeyToken,
      })
      setIsSuccess(true)
      setStep(5)
      queryClient.invalidateQueries({ queryKey: ['sendBalance'] })
    } catch (error: any) {
      const message = error.response?.data?.message || 'Transaction failed'
      toast.error(message)
      // Stay on (or drop to) the PIN keypad with the dots cleared so the user
      // can retry with a PIN or the biometric fallback.
      setPinError(message)
      setStep(4)
    } finally {
      setIsLoading(false)
    }
  }

  // Biometric-first approval (same pattern as bills): Face ID / fingerprint is
  // triggered from the "Confirm Transfer" button — a user gesture, which
  // browsers require for navigator.credentials.get(). No enrolled credential,
  // cancel, or failure falls back to the PIN keypad (step 4).
  const { approve: approveWithBiometric, biometricBusy } = useBiometricApproval(
    (passkeyToken) => void executeSend(undefined, passkeyToken),
    () => setStep(4),
  )

  const handleConfirmSend = () => {
    void approveWithBiometric()
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
                <Send className="w-5 h-5" style={{ color: colors.primary }} /> Send money
              </h2>
              <p className="text-xs text-[#94A3B8] mt-0.5">Send USDC on-chain, or USDC and local currency to a SureX Tag</p>
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
                <Tag className="w-3.5 h-3.5" /> SureX Tag (@tag)
              </button>
            </div>

            <form onSubmit={handleSubmit(onSubmitStep1 as any)} className="space-y-5">
              {sendMode === 'TAG' ? (
                <div>
                  <label className="block text-xs font-semibold text-[#94A3B8] mb-2 flex items-center justify-between">
                    <span>Recipient SureX Tag (@username)</span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setShowQRScanner(true)}
                        className="text-[10px] font-bold text-white/90 hover:text-white flex items-center gap-1 bg-white/[0.06] hover:bg-white/10 px-2 py-0.5 rounded-lg border border-white/10 transition-colors active:scale-95"
                      >
                        <QrCode className="w-3 h-3 text-emerald-400" /> Scan QR
                      </button>
                      <span className="text-[10px] text-emerald-400 font-bold flex items-center gap-1">
                        <Zap className="w-3 h-3" /> Zero Fee · Instant
                      </span>
                    </div>
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
                  <div className="mt-4">
                    <SendFromPicker
                      assets={tagTransferAssets}
                      value={tagCurrency}
                      onChange={setTagCurrency}
                      loading={balanceLoading}
                    />
                    <p className="text-[11px] text-[#64748B] mt-1.5">Local-currency sends stay in the same currency — no conversion, no fee.</p>
                  </div>
                  {errors.address && <p className="text-red-400 text-xs mt-1">{errors.address.message}</p>}
                  <p className="text-[11px] text-[#64748B] mt-1.5">
                    Peer-to-peer transfers using SureX Tags are processed instantly with zero network fees.
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
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-xs font-semibold text-[#94A3B8]">Recipient Wallet Address</label>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setShowQRScanner(true)}
                          className="px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all flex items-center gap-1 border active:scale-95 shadow-sm"
                          style={{
                            background: `rgba(${colors.glowRgb}, 0.15)`,
                            color: colors.primary,
                            borderColor: `rgba(${colors.glowRgb}, 0.35)`,
                          }}
                        >
                          <QrCode className="w-3.5 h-3.5" />
                          <span>Scan QR</span>
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              const text = await navigator.clipboard.readText()
                              if (text) {
                                const parsed = parseScannedCryptoURI(text)
                                setValue('address', parsed.address, { shouldValidate: true })
                                if (parsed.network && SEND_NETWORKS.includes(parsed.network as any)) {
                                  setValue('network', parsed.network as any)
                                }
                                toast.success('Address pasted from clipboard!')
                              }
                            } catch {
                              toast.error('Clipboard access not allowed. Please paste manually.')
                            }
                          }}
                          className="px-2.5 py-1 rounded-lg text-[11px] font-bold text-[#94A3B8] hover:text-white bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 transition-all flex items-center gap-1 active:scale-95"
                        >
                          <Clipboard className="w-3.5 h-3.5" />
                          <span>Paste</span>
                        </button>
                      </div>
                    </div>
                    <div className="relative">
                      <input
                        {...register('address')}
                        type="text"
                        autoCapitalize="none"
                        autoCorrect="off"
                        spellCheck={false}
                        placeholder="Paste wallet address or scan QR"
                        className="w-full pl-4 pr-11 py-3.5 rounded-2xl bg-white/[0.03] border border-white/10 text-white text-xs font-mono focus:outline-none focus:border-white/30 focus:bg-white/[0.05] transition-colors"
                      />
                      <button
                        type="button"
                        onClick={() => setShowQRScanner(true)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-xl text-[#94A3B8] hover:text-white hover:bg-white/10 transition-all active:scale-95"
                        title="Scan QR Code with Camera"
                      >
                        <QrCode className="w-4 h-4" />
                      </button>
                    </div>
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
              {sendMode === 'TAG' && (
                <div className="flex items-center justify-between gap-3 p-3 rounded-2xl border border-white/10 bg-white/[0.03]">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <SendFromBadge asset={selectedTagAsset} accent={colors.primary} glowRgb={colors.glowRgb} />
                    <div className="min-w-0">
                      <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-[#64748B]">Sending from</p>
                      <p className="text-xs font-bold text-white truncate">{sendFromAssetName(selectedTagAsset)} balance</p>
                    </div>
                  </div>
                  <p className="text-[11px] font-bold text-white flex-shrink-0">
                    {formatTransferAmount(sendableBalance)}
                    <span className="text-[#64748B] font-semibold"> available</span>
                  </p>
                </div>
              )}
              <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/10">
                <div className="flex justify-between items-center mb-1">
                  <label className="text-xs text-[#94A3B8]">Send Amount ({transferCurrency})</label>
                  <button
                    type="button"
                    onClick={() => setValue('amount', sendableBalance)}
                    className="text-xs font-bold text-emerald-400"
                  >
                    Max: {formatTransferAmount(sendableBalance)}
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
                  <span className="font-bold text-sm text-white bg-white/10 px-3 py-1.5 rounded-xl">{transferCurrency}</span>
                </div>
              </div>

              <div className="text-xs space-y-2 py-3 px-4 rounded-xl bg-white/[0.02] border border-white/5 text-[#94A3B8]">
                <div className="flex justify-between">
                  <span>{sendMode === 'TAG' ? 'Delivery' : 'Receiving Network'}</span>
                  <span className="text-white font-bold">{sendMode === 'TAG' ? 'SureX Tag · instant' : formNetwork}</span>
                </div>
                <div className="flex justify-between">
                  <span>Recipient Receives</span>
                  <span className="text-emerald-400 font-bold">{formatTransferAmount(amount)}</span>
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
              <p className="text-4xl font-black text-white tracking-tight">{formatTransferAmount(Number(formData.amount || 0))}</p>
            </div>

            <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/10 space-y-3 text-xs">
              {sendMode === 'TAG' && (
                <div className="flex justify-between items-center py-1 border-b border-white/5">
                  <span className="text-[#94A3B8]">Sending from</span>
                  <span className="text-white font-bold">{sendFromAssetName(selectedTagAsset)} balance ({selectedTagAsset.code})</span>
                </div>
              )}
              {formData.network && formData.network !== 'ARC' && formData.network !== 'SUREX_TAG' && (
                <div className="flex justify-between py-1 border-b border-white/5">
                  <span className="text-[#94A3B8]">Network Fee (CCTP)</span>
                  <span className="text-amber-400 font-bold">${(cctpFee).toFixed(2)} USD</span>
                </div>
              )}
              <div className="flex justify-between py-1">
                <span className="text-[#94A3B8]">Total Deducted</span>
                <span className="text-emerald-400 font-extrabold text-sm">{formatTransferAmount(Number(formData.amount || 0) + (sendMode === 'CRYPTO' ? cctpFee : 0))}</span>
              </div>
            </div>

            <button
              onClick={handleConfirmSend}
              disabled={biometricBusy}
              className="w-full py-4 rounded-2xl font-bold text-black shadow-lg transition-transform active:scale-[0.98] hover:scale-[1.02] disabled:opacity-60"
              style={{ background: colors.gradientBg }}
            >
              {biometricBusy ? (
                <span className="inline-flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" /> Authenticating…
                </span>
              ) : (
                'Confirm Transfer'
              )}
            </button>
            {!biometricBusy && (
              <p className="text-center text-[#64748B] text-[11px] flex items-center justify-center gap-1.5">
                <span className="text-base leading-none">👆</span> Verify with Face ID / fingerprint, or use your PIN if you prefer.
              </p>
            )}
          </motion.div>
        )}

        {/* Step 4: PIN Security (fixed overlay — never scrolls; only shown when
            biometrics are unavailable, cancelled, or fail) */}
        {step === 4 && (
          <div className="fixed inset-x-0 top-0 z-[60] flex items-center justify-center bg-black/85 backdrop-blur-sm px-5 h-[100dvh]">
            <div className="w-full max-w-sm mx-auto rounded-3xl border border-white/10 bg-[#0C0E13]/95 p-5 sm:p-6 shadow-2xl text-center overflow-hidden">
              <PinKeypad
                title="Security Verification"
                subtitle={`Authorize sending ${formatTransferAmount(Number(formData.amount || 0))}${sendMode === 'CRYPTO' && cctpFee > 0 ? ` + ${cctpFee.toFixed(2)} USDC network fee` : ''} (${formatTransferAmount(Number(formData.amount || 0) + (sendMode === 'CRYPTO' ? cctpFee : 0))} total)`}
                onComplete={(p) => executeSend(p)}
                disabled={isLoading}
                error={pinError}
                accentHex={colors.primary}
                accentRgb={isGold ? '212, 160, 23' : '181, 226, 61'}
                onCancel={() => { setPinError(null); setStep(3) }}
                extra={<BiometricApproveButton onApproved={(token) => executeSend(undefined, token)} disabled={isLoading} />}
              />
            </div>
          </div>
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
                {formatTransferAmount(Number(formData.amount || 0))}
              </p>
              <p className="text-xs text-[#94A3B8] mt-1.5 flex items-center justify-center gap-1.5 min-w-0">
                <span>sent to</span>
                <span className="font-bold text-white truncate max-w-[200px]">{sendMode === 'TAG' ? `@${formData.address}` : `${formData.address?.slice(0, 8)}…${formData.address?.slice(-6)}`}</span>
              </p>
            </div>
            <button onClick={() => router.replace('/app/dashboard')} className="w-full py-3.5 rounded-xl font-bold text-black shadow-lg active:scale-[0.98] transition-transform" style={{ background: colors.gradientBg }}>
              Done
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <QRScannerModal
        open={showQRScanner}
        onClose={() => setShowQRScanner(false)}
        onScan={handleScanResult}
        title="Scan Recipient QR Code"
        description="Align recipient wallet QR code within the frame"
      />
    </div>
  )
}
