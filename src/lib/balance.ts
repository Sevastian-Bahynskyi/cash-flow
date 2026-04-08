// Personal balance derivation. All amounts in integer minor units.
// Formula (from context.md):
//   personal = incomes
//            - personal expenses
//            - shared top-ups
//            - savings adds + savings removes
//            + loan borrowed - loan repaid
//
// A "personal expense" is an expense row that is neither a shared expense
// (shared=true, i.e. spend from the shared pot) nor a shared top-up
// (is_shared_topup=true, i.e. transfer from personal into the shared pot).
// Shared expenses do not reduce personal balance directly; only the user's
// effective share does — and that is computed by the shared module.

import type { SavingsAction } from '@/features/savings/types';
import type { LoanEventKind } from '@/features/loans/types';

export type BalanceTxn = {
  kind: 'expense' | 'income';
  amount_minor: number;
  shared: boolean;
  is_shared_topup: boolean;
};

export type BalanceSavingsEvent = {
  action: SavingsAction;
  amount_minor: number;
};

export type BalanceLoanEvent = {
  kind: LoanEventKind;
  amount_minor: number;
};

export const personalBalance = (
  txns: readonly BalanceTxn[],
  savings: readonly BalanceSavingsEvent[],
  loanEvents: readonly BalanceLoanEvent[],
): number => {
  let total = 0;
  for (const t of txns) {
    if (t.kind === 'income') {
      total += t.amount_minor;
      continue;
    }
    if (t.shared) continue; // shared expenses don't affect personal balance directly
    if (t.is_shared_topup) {
      total -= t.amount_minor;
      continue;
    }
    total -= t.amount_minor; // personal expense
  }
  for (const s of savings) {
    if (s.action === 'add') total -= s.amount_minor;
    else if (s.action === 'remove') total += s.amount_minor;
    // `set` does not affect personal balance; it only redefines the savings total.
  }
  for (const e of loanEvents) {
    if (e.kind === 'borrowed') total += e.amount_minor;
    else total -= e.amount_minor;
  }
  return total;
};
