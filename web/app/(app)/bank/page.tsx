'use client'

import { useState } from 'react'
import { Header } from '@/components/Header'
import { Icon } from '@/components/Icon'
import { Sheet } from '@/components/Sheet'
import { Gate, SkRows, StatusLine } from '@/components/ui'
import { Check } from '@/components/Marks'
import { AMOUNT_ERR, AmountField, DeleteAsk, FormErr, IconPick, Seg, useSaver } from '@/components/settings/kit'
import { useStore } from '@/lib/data/store'
import type { Tables } from '@/lib/data/types'
import { savingsTotal } from '@/lib/domain/savings'
import { bankBalance } from '@/lib/domain/balance'
import { dayLabel, kr, minorToInput, parseAmount, todayYmd } from '@/lib/fmt'
import { supabase } from '@/lib/supabase/client'
import { useWide } from '@/lib/useWide'

type Kind = 'savings' | 'loan' | 'owed'
type Open = { kind: Kind; id: string | null }
type Ev = { id: string; kind: string; amount_minor: number; occurred_on: string; created_at: string; note?: string | null }
type Item = { id: string; name: string; value: number; goal: number | null; principal: number; icon: string; history: Ev[] }

// Loans and money owed to you have the same shape (DATA.md § 2); only the table and words differ.
const DEBT = {
  loan: { table: 'loans', events: 'loan_events', fk: 'loan_id', more: 'borrowed', acts: [['repaid', 'Repayment'], ['borrowed', 'Borrow more']] as [string, string][] },
  owed: { table: 'receivables', events: 'receivable_events', fk: 'receivable_id', more: 'lent', acts: [['repaid', 'Money returned'], ['lent', 'Lend more']] as [string, string][] },
} as const
const SAVINGS_ACTS: [string, string][] = [['add', 'Put in'], ['remove', 'Take out'], ['set', 'Set balance']]
const pct = (a: number, b: number): number => (b ? Math.round((100 * a) / b) : 0)
const newestFirst = (a: Ev, b: Ev): number => b.occurred_on.localeCompare(a.occurred_on) || b.created_at.localeCompare(a.created_at)

function itemsOf(t: Tables, kind: Kind): Item[] {
  if (kind === 'savings') return t.savings_accounts.map((s) => {
    const ev = t.savings_events.filter((e) => e.savings_account_id === s.id)
    return { id: s.id, name: s.name, value: savingsTotal(ev), goal: s.goal_minor, principal: 0, icon: s.icon, history: ev.map((e) => ({ ...e, kind: e.action })).sort(newestFirst) }
  })
  const rows = kind === 'loan' ? t.loans : t.receivables
  const ev: (Ev & { parent: string })[] = kind === 'loan' ? t.loan_events.map((e) => ({ ...e, parent: e.loan_id })) : t.receivable_events.map((e) => ({ ...e, parent: e.receivable_id }))
  return rows.map((r) => ({ id: r.id, name: r.name, value: r.remaining_minor, goal: null, principal: r.principal_minor, icon: kind === 'loan' ? 'loan' : 'owed', history: ev.filter((e) => e.parent === r.id).sort(newestFirst) }))
}

