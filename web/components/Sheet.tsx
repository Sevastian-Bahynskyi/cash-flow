'use client'

import { useEffect, useRef } from 'react'
import { Icon } from './Icon'

/**
 * The one sheet: full screen on a phone, a centred dialog on desktop. Escape and the scrim close it,
 * focus stays inside, the page behind does not scroll (tells.md S2).
 */
export function Sheet({ open, onClose, title, label, right, children }: { open: boolean; onClose: () => void; title?: string; label?: string; right?: React.ReactNode; children: React.ReactNode }): React.JSX.Element | null {
  const ref = useRef<HTMLElement>(null)
  useEffect(() => {
    if (!open) return
    const prev = document.activeElement as HTMLElement | null
    const html = document.documentElement
    const overflow = html.style.overflow
    html.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose() }
      if (e.key !== 'Tab' || !ref.current) return
      const f = [...ref.current.querySelectorAll<HTMLElement>('button:not([disabled]),input,textarea,select,[tabindex="0"]')]
      if (!f.length) return
      const i = f.indexOf(document.activeElement as HTMLElement)
      if (e.shiftKey && i <= 0) { f[f.length - 1]?.focus(); e.preventDefault() } else if (!e.shiftKey && i === f.length - 1) { f[0]?.focus(); e.preventDefault() }
    }
    document.addEventListener('keydown', onKey)
    if (!ref.current?.contains(document.activeElement)) ref.current?.querySelector<HTMLElement>('[data-autofocus],input,button')?.focus({ preventScroll: true })
    return () => { document.removeEventListener('keydown', onKey); html.style.overflow = overflow; prev?.focus?.({ preventScroll: true }) }
  }, [open, onClose])
  if (!open) return null
  return (
    <>
      <div className="scrim on" onClick={onClose} />
      <section ref={ref} className="sheet on" role="dialog" aria-modal="true" aria-label={label ?? title}>
        <div className="in">
          {title !== undefined && <div className="bar" style={{ display: 'grid' }}><button className="iconbtn" onClick={onClose} aria-label="Close"><Icon name="close" /></button><h1>{title}</h1>{right ?? <span />}</div>}
          {children}
        </div>
      </section>
    </>
  )
}
