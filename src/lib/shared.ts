// Shared-account calculation for a single salary cycle.
// All amounts in integer minor units.
//
// Rules (from context.md):
//   partner_inferred = max(shared_expense_total - user_shared_topup_total, 0)
//   user_share_ratio = user_shared_topup_total / (user_shared_topup_total + partner_inferred)
//   if both totals are zero, ratio = 0.5
//   user_effective_share = round(shared_expense_total * user_share_ratio)
//   shared balance = total_topup_total - shared_expense_total

export type SharedTopup = {
  amount_minor: number;
  shared_participant: 'me' | 'gf' | null;
};
export type SharedExpense = { amount_minor: number };

export type SharedMathTransaction = {
  id: string;
  kind: 'expense' | 'income';
  amount_minor: number;
  occurred_on: string;
  created_at: string;
  shared: boolean;
  is_shared_topup: boolean;
  shared_participant: 'me' | 'gf' | null;
  personal_effect_minor?: number;
};

export type SharedCycleResult = {
  /** Top-ups attributed to the app user (participant me or legacy null). */
  meTopupTotal: number;
  /** Top-ups attributed to partner. */
  gfTopupTotal: number;
  /** meTopupTotal + gfTopupTotal */
  totalTopupTotal: number;
  sharedExpenseTotal: number;
  partnerInferred: number;
  userShareRatio: number;
  userEffectiveShare: number;
  sharedBalance: number;
};

export const computeSharedCycle = (
  topups: readonly SharedTopup[],
  sharedExpenses: readonly SharedExpense[],
): SharedCycleResult => {
  const meTopupTotal = topups.reduce((a, t) => {
    if (t.shared_participant === 'gf') return a;
    return a + t.amount_minor;
  }, 0);
  const gfTopupTotal = topups.reduce(
    (a, t) => (t.shared_participant === 'gf' ? a + t.amount_minor : a),
    0,
  );
  const totalTopupTotal = meTopupTotal + gfTopupTotal;
  const sharedExpenseTotal = sharedExpenses.reduce((a, e) => a + e.amount_minor, 0);
  const partnerInferred = Math.max(sharedExpenseTotal - totalTopupTotal, 0);
  const denom = meTopupTotal + gfTopupTotal + partnerInferred;
  const userShareRatio = denom === 0 ? 0.5 : meTopupTotal / denom;
  const userEffectiveShare = Math.round(sharedExpenseTotal * userShareRatio);
  const sharedBalance = totalTopupTotal - sharedExpenseTotal;
  return {
    meTopupTotal,
    gfTopupTotal,
    totalTopupTotal,
    sharedExpenseTotal,
    partnerInferred,
    userShareRatio,
    userEffectiveShare,
    sharedBalance,
  };
};

export const orderTransactionsForSharedMath = <T extends { id: string; occurred_on: string; created_at: string }>(
  rows: readonly T[],
): T[] =>
  [...rows].sort((left, right) => {
    if (left.occurred_on !== right.occurred_on) return left.occurred_on.localeCompare(right.occurred_on);
    if (left.created_at !== right.created_at) return left.created_at.localeCompare(right.created_at);
    return left.id.localeCompare(right.id);
  });

export const computePersonalExpenseMinorByTransactionId = (
  rows: readonly SharedMathTransaction[],
): Map<string, number> => {
  const orderedRows = orderTransactionsForSharedMath(rows);
  const out = new Map<string, number>();
  let meTopupBeforeMinor = 0;
  let gfTopupBeforeMinor = 0;

  for (const row of orderedRows) {
    if (row.kind !== 'expense') {
      out.set(row.id, 0);
      continue;
    }

    if (typeof row.personal_effect_minor === 'number') {
      out.set(row.id, Math.max(0, -row.personal_effect_minor));
    } else if (row.is_shared_topup) {
      out.set(row.id, row.shared_participant === 'gf' ? 0 : row.amount_minor);
    } else if (row.shared) {
      const denom = meTopupBeforeMinor + gfTopupBeforeMinor;
      const ratio = denom === 0 ? 0.5 : meTopupBeforeMinor / denom;
      out.set(row.id, Math.round(row.amount_minor * ratio));
    } else {
      out.set(row.id, row.amount_minor);
    }

    if (row.is_shared_topup) {
      if (row.shared_participant === 'gf') gfTopupBeforeMinor += row.amount_minor;
      else meTopupBeforeMinor += row.amount_minor;
    }
  }

  return out;
};
