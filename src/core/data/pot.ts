import { computeSharedCycle } from '@/core/domain/shared'
import type { TransactionRow } from './types'

/** The shared pot over some rows: who put in what, what was spent together, your part (inferred, never typed). */
export function pot(rows: readonly TransactionRow[]) {
  const topups = rows.filter((r) => r.is_shared_topup)
  const spent = rows.filter((r) => r.shared && r.kind === 'expense')
  const s = computeSharedCycle(topups.map((r) => ({ amount_minor: r.amount_minor, shared_participant: r.shared_participant })), spent)
  return { ...s, topups, spentRows: spent, myPct: Math.round(100 * s.userShareRatio) }
}
