'use client'

import React, { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Eye, EyeOff, User, Mail, Phone, Lock, Hash } from 'lucide-react'
import toast from 'react-hot-toast'
import { authAPI } from '@/lib/api'
import { useTheme } from '@/context/ThemeContext'

const registerSchema = z.object({
  firstName: z.string().min(2, 'First name is required'),
  lastName: z.string().min(2, 'Last name is required'),
  surexTag: z.string()
    .optional()
    .or(z.literal(''))
    .refine(v => !v || /^[a-zA-Z0-9_]{3,20}$/.test(v.replace(/^@/, '')), {
      message: '3-20 characters, letters, numbers or underscores',
    }),
  email: z.string().email('Invalid email address'),
  phone: z.string().min(10, 'Invalid phone number'),
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
      await authAPI.register({
        firstName: data.firstName,
        lastName: data.lastName,
        surexTag: data.surexTag?.trim() || undefined,
        email: data.email,
        phone: '+234' + data.phone.replace(/^0+/, ''),
        password: data.password,
        referralCode: data.referralCode
      })
      toast.success('Registration successful! Please verify your email.')
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
        className="absolute w-96 h-96 rounded-full blur-[120px] pointer-events-none opacity-20"
        style={{ background: colors.glow, top: '-10%', right: '-10%' }}
      />
      
      <motion.div 
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className={`w-full max-w-xl p-8 liquid-glass relative z-10`}
      >
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
                <Phone className="absolute left-4 top-1/2 -translate-y-1/2 text-[#64748B] w-5 h-5 pointer-events-none z-10" />
                <input
                  {...register('phone')}
                  type="tel"
                  placeholder="Phone Number (e.g. 8012345678)"
                  className={`input-field input-field-${variant} input-has-icon-left rounded-l-none`}
                />
              </div>
            </div>
            {errors.phone && <p className="text-[#EF4444] text-sm mt-1">{errors.phone.message}</p>}
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

        <div className="mt-6 flex items-center gap-4">
          <div className="flex-1 h-px bg-[rgba(255,255,255,0.1)]"></div>
          <span className="text-sm text-[#64748B]">or sign up with</span>
          <div className="flex-1 h-px bg-[rgba(255,255,255,0.1)]"></div>
        </div>

        {googleEnabled && (
          <button type="button" onClick={googleLogin} className="w-full mt-6 py-3 rounded-xl border border-[rgba(255,255,255,0.1)] flex items-center justify-center gap-3 hover:bg-[rgba(255,255,255,0.05)] transition-colors">
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
            <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
            <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
          </svg>
          Google
        </button>
        )}

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
