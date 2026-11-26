import { kr } from '@/lib/fmt'

// Small marks with one meaning each, the same on every screen. Colour comes from the CSS around them (currentColor).

/** A check: a budget kept to the end of its cycle, or something done. */
export function Check({ size = 18 }: { size?: number }): React.JSX.Element {
  return <svg className="mk-check" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
}

export type BudgetState = 'ok' | 'ahead' | 'over' | 'none'
/**
 * Where a budget stands: over its line, ahead of the days (spent a bigger share of it than the share
 * of the cycle gone, with a small margin), or on track. Pace only warns once a tenth of the budget is used.
 */
export function budgetState(spent: number, amount: number, daysGoneShare: number): BudgetState {
  if (!amount) return 'none'
  if (spent > amount) return 'over'
  if (spent === amount) return 'ok' // used up exactly: not over, and nothing left to be ahead with
  const used = spent / amount
  return used >= 0.1 && used > daysGoneShare + 0.08 ? 'ahead' : 'ok'
}

/**
 * A budget meter: a round bar filled to what is spent. Within the budget it is indigo, with a short line at today;
 * over the budget the bar turns a calm grey up to where the budget ended, then a darker grey for the part over. The words beside it say the rest.
 */
export function Meter({ spent, amount, daysGoneShare }: { spent: number; amount: number; daysGoneShare: number }): React.JSX.Element | null {
  if (!amount) return null
  const st = budgetState(spent, amount, daysGoneShare)
  const pct = (x: number): string => `${(100 * Math.min(1, Math.max(0, x))).toFixed(1)}%`
  return (
    <span className={`mk-meter ${st}`} aria-hidden="true">
      <i className="mk-fill" style={{ width: pct(spent / amount) }} />
      {st === 'over' ? <><i className="mk-more" style={{ left: pct(amount / spent) }} /><i className="mk-end" style={{ left: pct(amount / spent) }} /></> : <i className="mk-today" style={{ left: pct(daysGoneShare) }} />}
    </span>
  )
}

/** The words that go with a state: colour never speaks alone (copy.md § In and out). */
export function StatePill({ left, st }: { left: number; st: BudgetState }): React.JSX.Element {
  const v = kr(Math.abs(left), true)
  if (st === 'over') return <span className="pill ov">{v} over</span>
  if (st === 'ahead') return <span className="pill ahead">{v} left, ahead</span>
  if (st === 'none') return <span className="pill zero">No budget</span>
  return left === 0 ? <span className="pill zero">Used up</span> : <span className="pill">{v} left</span>
}
