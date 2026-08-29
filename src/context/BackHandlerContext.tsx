'use client'

import React, { createContext, useContext, useEffect, useMemo, useRef, useCallback } from 'react'

interface BackHandler {
  id: number
  priority: number
  handler: () => boolean | Promise<boolean>
}

interface BackHandlerContextValue {
  register: (handler: () => boolean | Promise<boolean>, priority?: number) => () => void
}

const BackHandlerContext = createContext<BackHandlerContextValue | null>(null)

export function BackHandlerProvider({ children }: { children: React.ReactNode }) {
  const handlersRef = useRef(new Map<number, BackHandler>())
  const nextIdRef = useRef(0)
  const restoringHistoryRef = useRef(false)

  const register = useCallback((handler: () => boolean | Promise<boolean>, priority = 0) => {
    const id = ++nextIdRef.current
    handlersRef.current.set(id, { id, priority, handler })

    return () => {
      handlersRef.current.delete(id)
    }
  }, [])

  useEffect(() => {
    const handlePopState = async () => {
      if (restoringHistoryRef.current) {
        restoringHistoryRef.current = false
        return
      }

      const handlers = [...handlersRef.current.values()].sort(
        (a, b) => b.priority - a.priority || b.id - a.id
      )

      for (const entry of handlers) {
        if (await entry.handler()) {
          // popstate fires after the browser moves. Restore the current route
          // when transient UI consumes Back, without fabricating history on mount.
          restoringHistoryRef.current = true
          window.history.forward()
          return
        }
      }
    }

    // Listen for browser back button
    window.addEventListener('popstate', handlePopState)

    // Also handle hardware back button on Android
    const handleBackButton = (e: Event) => {
      e.preventDefault()
      void handlePopState()
    }
    window.addEventListener('backbutton', handleBackButton)

    return () => {
      window.removeEventListener('popstate', handlePopState)
      window.removeEventListener('backbutton', handleBackButton)
    }
  }, [])

  const value = useMemo(() => ({ register }), [register])

  return (
    <BackHandlerContext.Provider value={value}>
      {children}
    </BackHandlerContext.Provider>
  )
}

export function useBackHandler(handler: () => boolean | Promise<boolean>, priority = 0) {
  const context = useContext(BackHandlerContext)
  const handlerRef = useRef(handler)
  handlerRef.current = handler

  useEffect(() => {
    if (!context) return
    return context.register(() => handlerRef.current(), priority)
  }, [context, priority])
}

export function useBackHandlerContext() {
  const context = useContext(BackHandlerContext)
  if (!context) {
    throw new Error('useBackHandlerContext must be used within BackHandlerProvider')
  }
  return context
}
