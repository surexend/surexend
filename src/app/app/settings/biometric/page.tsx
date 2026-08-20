'use client'

import React, { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { useTheme } from '@/context/ThemeContext'
import { ArrowLeft, Fingerprint, Loader2, ShieldCheck, Trash2, MonitorSmartphone, Lock } from 'lucide-react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { passkeyAPI } from '@/lib/api'
import { startRegistration } from '@simplewebauthn/browser'
import BiometricSuccessOverlay from '@/components/BiometricSuccessOverlay'

export default function BiometricPage() {
  const { variant, colors } = useTheme()
  const isGold = variant === 'gold'
  const accentHex = isGold ? '#D4A017' : '#B5E23D'
  const accentRgb = isGold ? '212, 160, 23' : '181, 226, 61'
  const router = useRouter()

  const [supported, setSupported] = useState<boolean | null>(null)
  const [secureContext, setSecureContext] = useState<boolean | null>(null)
  const [devices, setDevices] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [enrolling, setEnrolling] = useState(false)
  const [enrolledFlash, setEnrolledFlash] = useState(false)

  const loadDevices = async () => {
    try {
      const data = await passkeyAPI.listDevices()
      setDevices(Array.isArray(data) ? data : [])
    } catch {
      setDevices([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setSupported(typeof window.PublicKeyCredential !== 'undefined')
      setSecureContext(window.isSecureContext)
    }
    loadDevices()
  }, [])

  const enroll = async () => {
    setEnrolling(true)
    try {
      const options = await passkeyAPI.registerBegin()
      const response = await startRegistration({ optionsJSON: options })
      await passkeyAPI.registerComplete(response)
      setEnrolledFlash(true)
      await new Promise((r) => setTimeout(r, 1500))
      setEnrolledFlash(false)
      toast.success('Biometric added successfully')
      await loadDevices()
    } catch (error: any) {
      toast.error(
        error?.response?.data?.message ||
        (error?.name === 'NotAllowedError' ? 'Registration cancelled' : error?.message || 'Could not add biometric')
      )
    } finally {
      setEnrolling(false)
    }
  }

  const remove = async (id: string) => {
    try {
      await passkeyAPI.removeDevice(id)
      toast.success('Biometric removed')
      await loadDevices()
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'Could not remove biometric')
    }
  }

  const isUnsupported = supported === false || secureContext === false

  return (
    <div className="w-full max-w-full overflow-x-hidden px-3 py-4 max-w-md mx-auto flex flex-col pb-28 sm:pb-36">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
        <button onClick={() => router.push('/app/profile')} className="text-[#94A3B8] hover:text-white text-xs font-semibold flex items-center gap-1">
          <ArrowLeft className="w-4 h-4" /> Back to Profile
        </button>

        <div className="liquid-glass p-6 space-y-5 rounded-2xl">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: `rgba(${accentRgb}, 0.12)` }}>
              <Fingerprint className="w-6 h-6" style={{ color: colors.primary }} />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">Biometrics</h1>
              <p className="text-xs text-[#94A3B8]">Sign in and approve transactions with Face ID or your fingerprint</p>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin" style={{ color: colors.primary }} />
            </div>
          ) : isUnsupported ? (
            <div className="rounded-2xl p-4 border border-white/10 bg-white/[0.02]">
              <div className="flex items-center gap-2 text-amber-400 text-sm font-semibold mb-1">
                <Lock className="w-4 h-4" /> Not available here
              </div>
              <p className="text-xs text-[#94A3B8] leading-relaxed">
                Biometrics need a secure connection (HTTPS or localhost) and a device with a passkey.
                Open SureXend over HTTPS to enable this.
              </p>
            </div>
          ) : (
            <>
              {!secureContext && (
                <div className="rounded-2xl p-4 border border-white/10 bg-white/[0.02]">
                  <p className="text-xs text-[#94A3B8] leading-relaxed">
                    Note: passkeys only work on HTTPS (or localhost). This page will work once the site is served securely.
                  </p>
                </div>
              )}

              <button
                onClick={enroll}
                disabled={enrolling}
                className="w-full py-4 rounded-xl text-center btn font-bold flex justify-center items-center gap-2 disabled:opacity-60"
                style={{ background: colors.gradientBg }}
              >
                {enrolling ? <Loader2 className="w-5 h-5 animate-spin" /> : <Fingerprint className="w-5 h-5" />}
                {enrolling ? 'Follow the prompt to confirm…' : 'Add Face ID or fingerprint'}
              </button>

              <div className="space-y-2">
                <p className="text-xs text-[#94A3B8] font-semibold uppercase tracking-wider">Enrolled devices ({devices.length})</p>
                {devices.length === 0 ? (
                  <p className="text-sm text-[#64748B]">No biometrics yet. Add one above to sign in and approve transactions without typing your PIN.</p>
                ) : (
                  devices.map((d) => (
                    <div key={d.id} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-3.5">
                      <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center flex-shrink-0">
                        <MonitorSmartphone className="w-5 h-5 text-[#94A3B8]" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-white truncate">{d.deviceName || 'My device'}</p>
                        <p className="text-[11px] text-[#64748B]">
                          {d.lastUsedAt ? `Last used ${new Date(d.lastUsedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}` : 'Never used yet'}
                        </p>
                      </div>
                      <button
                        onClick={() => remove(d.id)}
                        className="text-[#64748B] hover:text-red-400 transition-colors p-2"
                        aria-label="Remove biometric"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </>
          )}

          <div className="rounded-2xl p-4 border border-white/5 bg-white/[0.01] flex items-start gap-3">
            <ShieldCheck className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
            <p className="text-[11px] text-[#94A3B8] leading-relaxed">
              Your biometric never leaves your device. We only store a public key from your phone or computer, so a biometric can&apos;t be stolen from our servers.
            </p>
          </div>
        </div>
      </motion.div>
      <BiometricSuccessOverlay show={enrolledFlash} title="Biometric added" subtitle="Unlock faster from now on" />
    </div>
  )
}