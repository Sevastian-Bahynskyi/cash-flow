'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Header } from '@/components/Header'
import { Icon } from '@/components/Icon'
import { BudgetEditor } from '@/components/BudgetEditor'
import { Gate, SkRows, StatusLine } from '@/components/ui'
import type { Model } from '@/lib/data/model'
import { kr, plus } from '@/lib/fmt'
import type { CategoryRow } from '@/lib/data/types'

/** The cycle budget check (Expo Budgets summary): salary, all budgets, and what is really left to save. */
function Plan({ m }: { m: Model }): React.JSX.Element {
  const params = useSearchParams()
  const router = useRouter()
  const idx = (() => { const i = m.cycles.findIndex((c) => c.id === params.get('cycle')); return i >= 0 ? i : m.cycles.findIndex((c) => c.id === m.current?.id) })()
  const c = m.cycles[idx] ?? null
  const b = m.budgetsOf(c)
  const [editing, setEditing] = useState<CategoryRow | null>(null)
  if (!c) return <><Header title="Cycle plan" back /><div className="panel"><div className="empty"><b>No salary yet</b>Log your salary and the plan starts.</div></div></>
  const ifAll = b.salary - b.total
  const real = b.salary - b.allMine
  return (
    <>
      <Header title="Cycle plan" big="Cycle plan" back />
      <StatusLine />
      <div className="cyclepick" style={{ marginBottom: 12 }}>
        <button className="iconbtn" disabled={idx <= 0} onClick={() => router.replace(`/budgets/plan?cycle=${m.cycles[idx - 1]!.id}`)} aria-label="Previous cycle"><Icon name="back" /></button>
        <b>{c.name} cycle</b>
        <button className="iconbtn" disabled={idx >= m.cycles.length - 1} onClick={() => router.replace(`/budgets/plan?cycle=${m.cycles[idx + 1]!.id}`)} aria-label="Next cycle"><Icon name="chev" /></button>
      </div>
      <div className="cols even"><div>
        <div className="stats"><div className="stat"><div className="big2 num">{kr(b.salary, true)}</div><p>Salary this cycle</p></div><div className="stat"><div className="big2 num">{kr(b.total, true)}</div><p>All budgets</p></div></div>
        <h2 className="sec">Cycle budget check</h2>
        <div className="panel">
          <div className="flowrow"><span>Money in</span><b style={{ color: 'var(--in)' }}>{plus(b.income, true)}</b></div>
          <div className="flowrow"><span>If every budget is fully spent</span><b>{ifAll < 0 ? kr(ifAll, true) : `${kr(ifAll, true)} to save`}</b></div>
          <div className="flowrow"><span>Real available to save, after what you spent</span><b style={{ color: real >= 0 ? undefined : 'var(--over-text)', fontWeight: 600 }}>{kr(real, true)}</b></div>
        </div>
        <p className="note">Your spending counts your part of shared expenses. Money moved to the pot doesn’t count.</p>
      </div><div>
        <h2 className="sec">Used categories with no budget</h2>
        <div className="panel">{b.unbudgeted.length ? b.unbudgeted.map((x) => (
          <button key={x.cat.id} className="row" onClick={() => c.real && setEditing(x.cat)} disabled={!c.real}><span className="who cat"><Icon name={x.cat.icon} /></span><span><div className="nm">{x.cat.name}</div><div className="meta num">{kr(x.spent, true)} spent</div></span><span className="pill zero">Set</span></button>
        )) : <div className="empty">All used categories have a budget.</div>}</div>
      </div></div>
      {editing && <BudgetEditor cat={editing} cycle={c} spent={b.spent.get(editing.id) ?? 0} last={m.budgetsOf(m.prevOf(c)).spent.get(editing.id) ?? 0} onClose={() => setEditing(null)} />}
    </>
  )
}

export default function Page(): React.JSX.Element {
  return <Gate skeleton={<><Header title="Cycle plan" back /><div className="panel"><SkRows n={4} /></div></>}>{(m) => <Suspense><Plan m={m} /></Suspense>}</Gate>
}
