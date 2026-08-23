'use client'

import React, { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Eye, EyeOff, User, Mail, MessageCircle, Lock, Hash } from 'lucide-react'
import toast from 'react-hot-toast'
import { authAPI } from '@/lib/api'
import { useTheme } from '@/context/ThemeContext'

const registerSchema = z.object({
  firstName: z.string().min(2, 'First name is required'),
  lastName: z.string().min(2, 'Last name is required'),
  surexTag: z.string()
    .optional()
    .or(z.literal(''))
    .refine(v => !v || /^[a-zA-Z0-9][a-zA-Z0-9._-]{2,39}$/.test(v.replace(/^@/, '')), {
      message: '3-40 characters, starting with a letter or number',
    }),
  email: z.string().email('Invalid email address'),
  whatsapp: z.string().min(10, 'Enter a valid WhatsApp number'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  confirmPassword: z.string(),
  referralCode: z.string().optional(),
  terms: z.literal(true, { errorMap: () => ({ message: 'You must accept the terms' }) })
}).refine(data => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword']
})

type RegisterFormValues = z.infer<typeof registerSchema>

export default function RegisterPage() {
  const { variant, colors } = useTheme()
  const router = useRouter()
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [passwordStrength, setPasswordStrength] = useState(0)
  const [googleEnabled, setGoogleEnabled] = useState(false)

  useEffect(() => {
    authAPI.googleConfig().then((c: any) => setGoogleEnabled(Boolean(c?.enabled))).catch(() => {})
  }, [])

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
  })

  const passwordValue = watch('password')

  React.useEffect(() => {
    if (!passwordValue) {
      setPasswordStrength(0)
      return
    }
    let strength = 0
    if (passwordValue.length >= 8) strength += 25
    if (/[A-Z]/.test(passwordValue)) strength += 25
    if (/[0-9]/.test(passwordValue)) strength += 25
    if (/[^A-Za-z0-9]/.test(passwordValue)) strength += 25
    setPasswordStrength(strength)
  }, [passwordValue])

  const onSubmit = async (data: RegisterFormValues) => {
    setIsLoading(true)
    try {
      const res = await authAPI.register({
        firstName: data.firstName,
        lastName: data.lastName,
        surexTag: data.surexTag?.trim() || undefined,
        email: data.email,
        phone: '+234' + data.whatsapp.replace(/^0+/, ''),
        password: data.password,
        referralCode: data.referralCode
      })
      toast.success('Registration successful! Please verify your email.')
      if (res.data?.otpDelivered === false) {
        toast('Your code is still on its way — check your inbox (and spam). If it doesn\'t arrive, tap Resend on the next screen.', { duration: 6000 })
      }
      router.push(`/auth/verify-otp?identifier=${encodeURIComponent(data.email)}&type=email`)
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Registration failed')
    } finally {
      setIsLoading(false)
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

  const getStrengthColor = () => {
    if (passwordStrength < 50) return '#EF4444' // red
    if (passwordStrength < 100) return '#F59E0B' // yellow
    return '#10B981' // green
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden py-12" style={{ background: 'var(--app-bg)' }}>
      <div
        className="absolute w-96 h-96 rounded-full pointer-events-none opacity-20"
        style={{ background: `radial-gradient(circle, ${colors.glow}, transparent 70%)`, top: '-10%', right: '-10%' }}
      />
      <div
        className="absolute w-80 h-80 rounded-full pointer-events-none opacity-[0.12]"
        style={{ background: `radial-gradient(circle, ${colors.glow}, transparent 70%)`, bottom: '-8%', left: '-6%' }}
      />

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className={`w-full max-w-xl p-8 liquid-glass relative z-10 overflow-hidden rounded-3xl border border-white/10`}
      >
        {/* Signature brand hairline */}
        <div className="absolute inset-x-0 top-0 h-[2px] pointer-events-none" style={{ background: `linear-gradient(90deg, transparent, ${colors.primary}, transparent)` }} />
        <div className="text-center mb-8">
          <div className="w-16 h-16 mx-auto mb-4 flex items-center justify-center">
            <img 
              src={variant === 'gold' ? '/logo-mark-gold.png' : '/logo-mark-plain.png'}
              alt="SureXend"
              className={`w-14 h-14 object-contain ${variant === 'gold' ? 'gold-logo-glow' : 'lemon-logo-glow'}`}
            />
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">Create Account</h1>
          <p className="text-[#94A3B8]">Join SureXend and manage your crypto seamlessly</p>
        </div>

        {googleEnabled && (
          <button
            type="button"
            onClick={googleLogin}
            className="w-full mb-6 py-3.5 rounded-xl bg-white text-[#020203] font-bold text-sm flex items-center justify-center gap-3 hover:bg-gray-100 transition-colors shadow-lg shadow-black/20"
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
            <span className="text-sm text-[#64748B]">or sign up with email</span>
            <div className="flex-1 h-px bg-[rgba(255,255,255,0.1)]"></div>
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <div className="relative">
                <User className="absolute left-4 top-1/2 -translate-y-1/2 text-[#64748B] w-5 h-5 pointer-events-none z-10" />
                <input
                  {...register('firstName')}
                  placeholder="First Name"
                  className={`input-field input-field-${variant} input-has-icon-left`}
                />
              </div>
              {errors.firstName && <p className="text-[#EF4444] text-sm mt-1">{errors.firstName.message}</p>}
            </div>
            <div>
              <div className="relative">
                <User className="absolute left-4 top-1/2 -translate-y-1/2 text-[#64748B] w-5 h-5 pointer-events-none z-10" />
                <input
                  {...register('lastName')}
                  placeholder="Last Name"
                  className={`input-field input-field-${variant} input-has-icon-left`}
                />
              </div>
              {errors.lastName && <p className="text-[#EF4444] text-sm mt-1">{errors.lastName.message}</p>}
            </div>
          </div>

          <div>
            <div className="relative flex">
              <div className="flex items-center px-4 bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.1)] border-r-0 rounded-l-xl text-white">
                <span className="text-sm font-bold">@</span>
              </div>
              <div className="relative flex-1">
                <Hash className="absolute left-4 top-1/2 -translate-y-1/2 text-[#64748B] w-5 h-5 pointer-events-none z-10" />
                <input
                  {...register('surexTag')}
                  placeholder="SureX Tag (e.g. emmanuel.surexend)"
                  className={`input-field input-field-${variant} input-has-icon-left rounded-l-none`}
                />
              </div>
            </div>
            <p className="text-[11px] text-[#64748B] mt-1">Your @tag is how friends send you money instantly, free. Optional — we'll auto-create one if you skip it.</p>
            {errors.surexTag && <p className="text-[#EF4444] text-sm mt-1">{errors.surexTag.message}</p>}
          </div>

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
            <div className="relative flex">
              <div className="flex items-center px-4 bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.1)] border-r-0 rounded-l-xl text-white">
                <span className="text-sm font-medium">NG +234</span>
              </div>
              <div className="relative flex-1">
                <MessageCircle className="absolute left-4 top-1/2 -translate-y-1/2 text-[#64748B] w-5 h-5 pointer-events-none z-10" />
                <input
                  {...register('whatsapp')}
                  type="tel"
                  placeholder="WhatsApp Number (e.g. 8012345678)"
                  className={`input-field input-field-${variant} input-has-icon-left rounded-l-none`}
                />
              </div>
            </div>
            <p className="text-[11px] text-[#64748B] mt-1">So we can reach you when you're away from the app. We never send codes here.</p>
            {errors.whatsapp && <p className="text-[#EF4444] text-sm mt-1">{errors.whatsapp.message}</p>}
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
            {/* Password strength bar */}
            <div className="mt-2 h-1 w-full bg-[rgba(255,255,255,0.1)] rounded-full overflow-hidden">
              <motion.div 
                className="h-full rounded-full"
                animate={{ width: `${passwordStrength}%`, backgroundColor: getStrengthColor() }}
                transition={{ duration: 0.3 }}
              />
            </div>
            {errors.password && <p className="text-[#EF4444] text-sm mt-1">{errors.password.message}</p>}
          </div>

          <div>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-[#64748B] w-5 h-5 pointer-events-none z-10" />
              <input
                {...register('confirmPassword')}
                type={showPassword ? 'text' : 'password'}
                placeholder="Confirm Password"
                className={`input-field input-field-${variant} input-has-icon-left`}
              />
            </div>
            {errors.confirmPassword && <p className="text-[#EF4444] text-sm mt-1">{errors.confirmPassword.message}</p>}
          </div>

          <div>
            <div className="relative">
              <Hash className="absolute left-4 top-1/2 -translate-y-1/2 text-[#64748B] w-5 h-5 pointer-events-none z-10" />
              <input
                {...register('referralCode')}
                placeholder="Referral Code (Optional)"
                className={`input-field input-field-${variant} input-has-icon-left`}
              />
            </div>
          </div>

          <div className="flex items-start gap-3 py-2">
            <input 
              type="checkbox" 
              {...register('terms')}
              className="mt-1 w-4 h-4 rounded border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.04)]"
            />
            <label className="text-sm text-[#94A3B8]">
              I agree to SureXend's <Link href="#" className="text-white hover:underline">Terms of Service</Link> and <Link href="#" className="text-white hover:underline">Privacy Policy</Link>
            </label>
          </div>
          {errors.terms && <p className="text-[#EF4444] text-sm">{errors.terms.message}</p>}

          <button
            type="submit"
            disabled={isLoading}
            className={`w-full py-4 rounded-xl text-center btn-${variant} flex justify-center items-center mt-4`}
          >
            {isLoading ? (
              <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }} className="w-6 h-6 border-2 border-[#0D0D0D] border-t-transparent rounded-full" />
            ) : (
              'Create Account'
            )}
          </button>
        </form>

        <p className="mt-8 text-center text-[#94A3B8] text-sm">
          Already have an account?{' '}
          <Link href="/auth/login" style={{ color: colors.primary }} className="font-semibold hover:underline">
            Sign in
          </Link>
        </p>
      </motion.div>
    </div>
  )
}
