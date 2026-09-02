'use client'

/**
 * Send-from source picker — SureX Tag transfers (/app/send).
 *
 * Replaces the old native <select> with a premium account picker:
 *   • compact "Send from" card in the form (icon, name, code, balance, chevron)
 *   • bottom sheet on phones, viewport-anchored popover from tablet width up
 *   • grouped mini account cards: Digital balance (USDC only) + held Local
 *     balances, each with balance + selected checkmark
 *
 * Performance contract (budget Android devices):
 *   – no backdrop-filter / blur / animated gradients — solid surfaces, 1px
 *     borders and small static shadows only (see the .sfp-* rules in globals.css)
 *   – the dialog DOM is rendered only while open; motion is opacity/transform
 *     only, ~190ms, no springs, and disabled under prefers-reduced-motion
 *   – one trigger rect measurement on open (plus a resize listener that only
 *     exists while open); no polling, timers or scroll listeners
 *   – selecting performs a single parent state update and closes the picker
 *
 * Accessibility: the trigger is a labelled combobox-style button; the panel is
 * a modal listbox with grouped options, full arrow/Home/End keyboard support,
 * Escape and tap-outside to close, a Tab focus trap and focus restoration.
 */

import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Check, ChevronDown, Landmark, X } from 'lucide-react'
import CurrencyFlag from '@/components/CurrencyFlag'
import { useTheme } from '@/context/ThemeContext'
import { useBackLayer } from '@/context/BackNavigationContext'
import { currencySymbol, formatAmount } from '@/lib/utils'

export type SendFromAssetKind = 'digital' | 'local'

export interface SendFromAsset {
  code: string
  label?: string
  balance: number
  /** 'digital' = USDC-style crypto balance, 'local' = held local currency. */
  kind?: SendFromAssetKind
  /** Human name, e.g. "Nigerian Naira". Digital assets fall back to their code. */
  name?: string
  symbol?: string
  country?: string
  countryCode?: string
  flag?: string
}

/** Display name: "USDC" for digital, "Nigerian Naira" for local balances. */
export function sendFromAssetName(asset?: SendFromAsset | null): string {
  if (!asset) return ''
  if (asset.kind === 'local') return asset.name || asset.code
  return asset.code
}

/** Mirrors the send page's amount convention (USDC renders with "$"). */
function formatAssetBalance(asset: SendFromAsset): string {
  const code = (asset.code || '').toUpperCase()
  const symbol = ['USD', 'USDC', 'USDT'].includes(code) ? '$' : (asset.symbol || currencySymbol(code) || `${code} `)
  return `${symbol}${formatAmount(asset.balance)}`
}

/** Icon slot: brand monogram for USDC, currency flag for local balances. */
export function SendFromBadge({
  asset,
  accent,
  glowRgb,
  size = 40,
}: {
  asset?: SendFromAsset | null
  accent: string
  glowRgb: string
  size?: number
}) {
  const className = size >= 44 ? 'sfp-icon sfp-icon--lg' : 'sfp-icon'
  if (asset && asset.kind === 'local' && (asset.countryCode || asset.flag)) {
    return (
      <span className={className} aria-hidden="true">
        <CurrencyFlag countryCode={asset.countryCode} emoji={asset.flag} size={Math.round(size * 0.62)} />
      </span>
    )
  }
  // Digital balances get the brand-tinted "$" monogram; anything without a flag
  // falls back to a small code monogram so no balance ever loses its identity.
  const glyph = asset && asset.kind !== 'local' ? '$' : asset?.code || '$'
  return (
    <span
      className={glyph.length > 1 ? `${className} sfp-icon--code` : className}
      aria-hidden="true"
      style={{
        background: `rgba(${glowRgb}, 0.14)`,
        borderColor: `rgba(${glowRgb}, 0.4)`,
        color: accent,
      }}
    >
      {glyph}
    </span>
  )
}

