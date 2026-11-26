import type { Model } from '@/lib/data/model'

type Line = ReturnType<Model['budgetsOf']>['list'][number]
/** Budgets at or past 80% of their line this cycle (DATA.md § 3 Alerts); over is 100% or more. */
export function budgetAlerts(m: Model): { over: Line[]; close: Line[] } {
  const list = m.budgetsOf(m.current).list
  return { over: list.filter((x) => x.ratio >= 1), close: list.filter((x) => x.ratio >= 0.8 && x.ratio < 1) }
}
