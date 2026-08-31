'use client'

import { useState, useRef, useEffect } from 'react'
import { motion } from 'framer-motion'
import { useTheme } from '@/context/ThemeContext'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { userAPI } from '@/lib/api'
import { useRouter } from 'next/navigation'
import { UserRound, Loader2, Save } from 'lucide-react'
import toast from 'react-hot-toast'

export default function EditProfilePage() {
  const { variant, colors } = useTheme()
  const isGold = variant === 'gold'
  const accentRgb = isGold ? '212, 160, 23' : '181, 226, 61'
  const router = useRouter()
  const queryClient = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)

  const { data: profile } = useQuery({ queryKey: ['profile'], queryFn: userAPI.getProfile })

  const [firstName, setFirstName] = useState(profile?.firstName || '')
  const [lastName, setLastName] = useState(profile?.lastName || '')
  const [avatar, setAvatar] = useState<string | null>(profile?.avatar || null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!profile) return
    setFirstName(profile.firstName || '')
    setLastName(profile.lastName || '')
    setAvatar(profile.avatar || localStorage.getItem('surexend_user_avatar'))
  }, [profile])

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) return toast.error('Please choose an image file')
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = String(reader.result)
      setAvatar(dataUrl)
      localStorage.setItem('surexend_user_avatar', dataUrl)
      toast.success('Avatar selected — save to keep it')
    }
    reader.readAsDataURL(file)
  }

  const save = async () => {
    if (!firstName.trim()) return toast.error('First name is required')
    setSaving(true)
    try {
      await userAPI.updateProfile({ firstName: firstName.trim(), lastName: lastName.trim(), avatar: avatar || undefined })
      queryClient.invalidateQueries({ queryKey: ['profile'] })
      toast.success('Profile updated')
      router.push('/app/profile')
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'Could not update profile')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="w-full max-w-full px-3 py-4 max-w-md mx-auto flex flex-col pb-28 sm:pb-36">
      <div className="flex items-center gap-2 mb-4">
        <button onClick={() => router.back()} className="text-[#94A3B8] hover:text-white text-sm font-semibold">← Back</button>
      </div>

      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="liquid-glass p-5 rounded-2xl space-y-5">
        <div className="text-center">
          <div className="w-20 h-20 rounded-full overflow-hidden border-2 mx-auto mb-3" style={{ borderColor: `rgba(${accentRgb}, 0.5)`, background: '#212429' }}>
            {avatar ? (
              <img src={avatar} alt="Avatar" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <UserRound className="w-9 h-9 text-[#64748B]" />
              </div>
            )}
          </div>
          <button
            onClick={() => fileRef.current?.click()}
            className="text-xs font-bold px-3 py-1.5 rounded-full border transition-all active:scale-95"
            style={{ color: colors.primary, borderColor: `rgba(${accentRgb}, 0.4)`, background: `rgba(${accentRgb}, 0.1)` }}
          >
            Change photo
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile} />
        </div>

        <div>
          <label className="text-[11px] font-semibold text-[#94A3B8] uppercase tracking-wider">First name</label>
          <input
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            placeholder="First name"
            className="mt-1 w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none focus:border-[rgba(212,160,23,0.5)] transition-colors"
          />
        </div>

        <div>
          <label className="text-[11px] font-semibold text-[#94A3B8] uppercase tracking-wider">Last name</label>
          <input
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            placeholder="Last name"
            className="mt-1 w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none focus:border-[rgba(212,160,23,0.5)] transition-colors"
          />
        </div>

        <div>
          <label className="text-[11px] font-semibold text-[#94A3B8] uppercase tracking-wider">SureXend tag</label>
          <input
            value={profile?.surexTag || ''}
            disabled
            className="mt-1 w-full px-4 py-3 rounded-xl bg-white/3 border border-white/5 text-[#64748B] text-sm outline-none cursor-not-allowed"
          />
          <p className="text-[10px] text-[#64748B] mt-1">Your tag is permanent and can&apos;t be changed.</p>
        </div>

        <button
          onClick={save}
          disabled={saving}
          className="w-full py-3.5 rounded-xl font-bold text-black flex items-center justify-center gap-2 shadow-lg transition-all active:scale-[0.98] disabled:opacity-60"
          style={{ background: colors.gradientBg }}
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </motion.div>
    </div>
  )
}
