'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { useTheme } from '@/context/ThemeContext'
import { useQuery } from '@tanstack/react-query'
import { userAPI } from '@/lib/api'
import { useRouter } from 'next/navigation'
import { Lock, CheckCircle2, Shield } from 'lucide-react'
import toast from 'react-hot-toast'

export default function ChangePinPage() {
  const { variant, colors } = useTheme()
  const isGold = variant === 'gold'
  const accentRgb = isGold ? '212, 160, 23' : '181, 226, 61'
  const router = useRouter()

  const { data: profile } = useQuery({
    queryKey: ['profile'],
    queryFn: userAPI.getProfile,
  })
  const pinAlreadySet = !!profile?.pinSet

  const [currentPin, setCurrentPin] = useState(['', '', '', ''])
  const [newPin, setNewPin] = useState(['', '', '', ''])
  const [confirmPin, setConfirmPin] = useState(['', '', '', ''])
  const [field, setField] = useState<'current' | 'new' | 'confirm'>(pinAlreadySet ? 'current' : 'new')
  const [isLoading, setIsLoading] = useState(false)
  const [done, setDone] = useState(false)

  const pinBoxes = (digits: string[], active: boolean) => (
    <div className="flex justify-center gap-3 my-4">
      {digits.map((d, idx) => (
        <div key={idx} className={`w-11 h-14 rounded-xl border-2 flex items-center justify-center text-2xl font-bold transition-all ${d ? 'border-emerald-500 bg-emerald-500/10' : 'border-white/10 bg-white/5'} ${active ? '' : 'opacity-40'}`}>
          {d ? '•' : ''}
        </div>
      ))}
    </div>
  )

  const handleDigit = (n: string) => {
    if (field === 'new') {
      const i = newPin.findIndex(p => p === '')
      if (i === -1) return
      const next = [...newPin]; next[i] = n; setNewPin(next)
      if (i === 3) setField('confirm')
    } else if (field === 'confirm') {
      const i = confirmPin.findIndex(p => p === '')
      if (i === -1) return
      const next = [...confirmPin]; next[i] = n; setConfirmPin(next)
      if (i === 3) submit(newPin.join(''), next.join(''))
    } else {
      const i = currentPin.findIndex(p => p === '')
      if (i === -1) return
      const next = [...currentPin]; next[i] = n; setCurrentPin(next)
      if (i === 3) setField('new')
    }
  }

  const handleDelete = () => {
    if (field === 'new') {
      const last = newPin.map(p => p !== '').lastIndexOf(true)
      if (last === -1) return
      const next = [...newPin]; next[last] = ''; setNewPin(next)
    } else if (field === 'confirm') {
      const last = confirmPin.map(p => p !== '').lastIndexOf(true)
      if (last === -1) { setField('new'); return }
      const next = [...confirmPin]; next[last] = ''; setConfirmPin(next)
    } else {
      const last = currentPin.map(p => p !== '').lastIndexOf(true)
      if (last === -1) return
      const next = [...currentPin]; next[last] = ''; setCurrentPin(next)
    }
  }

  const submit = async (np: string, cp: string) => {
    if (np !== cp) {
      toast.error('PINs do not match. Try again.')
      setNewPin(['', '', '', '']); setConfirmPin(['', '', '', ''])
      setField('new')
      return
    }
    setIsLoading(true)
    try {
      const current = currentPin.join('')
      if (current) {
        await userAPI.changePin({ currentPin: current, newPin: np })
      } else {
        await userAPI.setupPin(np)
      }
      setDone(true)
      toast.success(current ? 'PIN changed successfully' : 'PIN set up successfully')
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to update PIN')
      setCurrentPin(['', '', '', '']); setNewPin(['', '', '', '']); setConfirmPin(['', '', '', ''])
      setField('new')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="w-full max-w-full overflow-x-hidden px-3 py-4 max-w-md mx-auto flex flex-col pb-28 sm:pb-36">
      <div className="flex items-center gap-2 mb-4">
        <button onClick={() => router.back()} className="text-[#94A3B8] hover:text-white text-sm font-semibold">← Back</button>
      </div>

      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-6 text-center space-y-6 rounded-2xl">
        {done ? (
          <>
            <div className="w-20 h-20 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-12 h-12 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-2xl font-black text-white">PIN Updated!</h2>
              <p className="text-sm text-[#94A3B8] mt-2">Your transaction PIN is now active for conversions, sends, and bill payments.</p>
            </div>
            <button onClick={() => router.push('/app/profile')} className="w-full py-4 rounded-xl font-bold text-black shadow-lg" style={{ background: colors.gradientBg }}>
              Done
            </button>
          </>
        ) : (
          <>
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto" style={{ background: `rgba(${accentRgb}, 0.12)` }}>
              <Lock className="w-6 h-6" style={{ color: colors.primary }} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Set Up Transaction PIN</h2>
              <p className="text-xs text-[#94A3B8] mt-1">
                Your 4-digit PIN protects every conversion, send, and bill payment. It is stored as a secure hash — never plaintext.
              </p>
              {process.env.NEXT_PUBLIC_TESTING_ENABLED === 'true' && !profile?.pinSet && (
                <p className="text-[10px] text-[#F59E0B] font-semibold mt-1">
                  Testing mode: your default PIN is 0000 — set a custom one now or leave it for testing.
                </p>
              )}
            </div>

            {field === 'current' && (
              <>
                <p className="text-sm text-white font-semibold">Current PIN</p>
                {pinBoxes(currentPin, true)}
              </>
            )}
            {field === 'new' && (
              <>
                <p className="text-sm text-white font-semibold">New PIN</p>
                {pinBoxes(newPin, true)}
              </>
            )}
            {field === 'confirm' && (
              <>
                <p className="text-sm text-white font-semibold">Confirm New PIN</p>
                {pinBoxes(confirmPin, true)}
              </>
            )}

            <div className="grid grid-cols-3 gap-3 max-w-[240px] mx-auto">
              {[1,2,3,4,5,6,7,8,9].map(n => (
                <button key={n} onClick={() => handleDigit(n.toString())} disabled={isLoading} className="p-3.5 rounded-2xl bg-white/6 hover:bg-white/12 text-white font-bold text-lg active:scale-95 transition-all disabled:opacity-50">{n}</button>
              ))}
              <button onClick={() => router.back()} className="p-3.5 rounded-2xl bg-white/4 text-[#94A3B8] text-xs font-bold">Cancel</button>
              <button onClick={() => handleDigit('0')} disabled={isLoading} className="p-3.5 rounded-2xl bg-white/6 hover:bg-white/12 text-white font-bold text-lg active:scale-95 transition-all disabled:opacity-50">0</button>
              <button onClick={handleDelete} disabled={isLoading} className="p-3.5 rounded-2xl bg-white/6 text-red-400 font-bold text-lg active:scale-95 transition-all disabled:opacity-50">⌫</button>
            </div>

            <div className="flex items-center gap-2 text-[#64748B] text-[11px]">
              <Shield className="w-3.5 h-3.5" /> Secured with bank-grade encryption (bcrypt)
            </div>
          </>
        )}
      </motion.div>
    </div>
  )
}
