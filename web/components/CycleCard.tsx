'use client'

import type { Model } from '@/lib/data/model'
import { daysBetween, dayLabel, kr, shortDate } from '@/lib/fmt'
import { PARTNER } from '@/lib/partner'

const pct = (v: number): string => `${(100 * v).toFixed(2)}%`

/**
 * The cycle as one card: what is left, days to payday, and a running total of spending so far
 * (your own on top, your part of shared in saffron below), against the budgets and an even pace.
 */
export function CycleCard({ m }: { m: Model }): React.JSX.Element | null {
  const c = m.current
  if (!c) return null
  const b = m.budgetsOf(c)
  const hasBudgets = b.list.length > 0
  const n = m.days, todayIdx = Math.min(n - 1, Math.max(0, daysBetween(c.startOn, m.today)))
  // With budgets the line counts what the budgets count (budgeted categories, split parts in their own), so it ends at "used".
  const budgeted = new Set(b.list.map((x) => x.id))
  const daily = Array.from({ length: todayIdx + 1 }, () => ({ mine: 0, shared: 0 }))
  for (const r of b.rows) {
    const i = daysBetween(c.startOn, r.occurred_on)
    if (i < 0 || i > todayIdx) continue
    const v = hasBudgets ? m.portions(r).filter((x) => budgeted.has(m.parentOf(x.category_id)?.id ?? '')).reduce((a, x) => a + x.minor, 0) : m.mine(r)
    if (v) daily[i]![r.shared ? 'shared' : 'mine'] += v
  }
  let cm = 0, cs = 0
  const cum = daily.map((d) => { cm += d.mine; cs += d.shared; return { mine: cm, shared: cs } })
  const spentSoFar = cm + cs
  const max = Math.max(hasBudgets ? b.total : 0, spentSoFar, 1) * 1.1
  const X = (i: number): number => (i + 1) / n, Y = (v: number): number => 1 - v / max
  const pts = (f: (p: { mine: number; shared: number }) => number): string => cum.map((p, i) => `L${(X(i) * 320).toFixed(1)} ${(Y(f(p)) * 100).toFixed(1)}`).join('')
  const total = `M0 100${pts((p) => p.mine + p.shared)}`
  const shared = `M0 100${pts((p) => p.shared)}`
  const close = `L${(X(todayIdx) * 320).toFixed(1)} 100Z`

  const big = hasBudgets ? b.left : b.income - b.allMine
  const daysLeft = m.daysLeft
  const perDay = hasBudgets && big > 0 && daysLeft ? Math.round(big / daysLeft) : 0
  const usedPct = hasBudgets && b.total ? Math.round((100 * b.used) / b.total) : 0
  const gonePct = Math.round((100 * (todayIdx + 1)) / n)
  const pace = !b.used ? 'Nothing spent yet this cycle' : usedPct > gonePct + 2 ? 'Spending is ahead of the days' : usedPct < gonePct - 2 ? 'Spending is behind the days' : 'Spending keeps pace with the days'
  const due = m.payday && m.payday <= m.today
  const todayX = X(todayIdx)
  return (
    <section className="hero" aria-label="This cycle">
      <div className="top"><span>{shortDate(c.startOn)} – {shortDate(c.endInclusive)}</span><span>{m.payday ? `Payday ${dayLabel(m.payday)}` : ''}</span></div>
      <div className="big num">{kr(big, true)}</div>
      <div className="sub">
        {hasBudgets ? (big < 0 ? 'over all budgets, ' : 'left to spend, ') : 'in minus out this cycle, '}
        <em>{due ? 'payday is due' : `${daysLeft} ${daysLeft === 1 ? 'day' : 'days'} to payday`}</em>
        {perDay > 0 && <><br />About {kr(perDay, true)} a day</>}
      </div>
      <div className="days">
        <span className="dayslabel">Spent so far <b className="num">{kr(spentSoFar, true)}</b></span>
        <div className="plot">
          <svg viewBox="0 0 320 100" preserveAspectRatio="none" role="img" aria-label={`Spent so far this cycle: ${kr(spentSoFar, true)}${hasBudgets ? ` of ${kr(b.total, true)} in budgets` : ''}, day ${todayIdx + 1} of ${n}.`}>
            {hasBudgets && <line x1={0} x2={320} y1={Y(b.total) * 100} y2={Y(b.total) * 100} className="budgetline" />}
            {hasBudgets && <line x1={0} x2={320} y1={100} y2={Y(b.total) * 100} className="paceline" />}
            <path d={total + close} className="area" />
            {cs > 0 && <path d={shared + close} className="area shared" />}
            <path d={total} className="line" />
            <line x1={0} x2={320} y1={100} y2={100} className="base" />
          </svg>
          {hasBudgets && <span className="budgetcap num" style={{ top: pct(Y(b.total)) }}>Budgets {kr(b.total, true)}</span>}
          <span className="todaydot" style={{ left: pct(todayX), top: pct(Y(spentSoFar)) }} />
        </div>
        <div className="axis">
          {/* start and end always show; "Today" only where it has room (the dot already marks today) */}
          <span style={{ left: 0 }}>{shortDate(c.startOn)}</span>
          {todayX > 0.25 && todayX < 0.72 && <span style={{ left: pct(todayX), transform: 'translateX(-50%)' }}>Today</span>}
          <span style={{ right: 0 }}>{shortDate(c.endInclusive)}</span>
        </div>
      </div>
      {hasBudgets && <div className="pace"><span>{pace}</span><span className="num"><b>{usedPct}%</b> of budgets used, <b>{gonePct}%</b> of days gone</span></div>}
      <div className="key"><span><i style={{ background: 'var(--on-you)' }} />Yours</span><span><i style={{ background: 'var(--anna)' }} />Shared with {PARTNER}</span>{hasBudgets && <span><i className="dashed" />Even pace</span>}</div>
    </section>
  )
}
