'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { startAuthentication } from '@simplewebauthn/browser'
import { passkeyAPI } from '@/lib/api'

/**
 * Biometric-first transaction approval — the shared version of the pattern
 * that shipped on the bills page.
 *
 * Call `approve()` from a user-gesture handler (the "Confirm / Continue"
 * button). It triggers Face ID / fingerprint (WebAuthn) BEFORE the PIN keypad:
 *
 *   1. `passkeyAPI.listDevices()` — skip straight to the PIN keypad when the
 *      account has no registered credential, so we never flash an unusable OS
 *      prompt (and an offline/failed listing silently drops to PIN too).
 *   2. `approveBegin` → `startAuthentication` → `approveComplete` produces a
 *      one-shot `passkeyToken` that money endpoints accept instead of a PIN.
 *   3. On success `onApproved(passkeyToken)` fires — execute the transaction
 *      with the token and NO pin.
 *   4. Any error (cancelled, no credential, unsupported, network) falls back
 *      to `onFallbackToPin()` — show the PIN keypad.
 *
 * `navigator.credentials.get()` must run inside a transient user activation,
 * so never auto-fire `approve()` from a useEffect for transaction approval.
 *
 * `biometricBusy` gates the confirm button (spinner + disabled) so the prompt
 * cannot be double-triggered while a ceremony is in flight.
 */
export function useBiometricApproval(
  onApproved: (passkeyToken: string) => void,
  onFallbackToPin: () => void,
) {
  const [biometricBusy, setBiometricBusy] = useState(false)

  // Keep the latest callbacks without re-creating `approve` every render, so
  // pages can pass inline closures (they still see fresh state when called).
  const onApprovedRef = useRef(onApproved)
  const onFallbackToPinRef = useRef(onFallbackToPin)
  useEffect(() => {
    onApprovedRef.current = onApproved
    onFallbackToPinRef.current = onFallbackToPin
  }, [onApproved, onFallbackToPin])

  // Re-entrancy guard: a second tap while a ceremony is already running must
  // not fire another OS prompt.
  const busyRef = useRef(false)

  const approve = useCallback(async () => {
    if (busyRef.current) return
    busyRef.current = true
    setBiometricBusy(true)
    try {
      // Skip to PIN if the account has no registered credential (no useless OS prompt).
      const devices = await passkeyAPI.listDevices().catch(() => [] as any[])
      if (!Array.isArray(devices) || devices.length === 0) {
        onFallbackToPinRef.current()
        return
      }
      const options = await passkeyAPI.approveBegin()
      const response = await startAuthentication({ optionsJSON: options })
      const { passkeyToken } = await passkeyAPI.approveComplete(response)
      setBiometricBusy(false)
      onApprovedRef.current(passkeyToken)
      return
    } catch {
      // Cancelled, no credential available, or WebAuthn not supported —
      // fall back to the PIN keypad.
    } finally {
      busyRef.current = false
      setBiometricBusy(false)
    }
    onFallbackToPinRef.current()
  }, [])

  return { approve, biometricBusy }
}

export default useBiometricApproval