interface PanelPlacement {
  mode: 'below' | 'above'
  top: number
  bottom: number
  left: number
  width: number
  maxHeight: number
}

interface SendFromPickerProps {
  assets: SendFromAsset[]
  value: string
  onChange: (code: string) => void
  /** True while balances are still loading (rows stay enabled, amounts show "—"). */
  loading?: boolean
  label?: string
}

export default function SendFromPicker({
  assets,
  value,
  onChange,
  loading = false,
  label = 'Send from',
}: SendFromPickerProps) {
  const { colors } = useTheme()
  const reduceMotion = useReducedMotion()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const restoreFocusRef = useRef<HTMLElement | null>(null)

  const [open, setOpen] = useState(false)
  const [placement, setPlacement] = useState<PanelPlacement | null>(null)

  const titleId = useId()
  const labelId = useId()
  const listboxId = useId()
  const digitalGroupId = useId()
  const localGroupId = useId()

  const digitalAssets = useMemo(
    () => assets.filter((asset) => (asset.kind ?? 'digital') !== 'local'),
    [assets]
  )
  const localAssets = useMemo(() => assets.filter((asset) => asset.kind === 'local'), [assets])
  const selected = useMemo(() => assets.find((asset) => asset.code === value) || assets[0], [assets, value])
  const selectableCount = useMemo(
    () => (loading ? assets.length : assets.filter((asset) => asset.balance > 0).length),
    [assets, loading]
  )

  // Android hardware back closes the sheet before the multi-step back handler.
  useBackLayer(open, () => setOpen(false), 40)

  // One rect measurement per open (and on window resize while open) — enough to
  // anchor the desktop popover. No scroll tracking, no continuous measurement.
  const measure = useCallback(() => {
    const el = triggerRef.current
    if (!el || typeof window === 'undefined') return
    const rect = el.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    const gap = 10
    const edge = 12
    const width = Math.min(Math.max(Math.round(rect.width), 300), 420)
    const left = Math.min(Math.max(edge, Math.round(rect.left)), Math.max(edge, vw - width - edge))
    const roomBelow = vh - rect.bottom - gap - edge
    const roomAbove = rect.top - gap - edge
    if (roomBelow >= 240 || roomBelow >= roomAbove) {
      setPlacement({
        mode: 'below',
        top: Math.round(rect.bottom + gap),
        bottom: 0,
        left,
        width,
        maxHeight: Math.max(180, Math.min(460, roomBelow)),
      })
    } else {
      setPlacement({
        mode: 'above',
        top: 0,
        bottom: Math.round(vh - rect.top + gap),
        left,
        width,
        maxHeight: Math.max(180, Math.min(460, roomAbove)),
      })
    }
  }, [])

  useEffect(() => {
    if (!open) return
    const onResize = () => measure()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [open, measure])

  // Move focus into the sheet on open and hand it back to the trigger on close.
  useEffect(() => {
    if (!open) return
    restoreFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    const options = panelRef.current?.querySelectorAll<HTMLElement>('[role="option"]:not([disabled])')
    const target =
      options && options.length > 0
        ? Array.from(options).find((el) => el.getAttribute('aria-selected') === 'true') || options[0]
        : panelRef.current || null
    target?.focus({ preventScroll: true })
    return () => {
      restoreFocusRef.current?.focus?.({ preventScroll: true })
      restoreFocusRef.current = null
    }
  }, [open])

  const openPicker = useCallback(() => {
    measure()
    setOpen(true)
  }, [measure])

  const close = useCallback(() => setOpen(false), [])

  // One clean state update in the parent, then close — no intermediate churn.
  const handleSelect = useCallback(
    (asset: SendFromAsset) => {
      if (!loading && asset.balance <= 0) return
      onChange(asset.code)
      setOpen(false)
    },
    [loading, onChange]
  )

  const handlePanelKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        close()
        return
      }
      if (event.key === 'Tab') {
        // Simple focus trap so Tab never escapes the open dialog.
        const focusables = Array.from(
          panelRef.current?.querySelectorAll<HTMLElement>('button:not([disabled])') || []
        )
        if (focusables.length === 0) return
        const first = focusables[0]
        const last = focusables[focusables.length - 1]
        const active = document.activeElement
        const inside = !!active && !!panelRef.current?.contains(active)
        if (event.shiftKey && (!inside || active === first)) {
          event.preventDefault()
          last.focus({ preventScroll: true })
        } else if (!event.shiftKey && (!inside || active === last)) {
          event.preventDefault()
          first.focus({ preventScroll: true })
        }
        return
      }
      const isNavigation =
        event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Home' || event.key === 'End'
      if (!isNavigation) return
      event.preventDefault()
      const options = Array.from(
        panelRef.current?.querySelectorAll<HTMLElement>('[role="option"]:not([disabled])') || []
      )
      if (options.length === 0) return
      const currentIndex = options.indexOf(document.activeElement as HTMLElement)
      let nextIndex = 0
      if (event.key === 'ArrowDown') nextIndex = (currentIndex + 1) % options.length
      else if (event.key === 'ArrowUp') nextIndex = currentIndex <= 0 ? options.length - 1 : currentIndex - 1
      else if (event.key === 'Home') nextIndex = 0
      else nextIndex = options.length - 1
      options[nextIndex]?.focus({ preventScroll: true })
    },
    [close]
  )

  const accentStyle = useMemo(
    () =>
      ({
        '--sfp-accent': colors.primary,
        '--sfp-accent-soft': `rgba(${colors.glowRgb}, 0.12)`,
        '--sfp-accent-border': `rgba(${colors.glowRgb}, 0.5)`,
      }) as React.CSSProperties,
    [colors.primary, colors.glowRgb]
  )

  const placementStyle = useMemo(
    () =>
      (placement
        ? {
            '--pf-top': placement.mode === 'below' ? `${placement.top}px` : 'auto',
            '--pf-bottom': placement.mode === 'above' ? `${placement.bottom}px` : 'auto',
            '--pf-left': `${placement.left}px`,
            '--pf-width': `${placement.width}px`,
            '--pf-max-h': `${placement.maxHeight}px`,
          }
        : {}) as React.CSSProperties,
    [placement]
  )

  const slide = reduceMotion ? 0 : 24

  const renderRow = (asset: SendFromAsset) => {
    const isSelected = !!selected && asset.code === selected.code
    const noBalance = !loading && asset.balance <= 0
    return (
      <button
        key={asset.code}
        type="button"
        role="option"
        aria-selected={isSelected}
        aria-disabled={noBalance}
        disabled={noBalance}
        data-selected={isSelected}
        className="sfp-row"
        onClick={() => handleSelect(asset)}
      >
        <SendFromBadge asset={asset} accent={colors.primary} glowRgb={colors.glowRgb} />
        <span className="sfp-row__body">
          <span className="sfp-row__name">{sendFromAssetName(asset)}</span>
          <span className="sfp-row__meta">
            {asset.kind === 'local' && <span className="sfp-chip">{asset.code}</span>}
            <span>{noBalance ? 'No balance available yet' : 'Instant · Zero fee'}</span>
          </span>
        </span>
        <span className="sfp-row__right">
          <span className="sfp-row__amount">{loading ? '—' : formatAssetBalance(asset)}</span>
          {!noBalance && <span className="sfp-row__caption">{loading ? 'Loading' : 'Available'}</span>}
        </span>
        {isSelected && (
          <span className="sfp-check" style={{ background: colors.primary }}>
            <Check className="w-3 h-3" strokeWidth={3} />
          </span>
        )}
      </button>
    )
  }

  const selectedHasBalance = !!selected && (loading || selected.balance > 0)

  return (
    <div style={accentStyle}>
      <span id={labelId} className="sfp-label">
        {label}
      </span>
      <button
        ref={triggerRef}
        type="button"
        className="sfp-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-labelledby={labelId}
        aria-controls={open ? listboxId : undefined}
        onClick={() => (open ? close() : openPicker())}
      >
        <SendFromBadge asset={selected} accent={colors.primary} glowRgb={colors.glowRgb} size={44} />
        <span className="sfp-trigger__body">
          <span className="sfp-trigger__name">
            {selected ? `${sendFromAssetName(selected)} balance` : 'Select a balance'}
          </span>
          <span className="sfp-trigger__meta">
            {selected
              ? `${selected.code} · ${selected.kind === 'local' ? 'Local balance' : 'Digital balance'}`
              : 'USDC and local balances'}
          </span>
        </span>
        <span className="sfp-trigger__right">
          <span className="sfp-trigger__amount">
            {loading ? '—' : selected ? formatAssetBalance(selected) : ''}
          </span>
          <span className="sfp-trigger__caption">
            {loading ? 'Loading' : selectedHasBalance ? 'Available' : 'No balance'}
          </span>
        </span>
        <ChevronDown className={`sfp-trigger__chevron${open ? ' is-open' : ''}`} aria-hidden="true" />
      </button>

      {createPortal(
        <AnimatePresence>
          {open && (
            <motion.div
              key="sfp-scrim"
              className="sfp-scrim"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reduceMotion ? 0 : 0.15, ease: 'easeOut' }}
              onMouseDown={(event) => {
                if (event.target === event.currentTarget) close()
              }}
            />
          )}
          {open && (
            <motion.div
              key="sfp-panel"
              ref={panelRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              tabIndex={-1}
              className="sfp-panel"
              style={{ ...accentStyle, ...placementStyle }}
              initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: slide }}
              animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: slide }}
              transition={{ duration: reduceMotion ? 0 : 0.19, ease: 'easeOut' }}
              onKeyDown={handlePanelKeyDown}
            >
              <div className="sfp-handle" aria-hidden="true" />
              <header className="sfp-panel__header">
                <div className="min-w-0">
                  <h2 id={titleId} className="sfp-panel__title">
                    Send from
                  </h2>
                  <p className="sfp-panel__subtitle">
                    {loading ? 'Loading your balances…' : 'Choose the balance to send from'}
                  </p>
                </div>
                <button type="button" className="sfp-close" aria-label="Close" onClick={close}>
                  <X className="w-4 h-4" />
                </button>
              </header>

              <div className="sfp-list" role="listbox" id={listboxId} aria-labelledby={labelId}>
                {digitalAssets.length > 0 && (
                  <div role="group" aria-labelledby={digitalGroupId}>
                    <div className="sfp-group-label">
                      <span id={digitalGroupId}>Digital balance</span>
                      <span className="sfp-group-note">USDC only</span>
                    </div>
                    {digitalAssets.map(renderRow)}
                  </div>
                )}
                {localAssets.length > 0 ? (
                  <div role="group" aria-labelledby={localGroupId}>
                    <div className="sfp-group-label">
                      <span id={localGroupId}>Local balances</span>
                      <span className="sfp-group-note">Stays in its currency</span>
                    </div>
                    {localAssets.map(renderRow)}
                  </div>
                ) : (
                  <div>
                    <div className="sfp-group-label">
                      <span id={localGroupId}>Local balances</span>
                    </div>
                    <div className="sfp-empty">
                      <Landmark className="w-4 h-4 flex-none mt-0.5" style={{ color: colors.primary }} />
                      <div>
                        <p className="sfp-empty__title">No local balances yet</p>
                        <p className="sfp-empty__body">
                          Balances you hold in NGN, KES, GHS, ZAR and other supported currencies appear
                          here.
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {!loading && selectableCount === 0 && (
                <p className="sfp-hint">Top up a balance to send to a SureX Tag.</p>
              )}
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </div>
  )
}
