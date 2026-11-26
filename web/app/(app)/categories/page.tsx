'use client'

import { useState } from 'react'
import { Header } from '@/components/Header'
import { Icon } from '@/components/Icon'
import { Sheet } from '@/components/Sheet'
import { Gate, SkRows, StatusLine } from '@/components/ui'
import { AMOUNT_ERR, AmountField, DeleteAsk, FormErr, IconPick, Seg, useSaver } from '@/components/settings/kit'
import { useStore } from '@/lib/data/store'
import type { Model } from '@/lib/data/model'
import type { CategoryRow, TransferPersonRow } from '@/lib/data/types'
import { normalizeTransferPersonName } from '@/lib/domain/rows'
import { kr, minorToInput, parseAmount } from '@/lib/fmt'
import { supabase } from '@/lib/supabase/client'
import { useWide } from '@/lib/useWide'

// Two inks draws no category colours; the column stays filled for the Expo app (DATA.md § 2 default).
const DEFAULT_COLOR = '#7C5CFF'
type Edit = { id: string } | { id: null; parentId: string | null }

function Categories({ m }: { m: Model }): React.JSX.Element {
  const [edit, setEdit] = useState<Edit | null>(null)
  const [person, setPerson] = useState<TransferPersonRow | 'new' | null>(null)
  const budgets = m.current ? m.t.budgets.filter((b) => b.salary_cycle_id === m.current?.id) : []
  const budgetOf = (id: string): number | undefined => budgets.find((b) => b.category_id === id)?.amount_minor
  const parents = m.cats.filter((c) => c.level === 1)
  const childrenOf = (id: string): CategoryRow[] => m.cats.filter((c) => c.parent_id === id)
  const row = (c: CategoryRow, sub: boolean): React.JSX.Element => {
    const b = c.level === 1 ? budgetOf(c.id) : undefined
    return (
      <button key={c.id} className={`linkrow ${sub ? 'subrow' : ''}`} onClick={() => setEdit({ id: c.id })}>
        <span className="who"><Icon name={c.icon} /></span>
        <span style={{ minWidth: 0 }}><span className="nm">{c.name}</span>{b ? <span className="sub num">Budget {kr(b, true)}</span> : null}</span>
        <span className="end">{c.is_system && <span className="tagp sys">System</span>}<Icon name="chev" /></span>
      </button>
    )
  }
  const tree = (list: CategoryRow[]): React.JSX.Element[] => list.flatMap((p) => [row(p, false), ...childrenOf(p.id).map((c) => row(c, true))])
  const exp = parents.filter((p) => !m.incomeParents.has(p.id)), inc = parents.filter((p) => m.incomeParents.has(p.id))
  const people = m.t.transfer_people
  return (
    <>
      <Head onNew={() => setEdit({ id: null, parentId: null })} />
      <StatusLine />
      <div className="cols even">
        <div>
          <h2 className="sec">Expenses</h2>
          <div className="panel">{exp.length ? tree(exp) : <div className="empty">No expense categories yet.</div>}</div>
          <div style={{ marginTop: 10 }}><button className="btn ghost" onClick={() => setEdit({ id: null, parentId: null })}><Icon name="add" />New category</button></div>
        </div>
        <div>
          <h2 className="sec">Income</h2>
          <div className="panel">{inc.length ? tree(inc) : <div className="empty">No income categories.</div>}</div>
          <h2 className="sec">People</h2>
          <div className="panel">{people.length ? people.map((p) => (
            <button key={p.id} className="linkrow" onClick={() => setPerson(p)}>
              <span className="who"><span className="avatar person" aria-hidden="true">{p.name.trim()[0]?.toUpperCase()}</span></span>
              <span>{p.name}</span><span className="end"><Icon name="chev" /></span>
            </button>
          )) : <div className="empty">No people added yet.<br /><button className="btn ghost" onClick={() => setPerson('new')}><Icon name="add" />Add person</button></div>}</div>
          {people.length > 0 && <div style={{ marginTop: 10 }}><button className="btn ghost" onClick={() => setPerson('new')}><Icon name="add" />Add person</button></div>}
          <p className="note">Transfers to or from these people go under Transfers, not spending.</p>
        </div>
      </div>
      {edit && <CategorySheet key={edit.id ?? `new-${edit.parentId}`} m={m} edit={edit} budgetOf={budgetOf} onOpen={setEdit} onClose={() => setEdit(null)} />}
      {person && <PersonSheet key={person === 'new' ? 'new' : person.id} p={person === 'new' ? null : person} onClose={() => setPerson(null)} />}
    </>
  )
}

