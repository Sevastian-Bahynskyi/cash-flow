// Shared-account calculation for a single salary cycle.
// All amounts in integer minor units.
//
// Rules (from context.md):
//   partner_inferred = max(shared_expense_total - user_shared_topup_total, 0)
//   user_share_ratio = user_shared_topup_total / (user_shared_topup_total + partner_inferred)
//   if both totals are zero, ratio = 0.5
//   user_effective_share = round(shared_expense_total * user_share_ratio)
//   shared balance = user_shared_topup_total - user_effective_share

export type SharedTopup = { amount_minor: number };
export type SharedExpense = { amount_minor: number };

export type SharedCycleResult = {
  userTopupTotal: number;
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
  const userTopupTotal = topups.reduce((a, t) => a + t.amount_minor, 0);
  const sharedExpenseTotal = sharedExpenses.reduce((a, e) => a + e.amount_minor, 0);
  const partnerInferred = Math.max(sharedExpenseTotal - userTopupTotal, 0);
  const denom = userTopupTotal + partnerInferred;
  const userShareRatio = denom === 0 ? 0.5 : userTopupTotal / denom;
  const userEffectiveShare = Math.round(sharedExpenseTotal * userShareRatio);
  const sharedBalance = userTopupTotal - userEffectiveShare;
  return {
    userTopupTotal,
    sharedExpenseTotal,
    partnerInferred,
    userShareRatio,
    userEffectiveShare,
    sharedBalance,
  };
};