function Bank({ t }: { t: Tables }): React.JSX.Element {
  const [open, setOpen] = useState<Open | null>(null)
  const sv = itemsOf(t, 'savings'), lo = itemsOf(t, 'loan'), ow = itemsOf(t, 'owed')
  const svTot = sv.reduce((a, s) => a + s.value, 0)
  const loTot = t.loans.filter((l) => l.status === 'open').reduce((a, l) => a + l.remaining_minor, 0)
  const owTot = t.receivables.filter((r) => r.status === 'open').reduce((a, r) => a + r.remaining_minor, 0)
  // As the Expo app: one running total over every savings event, minus open loans (DATA.md § 6).
  const balance = bankBalance(savingsTotal(t.savings_events), loTot)
  // done: a savings goal reached or a debt settled, marked with the hand-drawn check (MARKS.md).
  const row = (kind: Kind, x: Item, right: string, sub: string, prog: number | null, done = false): React.JSX.Element => (
    <button key={x.id} className={`linkrow mkb-bank ${kind}${done ? ' done' : ''}`} onClick={() => setOpen({ kind, id: x.id })}>
      <span className="who"><Icon name={x.icon} /></span>
      <span style={{ minWidth: 0 }}><span className="nm">{x.name}</span><span className="sub">{done && <Check size={16} seed={x.name.length} />}{sub}</span>{prog !== null && <span className="goal" aria-hidden="true"><i style={{ width: `${prog}%` }} /></span>}</span>
      <span className="end"><b className="num bankamt">{right}</b><Icon name="chev" /></span>
    </button>
  )
  const sec = (title: string, kind: Kind, list: React.JSX.Element[], empty: string, newLabel: string): React.JSX.Element => (
    <div><h2 className="sec">{title} <button onClick={() => setOpen({ kind, id: null })} aria-label={newLabel}>New</button></h2>
      <div className="panel">{list.length ? list : <div className="empty">{empty}<br /><button className="btn ghost" onClick={() => setOpen({ kind, id: null })}><Icon name="add" />{newLabel}</button></div>}</div></div>
  )
  const all = { savings: sv, loan: lo, owed: ow }
  const cur = open?.id ? all[open.kind].find((x) => x.id === open.id) ?? null : null
  return (
    <>
      <div className="stats bankstats" style={{ marginBottom: 4 }}>
        <div className="stat"><div className="big2 num">{kr(balance, true)}</div><p>Bank balance</p></div>
        <div className="stat"><div className="big2 num">{kr(svTot, true)}</div><p>Savings total</p></div>
        <div className="stat"><div className="big2 num">{kr(loTot, true)}</div><p>Still to repay</p></div>
        <div className="stat"><div className="big2 num">{kr(owTot, true)}</div><p>Owed to you</p></div>
      </div>
      <div className="cols3">
        {sec('Savings', 'savings', sv.map((s) => row('savings', s, kr(s.value, true), s.goal ? (s.value >= s.goal ? `Goal reached, ${kr(s.goal, true)}` : `${pct(s.value, s.goal)} of 100 toward ${kr(s.goal, true)}`) : 'No goal set yet', s.goal ? Math.min(100, pct(s.value, s.goal)) : null, Boolean(s.goal) && s.value >= s.goal!)), 'No savings yet. Name a pot and set a goal.', 'New savings')}
        {sec('Loans', 'loan', lo.map((l) => row('loan', l, l.value ? kr(l.value, true) : 'Settled', l.value ? `left of ${kr(l.principal, true)}` : `${kr(l.principal, true)} repaid`, l.value ? 100 - pct(l.value, l.principal) : null, !l.value)), 'No loans. Add one to track what is left to repay.', 'New loan')}
        {sec('Owed to you', 'owed', ow.map((o) => row('owed', o, o.value ? kr(o.value, true) : 'Settled', o.value ? `still owed of ${kr(o.principal, true)}` : 'Returned in full', o.value ? 100 - pct(o.value, o.principal) : null, !o.value)), 'Nobody owes you money.', 'Someone owes you')}
      </div>
      {open && (open.id === null || cur) && <BankSheet key={`${open.kind}-${open.id ?? 'new'}`} kind={open.kind} x={cur} t={t} onClose={() => setOpen(null)} />}
    </>
  )
}

const WORDS: Record<Kind, [string, string, string]> = { savings: ['New savings', 'Emergency fund', 'Goal'], loan: ['New loan', 'Student loan', 'Original amount'], owed: ['Someone owes you', 'Name', 'Amount lent'] }

function BankSheet({ kind, x, t, onClose }: { kind: Kind; x: Item | null; t: Tables; onClose: () => void }): React.JSX.Element {
  const [editing, setEditing] = useState(!x)
  return (
    <Sheet open onClose={onClose} title={editing ? (x ? 'Edit' : WORDS[kind][0]) : x?.name}
      right={!editing ? <button className="iconbtn" onClick={() => setEditing(true)} aria-label="Edit"><Icon name="edit" /></button> : undefined}>
      {editing || !x ? <EditForm kind={kind} x={x} t={t} onDone={onClose} /> : <Actions kind={kind} x={x} t={t} />}
    </Sheet>
  )
}