function CategorySheet({ m, edit, budgetOf, onOpen, onClose }: { m: Model; edit: Edit; budgetOf: (id: string) => number | undefined; onOpen: (e: Edit) => void; onClose: () => void }): React.JSX.Element {
  const { userId } = useStore()
  const { busy, err, save } = useSaver()
  const c = edit.id ? m.byId.get(edit.id) ?? null : null
  const parentId = c ? c.parent_id : edit.id === null ? edit.parentId : null
  const parent = parentId ? m.byId.get(parentId) ?? null : null
  const incomeParent = [...m.incomeParents][0] ?? null
  const [kind, setKind] = useState<'expense' | 'income'>(parent && m.incomeParents.has(parent.id) ? 'income' : 'expense')
  const [name, setName] = useState(c?.name ?? '')
  const [icon, setIcon] = useState(c?.icon ?? parent?.icon ?? 'other')
  const oldBudget = c ? budgetOf(c.id) : undefined
  const [budget, setBudget] = useState(oldBudget ? minorToInput(oldBudget) : '')
  const [e, setE] = useState<{ name?: string; budget?: string }>({})
  const [ask, setAsk] = useState(false)

  // A new top-level income category lives under the system Income parent (income is decided by the parent).
  const newParentId = parent?.id ?? (kind === 'income' ? incomeParent : null)
  const level: 1 | 2 = c ? c.level : newParentId ? 2 : 1
  const isIncome = c ? m.incomeParents.has(c.id) || (c.parent_id !== null && m.incomeParents.has(c.parent_id)) : kind === 'income'
  const readOnly = Boolean(c?.is_system && c.level === 1)
  const override = Boolean(c?.is_system && c.level === 2)
  const hasBudget = level === 1 && !isIncome && Boolean(m.current?.real)
  const kids = c && c.level === 1 ? m.cats.filter((x) => x.parent_id === c.id) : []

  const go = async (): Promise<void> => {
    const n = name.trim()
    const b = budget.trim() ? parseAmount(budget) : 0
    const next: typeof e = {}
    if (!n) next.name = 'Give it a name.'
    if (hasBudget && b === null) next.budget = AMOUNT_ERR
    setE(next)
    if (Object.keys(next).length || b === null) return
    let id = c?.id ?? null
    const steps: Parameters<typeof save>[1] = []
    if (c && override) steps.push([['category_overrides'], () => supabase().from('category_overrides').upsert({ user_id: userId, category_id: c.id, name: n, icon }, { onConflict: 'user_id,category_id' })])
    else if (c) steps.push([['categories'], () => supabase().from('categories').update({ name: n, icon }).eq('id', c.id)])
    else steps.push([['categories'], async () => {
      const r = await supabase().from('categories').insert({ user_id: userId, parent_id: newParentId, name: n, level, is_system: false, icon, color: parent?.color ?? (newParentId ? m.byId.get(newParentId)?.color : undefined) ?? DEFAULT_COLOR }).select('id').single<{ id: string }>()
      id = r.data?.id ?? null
      return r
    }])
    const cycle = m.current
    if (hasBudget && cycle && b !== (oldBudget ?? 0)) {
      const existing = c ? m.t.budgets.find((x) => x.category_id === c.id && x.salary_cycle_id === cycle.id) : undefined
      if (b > 0) steps.push([['budgets'], () => supabase().from('budgets').upsert({ user_id: userId, category_id: id, salary_cycle_id: cycle.id, amount_minor: b }, { onConflict: 'user_id,category_id,salary_cycle_id' })])
      else if (existing) steps.push([['budgets'], () => supabase().from('budgets').delete().eq('id', existing.id)])
    }
    if (await save('Category saved', steps)) onClose()
  }
  const del = async (): Promise<void> => {
    if (c && await save(`Deleted ${c.name}`, [[['categories', 'category_overrides', 'budgets'], () => supabase().from('categories').delete().eq('id', c.id)]])) onClose()
  }

  if (c && readOnly) return (
    <Sheet open onClose={onClose} title={c.name}>
      <div className="dhero" style={{ marginBottom: 18 }}><div className="who syshero"><Icon name={c.icon} size={32} /></div><p>{c.name} is a system category. It can’t be changed or deleted.</p></div>
      <Kids kids={kids} parent={c} onOpen={onOpen} />
    </Sheet>
  )
  return (
    <Sheet open onClose={onClose} title={!c ? (parent ? 'New subcategory' : 'New category') : c.level === 2 ? 'Subcategory' : 'Edit category'}>
      {!c && !parent && incomeParent && <div style={{ marginBottom: 14 }}><Seg label="Type" value={kind} onChange={setKind} options={[['expense', 'Expense'], ['income', 'Income']]} /></div>}
      <label className="field" htmlFor="cname"><span>Name</span>
        <input id="cname" value={name} onChange={(ev) => { setName(ev.target.value); setE({ ...e, name: undefined }) }} placeholder="Category name" autoComplete="off" />
        {e.name && <span className="err2">{e.name}</span>}</label>
      <IconPick value={icon} onPick={setIcon} />
      {override && <p className="note" style={{ margin: '-6px 0 14px' }}>A system category. Your name and icon show only for you.{c && ['salary', 'top up', 'transfer', 'others', 'other income', 'mobilepay'].includes(c.name.trim().toLowerCase()) ? ' Keep its name: Cashflow finds it by name, and a new name stops it working.' : ''}</p>}
      {(parent || (!c && newParentId)) && <p className="note" style={{ margin: '-6px 0 14px' }}>Part of {(parent ?? m.byId.get(newParentId ?? ''))?.name}.</p>}
      {hasBudget && <AmountField id="cbudget" label={`Budget for the ${m.current?.name} cycle`} value={budget} onChange={(v) => { setBudget(v); setE({ ...e, budget: undefined }) }} error={e.budget} hint="Empty means no budget" />}
      {level === 1 && !isIncome && !m.current?.real && <p className="note" style={{ margin: '-6px 0 14px' }}>Add a salary to set budgets.</p>}
      {c && c.level === 1 && <Kids kids={kids} parent={c} onOpen={onOpen} />}
      {ask && c && <DeleteAsk what="this category" busy={busy} onYes={() => void del()} onNo={() => setAsk(false)} />}
      <FormErr err={err} />
      <div className="formfoot">
        {c && !c.is_system && !ask && <button className="btn danger" onClick={() => setAsk(true)}>Delete…</button>}
        <button className="btn" disabled={busy} onClick={() => void go()}>{busy ? 'Saving…' : 'Save'}</button>
      </div>
    </Sheet>
  )
}

