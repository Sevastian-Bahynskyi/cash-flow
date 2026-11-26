'use client'

import { useEffect } from 'react'

/** Registers /sw.js (Ordly's proven pattern): checks for a new deploy every minute, reloads once when one takes over. */
export function PwaRegistration(): null {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    let interval: number | undefined
    const hadController = Boolean(navigator.serviceWorker.controller)
    let reloading = false
    const onControllerChange = (): void => {
      if (!hadController || reloading) return
      reloading = true
      window.location.reload()
    }
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange)
    const register = async (): Promise<void> => {
      try {
        const registration = await navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' })
        interval = window.setInterval(() => { void registration.update().catch(() => undefined) }, 60_000)
      } catch {
        // The PWA shell is optional; the app works without it.
      }
    }
    if (document.readyState === 'complete') void register()
    else window.addEventListener('load', register, { once: true })
    return () => {
      window.removeEventListener('load', register)
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange)
      if (interval) window.clearInterval(interval)
    }
  }, [])
  return null
}
