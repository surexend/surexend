'use client'

import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react'

interface BackHandler {
  id: number
  priority: number
  handler: () => boolean | Promise<boolean>
}

interface BackHandlerContextValue {
  register: (handler: () => boolean | Promise<boolean>, priority?: number) => () => void
  unregister: (id: number) => void
}

const BackHandlerContext = createContext<BackHandlerContextValue | null>(null)

let handlerIdCounter = 0

export function BackHandlerProvider({ children }: { children: React.ReactNode }) {
  const [handlers, setHandlers] = useState<BackHandler[]>([])
  const isHandling = useRef(false)

  const register = useCallback((handler: () => boolean | Promise<boolean>, priority = 0) => {
    const id = ++handlerIdCounter
    const newHandler: BackHandler = { id, priority, handler }
    
    setHandlers(prev => {
      const updated = [...prev, newHandler].sort((a, b) => b.priority - a.priority)
      return updated
    })

    return () => {
      setHandlers(prev => prev.filter(h => h.id !== id))
    }
  }, [])

  const unregister = useCallback((id: number) => {
    setHandlers(prev => prev.filter(h => h.id !== id))
  }, [])

  useEffect(() => {
    const handlePopState = async () => {
      if (isHandling.current || handlers.length === 0) return

      // Get highest priority handler
      const handler = handlers[0]
      if (!handler) return

      isHandling.current = true
      try {
        const handled = await handler.handler()
        if (!handled && handlers.length > 1) {
          // If not handled, try next handler
          for (let i = 1; i < handlers.length; i++) {
            const nextHandled = await handlers[i].handler()
            if (nextHandled) break
          }
        }
      } finally {
        isHandling.current = false
      }
    }

    // Listen for browser back button
    window.addEventListener('popstate', handlePopState)

    // Also handle hardware back button on Android
    const handleBackButton = (e: Event) => {
      e.preventDefault()
      handlePopState()
    }
    window.addEventListener('backbutton', handleBackButton)

    return () => {
      window.removeEventListener('popstate', handlePopState)
      window.removeEventListener('backbutton', handleBackButton)
    }
  }, [handlers])

  // Push a dummy state on mount so there's always something to pop
  // Disabled — was interfering with Next.js client-side navigation
  // useEffect(() => {
  //   if (typeof window !== 'undefined') {
  //     window.history.pushState({ surexend: Date.now() }, '')
  //   }
  // }, [])

  return (
    <BackHandlerContext.Provider value={{ register, unregister }}>
      {children}
    </BackHandlerContext.Provider>
  )
}

export function useBackHandler(handler: () => boolean | Promise<boolean>, priority = 0, deps: React.DependencyList = []) {
  const context = useContext(BackHandlerContext)
  if (!context) {
    // During SSR/static generation, context may not be available
    // Return a no-op cleanup function
    return () => {}
  }

  useEffect(() => {
    const unregister = context.register(handler, priority)
    return unregister
  }, [context, priority, ...deps])
}

export function useBackHandlerContext() {
  const context = useContext(BackHandlerContext)
  if (!context) {
    return { register: () => () => {}, unregister: () => {} }
  }
  return context
}