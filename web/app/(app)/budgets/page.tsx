'use client'

import Link from 'next/link'
import { Suspense, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Header } from '@/components/Header'
import { Icon } from '@/components/Icon'
import { BudgetEditor, RichNote } from '@/components/BudgetEditor'
import { Check, Meter, StatePill } from '@/components/Marks'
import { goneShare, stateOf } from '@/components/marks-a/pace'
import { Gate, NavRow, SkRows, StatusLine, TxRow, useDetail } from '@/components/ui'
import type { Cycle, Model } from '@/lib/data/model'
import { findSalaryCategoryOption } from '@/lib/domain/category-rules'
import { daysBetween, kr, shortDate } from '@/lib/fmt'
import type { CategoryRow, TransactionRow } from '@/lib/data/types'

/** Spent by day in one category this cycle, against the cycle before and the budget line. */
function Pace({ m, c, cat, budget }: { m: Model; c: Cycle; cat: CategoryRow; budget: number }): React.JSX.Element {
  const prev = m.prevOf(c)
  const n = daysBetween(c.startOn, c.endInclusive) + 1
  const cum = (rows: TransactionRow[], start: string, len: number): number[] => {
    const a = new Array<number>(len).fill(0)
    for (const r of rows) { const i = daysBetween(start, r.occurred_on); if (i >= 0 && i < len && m.parentOf(r.category_id)?.id === cat.id) a[i]! += m.mine(r) }
    for (let i = 1; i < len; i++) a[i]! += a[i - 1]!
    return a
  }
  const nowLen = Math.min(n, daysBetween(c.startOn, m.today < c.endInclusive ? m.today : c.endInclusive) + 1)
  const now = cum(m.tx.filter(m.inCycle(c)), c.startOn, nowLen)
  const last = prev ? cum(m.tx.filter(m.inCycle(prev)), prev.startOn, Math.min(n, daysBetween(prev.startOn, prev.endInclusive) + 1)) : []
  const W = 320, H = 150, top = 10
  const max = Math.max(budget, now[now.length - 1] ?? 0, last[last.length - 1] ?? 0, 1) * 1.08
  const X = (i: number): number => (W - 4) * (i + 1) / n, Y = (v: number): number => top + (H - top) * (1 - v / max)
  const path = (a: number[]): string => a.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(v).toFixed(1)}`).join('')
  const end = now[now.length - 1] ?? 0
  return (
    <div className="chart">
      <svg viewBox={`0 0 ${W} ${H + 22}`} role="img" aria-label={`${cat.name}: spent by day this cycle against the cycle before and the budget`}>
        <line x1={0} x2={W - 4} y1={H} y2={H} stroke="var(--line-2)" />
        {budget > 0 && <line x1={0} x2={W - 4} y1={Y(budget)} y2={Y(budget)} stroke="var(--ink-2)" strokeWidth={1.4} strokeDasharray="5 5" />}
        {budget > 0 && <text x={W - 4} y={Y(budget) - 6} fontSize={11} fill="var(--ink-2)" textAnchor="end">Budget {kr(budget, true)}</text>}
        {last.length > 0 && <path d={path(last)} fill="none" stroke="var(--ink-3)" strokeWidth={2} strokeLinejoin="round" opacity={0.55} />}
        {now.length > 0 && <path d={`${path(now)}L${X(now.length - 1).toFixed(1)} ${H}L${X(0).toFixed(1)} ${H}Z`} fill="var(--you-mark)" opacity={0.14} />}
        {now.length > 0 && <path d={path(now)} fill="none" stroke="var(--you-mark)" strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />}
        {now.length > 0 && <circle cx={X(now.length - 1)} cy={Y(end)} r={5} fill="var(--you-mark)" stroke="var(--surface)" strokeWidth={2.5} />}
        <text x={0} y={H + 17} fontSize={11} fill="var(--ink-3)">{shortDate(c.startOn)}</text>
        <text x={W - 4} y={H + 17} fontSize={11} fill="var(--ink-3)" textAnchor="end">{shortDate(c.endInclusive)}</text>
      </svg>
      <div className="legend">
        <span><i style={{ background: 'var(--you-mark)' }} />This cycle <b>{kr(end, true)}</b></span>
        {prev && <span><i style={{ background: 'var(--ink-3)' }} />{prev.name} <b>{kr(last[last.length - 1] ?? 0, true)}</b></span>}
        {budget > 0 && <span><i style={{ background: 'none', borderTop: '2px dashed var(--ink-2)', height: 0 }} />Budget <b>{kr(budget, true)}</b></span>}
      </div>
    </div>
  )
}

function Budgets({ m }: { m: Model }): React.JSX.Element {
  const params = useSearchParams()
  const router = useRouter()
  const open = useDetail()
  const cycleIdx = (() => { const id = params.get('cycle'); const i = m.cycles.findIndex((c) => c.id === id); return i >= 0 ? i : m.cycles.findIndex((c) => c.id === m.current?.id) })()
  const c = m.cycles[cycleIdx] ?? null
  const b = useMemo(() => m.budgetsOf(c), [m, c])
  const prevB = useMemo(() => m.budgetsOf(m.prevOf(c)), [m, c])
  const parents = m.cats.filter((x) => x.level === 1 && !m.incomeParents.has(x.id) && !m.isTransfer(x.id))
  const sel = m.byId.get(params.get('cat') ?? '') ?? b.list[0]?.cat ?? parents[0]
  const [editing, setEditing] = useState<CategoryRow | null>(null)
  const go = (q: Record<string, string>): void => { const p = new URLSearchParams(params.toString()); for (const [k, v] of Object.entries(q)) p.set(k, v); router.replace(`/budgets?${p.toString()}`, { scroll: false }) }

  if (!c || !m.hasSalary) {
    const salary = findSalaryCategoryOption(m.options)
    return <><Header title="Budgets" /><StatusLine /><div className="panel"><div className="empty"><b>No salary yet</b>Budgets run from payday to payday. The first cycle starts when your salary arrives from the bank.</div></div></>
  }
  const item = sel ? b.list.find((x) => x.id === sel.id) : undefined
  const spentSel = sel ? b.spent.get(sel.id) ?? 0 : 0
  const amount = item?.amount ?? 0
  const over = amount > 0 && spentSel > amount
  const inCat = sel ? b.rows.filter((r) => m.parentOf(r.category_id)?.id === sel.id && r.kind === 'expense' && !r.is_shared_topup).reverse() : []
  const lastSpent = sel ? prevB.spent.get(sel.id) ?? 0 : 0
  const isCurrent = c.id === m.current?.id
  const days = isCurrent ? m.daysLeft : 0
  const share = goneShare(m, c)
  const st = stateOf(spentSel, amount, share)
  const kept = c.real && amount > 0 && spentSel <= amount && m.today > c.endInclusive
  const unbudgetedParents = parents.filter((p) => !b.list.some((x) => x.id === p.id))

  const row = (cat: CategoryRow): React.JSX.Element => {
    const x = b.list.find((y) => y.id === cat.id)
    const s = b.spent.get(cat.id) ?? 0
    const pill = !x ? <span className="pill zero">{s ? kr(s, true) : 'No budget'}</span> : <StatePill left={x.left} st={stateOf(s, x.amount, share)} />
    return (
      <button key={cat.id} className="brow" aria-current={sel?.id === cat.id ? 'true' : undefined} onClick={() => go({ cat: cat.id })}>
        <span className="who cat"><Icon name={cat.icon} /></span><span className="nm">{cat.name}</span>
        <span className="dcol">{kr(s, true)}</span><span className="dcol">{x ? kr(x.amount, true) : '–'}</span>{pill}
        {x && <Meter spent={s} amount={x.amount} daysGoneShare={share} />}
        {x && <span className="cap num">{kr(s, true)} of {kr(x.amount, true)}</span>}
      </button>
    )
  }
  const all = (
    <>
      <div className="thead deskonly"><span /><span style={{ textAlign: 'left' }}>Category</span><span>Spent</span><span>Budget</span><span>Left</span></div>
      <div className="panel">{b.list.map((x) => row(x.cat as CategoryRow))}{unbudgetedParents.map(row)}</div>
      {b.list.length > 0 && <p className="note num" style={{ display: 'flex', justifyContent: 'space-between' }}><span>All budgets</span><span>{kr(b.used, true)} of {kr(b.total, true)}</span></p>}
    </>
  )
  return (
    <>
      <Header title="Budgets" big="Budgets" aside={b.list.length ? `${kr(b.left, true)} ${b.left < 0 ? 'over' : 'left'} across ${b.list.length}` : undefined} />
      <StatusLine />
      <div className="hrow" style={{ margin: '0 0 12px', flexWrap: 'wrap' }}>
        <div className="cyclepick">
          <button className="iconbtn" disabled={cycleIdx <= 0} onClick={() => go({ cycle: m.cycles[cycleIdx - 1]!.id })} aria-label="Previous cycle"><Icon name="back" /></button>
          <b>{c.name} cycle</b>
          <button className="iconbtn" disabled={cycleIdx >= m.cycles.length - 1} onClick={() => go({ cycle: m.cycles[cycleIdx + 1]!.id })} aria-label="Next cycle"><Icon name="chev" /></button>
        </div>
      </div>
      <div className="panel" style={{ marginBottom: 12 }}><NavRow href={`/budgets/plan?cycle=${c.id}`} icon="sack" name="Cycle plan" sub={`Salary ${kr(b.salary, true)}${b.list.length ? `, ${kr(Math.max(0, b.salary - b.total), true)} to save if every budget is spent` : ''}`} /></div>
      {!c.real && <div className="offline"><Icon name="info" /><span>This stretch is before your first salary, so it can’t hold budgets.</span></div>}
      <div className="cols even">
        <div className="deskonly"><h2 className="sec" style={{ marginTop: 0 }}>All budgets</h2>{all}</div>
        <div>
          {sel && (
            <section className={`hero mka-${st}`} aria-label={sel.name}>
              <div className="top"><b style={{ display: 'flex', gap: 8, alignItems: 'center' }}><Icon name={sel.icon} />{sel.name}</b><span>{c.name} cycle</span></div>
              <div className="big num">{kr(spentSel, true)}</div>
              <div className="sub">{amount ? <>spent of <em>{kr(amount, true)}</em></> : 'spent, no budget set'}</div>
              {amount > 0 && <span className="herometer"><Meter spent={spentSel} amount={amount} daysGoneShare={share} /></span>}
              <div className="pace"><span>{!spentSel ? 'Nothing spent here yet' : !amount ? 'Set a budget to see what is left' : over ? <><b>{kr(spentSel - amount, true)} over</b>{days ? ` with ${days} days to payday` : ''}</> : kept ? <span className="mka-kept"><Check size={20} /><span><b>Kept</b>, {kr(amount - spentSel, true)} left at payday</span></span> : st === 'ahead' ? <span className="mka-aheadline"><span><b>{kr(amount - spentSel, true)} left</b>{days ? ` for ${days} days` : ''}</span><span className="pill ahead">ahead of the days</span></span> : <><b>{kr(amount - spentSel, true)} left</b>{days ? ` for ${days} days` : ''}</>}</span>{m.prevOf(c) && <span className="num">{m.prevOf(c)?.name}: {kr(lastSpent, true)}</span>}</div>
            </section>
          )}
          {sel && item?.budget.notes && <p className="note"><RichNote text={item.budget.notes} /></p>}
          {sel && c.real && <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}><button className="btn ghost" onClick={() => setEditing(sel)}><Icon name="edit" />{item ? 'Change budget' : 'Set budget'}</button></div>}
          {sel && <><h2 className="sec">Pace through the cycle</h2>{inCat.length ? <Pace m={m} c={c} cat={sel} budget={amount} /> : <div className="chart"><div className="empty"><b>No {sel.name.toLowerCase()} yet this cycle</b>The pace line starts with the first one.</div></div>}</>}
          {sel && <><h2 className="sec">In {sel.name.toLowerCase()} this cycle {inCat.length > 0 && <Link href={`/transactions?cat=${sel.id}`}>All</Link>}</h2>
            <div className="panel">{inCat.length ? inCat.slice(0, 12).map((t) => <TxRow key={t.id} t={t} m={m} onOpen={open} />) : <div className="empty">Nothing here yet.</div>}</div></>}
          <div className="phoneonly"><h2 className="sec">All budgets</h2>{all}</div>
        </div>
      </div>
      {editing && <BudgetEditor cat={editing} cycle={c} budget={b.list.find((x) => x.id === editing.id)?.budget} spent={b.spent.get(editing.id) ?? 0} last={prevB.spent.get(editing.id) ?? 0} onClose={() => setEditing(null)} />}
    </>
  )
}

export default function Page(): React.JSX.Element {
  return <Gate skeleton={<><Header title="Budgets" /><div className="panel"><SkRows n={9} /></div></>}>{(m) => <Suspense><Budgets m={m} /></Suspense>}</Gate>
}
