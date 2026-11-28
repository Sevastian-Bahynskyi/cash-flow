import type { Model } from './model'
import type { TransactionRow } from './types'

const sum = (xs: readonly number[]): number => xs.reduce((a, x) => a + x, 0)

/**
 * The shared pot over some rows: who put in what, what the joint account spent together, and your share of it.
 * Spending and your share come from the model's parts, so they match the shared budgets and your own spending.
 */
export function pot(m: Model, rows: readonly TransactionRow[]) {
  const topups = rows.filter((r) => r.is_shared_topup)
  const gfTopupTotal = sum(topups.filter((r) => r.shared_participant === 'gf').map((r) => r.amount_minor))
  const meTopupTotal = sum(topups.filter((r) => r.shared_participant !== 'gf').map((r) => r.amount_minor))
  const totalTopupTotal = meTopupTotal + gfTopupTotal
  const spentRows = rows.filter((r) => m.portions(r, 'shared').some((p) => p.minor))
  const sharedExpenseTotal = sum(spentRows.flatMap((r) => m.portions(r, 'shared').map((p) => p.minor)))
  const userEffectiveShare = sum(spentRows.flatMap((r) => m.portions(r).filter((p) => p.shared).map((p) => p.minor)))
  const userShareRatio = sharedExpenseTotal ? userEffectiveShare / sharedExpenseTotal : totalTopupTotal ? meTopupTotal / totalTopupTotal : 0.5
  return { topups, spentRows, gfTopupTotal, meTopupTotal, totalTopupTotal, sharedExpenseTotal, userEffectiveShare, userShareRatio, sharedBalance: totalTopupTotal - sharedExpenseTotal, myPct: Math.round(100 * userShareRatio) }
}
