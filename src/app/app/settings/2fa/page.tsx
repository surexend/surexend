'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { useTheme } from '@/context/ThemeContext'
import { userAPI } from '@/lib/api'
import { useRouter } from 'next/navigation'
import { ShieldCheck, KeyRound, Loader2, CheckCircle2, Lock } from 'lucide-react'
import toast from 'react-hot-toast'

export default function TwoFAPage() {
  const { variant, colors } = useTheme()
  const isGold = variant === 'gold'
  const accentRgb = isGold ? '212, 160, 23' : '181, 226, 61'
  const router = useRouter()

  const [step, setStep] = useState<'start' | 'setup' | 'verify' | 'done'>('start')
  const [secret, setSecret] = useState('')
  const [qrUrl, setQrUrl] = useState('')
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)

  const begin = async () => {
    setLoading(true)
    try {
      const data = await userAPI.setup2FA()
      setSecret(data?.secret || '')
      setQrUrl(data?.qrCodeUrl || '')
      setStep('setup')
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'Could not start 2FA setup')
    } finally {
      setLoading(false)
    }
  }

  const verify = async () => {
    if (code.length !== 6) return toast.error('Enter the 6-digit code from your authenticator app')
    setLoading(true)
    try {
      await userAPI.verify2FA(code)
      setStep('done')
      toast.success('Two-factor authentication enabled')
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'Invalid code — try again')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="w-full max-w-full px-3 py-4 max-w-md mx-auto flex flex-col pb-28 sm:pb-36">
      <div className="flex items-center gap-2 mb-4">
        <button onClick={() => router.back()} className="text-[#94A3B8] hover:text-white text-sm font-semibold">← Back</button>
      </div>

      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="liquid-glass p-5 rounded-2xl space-y-5">
        {step === 'start' && (
          <>
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto" style={{ background: `rgba(${accentRgb}, 0.12)` }}>
              <ShieldCheck className="w-6 h-6" style={{ color: colors.primary }} />
            </div>
            <div className="text-center">
              <h2 className="text-xl font-bold text-white">Two-Factor Authentication</h2>
              <p className="text-xs text-[#94A3B8] mt-1 leading-relaxed">
                Add an extra layer of protection. After enabling, signing in needs both your password and a 6-digit code from your authenticator app.
              </p>
            </div>
            <button
              onClick={begin}
              disabled={loading}
              className="w-full py-3.5 rounded-xl font-bold text-black flex items-center justify-center gap-2 shadow-lg transition-all active:scale-[0.98] disabled:opacity-60"
              style={{ background: colors.gradientBg }}
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
              {loading ? 'Preparing…' : 'Enable 2FA'}
            </button>
          </>
        )}

        {step === 'setup' && (
          <>
            <div className="text-center">
              <h2 className="text-xl font-bold text-white">Scan this QR code</h2>
              <p className="text-xs text-[#94A3B8] mt-1">Open Google Authenticator (or Authy) and scan the code below.</p>
            </div>
            <div className="flex justify-center">
              {qrUrl ? (
                <img src={qrUrl} alt="2FA QR code" className="w-44 h-44 rounded-xl border border-white/10 bg-white p-2" />
              ) : (
                <div className="w-44 h-44 rounded-xl border border-white/10 bg-white/5 flex items-center justify-center text-[#64748B] text-xs">QR unavailable</div>
              )}
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-center">
              <p className="text-[10px] text-[#64748B] uppercase tracking-wider mb-1">Or enter this code manually</p>
              <p className="font-mono font-bold text-white tracking-[0.2em]">{secret}</p>
            </div>
            <button onClick={() => setStep('verify')} className="w-full py-3 rounded-xl font-bold text-black shadow-lg transition-all active:scale-[0.98]" style={{ background: colors.gradientBg }}>
              I&apos;ve scanned it — continue
            </button>
          </>
        )}

        {step === 'verify' && (
          <>
            <div className="text-center">
              <h2 className="text-xl font-bold text-white">Enter the 6-digit code</h2>
              <p className="text-xs text-[#94A3B8] mt-1">Confirm it works by entering the code shown in your authenticator app.</p>
            </div>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              inputMode="numeric"
              placeholder="123456"
              className="w-full text-center text-2xl font-bold tracking-[0.4em] px-4 py-4 rounded-xl bg-white/5 border border-white/10 text-white outline-none focus:border-[rgba(212,160,23,0.5)] transition-colors"
            />
            <button
              onClick={verify}
              disabled={loading}
              className="w-full py-3.5 rounded-xl font-bold text-black flex items-center justify-center gap-2 shadow-lg transition-all active:scale-[0.98] disabled:opacity-60"
              style={{ background: colors.gradientBg }}
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              {loading ? 'Verifying…' : 'Verify & enable'}
            </button>
          </>
        )}

        {step === 'done' && (
          <>
            <div className="w-20 h-20 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-12 h-12 text-emerald-400" />
            </div>
            <div className="text-center">
              <h2 className="text-2xl font-black text-white">2FA Enabled!</h2>
              <p className="text-sm text-[#94A3B8] mt-2">Your account is now protected by a second factor. Keep recovery codes somewhere safe.</p>
            </div>
            <div className="flex items-center gap-2 text-[#64748B] text-[11px] justify-center">
              <Lock className="w-3.5 h-3.5" /> Codes are validated with time-based one-time passwords (TOTP)
            </div>
            <button onClick={() => router.push('/app/profile')} className="w-full py-3.5 rounded-xl font-bold text-black shadow-lg transition-all active:scale-[0.98]" style={{ background: colors.gradientBg }}>
              Done
            </button>
          </>
        )}
      </motion.div>
    </div>
  )
}