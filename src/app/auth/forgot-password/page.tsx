'use client'

import React, { useState } from 'react'
import { motion } from 'framer-motion'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import Link from 'next/link'
import { Mail, ArrowLeft, CheckCircle2, KeyRound, Lock } from 'lucide-react'
import toast from 'react-hot-toast'
import { authAPI } from '@/lib/api'
import { useTheme } from '@/context/ThemeContext'

const forgotPasswordSchema = z.object({
  email: z.string().email('Invalid email address'),
})

type ForgotPasswordFormValues = z.infer<typeof forgotPasswordSchema>

export default function ForgotPasswordPage() {
  const { variant, colors } = useTheme()
  const [isLoading, setIsLoading] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [resetDone, setResetDone] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotPasswordFormValues>({
    resolver: zodResolver(forgotPasswordSchema),
  })

  const onSubmit = async (data: ForgotPasswordFormValues) => {
    setIsLoading(true)
    try {
      await authAPI.forgotPassword(data.email)
      setEmail(data.email)
      setIsSuccess(true)
      toast.success('Reset link sent to your email')
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to send reset link')
    } finally {
      setIsLoading(false)
    }
  }

  const onReset = async (event: React.FormEvent) => {
    event.preventDefault()
    if (code.trim().length < 4) return toast.error('Enter the reset code from your email')
    if (newPassword.length < 8) return toast.error('Password must be at least 8 characters')
    setIsLoading(true)
    try {
      await authAPI.resetPassword({ token: code.trim(), newPassword })
      setResetDone(true)
      toast.success('Password reset successfully')
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Invalid or expired reset code')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden" style={{ background: 'var(--app-bg)' }}>
      <div 
        className="absolute w-96 h-96 rounded-full pointer-events-none opacity-20"
        style={{ background: `radial-gradient(circle, ${colors.glow}, transparent 70%)`, top: '20%', right: '10%' }}
      />
      
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className={`w-full max-w-md p-8 liquid-glass relative z-10 overflow-hidden rounded-3xl border border-white/10`}
      >
        {/* Signature brand hairline */}
        <div className="absolute inset-x-0 top-0 h-[2px] pointer-events-none" style={{ background: `linear-gradient(90deg, transparent, ${colors.primary}, transparent)` }} />
        <Link href="/auth/login" className="inline-flex items-center text-[#94A3B8] hover:text-white transition-colors mb-6">
          <ArrowLeft className="w-4 h-4 mr-2" /> Back to login
        </Link>

        {resetDone ? (
          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="text-center py-6">
            <div className="w-16 h-16 mx-auto rounded-full bg-[rgba(16,185,129,0.1)] flex items-center justify-center mb-6"><CheckCircle2 className="w-8 h-8 text-[#10B981]" /></div>
            <h2 className="text-2xl font-bold text-white mb-2">Password changed</h2>
            <p className="text-[#94A3B8] mb-8">Your password has been reset. You can now sign in.</p>
            <Link href="/auth/login" className={`block w-full py-4 rounded-xl text-center btn-${variant}`}>Back to login</Link>
          </motion.div>
        ) : isSuccess ? (
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }} 
            animate={{ opacity: 1, scale: 1 }} 
            className="text-center py-6"
          >
            <div className="w-16 h-16 mx-auto rounded-full bg-[rgba(16,185,129,0.1)] flex items-center justify-center mb-6">
              <CheckCircle2 className="w-8 h-8 text-[#10B981]" />
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">Check your email</h2>
            <p className="text-[#94A3B8] mb-5">We sent a reset code to <span className="text-white">{email}</span>.</p>
            <form onSubmit={onReset} className="space-y-4 text-left">
              <div className="relative"><KeyRound className="absolute left-4 top-1/2 -translate-y-1/2 text-[#64748B] w-5 h-5" /><input value={code} onChange={e => setCode(e.target.value)} inputMode="numeric" placeholder="Reset code" className={`input-field input-field-${variant} input-has-icon-left`} /></div>
              <div className="relative"><Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-[#64748B] w-5 h-5" /><input value={newPassword} onChange={e => setNewPassword(e.target.value)} type="password" placeholder="New password (8+ characters)" className={`input-field input-field-${variant} input-has-icon-left`} /></div>
              <button type="submit" disabled={isLoading} className={`w-full py-4 rounded-xl text-center btn-${variant}`}>{isLoading ? 'Resetting…' : 'Reset password'}</button>
            </form>
            <p className="text-xs text-[#64748B] mt-5">The code expires shortly. Check spam if you do not see it.</p>
            <button
              onClick={() => setIsSuccess(false)}
              className="text-sm hover:underline"
              style={{ color: colors.primary }}
            >
              Try another email
            </button>
          </motion.div>
        ) : (
          <>
            <div className="text-center mb-8">
              <div className="w-16 h-16 mx-auto mb-4 flex items-center justify-center">
                <img 
                  src={variant === 'gold' ? '/logo-mark-gold.png' : '/logo-mark-plain.png'}
                  alt="SureXend"
                  className={`w-14 h-14 object-contain ${variant === 'gold' ? 'gold-logo-glow' : 'lemon-logo-glow'}`}
                />
              </div>
              <h1 className="text-3xl font-bold text-white mb-2">Forgot Password</h1>
              <p className="text-[#94A3B8]">Enter your email and we'll send you a link to reset your password.</p>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
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

              <button
                type="submit"
                disabled={isLoading}
                className={`w-full py-4 rounded-xl text-center btn-${variant} flex justify-center items-center`}
              >
                {isLoading ? (
                  <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }} className="w-6 h-6 border-2 border-[#0D0D0D] border-t-transparent rounded-full" />
                ) : (
                  'Send Reset Link'
                )}
              </button>
            </form>
          </>
        )}
      </motion.div>
    </div>
  )
}
