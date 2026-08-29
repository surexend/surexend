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
  const suppressNextPopRef = useRef(false)

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
    if (!layer || currentLayerId() !== id || window.location.href !== layer.url) return

    // Programmatic dismissal should remove the matching same-URL history entry.
    suppressNextPopRef.current = true
    window.history.back()
  }, [])

  useEffect(() => {
    const handlePopState = async () => {
      if (suppressNextPopRef.current) {
        suppressNextPopRef.current = false
        return
      }

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
