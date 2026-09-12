'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { startAuthentication } from '@simplewebauthn/browser'
import { passkeyAPI } from '@/lib/api'

/**
 * Biometric approval is bound to the exact operation the page is about to
 * submit. The server hashes this intent into the one-time approval token and
 * compares it again when the money endpoint executes.
 */
export function useBiometricApproval(
  onApproved: (passkeyToken: string) => void,
  onFallbackToPin: () => void,
  intent: Record<string, unknown>,
) {
  const [biometricBusy, setBiometricBusy] = useState(false)
  const onApprovedRef = useRef(onApproved)
  const onFallbackToPinRef = useRef(onFallbackToPin)
  const intentRef = useRef(intent)
  useEffect(() => {
    onApprovedRef.current = onApproved
    onFallbackToPinRef.current = onFallbackToPin
    intentRef.current = intent
  }, [onApproved, onFallbackToPin, intent])

  const busyRef = useRef(false)

  const approve = useCallback(async () => {
    if (busyRef.current) return
    busyRef.current = true
    setBiometricBusy(true)
    try {
      const devices = await passkeyAPI.listDevices().catch(() => [] as any[])
      if (!Array.isArray(devices) || devices.length === 0) {
        onFallbackToPinRef.current()
        return
      }
      const options = await passkeyAPI.approveBegin(intentRef.current)
      const response = await startAuthentication({ optionsJSON: options })
      const { passkeyToken } = await passkeyAPI.approveComplete(options.challengeId, response)
      onApprovedRef.current(passkeyToken)
      return
    } catch {
      // Cancelled, unavailable, or failed ceremonies fall back to the PIN UI.
    } finally {
      busyRef.current = false
      setBiometricBusy(false)
    }
    onFallbackToPinRef.current()
  }, [])

  return { approve, biometricBusy }
}

export default useBiometricApproval
