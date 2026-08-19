'use client'

import React, { useState, useEffect, Suspense } from 'react'
import { motion } from 'framer-motion'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Eye, EyeOff, Mail, Lock, KeyRound, Fingerprint } from 'lucide-react'
import toast from 'react-hot-toast'
import { authAPI, passkeyAPI } from '@/lib/api'
import { useTheme } from '@/context/ThemeContext'
import { startAuthentication } from '@simplewebauthn/browser'

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
})

type LoginFormValues = z.infer<typeof loginSchema>

function LoginForm() {
  const { variant, colors } = useTheme()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [googleEnabled, setGoogleEnabled] = useState(false)

  // One-time code mode
  const [codeMode, setCodeMode] = useState(false)
  const [codeEmail, setCodeEmail] = useState('')
  const [codeSent, setCodeSent] = useState(false)
  const [code, setCode] = useState('')
  const [codeLoading, setCodeLoading] = useState(false)
  const [resendIn, setResendIn] = useState(0)

  useEffect(() => {
    const error = searchParams.get('error')
    if (error) toast.error(error)
  }, [searchParams])

  useEffect(() => {
    authAPI.googleConfig().then((c: any) => setGoogleEnabled(Boolean(c?.enabled))).catch(() => {})
  }, [])

  useEffect(() => {
    if (resendIn <= 0) return
    const t = setTimeout(() => setResendIn(resendIn - 1), 1000)
    return () => clearTimeout(t)
  }, [resendIn])

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
  })

  const onSubmit = async (data: LoginFormValues) => {
    setIsLoading(true)
    try {
      await authAPI.login(data)
      toast.success('Login successful!')
      window.location.href = '/app/dashboard'
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Login failed. Please check your credentials.')
    } finally {
      setIsLoading(false)
    }
  }

  const sendCode = async () => {
    if (!codeEmail) return toast.error('Enter your email address')
    setCodeLoading(true)
    try {
      await authAPI.requestLoginOtp(codeEmail)
      setCodeSent(true)
      setResendIn(60)
      toast.success('One-time code sent to your email')
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Could not send code')
    } finally {
      setCodeLoading(false)
    }
  }

  const verifyCode = async () => {
    if (!code || code.length !== 6) return toast.error('Enter the 6-digit code')
    setCodeLoading(true)
    try {
      await authAPI.verifyLoginOtp({ email: codeEmail, code })
      toast.success('Login successful!')
      window.location.href = '/app/dashboard'
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Invalid code')
    } finally {
      setCodeLoading(false)
    }
  }

  const googleLogin = async () => {
    try {
      const url = await authAPI.googleUrl()
      window.location.href = url
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Google sign-in is not configured yet')
    }
  }

  const [biometricLoading, setBiometricLoading] = useState(false)

  const biometricLogin = async () => {
    setBiometricLoading(true)
    try {
      const { options, challengeId } = await passkeyAPI.loginBegin()
      const response = await startAuthentication(options)
      await passkeyAPI.loginComplete(challengeId, response)
      toast.success('Login successful!')
      window.location.href = '/app/dashboard'
    } catch (error: any) {
      toast.error(error.response?.data?.message || error?.name === 'NotAllowedError' ? 'Biometric sign-in cancelled' : (error?.message || 'Biometric sign-in failed'))
    } finally {
      setBiometricLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden" style={{ background: 'var(--app-bg)' }}>
      {/* Background glowing orb */}
      <div 
        className="absolute w-96 h-96 rounded-full blur-[120px] pointer-events-none opacity-20"
        style={{ background: colors.glow, top: '-10%', left: '-10%' }}
      />
      
      <motion.div 
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className={`w-full max-w-md p-8 liquid-glass relative z-10`}
      >
        <div className="text-center mb-8">
          <div className="w-16 h-16 mx-auto mb-4 flex items-center justify-center">
            <img 
              src={variant === 'gold' ? '/logo-mark-gold.png' : '/logo-mark-plain.png'}
              alt="SureXend"
              className={`w-14 h-14 object-contain ${variant === 'gold' ? 'gold-logo-glow' : 'lemon-logo-glow'}`}
            />
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">Welcome Back</h1>
          <p className="text-[#94A3B8]">Sign in to access your SureXend wallet</p>
        </div>

        {googleEnabled && (
          <button
            type="button"
            onClick={googleLogin}
            className="w-full mb-6 py-3.5 rounded-xl bg-white text-[#0A0F1E] font-bold text-sm flex items-center justify-center gap-3 hover:bg-gray-100 transition-colors shadow-lg shadow-black/20"
          >
            <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 48 48">
              <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
              <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
              <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
              <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
            </svg>
            Continue with Google
          </button>
        )}

        {googleEnabled && (
          <div className="mb-6 flex items-center gap-4">
            <div className="flex-1 h-px bg-[rgba(255,255,255,0.1)]"></div>
            <span className="text-sm text-[#64748B]">or continue with email</span>
            <div className="flex-1 h-px bg-[rgba(255,255,255,0.1)]"></div>
          </div>
        )}

        <button
          type="button"
          onClick={biometricLogin}
          disabled={biometricLoading}
          className="w-full mb-6 py-3.5 rounded-xl border border-white/10 bg-white/[0.03] text-white font-semibold text-sm flex items-center justify-center gap-2.5 hover:bg-white/[0.07] transition-colors disabled:opacity-60"
        >
          <Fingerprint className="w-5 h-5" style={{ color: colors.primary }} />
          {biometricLoading ? 'Checking your biometric…' : 'Sign in with Face ID or fingerprint'}
        </button>

        {!codeMode ? (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            <div>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-[#64748B] w-5 h-5 pointer-events-none z-10" />
                <input
                  {...register('email')}
                  type="email"
                  placeholder="Email address"
                  className={`input-field input-field-${variant} input-has-icon-left`}
                />
              </div>
              {errors.email && <p className="text-[#EF4444] text-sm mt-1">{errors.email.message}</p>}
            </div>

            <div>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-[#64748B] w-5 h-5 pointer-events-none z-10" />
                <input
                  {...register('password')}
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Password"
                  className={`input-field input-field-${variant} input-has-icon-both`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-[#64748B] hover:text-white transition-colors z-10 p-1"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
              {errors.password && <p className="text-[#EF4444] text-sm mt-1">{errors.password.message}</p>}
            </div>

            <div className="flex justify-between items-center">
              <button
                type="button"
                onClick={() => setCodeMode(true)}
                className="text-sm text-[#94A3B8] hover:text-white transition-colors flex items-center gap-1"
                style={{ color: colors.primary }}
              >
                <KeyRound className="w-3.5 h-3.5" /> Sign in with a code
              </button>
              <Link href="/auth/forgot-password" className="text-sm text-[#94A3B8] hover:text-white transition-colors" style={{ color: colors.primary }}>
                Forgot password?
              </Link>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className={`w-full py-4 rounded-xl text-center btn-${variant} flex justify-center items-center`}
            >
              {isLoading ? (
                <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }} className="w-6 h-6 border-2 border-[#0D0D0D] border-t-transparent rounded-full" />
              ) : (
                'Sign In'
              )}
            </button>
          </form>
        ) : (
          <div className="space-y-5">
            {!codeSent ? (
              <>
                <div>
                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-[#64748B] w-5 h-5 pointer-events-none z-10" />
                    <input
                      value={codeEmail}
                      onChange={e => setCodeEmail(e.target.value)}
                      type="email"
                      placeholder="Email address"
                      className={`input-field input-field-${variant} input-has-icon-left`}
                    />
                  </div>
                </div>
                <button
                  type="button"
                  onClick={sendCode}
                  disabled={codeLoading}
                  className={`w-full py-4 rounded-xl text-center btn-${variant} flex justify-center items-center disabled:opacity-50`}
                >
                  {codeLoading ? (
                    <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }} className="w-6 h-6 border-2 border-[#0D0D0D] border-t-transparent rounded-full" />
                  ) : (
                    'Send One-Time Code'
                  )}
                </button>
              </>
            ) : (
              <>
                <p className="text-sm text-[#94A3B8] text-center">
                  We've sent a 6-digit code to <span className="text-white font-medium">{codeEmail}</span>
                </p>
                <input
                  value={code}
                  onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  inputMode="numeric"
                  placeholder="6-digit code"
                  className={`input-field input-field-${variant} text-center tracking-[0.5em]`}
                />
                <button
                  type="button"
                  onClick={verifyCode}
                  disabled={codeLoading || code.length !== 6}
                  className={`w-full py-4 rounded-xl text-center btn-${variant} flex justify-center items-center disabled:opacity-50`}
                >
                  {codeLoading ? (
                    <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }} className="w-6 h-6 border-2 border-[#0D0D0D] border-t-transparent rounded-full" />
                  ) : (
                    'Sign In'
                  )}
                </button>
                {resendIn > 0 ? (
                  <p className="text-center text-sm text-[#64748B]">Resend code in {resendIn}s</p>
                ) : (
                  <button onClick={sendCode} className="w-full text-center text-sm font-semibold hover:underline" style={{ color: colors.primary }}>
                    Resend Code
                  </button>
                )}
              </>
            )}
            <button
              type="button"
              onClick={() => { setCodeMode(false); setCodeSent(false); setCode(''); }}
              className="w-full text-center text-sm text-[#94A3B8] hover:text-white transition-colors"
            >
              ← Back to password login
            </button>
          </div>
        )}

        <p className="mt-8 text-center text-[#94A3B8] text-sm">
          Don't have an account?{' '}
          <Link href="/auth/register" style={{ color: colors.primary }} className="font-semibold hover:underline">
            Sign up
          </Link>
        </p>
      </motion.div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-[#060A15] text-white">
        <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
      </div>
    }>
      <LoginForm />
    </Suspense>
  )
}