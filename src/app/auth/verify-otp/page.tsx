'use client'

import { useState, useEffect, useRef, Suspense, type KeyboardEvent } from 'react'
import { motion } from 'framer-motion'
import { useRouter, useSearchParams } from 'next/navigation'
import { authAPI } from '@/lib/api'
import toast from 'react-hot-toast'
import { useTheme } from '@/context/ThemeContext'

function VerifyOTPForm() {
  const { variant, colors } = useTheme()
  const router = useRouter()
  const searchParams = useSearchParams()
  const identifier = searchParams.get('identifier') || ''
  const type = (searchParams.get('type') as 'email' | 'phone') || 'email'

  const [otp, setOtp] = useState(['', '', '', '', '', ''])
  const [isLoading, setIsLoading] = useState(false)
  const [timeLeft, setTimeLeft] = useState(60)
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])

  useEffect(() => {
    if (timeLeft > 0) {
      const timerId = setTimeout(() => setTimeLeft(timeLeft - 1), 1000)
      return () => clearTimeout(timerId)
    }
  }, [timeLeft])

  const handleChange = (index: number, value: string) => {
    if (value.length > 1) {
      const pasted = value.replace(/\D/g, '').slice(0, 6)
      const newOtp = [...otp]
      for (let i = 0; i < pasted.length; i++) {
        newOtp[i] = pasted[i]
      }
      setOtp(newOtp)
      const nextIndex = Math.min(pasted.length, 5)
      inputRefs.current[nextIndex]?.focus()
      if (pasted.length === 6) {
        verify(newOtp.join(''))
      }
      return
    }

    if (!/^\d*$/.test(value)) return

    const newOtp = [...otp]
    newOtp[index] = value
    setOtp(newOtp)

    if (value !== '' && index < 5) {
      inputRefs.current[index + 1]?.focus()
    }

    if (newOtp.every(digit => digit !== '')) {
      verify(newOtp.join(''))
    }
  }

  const handleKeyDown = (index: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && otp[index] === '' && index > 0) {
      inputRefs.current[index - 1]?.focus()
    }
  }

  const verify = async (code: string) => {
    setIsLoading(true)
    try {
      await authAPI.verifyOTP({ identifier, code })
      toast.success('Account verified successfully!')
      router.replace('/app/dashboard')
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Verification failed. Please check the code and try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const resendOTP = async () => {
    try {
      await authAPI.resendOTP({ identifier, type })
      toast.success('OTP resent successfully')
      setTimeLeft(60)
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to resend OTP')
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden" style={{ background: 'var(--app-bg)' }}>
      <div 
        className="absolute w-96 h-96 rounded-full pointer-events-none opacity-20"
        style={{ background: `radial-gradient(circle, ${colors.glow}, transparent 70%)`, bottom: '-10%', left: '-10%' }}
      />
      
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
        className={`w-full max-w-md p-8 liquid-glass relative z-10 text-center overflow-hidden rounded-3xl border border-white/10`}
      >
        {/* Signature brand hairline */}
        <div className="absolute inset-x-0 top-0 h-[2px] pointer-events-none" style={{ background: `linear-gradient(90deg, transparent, ${colors.primary}, transparent)` }} />
        <div className="w-16 h-16 mx-auto rounded-full bg-[rgba(255,255,255,0.05)] border border-white/10 flex items-center justify-center mb-6">
          <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </div>
        
        <h1 className="text-3xl font-bold text-white mb-2">Verify Account</h1>
        <p className="text-[#94A3B8] mb-8">
          We&apos;ve sent a 6-digit code to <br />
          <span className="text-white font-medium">{identifier}</span>
        </p>

        <div className="flex justify-center gap-2.5 mb-8">
          {otp.map((digit, index) => (
            <input
              key={index}
              ref={el => {
                inputRefs.current[index] = el
              }}
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={1}
              value={digit}
              onChange={(e) => handleChange(index, e.target.value)}
              onKeyDown={(e) => handleKeyDown(index, e)}
              className="w-12 h-14 text-center text-xl font-bold rounded-2xl bg-[rgba(255,255,255,0.04)] border border-white/10 text-white focus:outline-none focus:border-white/40 focus:bg-white/[0.07] transition-colors"
              disabled={isLoading}
            />
          ))}
        </div>

        <button
          onClick={() => verify(otp.join(''))}
          disabled={isLoading || otp.some(d => d === '')}
          className={`w-full py-4 rounded-xl text-center btn-${variant} flex justify-center items-center mb-6 disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          {isLoading ? (
            <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }} className="w-6 h-6 border-2 border-[#0D0D0D] border-t-transparent rounded-full" />
          ) : (
            'Verify'
          )}
        </button>

        <div className="text-sm">
          {timeLeft > 0 ? (
            <span className="text-[#64748B]">Resend code in {timeLeft}s</span>
          ) : (
            <button onClick={resendOTP} className="text-white hover:underline transition-all" style={{ color: colors.primary }}>
              Resend Code
            </button>
          )}
        </div>
      </motion.div>
    </div>
  )
}

export default function VerifyOTPPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center p-4 bg-[#000000] text-white">
        <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
      </div>
    }>
      <VerifyOTPForm />
    </Suspense>
  )
}