function Actions({ kind, x, t }: { kind: Kind; x: Item; t: Tables }): React.JSX.Element {
  const { userId } = useStore()
  const { busy, err, save } = useSaver()
  const acts = kind === 'savings' ? SAVINGS_ACTS : DEBT[kind].acts
  const [act, setAct] = useState(acts[0]![0])
  const [amt, setAmt] = useState('')
  const [note, setNote] = useState('')
  const [amtErr, setAmtErr] = useState<string | null>(null)
  const done = kind === 'savings' ? Boolean(x.goal) && x.value >= x.goal! : !x.value
  const word: Record<string, string> = { add: 'Put in', remove: 'Taken out', set: 'Balance set to', repaid: kind === 'loan' ? 'Repaid' : 'Returned', borrowed: 'Borrowed', lent: 'Lent' }
  const go = async (): Promise<void> => {
    const m = parseAmount(amt)
    if (m === null || (m === 0 && act !== 'set')) { setAmtErr(AMOUNT_ERR); return }
    setAmtErr(null)
    const today = todayYmd()
    let ok: boolean
    if (kind === 'savings') {
      ok = await save('Saved', [[['savings_events'], () => supabase().from('savings_events').insert({ user_id: userId, savings_account_id: x.id, action: act, amount_minor: m, occurred_on: today, note: note.trim() || null })]])
    } else {
      const d = DEBT[kind]
      const row = (kind === 'loan' ? t.loans : t.receivables).find((r) => r.id === x.id)
      if (!row) return
      const more = act === d.more
      const principal = more ? row.principal_minor + m : row.principal_minor
      const remaining = more ? row.remaining_minor + m : Math.max(0, row.remaining_minor - m)
      // Two calls, as in the Expo app: the event, then the running numbers (not transactional, DATA.md § 6).
      ok = await save('Saved', [
        [[d.events], () => supabase().from(d.events).insert({ [d.fk]: x.id, user_id: userId, kind: act, amount_minor: m, occurred_on: today })],
        [[d.table], () => supabase().from(d.table).update({ principal_minor: principal, remaining_minor: remaining, status: remaining === 0 ? 'closed' : 'open' }).eq('id', x.id)],
      ])
    }
    if (ok) { setAmt(''); setNote('') }
  }
  return (
    <>
      <div className="dhero"><div className="big serif num">{x.value ? kr(x.value, true) : 'Settled'}</div>
        <p className={done ? 'mkb-done' : undefined}>{done && <Check size={18} seed={7} />}{kind === 'savings' ? (x.goal ? `${done ? 'Reached the' : 'of'} ${kr(x.goal, true)} goal` : 'No goal set yet') : done ? (kind === 'loan' ? `${kr(x.principal, true)} repaid` : 'Returned in full') : kind === 'loan' ? `left to repay of ${kr(x.principal, true)}` : `still owed of ${kr(x.principal, true)}`}</p>
        {kind === 'savings' && x.goal ? <span className="goal dgoal" aria-hidden="true"><i style={{ width: `${Math.min(100, pct(x.value, x.goal))}%` }} /></span> : null}
      </div>
      <div style={{ margin: '18px 0 12px' }}><Seg label="What happened" value={act} onChange={setAct} options={acts} /></div>
      <AmountField id="bamt" label="Amount" value={amt} onChange={(v) => { setAmt(v); setAmtErr(null) }} error={amtErr} />
      {kind === 'savings' && <label className="field" htmlFor="bnote"><span>Note</span><input id="bnote" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" autoComplete="off" /></label>}
      <FormErr err={err} />
      <button className="btn" style={{ width: '100%' }} disabled={busy} onClick={() => void go()}>{busy ? 'Saving…' : 'Save'}</button>
      <h2 className="sect">History</h2>
      <div className="panel">{x.history.length ? x.history.map((e) => (
        <div className="row" key={e.id}><span className="who cat"><Icon name={e.kind === 'add' || e.kind === 'lent' || e.kind === 'borrowed' ? 'in' : e.kind === 'set' ? 'edit' : 'out'} /></span>
          <span style={{ minWidth: 0 }}><div className="nm">{word[e.kind] ?? e.kind}</div><div className="meta">{dayLabel(e.occurred_on)}{e.note ? `, ${e.note}` : ''}</div></span>
          <span className="amt">{kr(e.amount_minor, true)}</span></div>
      )) : <div className="empty">No history yet.</div>}</div>
    </>
  )
}

function EditForm({ kind, x, t, onDone }: { kind: Kind; x: Item | null; t: Tables; onDone: () => void }): React.JSX.Element {
  const { userId } = useStore()
  const { busy, err, save } = useSaver()
  const debt = kind === 'savings' ? null : (kind === 'loan' ? t.loans : t.receivables).find((r) => r.id === x?.id) ?? null
  const [name, setName] = useState(x?.name ?? '')
  const [amt, setAmt] = useState(x ? (kind === 'savings' ? (x.goal ? minorToInput(x.goal) : '') : minorToInput(x.principal)) : '')
  const [left, setLeft] = useState(debt ? minorToInput(debt.remaining_minor) : '')
  const [icon, setIcon] = useState(x?.icon ?? 'savings')
  const [e, setE] = useState<{ name?: string; amt?: string; left?: string }>({})
  const [ask, setAsk] = useState(false)
  const W = WORDS[kind]

  const go = async (): Promise<void> => {
    const n = name.trim()
    const m = amt.trim() ? parseAmount(amt) : null
    const next: typeof e = {}
    if (!n) next.name = 'Give it a name.'
    if (amt.trim() && m === null) next.amt = AMOUNT_ERR
    if (kind !== 'savings' && !m) next.amt = AMOUNT_ERR
    const l = kind === 'savings' ? null : left.trim() ? parseAmount(left) : m
    if (kind !== 'savings' && left.trim() && l === null) next.left = AMOUNT_ERR
    else if (kind !== 'savings' && m && l !== null && l > m) next.left = 'Can’t be more than the original amount.'
    setE(next)
    if (Object.keys(next).length) return
    let ok: boolean
    if (kind === 'savings') {
      ok = await save('Saved', [[['savings_accounts'], () => x
        ? supabase().from('savings_accounts').update({ name: n, goal_minor: m, icon }).eq('id', x.id)
        : supabase().from('savings_accounts').insert({ user_id: userId, name: n, goal_minor: m, icon })]])
    } else {
      const d = DEBT[kind]
      const principal = m as number, remaining = l as number
      const status = remaining === 0 ? 'closed' : 'open'
      if (x) ok = await save('Saved', [[[d.table], () => supabase().from(d.table).update({ name: n, principal_minor: principal, remaining_minor: remaining, status }).eq('id', x.id)]])
      else {
        let id: string | null = null
        ok = await save('Saved', [
          [[d.table], async () => { const r = await supabase().from(d.table).insert({ user_id: userId, name: n, principal_minor: principal, remaining_minor: remaining, status }).select('id').single<{ id: string }>(); id = r.data?.id ?? null; return r }],
          [[d.events], () => supabase().from(d.events).insert({ [d.fk]: id, user_id: userId, kind: d.more, amount_minor: principal, occurred_on: todayYmd() })],
        ])
      }
    }
    if (ok) onDone()
  }
  const del = async (): Promise<void> => {
    if (!x) return
    const table = kind === 'savings' ? 'savings_accounts' : DEBT[kind].table
    const also = kind === 'savings' ? 'savings_events' : DEBT[kind].events
    if (await save('Deleted', [[[table, also], () => supabase().from(table).delete().eq('id', x.id)]])) onDone()
  }
  return (
    <>
      <label className="field" htmlFor="bname"><span>{kind === 'owed' ? 'Who' : 'Name'}</span>
        <input id="bname" value={name} onChange={(ev) => { setName(ev.target.value); setE({ ...e, name: undefined }) }} placeholder={W[1]} autoComplete="off" />
        {e.name && <span className="err2">{e.name}</span>}</label>
      <AmountField id="bamt1" label={W[2]} value={amt} onChange={(v) => { setAmt(v); setE({ ...e, amt: undefined }) }} error={e.amt} hint={kind === 'savings' ? 'Optional' : undefined} />
      {kind !== 'savings' && <AmountField id="bleft" label={kind === 'loan' ? 'Still to repay' : 'Still owed'} value={left} onChange={(v) => { setLeft(v); setE({ ...e, left: undefined }) }} error={e.left} hint={x ? undefined : 'Leave empty if nothing is paid back yet'} />}
      {kind === 'savings' && <IconPick value={icon} onPick={setIcon} extra={[['savings', 'Savings']]} />}
      {ask && <DeleteAsk what="it" busy={busy} onYes={() => void del()} onNo={() => setAsk(false)} />}
      <FormErr err={err} />
      <div className="formfoot">
        {x && !ask && <button className="btn danger" onClick={() => setAsk(true)}>Delete…</button>}
        <button className="btn" disabled={busy} onClick={() => void go()}>{busy ? 'Saving…' : 'Save'}</button>
      </div>
    </>
  )
}

export default function Page(): React.JSX.Element {
  const wide = useWide()
  const { tables } = useStore()
  const head = <Header title="Bank" big="Bank" aside="Savings, loans and money owed to you" back={!wide} />
  return (
    <Gate skeleton={<>{head}<div className="panel"><SkRows n={2} /></div><h2 className="sec">Savings</h2><div className="panel"><SkRows n={2} /></div></>}>
      {() => <>{head}<StatusLine />{tables && <Bank t={tables} />}</>}
    </Gate>
  )
}
