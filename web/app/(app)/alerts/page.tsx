'use client'

import Link from 'next/link'
import { Header } from '@/components/Header'
import { Icon } from '@/components/Icon'
import { useAdd } from '@/components/AddSheet'
import { Gate, SkRows, StatusLine } from '@/components/ui'
import type { Model } from '@/lib/data/model'
import { labelForSalaryDate } from '@/lib/domain/cycles'
import { dayLabel, kr } from '@/lib/fmt'
import { PARTNER } from '@/lib/partner'
import { useWide } from '@/lib/useWide'
import { budgetAlerts } from '@/components/settings/alerts'

function Alerts({ m }: { m: Model }): React.JSX.Element {
  const add = useAdd()
  const { over, close } = budgetAlerts(m)
  const b = m.budgetsOf(m.current)
  const next = m.payday ? labelForSalaryDate(m.payday).replace(/ \d{4}$/, (y) => (y.trim() === m.today.slice(0, 4) ? '' : y)) : null
  return (
    <div style={{ maxWidth: 760 }}>
      <h2 className="sec">Over budget</h2>
      <div className="panel">{over.length ? over.map((x) => (
        <Link key={x.id} className="row" href={`/budgets?cat=${x.id}`}>
          <span className="who cat"><Icon name={x.cat?.icon ?? 'other'} /></span>
          <span style={{ minWidth: 0 }}><div className="nm">{x.cat?.name}</div><div className="meta num">{kr(x.spent, true)} of {kr(x.amount, true)}</div></span>
          {x.left < 0 ? <span className="amt ovq"><i className="ovdot" />{kr(-x.left, true)} over</span> : <span className="pill zero">Fully spent</span>}
        </Link>
      )) : <div className="empty">No budget is over.</div>}</div>
      <h2 className="sec">Close to the line</h2>
      <div className="panel">{close.length ? close.map((x) => (
        <Link key={x.id} className="row" href={`/budgets?cat=${x.id}`}>
          <span className="who cat"><Icon name={x.cat?.icon ?? 'other'} /></span>
          <span style={{ minWidth: 0 }}><div className="nm">{x.cat?.name}</div><div className="meta num">{Math.round(x.ratio * 100)} of 100 used, {m.daysLeft} days left</div></span>
          <span className="pill">{kr(x.left, true)} left</span>
        </Link>
      )) : <div className="empty">Nothing is close.</div>}</div>
      <h2 className="sec">Heads-up</h2>
      <div className="panel">
        {m.payday && <div className="row"><span className="who cat"><Icon name="cal" /></span><span><div className="nm">Payday {dayLabel(m.payday)}</div><div className="meta">Log the salary and the {next} cycle starts.</div></span><span /></div>}
        {!m.tx.length && <div className="row"><span className="who cat"><Icon name="list" /></span><span><div className="nm">No transactions yet</div><div className="meta">Alerts start once you add what you spend.</div></span><button className="btn link" onClick={() => add()}>Add</button></div>}
        {m.current && !b.rows.some((r) => r.is_shared_topup) && <div className="row"><span className="who cat"><Icon name="moved" /></span><span style={{ minWidth: 0 }}><div className="nm">Nothing moved to the pot this cycle</div><div className="meta wrap">Your part of what you spend with {PARTNER} follows what you each move in.</div></span><span /></div>}
        {m.current && !b.list.length && <div className="row"><span className="who cat"><Icon name="budgets" /></span><span style={{ minWidth: 0 }}><div className="nm">No budgets this cycle</div><div className="meta wrap">Set one and it shows here when it gets close.</div></span><Link className="btn link" href="/budgets">Set</Link></div>}
        {!m.payday && m.tx.length > 0 && b.list.length > 0 && b.rows.some((r) => r.is_shared_topup) && <div className="empty">Nothing else to look at.</div>}
      </div>
    </div>
  )
}

export default function Page(): React.JSX.Element {
  const wide = useWide()
  const head = <Header title="Alerts" big="Alerts" back={!wide} />
  return (
    <Gate skeleton={<>{head}<div className="panel"><SkRows n={3} /></div></>}>
      {(m) => <>{head}<StatusLine /><Alerts m={m} /></>}
    </Gate>
  )
}
