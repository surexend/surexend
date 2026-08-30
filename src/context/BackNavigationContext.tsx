'use client'

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef } from 'react'

const HISTORY_KEY = '__surexendBackLayer'

interface BackLayer {
  id: number
  priority: number
  url: string
  isActive: () => boolean
  onBack: () => void | Promise<void>
}

interface BackNavigationContextValue {
  register: (layer: Omit<BackLayer, 'id' | 'url'>) => number
  unregister: (id: number) => void
  activate: (id: number) => void
  deactivate: (id: number) => void
}

const BackNavigationContext = createContext<BackNavigationContextValue | null>(null)

function currentLayerId() {
  return window.history.state?.[HISTORY_KEY] as number | undefined
}

export function BackNavigationProvider({ children }: { children: React.ReactNode }) {
  const layersRef = useRef(new Map<number, BackLayer>())
  const nextIdRef = useRef(0)

  const register = useCallback((layer: Omit<BackLayer, 'id' | 'url'>) => {
    const id = ++nextIdRef.current
    layersRef.current.set(id, { ...layer, id, url: window.location.href })
    return id
  }, [])

  const unregister = useCallback((id: number) => {
    layersRef.current.delete(id)
  }, [])

  const activate = useCallback((id: number) => {
    const layer = layersRef.current.get(id)
    if (!layer || currentLayerId() === id) return

    layer.url = window.location.href
    window.history.pushState(
      { ...window.history.state, [HISTORY_KEY]: id },
      '',
      window.location.href
    )
  }, [])

  const deactivate = useCallback((id: number) => {
    const layer = layersRef.current.get(id)
    if (!layer) return

    // ── FIX: replaceState instead of history.back() ───────────────────────
    // history.back() is async: it queues a popstate event on the next tick.
    // If a router navigation is also in flight (e.g. from a modal option
    // button), the popstate fires AFTER the navigation starts, cancelling it.
    //
    // replaceState removes the __surexendBackLayer marker from the current
    // history entry instantly and synchronously, with no events fired.
    // The back-layer guard in the popstate handler then won't match a future
    // hardware-Back press because the marker is gone from history state.
    if (currentLayerId() === id) {
      const { [HISTORY_KEY]: _removed, ...rest } = window.history.state ?? {}
      window.history.replaceState(rest, '', window.location.href)
    }
  }, [])

  useEffect(() => {
    const handlePopState = async () => {
      const candidates = [...layersRef.current.values()]
        .filter((layer) => layer.isActive() && window.location.href === layer.url)
        .sort((a, b) => b.priority - a.priority || b.id - a.id)

      const layer = candidates[0]
      if (!layer) return

      await layer.onBack()

      // Multi-step flows keep owning Back until they reach their root step.
      // Re-arm after React commits the state change, without moving routes.
      window.setTimeout(() => {
        if (layersRef.current.has(layer.id) && layer.isActive() && currentLayerId() !== layer.id) {
          layer.url = window.location.href
          window.history.pushState(
            { ...window.history.state, [HISTORY_KEY]: layer.id },
            '',
            window.location.href
          )
        }
      }, 0)
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  const value = useMemo(
    () => ({ register, unregister, activate, deactivate }),
    [register, unregister, activate, deactivate]
  )

  return (
    <BackNavigationContext.Provider value={value}>
      {children}
    </BackNavigationContext.Provider>
  )
}

export function useBackLayer(active: boolean, onBack: () => void | Promise<void>, priority = 0) {
  const context = useContext(BackNavigationContext)
  const activeRef = useRef(active)
  const onBackRef = useRef(onBack)
  const idRef = useRef<number | null>(null)
  const wasActiveRef = useRef(false)

  activeRef.current = active
  onBackRef.current = onBack

  useEffect(() => {
    if (!context) return

    const id = context.register({
      priority,
      isActive: () => activeRef.current,
      onBack: () => onBackRef.current(),
    })
    idRef.current = id

    return () => {
      context.unregister(id)
      idRef.current = null
    }
  }, [context, priority])

  useEffect(() => {
    if (!context || idRef.current === null) return

    if (active && !wasActiveRef.current) {
      context.activate(idRef.current)
    } else if (!active && wasActiveRef.current) {
      context.deactivate(idRef.current)
    }
    wasActiveRef.current = active
  }, [active, context])
}
