'use client'

import type { Model } from '@/lib/data/model'
import { daysBetween, dayLabel, kr, shortDate } from '@/lib/fmt'
import { PARTNER } from '@/lib/partner'
import { Ring, Underline } from '@/components/Marks'

/** The month as an object you hold: what is left, days to payday, a bar per day (yours white, shared saffron). */
export function CycleCard({ m }: { m: Model }): React.JSX.Element | null {
  const c = m.current
  if (!c) return null
  const b = m.budgetsOf(c)
  const n = m.days, todayIdx = Math.min(n - 1, Math.max(0, daysBetween(c.startOn, m.today)))
  const daily = Array.from({ length: n }, () => ({ mine: 0, shared: 0 }))
  for (const r of b.rows) {
    const i = daysBetween(c.startOn, r.occurred_on)
    const v = m.mine(r)
    if (i >= 0 && i < n && v) daily[i]![r.shared ? 'shared' : 'mine'] += v
  }
  const totals = daily.slice(0, todayIdx + 1).map((d) => d.mine + d.shared).filter(Boolean).sort((x, y) => x - y)
  const cap = Math.max(1, (totals[Math.floor(totals.length * 0.9)] ?? 1) * 1.15)
  const W = 310, H = 72, step = W / n, bw = Math.min(6, step * 0.7)
  const hasBudgets = b.list.length > 0
  const big = hasBudgets ? b.left : b.income - b.allMine
  const daysLeft = m.daysLeft
  const perDay = hasBudgets && big > 0 && daysLeft ? Math.round(big / daysLeft) : 0
  const usedPct = hasBudgets && b.total ? Math.round((100 * b.used) / b.total) : 0
  const gonePct = Math.round((100 * (todayIdx + 1)) / n)
  const pace = !b.used ? 'Nothing spent yet this cycle' : usedPct > gonePct + 2 ? 'Spending is ahead of the days' : usedPct < gonePct - 2 ? 'Spending is behind the days' : 'Spending keeps pace with the days'
  const due = m.payday && m.payday <= m.today
  return (
    <section className={`hero ${hasBudgets && big < 0 ? 'over' : ''}`} aria-label="This cycle">
      <div className="top"><span>{shortDate(c.startOn)} <span className="dash">–</span> {shortDate(c.endInclusive)}</span><span>{m.payday ? `Payday ${dayLabel(m.payday)}` : ''}</span></div>
      <div className="big num"><Underline>{kr(big, true)}</Underline></div>
      <div className="sub">
        {hasBudgets ? (big < 0 ? 'over all budgets, ' : 'left to spend, ') : 'in minus out this cycle, '}
        <em>{due ? 'payday is due' : `${daysLeft} ${daysLeft === 1 ? 'day' : 'days'} to payday`}</em>
        {perDay > 0 && <><br />About {kr(perDay, true)} a day</>}
      </div>
      <div className="days">
        <svg viewBox={`0 -2 ${W} ${H + 18}`} role="img" aria-label="Spending per day this cycle">
          {daily.map((d, i) => {
            const x = i * step + (step - bw) / 2
            if (i > todayIdx) return <rect key={i} x={x} y={H - 8} width={bw} height={8} rx={3} fill="none" stroke="var(--on-you-line)" strokeWidth={1.2} />
            const tot = d.mine + d.shared
            if (!tot) return <rect key={i} x={x} y={H - 2} width={bw} height={2} rx={1} fill="var(--on-you-line)" />
            const h = Math.max(4, Math.min(1, tot / cap) * (H - 4)), hs = (h * d.shared) / tot, hm = h - hs
            return (
              <g key={i}>
                {hm > 0 && <rect x={x} y={H - hm} width={bw} height={hm} rx={3} fill="var(--on-you)" />}
                {hs > 0 && <rect x={x} y={H - h} width={bw} height={Math.max(2, hs - (hm ? 1.5 : 0))} rx={3} fill="var(--anna)" />}
                {tot > cap && <path d={`M${x - 1} ${H - h + 12}l${bw + 2} -3M${x - 1} ${H - h + 16}l${bw + 2} -3`} stroke="var(--you)" strokeWidth={1.6} />}
              </g>
            )
          })}
          <circle cx={todayIdx * step + step / 2} cy={H + 7} r={2.4} fill="var(--on-you)" />
          <g className="mka-today" transform={`translate(${(todayIdx * step + step / 2 - 14).toFixed(1)} ${H - 2})`}><Ring size={28} /></g>
          <line x1={0} x2={W} y1={H + 14} y2={H + 14} stroke="var(--on-you-line)" strokeWidth={2} strokeLinecap="round" />
          {hasBudgets && <line x1={0} x2={(W * Math.min(1, b.used / Math.max(1, b.total))).toFixed(1)} y1={H + 14} y2={H + 14} stroke="var(--on-you)" strokeWidth={2} strokeLinecap="round" />}
          <line x1={todayIdx * step} x2={todayIdx * step} y1={H + 10} y2={H + 18} stroke="var(--anna)" strokeWidth={2} strokeLinecap="round" />
        </svg>
        <div className="axis"><span style={{ left: 0 }}>{shortDate(c.startOn)}</span><span style={{ right: `${((100 * (n - todayIdx - 0.5)) / n).toFixed(2)}%`, transform: 'translateX(50%)' }}>Today</span></div>
      </div>
      {hasBudgets && <div className="pace"><span>{pace}</span><span className="num"><b>{usedPct}%</b> of budgets used, <b>{gonePct}%</b> of days gone</span></div>}
      <div className="key" style={{ marginTop: 8 }}><span><i style={{ background: 'var(--on-you)' }} />Yours</span><span><i style={{ background: 'var(--anna)' }} />Shared with {PARTNER}</span><span><i style={{ border: '1.2px solid var(--on-you-2)' }} />Days to come</span></div>
    </section>
  )
}