function Kids({ kids, parent, onOpen }: { kids: CategoryRow[]; parent: CategoryRow; onOpen: (e: Edit) => void }): React.JSX.Element {
  return (
    <div className="field"><span>Subcategories</span>
      <div className="panel">{kids.length ? kids.map((k) => (
        <button key={k.id} className="linkrow" onClick={() => onOpen({ id: k.id })}><span className="who"><Icon name={k.icon} /></span><span>{k.name}</span><span className="end"><Icon name="chev" /></span></button>
      )) : <div className="empty">No subcategories</div>}</div>
      <button className="btn link" style={{ justifySelf: 'start' }} onClick={() => onOpen({ id: null, parentId: parent.id })}><Icon name="add" />Add subcategory</button>
    </div>
  )
}

function PersonSheet({ p, onClose }: { p: TransferPersonRow | null; onClose: () => void }): React.JSX.Element {
  const { userId } = useStore()
  const { busy, err, save } = useSaver()
  const [name, setName] = useState(p?.name ?? '')
  const [nameErr, setNameErr] = useState<string | null>(null)
  const [ask, setAsk] = useState(false)
  const go = async (): Promise<void> => {
    const n = name.trim(), norm = normalizeTransferPersonName(n)
    if (!norm) { setNameErr('Give them a name.'); return }
    const ok = await save('Saved', [[['transfer_people'], () => p
      ? supabase().from('transfer_people').update({ name: n, normalized_name: norm, updated_at: new Date().toISOString() }).eq('id', p.id)
      : supabase().from('transfer_people').insert({ user_id: userId, name: n, normalized_name: norm })]])
    if (ok) onClose()
  }
  const del = async (): Promise<void> => { if (p && await save(`Deleted ${p.name}`, [[['transfer_people'], () => supabase().from('transfer_people').delete().eq('id', p.id)]])) onClose() }
  return (
    <Sheet open onClose={onClose} title={p ? 'Edit person' : 'Add person'}>
      <label className="field" htmlFor="pn"><span>Name</span>
        <input id="pn" value={name} onChange={(ev) => { setName(ev.target.value); setNameErr(null) }} placeholder="Person name" autoComplete="off" />
        {nameErr && <span className="err2">{nameErr}</span>}</label>
      <p className="note" style={{ margin: '-6px 0 14px' }}>Transfers to or from them go under Transfers.</p>
      {ask && <DeleteAsk what="this person" busy={busy} onYes={() => void del()} onNo={() => setAsk(false)} />}
      <FormErr err={err === 'That already exists.' ? `${name.trim()} is already in the list.` : err} />
      <div className="formfoot">
        {p && !ask && <button className="btn danger" onClick={() => setAsk(true)}>Delete…</button>}
        <button className="btn" disabled={busy} onClick={() => void go()}>{busy ? 'Saving…' : 'Save'}</button>
      </div>
    </Sheet>
  )
}

function Head({ onNew }: { onNew?: () => void }): React.JSX.Element {
  const wide = useWide()
  return <Header title="Categories" big="Categories" back={!wide} right={onNew ? <button className="iconbtn" onClick={onNew} aria-label="New category"><Icon name="add" /></button> : undefined} />
}

export default function Page(): React.JSX.Element {
  return (
    <Gate skeleton={<><Head /><div className="panel"><SkRows n={6} /></div></>}>
      {(m) => <Categories m={m} />}
    </Gate>
  )
}
