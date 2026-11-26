'use client'

import { createContext, useCallback, useContext, useRef, useState } from 'react'

type Toast = { msg: string; undo?: () => void }
const Ctx = createContext<(msg: string, undo?: () => void) => void>(() => undefined)
export const useToast = (): ((msg: string, undo?: () => void) => void) => useContext(Ctx)

/** One quiet status line at the bottom; success updates the UI, the toast only confirms and offers Undo. */
export function ToastProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [t, setT] = useState<Toast | null>(null)
  const timer = useRef<number | undefined>(undefined)
  const show = useCallback((msg: string, undo?: () => void) => {
    setT({ msg, undo })
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setT(null), 4200)
  }, [])
  return (
    <Ctx.Provider value={show}>
      {children}
      <div className={`toast ${t ? 'on' : ''}`} role="status" aria-live="polite">
        {t && <><span>{t.msg}</span>{t.undo && <button onClick={() => { t.undo?.(); setT(null) }}>Undo</button>}</>}
      </div>
    </Ctx.Provider>
  )
}
