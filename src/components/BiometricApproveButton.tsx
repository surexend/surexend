'use client'

import { useState } from 'react'
import { startAuthentication } from '@simplewebauthn/browser'
import { passkeyAPI } from '@/lib/api'
import toast from 'react-hot-toast'
import { Fingerprint } from 'lucide-react'

export default function BiometricApproveButton({
  onApproved,
  accentHex,
  accentRgb,
  disabled,
  label,
}: {
  onApproved: (passkeyToken: string) => void
  accentHex?: string
  accentRgb?: string
  disabled?: boolean
  label?: string
}) {
  const [loading, setLoading] = useState(false)

  const handle = async () => {
    setLoading(true)
    try {
      const options = await passkeyAPI.approveBegin()
      const response = await startAuthentication({ optionsJSON: options })
      const { passkeyToken } = await passkeyAPI.approveComplete(response)
      onApproved(passkeyToken)
    } catch (error: any) {
      toast.error(
        error?.response?.data?.message ||
        (error?.name === 'NotAllowedError' ? 'Biometric approval cancelled' : error?.message || 'Biometric approval failed')
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      type="button"
      onClick={handle}
      disabled={disabled || loading}
      className="mt-3 w-full py-2.5 rounded-xl border border-white/10 bg-white/[0.03] text-white text-xs font-semibold flex items-center justify-center gap-2 hover:bg-white/[0.07] transition-colors disabled:opacity-60"
      style={accentRgb ? { boxShadow: `inset 0 0 0 1px rgba(${accentRgb}, 0.15)` } : undefined}
    >
      <Fingerprint className="w-4 h-4" style={accentHex ? { color: accentHex } : undefined} />
      {loading ? 'Checking your biometric…' : (label || 'Use Face ID or fingerprint instead')}
    </button>
  )
}