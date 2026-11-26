// Balance derivation helpers. All amounts are integer minor units.
// `transactionBalance` is the spendable balance for a set of transactions.
// `bankBalance` is the net position of bank objects such as savings and loans.

export type BalanceTxn = {
  kind: 'expense' | 'income';
  amount_minor: number;
  shared: boolean;
  is_shared_topup: boolean;
  shared_participant?: 'me' | 'gf' | null;
  personal_effect_minor?: number;
};

export const transactionBalance = (txns: readonly BalanceTxn[]): number => {
  let total = 0;
  for (const t of txns) {
    if (typeof t.personal_effect_minor === 'number') {
      total += t.personal_effect_minor;
      continue;
    }
    if (t.kind === 'income') {
      total += t.amount_minor;
      continue;
    }
    if (t.shared) continue; // shared expenses don't affect personal balance directly
    if (t.is_shared_topup) {
      if (t.shared_participant === 'gf') continue;
      total -= t.amount_minor;
      continue;
    }
    total -= t.amount_minor; // personal expense
  }
  return total;
};

export const bankBalance = (savingsMinor: number, loanRemainingMinor: number): number =>
  savingsMinor - loanRemainingMinor;
