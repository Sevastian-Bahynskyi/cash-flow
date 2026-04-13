// Shared-account calculation for a single salary cycle.
// All amounts in integer minor units.
//
// Rules (from context.md):
//   partner_inferred = max(shared_expense_total - user_shared_topup_total, 0)
//   user_share_ratio = user_shared_topup_total / (user_shared_topup_total + partner_inferred)
//   if both totals are zero, ratio = 0.5
//   user_effective_share = round(shared_expense_total * user_share_ratio)
//   shared balance = user_shared_topup_total - user_effective_share

export type SharedTopup = {
  amount_minor: number;
  shared_participant: 'me' | 'gf' | null;
};
export type SharedExpense = { amount_minor: number };

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
  const sharedBalance = meTopupTotal - userEffectiveShare;
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
