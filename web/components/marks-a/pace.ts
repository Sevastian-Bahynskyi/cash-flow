import type { Cycle, Model } from '@/lib/data/model'
import { budgetState, type BudgetState } from '@/components/Marks'
import { daysBetween } from '@/lib/fmt'

/** Share of a cycle gone, today counted: (today - start + 1) / days for the current cycle, 1 for past ones. */
export function goneShare(m: Model, c: Cycle | null): number {
  if (!c) return 1
  if (m.today > c.endInclusive) return 1
  if (m.today < c.startOn) return 0
  return Math.min(1, (daysBetween(c.startOn, m.today) + 1) / (daysBetween(c.startOn, c.endInclusive) + 1))
}

/** budgetState, but a budget spent to the krone reads "Used up", not "0 kr left, ahead". */
export function stateOf(spent: number, amount: number, share: number): BudgetState {
  return amount > 0 && spent === amount ? 'ok' : budgetState(spent, amount, share)
}
