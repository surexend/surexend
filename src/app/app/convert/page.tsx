'use client'

import React, { useState, useMemo, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowUpDown, CheckCircle2, ChevronDown, Check, X, Globe, ArrowDown, Wallet } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { conversionAPI, walletAPI, AFRICAN_CURRENCIES } from '@/lib/api'
import { useTheme } from '@/context/ThemeContext'
import { useRouter } from 'next/navigation'
import CurrencyFlag from '@/components/CurrencyFlag'
import BiometricApproveButton from '@/components/BiometricApproveButton'
import { useBackLayer } from '@/context/BackNavigationContext'

const USD_ASSET = { code: 'USD', name: 'US Dollar', symbol: '$', flag: '💵', countryCode: 'US' }

export default function ConvertPage() {
  const { variant, colors } = useTheme()
  const isGold = variant === 'gold'
  const accentRgb = isGold ? '212, 160, 23' : '181, 226, 61'
  const router = useRouter()
  const accentHex = isGold ? '#D4A017' : '#B5E23D'

  const [amount, setAmount] = useState<string>('')
  const [fromCode, setFromCode] = useState('USD')
  const [toCode, setToCode] = useState('NGN')
  const [pickerTarget, setPickerTarget] = useState<'from' | 'to' | null>(null)
  const [currencySearch, setCurrencySearch] = useState('')
  const [step, setStep] = useState(1)
  const [pin, setPin] = useState(['', '', '', ''])
  const [isLoading, setIsLoading] = useState(false)
  const [result, setResult] = useState<any>(null)

  useBackLayer(pickerTarget !== null, () => {
    setPickerTarget(null)
    setCurrencySearch('')
  }, 40)

  useBackLayer(step > 1, useCallback(() => {
    if (step === 3) {
      router.replace('/app/dashboard')
      return
    }
    setStep(1)
    setPin(['', '', '', ''])
  }, [step, router]), 30)

  // ── Real balances ────────────────────────────────────────────────────────
  const { data: balanceData, refetch: refetchBalance } = useQuery({
    queryKey: ['balance'],
    queryFn: walletAPI.getBalance,
    staleTime: 30000,
  })

  const { data: currenciesData } = useQuery({
    queryKey: ['currencies'],
    queryFn: conversionAPI.getCurrencies,
    staleTime: 60000,
  })

  const localCurrencies = useMemo(() => {
    const locals = currenciesData?.local || []
    return locals.length ? locals : AFRICAN_CURRENCIES
  }, [currenciesData])

  const allAssets = useMemo(() => [USD_ASSET, ...localCurrencies], [localCurrencies])

  const filteredAssets = useMemo(() => {
    const q = currencySearch.trim().toLowerCase()
    if (!q) return allAssets
    return allAssets.filter(a =>
      a.code.toLowerCase().includes(q) ||
      a.name.toLowerCase().includes(q) ||
      (a.country || '').toLowerCase().includes(q) ||
      (a.countries || []).some((c: string) => c.toLowerCase().includes(q))
    )
  }, [allAssets, currencySearch])

  const assetInfo = (code: string) =>
    allAssets.find(a => a.code === code) || (code === 'USD' ? USD_ASSET : allAssets.find(a => a.code === code))

  const fromInfo = assetInfo(fromCode)
  const toInfo = assetInfo(toCode)

  // Balances per asset
  const localBalances: Record<string, number> = balanceData?.localBalances || {}
  const usdBalance = balanceData?.usdBalance ?? 0
  const realNgn = balanceData?.realNgn ?? 0
  const testnetNgn = balanceData?.testnetNgn ?? 0
  const getAssetBalance = (code: string) => code === 'USD' ? usdBalance : (localBalances[code] || 0)

  // Live/static rate for the "to" currency
  const { data: ratesData } = useQuery({
    queryKey: ['rates', toCode],
    queryFn: () => conversionAPI.getRates(toCode),
    enabled: !!toCode && toCode !== 'USD',
  })
  const toRate = ratesData?.rate || (toCode === 'USD' ? 1 : 1)

  // Client-side preview estimate (server is authoritative on execution)
  const numAmount = parseFloat(amount) || 0
  const preview = useMemo(() => {
    if (!numAmount || numAmount <= 0 || fromCode === toCode) return null
    const usdValue = fromCode === 'USD' ? numAmount : numAmount / (assetInfo(fromCode)?.rate || 1500)
    const feeUsd = 0
    const receiveAmount = toCode === 'USD' ? usdValue : usdValue * (assetInfo(toCode)?.rate || 1500)
    return { usdValue, feeUsd, receiveAmount }
  }, [numAmount, fromCode, toCode, allAssets])

  const fromSymbol = fromInfo?.symbol || ''
  const toSymbol = toInfo?.symbol || ''
  // Swappable balance: NGN shows only testnet naira — real naira is reserved for bills.
  const fromBalance = fromCode === 'NGN' ? testnetNgn : getAssetBalance(fromCode)
  const toBalance = toCode === 'NGN' ? testnetNgn : getAssetBalance(toCode)
  const fromRate = fromCode === 'USD' ? 1 : (assetInfo(fromCode)?.rate || 1500)
  const toRateForDisplay = toCode === 'USD' ? 1 : (assetInfo(toCode)?.rate || 1500)

  const handleSwap = () => {
    setFromCode(toCode)
    setToCode(fromCode)
    setAmount('')
  }

  const handlePreset = (pct: number) => {
    setAmount((fromBalance * pct / 100).toFixed(2))
  }

  const handleNext = () => {
    if (fromCode === toCode) { toast.error('Select different currencies to convert'); return }
    if (fromCode === 'NGN' && numAmount > testnetNgn) {
      toast.error('Real naira is reserved for bills. Only testnet naira can be swapped to crypto.')
      return
    }
    if (!numAmount || numAmount <= 0) { toast.error('Enter an amount'); return }
    if (numAmount > fromBalance) { toast.error(`Insufficient swappable balance in ${fromCode}`); return }
    setStep(2)
  }

  const handlePinInput = (digit: string) => {
    const emptyIndex = pin.findIndex(p => p === '')
    if (emptyIndex === -1) return
    const newPin = [...pin]
    newPin[emptyIndex] = digit
    setPin(newPin)
    if (emptyIndex === 3) executeConversion(newPin.join(''))
  }

  const handlePinDelete = () => {
    const lastFilled = pin.map(p => p !== '').lastIndexOf(true)
    if (lastFilled !== -1) {
      const newPin = [...pin]
      newPin[lastFilled] = ''
      setPin(newPin)
    }
  }

  const executeConversion = async (finalPin?: string, passkeyToken?: string) => {
    setIsLoading(true)
    try {
      const res = await conversionAPI.execute({ from: fromCode, to: toCode, amount: numAmount, pin: finalPin, passkeyToken })
      setResult(res)
      setStep(3)
      refetchBalance()
    } catch (error: any) {
      const msg = error.response?.data?.message || 'Conversion failed'
      toast.error(msg)
      if (msg && msg.toLowerCase().includes('pin not set up')) {
        setStep(1)
        router.push('/app/settings/change-pin')
      }
      setPin(['', '', '', ''])
    } finally {
      setIsLoading(false)
    }
  }

  const resetAll = () => {
    setStep(1)
    setAmount('')
    setPin(['', '', '', ''])
    setResult(null)
  }

  return (
    <div className="w-full max-w-full overflow-x-hidden px-3 py-4 max-w-md mx-auto flex flex-col pb-28 sm:pb-36">
      <AnimatePresence mode="wait">
        {/* ─── STEP 1: Swap UI ─── */}
        {step === 1 && (
          <motion.div
            key="step1"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-3"
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-extrabold text-white flex items-center gap-2">
                  <ArrowUpDown className="w-5 h-5 flex-shrink-0" style={{ color: colors.primary }} />
                  Convert Currency
                </h2>
                <p className="text-[11px] text-[#64748B] mt-0.5">Move funds between your USD & local wallets instantly</p>
              </div>
              <span className="px-2 py-1 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 whitespace-nowrap flex-shrink-0">
                Instant
              </span>
            </div>

            {/* FROM Card */}
            <div className="liquid-glass p-4 rounded-2xl border border-white/10 space-y-3">
              <div className="flex items-center justify-between gap-2">
                {/* Currency selector (FROM) */}
                <button
                  type="button"
                  onClick={() => setPickerTarget('from')}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/[0.08] border border-white/10 hover:bg-white/15 transition-all active:scale-95"
                >
                  <CurrencyFlag countryCode={fromInfo?.countryCode} emoji={fromInfo?.flag} size={18} />
                  <span className="font-extrabold text-sm text-white">{fromCode}</span>
                  <ChevronDown className="w-4 h-4 text-[#64748B]" />
                </button>

                {/* Bal + presets */}
                <div className="flex items-center gap-1 flex-wrap justify-end">
                  <span
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-extrabold border shadow-sm"
                    style={{
                      background: `rgba(${colors.glowRgb}, 0.12)`,
                      borderColor: `rgba(${colors.glowRgb}, 0.35)`,
                      color: '#FFFFFF',
                    }}
                  >
                    <Wallet className="w-3.5 h-3.5" style={{ color: colors.primary }} />
                    Bal: {fromSymbol}{fromBalance.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                  </span>
                  {[25, 50, 75, 100].map((pct) => (
                    <button
                      key={pct}
                      type="button"
                      onClick={() => handlePreset(pct)}
                      className="px-1.5 py-0.5 rounded-md bg-white/[0.06] hover:bg-white/15 text-[10px] font-bold text-[#94A3B8] hover:text-white transition-colors"
                    >
                      {pct === 100 ? 'Max' : `${pct}%`}
                    </button>
                  ))}
                </div>
              </div>

              {/* Amount input */}
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold text-[#64748B]">{fromSymbol}</span>
                <input
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
                  placeholder="0"
                  className="bg-transparent text-3xl sm:text-4xl font-black text-white w-full focus:outline-none placeholder:text-[#2F3239]"
                />
              </div>
            </div>

            {/* Flip Button */}
            <div className="flex justify-center -my-1 relative z-10">
              <button
                type="button"
                onClick={handleSwap}
                className="w-10 h-10 rounded-full flex items-center justify-center shadow-xl transition-all active:scale-90 border-2"
                style={{
                  background: colors.gradientBg,
                  borderColor: `rgba(${colors.glowRgb}, 0.4)`
                }}
                title="Swap conversion direction"
              >
                <ArrowDown className="w-5 h-5 text-black" />
              </button>
            </div>

            {/* TO Card */}
            <div className="liquid-glass p-4 rounded-2xl border border-white/10 space-y-3">
              <div className="flex items-center justify-between">
                {/* Currency selector (TO) */}
                <button
                  type="button"
                  onClick={() => setPickerTarget('to')}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/[0.08] border border-white/10 hover:bg-white/15 transition-all active:scale-95"
                >
                  <CurrencyFlag countryCode={toInfo?.countryCode} emoji={toInfo?.flag} size={18} />
                  <span className="font-extrabold text-sm text-white">{toCode}</span>
                  <ChevronDown className="w-4 h-4 text-[#64748B]" />
                </button>
                <span
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-extrabold border shadow-sm"
                  style={{
                    background: `rgba(${colors.glowRgb}, 0.12)`,
                    borderColor: `rgba(${colors.glowRgb}, 0.35)`,
                    color: '#FFFFFF',
                  }}
                >
                  <Wallet className="w-3.5 h-3.5" style={{ color: colors.primary }} />
                  Bal: {toSymbol}{toBalance.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                </span>
              </div>

              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold text-[#64748B]">{toSymbol}</span>
                <span className="text-3xl sm:text-4xl font-black text-white">
                  {preview && preview.receiveAmount > 0
                    ? preview.receiveAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })
                    : '0'}
                </span>
                <span className="text-sm text-[#64748B] font-medium">{toCode}</span>
              </div>

              {/* Rate + fee pill */}
              <div className="flex items-center gap-3 pt-1 border-t border-white/5 flex-wrap">
                <span className="text-[11px] text-[#64748B]">
                  1 {fromCode} = {(fromRate && toRateForDisplay ? (toRateForDisplay / fromRate) : 0).toLocaleString(undefined, { maximumFractionDigits: 2 })} {toCode}
                </span>
                <span className="text-[10px] text-[#64748B]">Fee: {preview ? preview.feeUsd.toFixed(2) : '0.00'} USD</span>
              </div>

              {fromCode === 'USD' && toCode !== 'USD' && (
                <div className="mt-3 rounded-xl px-4 py-3 text-xs text-amber-300 border border-amber-500/30 bg-amber-500/10">
                  Swapping crypto to naira creates <b>testnet naira</b> — great for testing, but it can't pay real bills or be withdrawn. Real bills are paid from the NGN wallet you fund by bank transfer. Crypto bill payments go live at mainnet launch.
                </div>
              )}
              {fromCode === 'NGN' && (
                <div className="mt-3 rounded-xl px-4 py-3 text-xs text-amber-300 border border-amber-500/30 bg-amber-500/10">
                  Real naira (from bank transfers) is reserved for paying bills. Only your <b>testnet naira</b> (₦{testnetNgn.toLocaleString(undefined, { maximumFractionDigits: 2 })}) can be swapped to crypto.
                </div>
              )}
            </div>

            {/* CTA */}
            <button
              onClick={handleNext}
              disabled={!numAmount || fromCode === toCode}
              className="w-full py-4 rounded-2xl font-extrabold text-black shadow-xl transition-transform active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed mt-2"
              style={{ background: colors.gradientBg }}
            >
              Continue
            </button>
          </motion.div>
        )}

        {/* ─── STEP 2: PIN ─── */}
        {step === 2 && (
          <motion.div key="step2" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, x: -20 }} className="liquid-glass p-6 text-center space-y-6 rounded-2xl">
            <button onClick={() => setStep(1)} className="text-[#94A3B8] hover:text-white text-xs font-semibold flex items-center gap-1">← Back</button>
            <h2 className="text-xl font-bold text-white">Enter 4-Digit PIN</h2>
            <p className="text-xs text-[#94A3B8]">
              Convert {fromSymbol}{numAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })} {fromCode} → {toSymbol}{(preview?.receiveAmount || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })} {toCode}
            </p>
            <div className="flex justify-center gap-3 my-4">
              {pin.map((digit, idx) => (
                <div key={idx} className={`w-11 h-14 rounded-xl border-2 flex items-center justify-center text-2xl font-bold transition-all ${digit ? 'border-emerald-500 bg-emerald-500/10 text-white' : 'border-white/10 bg-white/5 text-transparent'}`}>
                  {digit ? '•' : ''}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-3 max-w-[240px] mx-auto">
              {[1,2,3,4,5,6,7,8,9].map(n => (
                <button key={n} onClick={() => handlePinInput(n.toString())} className="p-3.5 rounded-2xl bg-white/[0.06] hover:bg-white/[0.12] text-white font-bold text-lg active:scale-95 transition-all">{n}</button>
              ))}
              <button onClick={() => setStep(1)} className="p-3.5 rounded-2xl bg-white/[0.04] text-[#94A3B8] text-xs font-bold">Cancel</button>
              <button onClick={() => handlePinInput('0')} className="p-3.5 rounded-2xl bg-white/[0.06] hover:bg-white/[0.12] text-white font-bold text-lg active:scale-95">0</button>
              <button onClick={handlePinDelete} className="p-3.5 rounded-2xl bg-white/[0.06] text-red-400 font-bold text-lg active:scale-95">⌫</button>
            </div>

            <div className="flex items-center gap-3 my-2">
              <div className="flex-1 h-px bg-white/5"></div>
              <span className="text-[10px] text-[#64748B] uppercase tracking-wider">or</span>
              <div className="flex-1 h-px bg-white/5"></div>
            </div>
            <BiometricApproveButton onApproved={(token) => executeConversion(undefined, token)} disabled={isLoading} />
          </motion.div>
        )}

        {/* ─── STEP 3: Success ─── */}
        {step === 3 && (
          <motion.div key="step3" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="liquid-glass p-8 text-center space-y-6 rounded-2xl">
            <div className="w-20 h-20 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-12 h-12 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-2xl font-black text-white">Conversion Successful!</h2>
              <p className="text-sm text-[#94A3B8] mt-2">
                {toSymbol}{(result?.receiveAmount || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })} {toCode} has been added to your wallet.
              </p>
            </div>
            <div className="liquid-glass p-4 rounded-xl border border-white/10 space-y-2 text-left">
              <div className="flex justify-between text-xs">
                <span className="text-[#94A3B8]">Converted</span>
                <span className="text-white font-bold">{fromSymbol}{(result?.amount || 0).toLocaleString()} {fromCode}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-[#94A3B8]">Rate</span>
                <span className="text-white font-bold">1 {fromCode} = {result?.rate ? (result.rate / (fromRate || 1)).toLocaleString(undefined, { maximumFractionDigits: 2 }) : '—'} {toCode}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-[#94A3B8]">Fee</span>
                <span className="text-white font-bold">${(result?.fee || 0).toFixed(2)}</span>
              </div>
            </div>
            <button onClick={resetAll} className="w-full py-4 rounded-xl font-bold text-black shadow-lg" style={{ background: colors.gradientBg }}>
              Done / Convert Again
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Currency Picker Modal ── */}
      <AnimatePresence>
        {pickerTarget && (
          <div className="fixed inset-0 z-[80] flex items-end justify-center liquid-backdrop">
            <motion.div
              initial={{ opacity: 0, y: 100 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 100 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="w-full max-w-md liquid-glass rounded-t-3xl border-t border-white/15 shadow-2xl"
              style={{ borderColor: `rgba(${colors.glowRgb},0.4)` }}
            >
              <div className="flex items-center justify-between p-4 border-b border-white/10">
                <div className="flex items-center gap-2">
                  <Globe className="w-4 h-4 text-emerald-400" />
                  <h3 className="font-bold text-white text-sm">Select {pickerTarget === 'from' ? 'From' : 'To'} Currency</h3>
                </div>
                <button onClick={() => setPickerTarget(null)} className="p-1.5 rounded-full hover:bg-white/10 text-[#64748B] hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-4 pb-2 sticky top-0 z-10" style={{ background: 'rgba(8,9,12,0.95)', backdropFilter: 'blur(12px)' }}>
                <div className="relative">
                  <input
                    value={currencySearch}
                    onChange={(e) => setCurrencySearch(e.target.value)}
                    placeholder="Search country or currency…"
                    className="w-full bg-[#020203] border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-[#64748B] focus:outline-none focus:border-white/30"
                  />
                </div>
              </div>
              <div className="p-4 space-y-2 max-h-[55vh] overflow-y-auto pb-8">
                {filteredAssets.map((asset: any) => {
                  const isSelected = (pickerTarget === 'from' ? fromCode : toCode) === asset.code
                  const isUsd = asset.code === 'USD'
                  const balance = asset.code === 'NGN' ? testnetNgn : getAssetBalance(asset.code)
                  const assetRate = isUsd ? 1 : (asset.rate || 1500)
                  return (
                    <button
                      key={asset.code}
                      onClick={() => {
                        if (pickerTarget === 'from') {
                          if (asset.code === toCode) { toast.error('From and To must be different'); return }
                          setFromCode(asset.code)
                        } else {
                          if (asset.code === fromCode) { toast.error('From and To must be different'); return }
                          setToCode(asset.code)
                        }
                        setPickerTarget(null)
                        setCurrencySearch('')
                      }}
                      className="w-full p-3.5 rounded-2xl border flex items-center justify-between transition-all"
                      style={isSelected
                        ? { background: `rgba(${colors.glowRgb},0.12)`, borderColor: colors.primary }
                        : { background: 'rgba(255,255,255,0.02)', borderColor: 'rgba(255,255,255,0.08)' }
                      }
                    >
                      <div className="flex items-center gap-3">
                        <CurrencyFlag countryCode={asset.countryCode} emoji={asset.flag} size={32} />
                        <div className="text-left">
                          <div className="flex items-center gap-2">
                            <span className="font-extrabold text-white text-sm">{asset.code}</span>
                            <span className="text-xs text-[#94A3B8]">({asset.symbol})</span>
                          </div>
                          <p className="text-[11px] text-[#64748B]">{asset.name}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <p className="text-xs font-bold text-emerald-400">
                            {isUsd ? 'Crypto balance' : asset.code === 'NGN' ? 'Swappable naira' : `1 USD = ${asset.symbol}${assetRate.toLocaleString()}`}
                          </p>
                          <p className="text-[11px] font-bold text-white">
                            Bal: {asset.symbol}{balance.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                          </p>
                        </div>
                        {isSelected && (
                          <div className="w-5 h-5 rounded-full flex items-center justify-center text-black" style={{ background: colors.primary }}>
                            <Check className="w-3 h-3 stroke-[3]" />
                          </div>
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}
