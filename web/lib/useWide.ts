'use client'

import { useSyncExternalStore } from 'react'

const q = '(min-width:960px)'
const subscribe = (cb: () => void): (() => void) => { const m = window.matchMedia(q); m.addEventListener('change', cb); return () => m.removeEventListener('change', cb) }

/** True at desktop width (960px and up), the same breakpoint as the CSS. */
export const useWide = (): boolean => useSyncExternalStore(subscribe, () => window.matchMedia(q).matches, () => false)
