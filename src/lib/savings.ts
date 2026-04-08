// Derive the current savings total from an ordered history of savings events.
// Events must be passed in chronological order (ascending by occurred_on, then created_at).
// `set` snaps the running total to the given amount.

import type { SavingsEventRow } from '@/features/savings/types';

export const savingsTotal = (events: readonly SavingsEventRow[]): number => {
  let total = 0;
  for (const e of events) {
    if (e.action === 'add') total += e.amount_minor;
    else if (e.action === 'remove') total = Math.max(0, total - e.amount_minor);
    else total = e.amount_minor; // 'set'
  }
  return total;
};
