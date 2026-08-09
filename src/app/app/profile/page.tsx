'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useTheme } from '@/context/ThemeContext'
import { useQuery } from '@tanstack/react-query'
import { userAPI } from '@/lib/api'
import { useRouter } from 'next/navigation'
import {
  User, Shield, Bell, CreditCard, HelpCircle, LogOut,
  ChevronRight, Camera, Edit3, Copy, CheckCircle,
  Fingerprint, Eye, EyeOff, Smartphone, Lock,
  Globe, Moon, Star, Award, Crown, ExternalLink,
  AlertTriangle, Tag
} from 'lucide-react'
import { getInitials } from '@/lib/utils'
import toast from 'react-hot-toast'
import VerifiedCheckmark from '@/components/VerifiedCheckmark'

function MenuSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="w-full mb-4">
      <p className="text-[#64748B] text-[11px] font-bold uppercase tracking-wider px-1 mb-2">{title}</p>
      <div className="glass-card rounded-2xl border border-white/10 overflow-hidden">
        {children}
      </div>
    </div>
  )
}

function MenuItem({
  icon: Icon, label, value, onClick, danger = false, accentHex, accentRgb, badge
}: {
  icon: any; label: string; value?: string; onClick?: () => void;
  danger?: boolean; accentHex: string; accentRgb: string; badge?: string
}) {
  return (
    <button
      className="w-full flex items-center gap-4 px-5 py-4 border-b border-white/5 last:border-0 hover:bg-white/5 active:bg-white/10 transition-colors text-left"
      onClick={onClick}
    >
      <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
        style={danger
          ? { background: 'rgba(239,68,68,0.1)' }
          : { background: `rgba(${accentRgb}, 0.1)` }
        }>
        <Icon size={17} style={{ color: danger ? '#EF4444' : accentHex }} />
      </div>
      <div className="flex-1">
        <p className={`text-sm font-medium ${danger ? 'text-[#EF4444]' : 'text-white'}`}>{label}</p>
        {value && <p className="text-[#64748B] text-xs mt-0.5">{value}</p>}
      </div>
      {badge && (
        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#10B981]/15 text-[#10B981]">
          {badge}
        </span>
      )}
      <ChevronRight size={15} className={danger ? 'text-[#EF4444]/40' : 'text-[#64748B]'} />
    </button>
  )
}

// ── KYC tier badge ─────────────────────────────────────────────────────────
function KYCBadge({ tier }: { tier: number }) {
  const config = [
    { label: 'Unverified', color: '#EF4444', bg: 'rgba(239,68,68,0.1)' },
    { label: 'Tier 1', color: '#F59E0B', bg: 'rgba(245,158,11,0.1)' },
    { label: 'Tier 2', color: '#6366F1', bg: 'rgba(99,102,241,0.1)' },
    { label: 'Tier 3 ✓', color: '#10B981', bg: 'rgba(16,185,129,0.1)' },
  ]
  const cfg = config[tier] || config[0]
  return (
    <span className="px-2.5 py-1 rounded-full text-xs font-semibold"
      style={{ background: cfg.bg, color: cfg.color }}>
      {cfg.label}
    </span>
  )
}

// ══════════════════════════════════════════════════════════════════════════
// PROFILE PAGE
// ══════════════════════════════════════════════════════════════════════════

