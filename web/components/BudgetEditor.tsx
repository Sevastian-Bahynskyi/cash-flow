'use client'

import { useState } from 'react'
import { Sheet } from './Sheet'
import { useToast } from './Toast'
import { useStore, write } from '@/lib/data/store'
import type { Cycle } from '@/lib/data/model'
import { supabase } from '@/lib/supabase/client'
import { kr, minorToInput, parseAmount } from '@/lib/fmt'
import type { BudgetRow, CategoryRow } from '@/lib/data/types'

/** Sets one category's budget for one salary cycle, with notes (**bold** works). Empty or 0 removes it. */
export function BudgetEditor({ cat, cycle, budget, spent, last, onClose }: { cat: CategoryRow; cycle: Cycle; budget?: BudgetRow; spent: number; last: number; onClose: () => void }): React.JSX.Element {
  const store = useStore()
  const toast = useToast()
  const [amt, setAmt] = useState(budget ? minorToInput(budget.amount_minor) : '')
  const [notes, setNotes] = useState(budget?.notes ?? '')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  async function save(remove = false): Promise<void> {
    const minor = remove || !amt.trim() ? 0 : parseAmount(amt)
    if (minor === null) { setErr('Type an amount, like 1500 or 89,50.'); return }
    if (!store.userId) return
    setBusy(true); setErr(null)
    try {
      if (minor === 0) { if (budget) await write(store, ['budgets'], () => supabase().from('budgets').delete().eq('id', budget.id)) }
      else await write(store, ['budgets'], () => supabase().from('budgets').upsert({ user_id: store.userId, category_id: cat.id, salary_cycle_id: cycle.id, amount_minor: minor, notes: notes.trim() || null }, { onConflict: 'user_id,category_id,salary_cycle_id' }))
      toast(minor ? `${cat.name}: ${kr(minor, true)} this cycle` : `${cat.name} keeps no budget now`)
      onClose()
    } catch (e) { setErr(e instanceof Error ? e.message : 'Not saved.') } finally { setBusy(false) }
  }
  return (
    <Sheet open onClose={onClose} title={`${cat.name} budget`}>
      <p className="note" style={{ padding: '4px 4px 14px' }}>{kr(spent, true)} spent in the {cycle.name} cycle{last ? `, ${kr(last, true)} the cycle before` : ''}.</p>
      <label className="field"><span>Budget this cycle</span><input className="amtin" inputMode="decimal" enterKeyHint="done" autoComplete="off" value={amt} placeholder="0" onChange={(e) => { setAmt(e.target.value); setErr(null) }} onKeyDown={(e) => { if (e.key === 'Enter') void save() }} data-autofocus />{err && <span className="err2" role="alert">{err}</span>}</label>
      <label className="field"><span>Notes</span><textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" /><span className="hint">**bold** works</span></label>
      <p className="note">The next salary copies this cycle’s budgets into the new cycle.</p>
      <div className="formfoot">{budget && <button className="btn danger" disabled={busy} onClick={() => void save(true)}>Remove budget</button>}<button className="btn" disabled={busy} onClick={() => void save()}>{busy ? 'Saving…' : 'Save'}</button></div>
    </Sheet>
  )
}

/** Notes keep the Expo app's **bold**; everything else is plain text. */
export function RichNote({ text }: { text: string }): React.JSX.Element {
  return <>{text.split(/(\*\*[^*]+\*\*)/g).map((part, i) => part.startsWith('**') && part.endsWith('**') ? <b key={i}>{part.slice(2, -2)}</b> : <span key={i}>{part}</span>)}</>
}
