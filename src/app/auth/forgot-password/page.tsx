'use client'

import React, { useState } from 'react'
import { motion } from 'framer-motion'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import Link from 'next/link'
import { Mail, ArrowLeft, CheckCircle2 } from 'lucide-react'
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
      setIsSuccess(true)
      toast.success('Reset link sent to your email')
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to send reset link')
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
        className={`w-full max-w-md p-8 liquid-glass relative z-10`}
      >
        <Link href="/auth/login" className="inline-flex items-center text-[#94A3B8] hover:text-white transition-colors mb-6">
          <ArrowLeft className="w-4 h-4 mr-2" /> Back to login
        </Link>

        {isSuccess ? (
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }} 
            animate={{ opacity: 1, scale: 1 }} 
            className="text-center py-6"
          >
            <div className="w-16 h-16 mx-auto rounded-full bg-[rgba(16,185,129,0.1)] flex items-center justify-center mb-6">
              <CheckCircle2 className="w-8 h-8 text-[#10B981]" />
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">Check your email</h2>
            <p className="text-[#94A3B8] mb-8">
              We've sent password reset instructions to your email address.
            </p>
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
