import type { Model } from '@/lib/data/model'
import { budgetState } from '@/components/Marks'
import { goneShare } from '@/components/marks-a/pace'

type Line = ReturnType<Model['budgetsOf']>['list'][number]
/**
 * Budgets at or past 80% of their line this cycle (DATA.md § 3 Alerts); over is 100% or more.
 * Ahead: spent a bigger share than the share of the cycle gone (MARKS.md), not yet over.
 */
export function budgetAlerts(m: Model): { over: Line[]; ahead: Line[]; close: Line[] } {
  const list = m.budgetsOf(m.current).list
  const share = goneShare(m, m.current)
  return {
    over: list.filter((x) => x.ratio >= 1),
    ahead: list.filter((x) => x.ratio < 1 && budgetState(x.spent, x.amount, share) === 'ahead'),
    close: list.filter((x) => x.ratio >= 0.8 && x.ratio < 1),
  }
}