export default function ProfilePage() {
  const { variant, colors } = useTheme()
  const router = useRouter()
  const isGold = variant === 'gold'
  const accentRgb = isGold ? '212, 160, 23' : '181, 226, 61'
  const accentHex = isGold ? '#D4A017' : '#B5E23D'

  const [copiedId, setCopiedId] = useState(false)
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)

  const { data: profile, isLoading } = useQuery({
    queryKey: ['profile'],
    queryFn: userAPI.getProfile,
  })

  const { data: kycData } = useQuery({
    queryKey: ['kyc'],
    queryFn: userAPI.getKYCStatus,
  })

  const copyUserId = () => {
    if (profile?.id) {
      navigator.clipboard.writeText(profile.id)
      setCopiedId(true)
      toast.success('User ID copied')
      setTimeout(() => setCopiedId(false), 2000)
    }
  }

  const [avatar, setAvatar] = useState<string | null>(null)

  useEffect(() => {
    const saved = localStorage.getItem('surexend_user_avatar')
    if (saved) setAvatar(saved)
  }, [])

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toast.error('File size must be under 5MB')
        return
      }
      const reader = new FileReader()
      reader.onload = (event) => {
        const result = event.target?.result as string
        setAvatar(result)
        localStorage.setItem('surexend_user_avatar', result)
        toast.success('Profile picture updated successfully!')
      }
      reader.readAsDataURL(file)
    }
  }

  const handleLogout = () => {
    localStorage.clear()
    router.push('/auth/login')
  }

  const kycTier = kycData?.tier || 0
  const fullName = `${profile?.firstName || ''} ${profile?.lastName || ''}`.trim()

  return (
    <div className="w-full max-w-full overflow-x-hidden px-3 py-4 sm:p-6 md:p-8 max-w-2xl mx-auto space-y-4 pb-28 sm:pb-32">
      {/* Sleek Single-Line Profile Header with Custom Avatar Upload */}
      <div className="glass-card p-3.5 sm:p-5 rounded-2xl border border-white/10 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 truncate">
          {/* Clean Avatar Display */}
          <div className="w-12 h-12 rounded-full overflow-hidden border-2 border-white/20 shadow-lg bg-[#1E2738] flex-shrink-0">
            {avatar ? (
              <img src={avatar} alt="Profile" className="w-full h-full object-cover" />
            ) : (
              <img src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80" alt="Avatar" className="w-full h-full object-cover" />
            )}
          </div>

          <div className="truncate">
            <div className="flex items-center gap-1.5">
              <h2 className="text-white font-extrabold text-sm sm:text-base truncate">
                {fullName || 'Alex Johnson'}
              </h2>
              {/* Twitter / X style Scalloped Gold/Lemon Verified Rosette */}
              <VerifiedCheckmark size={18} variant={variant} />
              <KYCBadge tier={kycTier} />
            </div>
            <p className="text-[#94A3B8] text-xs font-medium truncate">@alex_xend • alex@example.com</p>
          </div>
        </div>

        {/* Single Sleek Upload Photo Button */}
        <label 
          className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white border border-white/10 flex-shrink-0 cursor-pointer flex items-center gap-1.5 text-xs font-semibold transition-all active:scale-95 shadow-sm"
          title="Upload Custom Profile Picture"
        >
          <Camera className="w-4 h-4 text-emerald-400" />
          <span className="hidden sm:inline">Upload Photo</span>
          <input type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
        </label>
      </div>

      {/* 🏷️ XEND TAG MANAGEMENT CARD */}
      <motion.div 
        className="w-full"
        initial={{ opacity: 0, y: 10 }} 
        animate={{ opacity: 1, y: 0 }} 
        transition={{ delay: 0.05 }}
      >
        <div className="glass-card p-4 rounded-2xl border border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-400">
              <Tag className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[11px] text-[#94A3B8] uppercase font-bold tracking-wider">Your Xend Tag</p>
              <p className="font-mono text-sm font-extrabold text-white">@alex_xend</p>
            </div>
          </div>
          <button 
            onClick={() => { navigator.clipboard.writeText('@alex_xend'); toast.success('Copied Xend Tag @alex_xend!') }}
            className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-white text-xs font-semibold border border-white/10 flex items-center gap-1.5 transition-all"
          >
            <Copy className="w-3.5 h-3.5" /> Copy Tag
          </button>
        </div>
      </motion.div>

      {/* ⬛ BLACK TICK TESTNET & CAMPAIGN BADGE (TWITTER / X STYLE ROUND BADGE - SINGLE LINE) */}
      <div className="glass-card py-2.5 px-3.5 rounded-2xl border border-white/10 flex items-center justify-between gap-2 bg-black/50 text-xs">
        <div className="flex items-center gap-2.5 truncate">
          {/* Twitter / X style perfectly round Black Verified Tick */}
          <div className="w-6 h-6 rounded-full bg-black border border-white/30 flex items-center justify-center text-white font-black text-[11px] shadow-md flex-shrink-0">
            ✓
          </div>
          <div className="flex items-center gap-1.5 truncate">
            <span className="font-extrabold text-white text-xs truncate">Black Tick Member</span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-white/10 text-gray-300 border border-white/10 flex-shrink-0">
              Campaign Winner
            </span>
          </div>
        </div>

        <span className="font-mono font-extrabold text-emerald-400 text-xs flex-shrink-0">
          +500 PTS
        </span>
      </div>

      {/* KYC completion banner (if not fully verified) */}
      {kycTier < 3 && (
        <motion.div
          className="w-full"
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
        >
          <div
            className="rounded-2xl p-4 flex items-center gap-4 border"
            style={{ background: 'rgba(245,158,11,0.06)', borderColor: 'rgba(245,158,11,0.2)' }}
          >
            <div className="w-10 h-10 rounded-xl bg-[#F59E0B]/15 flex items-center justify-center flex-shrink-0">
              <Shield size={18} className="text-[#F59E0B]" />
            </div>
            <div className="flex-1">
              <p className="text-white text-sm font-semibold">Complete Identity Verification</p>
              <p className="text-[#94A3B8] text-xs mt-0.5">
                You are on Tier {kycTier}. Upgrade to unlock higher limits.
              </p>
            </div>
            <button
              className="px-3 py-2 rounded-xl text-xs font-bold text-[#F59E0B]"
              style={{ background: 'rgba(245,158,11,0.12)' }}
              onClick={() => router.push('/app/kyc')}
            >
              Verify
            </button>
          </div>
        </motion.div>
      )}

      <div className="w-full space-y-4">

        <MenuSection title="Account">
          <MenuItem icon={Edit3} label="Edit Profile" value="Update your name & photo"
            accentHex={accentHex} accentRgb={accentRgb}
            onClick={() => router.push('/app/profile/edit')} />
          <MenuItem icon={Shield} label="Identity Verification (KYC)"
            value={`Currently Tier ${kycTier}`}
            badge={kycTier >= 3 ? 'Verified' : `Tier ${kycTier}`}
            accentHex={accentHex} accentRgb={accentRgb}
            onClick={() => router.push('/app/kyc')} />
          <MenuItem icon={CreditCard} label="Bank Accounts" value="Manage withdrawal banks"
            accentHex={accentHex} accentRgb={accentRgb}
            onClick={() => router.push('/app/bank-accounts')} />
        </MenuSection>

        <MenuSection title="Security">
          <MenuItem icon={Lock} label="Change Transaction PIN"
            value="Update your 6-digit PIN"
            accentHex={accentHex} accentRgb={accentRgb}
            onClick={() => router.push('/app/settings/change-pin')} />
          <MenuItem icon={Fingerprint} label="Two-Factor Authentication (2FA)"
            value={profile?.twoFactorEnabled ? 'Enabled via Authenticator' : 'Not enabled — recommended'}
            badge={profile?.twoFactorEnabled ? 'ON' : undefined}
            accentHex={accentHex} accentRgb={accentRgb}
            onClick={() => router.push('/app/settings/2fa')} />
          <MenuItem icon={Smartphone} label="Active Sessions"
            value="View & manage device logins"
            accentHex={accentHex} accentRgb={accentRgb}
            onClick={() => toast('Coming soon')} />
        </MenuSection>

        <MenuSection title="Preferences">
          <MenuItem icon={Bell} label="Notifications" value="Push, email, SMS"
            accentHex={accentHex} accentRgb={accentRgb}
            onClick={() => router.push('/app/settings/notifications')} />
          <MenuItem icon={Globe} label="Currency Display" value="USD"
            accentHex={accentHex} accentRgb={accentRgb}
            onClick={() => toast('Coming soon')} />
        </MenuSection>

        <MenuSection title="About SureXend">
          <MenuItem icon={HelpCircle} label="Help & Support"
            accentHex={accentHex} accentRgb={accentRgb}
            onClick={() => router.push('/app/support')} />
          <MenuItem icon={Star} label="Rate the App"
            accentHex={accentHex} accentRgb={accentRgb}
            onClick={() => toast('Thank you! ⭐')} />
          <MenuItem icon={ExternalLink} label="Privacy Policy"
            accentHex={accentHex} accentRgb={accentRgb}
            onClick={() => window.open('https://surexend.com/privacy', '_blank')} />
          <MenuItem icon={ExternalLink} label="Terms of Service"
            accentHex={accentHex} accentRgb={accentRgb}
            onClick={() => window.open('https://surexend.com/terms', '_blank')} />
        </MenuSection>

        {/* App version */}
        <p className="text-center text-[#334155] text-xs mb-6">
          SureXend v1.0.0 · Built with ❤️ for Africa
        </p>

        <MenuSection title="">
          <MenuItem icon={LogOut} label="Sign Out" danger
            accentHex={accentHex} accentRgb={accentRgb}
            onClick={() => setShowLogoutConfirm(true)} />
        </MenuSection>

        <div className="h-8" />
      </div>

      {/* Logout confirmation */}
      <AnimatePresence>
        {showLogoutConfirm && (
          <>
            <motion.div className="fixed inset-0 bg-black/60 z-40 backdrop-blur-sm"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setShowLogoutConfirm(false)} />
            <motion.div
              className="fixed inset-x-4 bottom-8 z-50 sm:inset-auto sm:bottom-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:w-[380px]"
              initial={{ opacity: 0, y: 50, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 50, scale: 0.95 }}
            >
              <div className="bg-[#0F1629] rounded-3xl p-6 border border-white/8">
                <div className="w-14 h-14 rounded-2xl bg-[#EF4444]/10 flex items-center justify-center mx-auto mb-4">
                  <AlertTriangle size={26} className="text-[#EF4444]" />
                </div>
                <h3 className="text-white font-bold text-lg text-center mb-2">Sign Out?</h3>
                <p className="text-[#94A3B8] text-sm text-center mb-6">
                  You will need to log back in to access your wallet and transactions.
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    className="py-3.5 rounded-xl text-sm font-medium text-[#94A3B8] border border-white/08"
                    onClick={() => setShowLogoutConfirm(false)}
                  >
                    Cancel
                  </button>
                  <button
                    className="py-3.5 rounded-xl text-sm font-bold text-white bg-[#EF4444]/80"
                    onClick={handleLogout}
                  >
                    Sign Out
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}
