// Where a budget stands (web/components/Marks.tsx and marks-a/pace.ts), shared by every screen.
import { daysBetween } from '@/core/fmt';
import type { Cycle, Model } from '@/core/data/model';

export type BudgetState = 'ok' | 'ahead' | 'over' | 'none';

/**
 * Over its line, ahead of the days (spent a bigger share of it than the share of the cycle gone,
 * with a small margin), or on track. Pace only warns once a tenth of the budget is used.
 */
export function budgetState(spent: number, amount: number, daysGoneShare: number): BudgetState {
  if (!amount) return 'none';
  if (spent > amount) return 'over';
  if (spent === amount) return 'ok';
  const used = spent / amount;
  return used >= 0.1 && used > daysGoneShare + 0.08 ? 'ahead' : 'ok';
}

/** Share of a cycle gone, today counted: (today - start + 1) / days for the current cycle, 1 for past ones. */
export function goneShare(m: Model, c: Cycle | null): number {
  if (!c) return 1;
  if (m.today > c.endInclusive) return 1;
  if (m.today < c.startOn) return 0;
  return Math.min(1, (daysBetween(c.startOn, m.today) + 1) / (daysBetween(c.startOn, c.endInclusive) + 1));
}
