'use client'

import { useState } from 'react'
import { Icon } from '@/components/Icon'
import { useToast } from '@/components/Toast'
import { useStore, write } from '@/lib/data/store'
import type { TableName } from '@/lib/data/types'
import { ICON_GROUPS } from '@/lib/icons'

const CATEGORY_ICONS = ICON_GROUPS.find((g) => g[0] === 'Categories')?.[1] ?? []

/** Our icon set for categories and savings; stores our names (legacy names still resolve when shown). */
export function IconPick({ value, onPick, extra = [] }: { value: string; onPick: (name: string) => void; extra?: [string, string][] }): React.JSX.Element {
  return (
    <div className="field" role="group" aria-label="Icon"><span>Icon</span>
      <div className="icongrid">{[...extra, ...CATEGORY_ICONS].map(([n, l]) => <button type="button" key={n} aria-label={l} aria-pressed={value === n} onClick={() => onPick(n)}><Icon name={n} /></button>)}</div>
    </div>
  )
}

export function Toggle({ on, onChange, label, sub }: { on: boolean; onChange: (v: boolean) => void; label: string; sub?: string }): React.JSX.Element {
  return <button type="button" className="sw" role="switch" aria-checked={on} onClick={() => onChange(!on)}><span>{label}{sub ? <small>{sub}</small> : null}</span><i aria-hidden="true" /></button>
}

export function Seg<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: [T, string][]; label: string }): React.JSX.Element {
  return <div className="seg" role="group" aria-label={label}>{options.map(([v, l]) => <button type="button" key={v} aria-pressed={value === v} onClick={() => onChange(v)}>{l}</button>)}</div>
}

/** Inline "are you sure" inside a sheet; the first tap on Delete… only asks. */
export function DeleteAsk({ what, busy, onYes, onNo }: { what: string; busy: boolean; onYes: () => void; onNo: () => void }): React.JSX.Element {
  return (
    <div className="linkrow askdel" role="alert">
      <span>Delete {what}? This can’t be undone.</span>
      <button type="button" className="btn ghost" onClick={onNo}>Cancel</button>
      <button type="button" className="btn danger" disabled={busy} onClick={onYes}>Delete</button>
    </div>
  )
}

/** A money field that keeps what was typed; the caller parses on save. */
export function AmountField({ label, value, onChange, error, hint, id }: { label: string; value: string; onChange: (v: string) => void; error?: string | null; hint?: string; id: string }): React.JSX.Element {
  return (
    <label className="field" htmlFor={id}><span>{label}</span>
      <input id={id} className="amtin" inputMode="decimal" enterKeyHint="done" autoComplete="off" placeholder="0" value={value} onChange={(e) => onChange(e.target.value)} aria-invalid={Boolean(error)} />
      {hint ? <span className="hint">{hint}</span> : null}
      {error ? <span className="err2">{error}</span> : null}
    </label>
  )
}
export const AMOUNT_ERR = 'Type an amount, like 1500 or 89,50.'

/**
 * Runs writes for a sheet: one busy flag, one inline error, a toast on success.
 * Each step goes through `write`, so offline and FK errors read the same everywhere.
 */
export function useSaver(): { busy: boolean; err: string | null; setErr: (e: string | null) => void; save: (msg: string, steps: [TableName[], () => PromiseLike<{ error: { message: string; code?: string } | null }>][]) => Promise<boolean> } {
  const store = useStore()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const save = async (msg: string, steps: [TableName[], () => PromiseLike<{ error: { message: string; code?: string } | null }>][]): Promise<boolean> => {
    setBusy(true); setErr(null)
    try {
      for (const [tables, run] of steps) await write(store, tables, run)
      toast(msg)
      return true
    } catch (e) {
      const m = e instanceof Error ? e.message : ''
      // write() already words offline, in-use and duplicate errors; anything else is a raw server message.
      setErr(/^(You’re|It’s|That)/.test(m) ? m : `Not saved. ${m || 'Try again.'}`)
      return false
    } finally { setBusy(false) }
  }
  return { busy, err, setErr, save }
}

export const FormErr = ({ err }: { err: string | null }): React.JSX.Element | null => err ? <div className="err" role="alert"><span>{err}</span></div> : null
