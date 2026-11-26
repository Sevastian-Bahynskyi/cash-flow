// Shared-account calculation for a single salary cycle.
// All amounts in integer minor units.
//
// Rules (from context.md):
//   user_share_ratio = user_shared_topup_total / total_topup_total
//   if total_topup_total is zero, ratio = 0.5
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
  const partnerInferred = Math.max(sharedExpenseTotal - meTopupTotal, 0);
  const userShareRatio = totalTopupTotal === 0 ? 0.5 : meTopupTotal / totalTopupTotal;
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

    if (row.is_shared_topup) {
      out.set(row.id, row.shared_participant === 'gf' ? 0 : row.amount_minor);
    } else if (row.shared) {
      const denom = meTopupBeforeMinor + gfTopupBeforeMinor;
      const ratio = denom === 0 ? 0.5 : meTopupBeforeMinor / denom;
      out.set(row.id, Math.round(row.amount_minor * ratio));
    } else if (typeof row.personal_effect_minor === 'number') {
      out.set(row.id, Math.max(0, -row.personal_effect_minor));
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

// ---- Bank-era share math (Cashflow v2) ----
// share = my top-ups / all top-ups in the salary cycle; no top-ups in the cycle -> trailing 90 days; none -> 0.5.
// My share of joint spending counts in my personal category budgets (400 kr joint groceries at 60% = 240 kr Food).

export type ShareRow = {
  id: string;
  kind: 'expense' | 'income';
  amount_minor: number;
  occurred_on: string;
  shared: boolean;
  is_shared_topup: boolean;
  shared_participant: 'me' | 'gf' | null;
  /** Bank rows: what the row does to budgets. Null/absent on old manual rows. */
  movement?: string | null;
  /** 'void' rows (expired pending payments) never count. */
  status?: string | null;
};

export type ShareSpan = { id: string; startOn: string; endOnExclusive: string | null };

export type CycleShare = {
  ratio: number;
  source: 'cycle' | 'trailing90' | 'default';
  meTopupMinor: number;
  totalTopupMinor: number;
};

const DAY_MS = 86_400_000;
const NOT_SPENDING = new Set(['moved', 'topup', 'ignore']);

const addDaysYmd = (ymd: string, days: number): string => new Date(Date.parse(`${ymd}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
const counts = (r: ShareRow): boolean => r.status !== 'void';

const topupShare = (rows: readonly ShareRow[], from: string, toExclusive: string): { me: number; total: number } => {
  let me = 0;
  let total = 0;
  for (const r of rows) {
    if (!r.is_shared_topup || !counts(r) || r.occurred_on < from || r.occurred_on >= toExclusive) continue;
    total += r.amount_minor;
    if (r.shared_participant !== 'gf') me += r.amount_minor;
  }
  return { me, total };
};

/** My share of the joint account for one salary cycle. `today` closes the open (current) cycle. */
export const shareForCycle = (rows: readonly ShareRow[], cycle: ShareSpan, today: string): CycleShare => {
  const end = cycle.endOnExclusive ?? addDaysYmd(today, 1);
  const inCycle = topupShare(rows, cycle.startOn, end);
  if (inCycle.total > 0) return { ratio: inCycle.me / inCycle.total, source: 'cycle', meTopupMinor: inCycle.me, totalTopupMinor: inCycle.total };
  const trailing = topupShare(rows, addDaysYmd(end, -90), end);
  if (trailing.total > 0) return { ratio: trailing.me / trailing.total, source: 'trailing90', meTopupMinor: trailing.me, totalTopupMinor: trailing.total };
  return { ratio: 0.5, source: 'default', meTopupMinor: 0, totalTopupMinor: 0 };
};

/**
 * What each expense costs me, in minor units: my share of a joint expense, nothing for top-ups,
 * own moves, ignored or void rows, the full amount otherwise. Rows outside every cycle use the default share.
 */
export const computeMyCostByTransactionId = (rows: readonly ShareRow[], cycles: readonly ShareSpan[], today: string): Map<string, number> => {
  const shares = new Map(cycles.map((c) => [c.id, shareForCycle(rows, c, today).ratio]));
  const cycleOf = (day: string): ShareSpan | undefined => cycles.find((c) => day >= c.startOn && (c.endOnExclusive === null || day < c.endOnExclusive));
  const out = new Map<string, number>();
  for (const r of rows) {
    if (r.kind !== 'expense' || !counts(r) || r.is_shared_topup || NOT_SPENDING.has(r.movement ?? '')) {
      out.set(r.id, 0);
      continue;
    }
    if (!r.shared) {
      out.set(r.id, r.amount_minor);
      continue;
    }
    const c = cycleOf(r.occurred_on);
    out.set(r.id, Math.round(r.amount_minor * (c ? shares.get(c.id) ?? 0.5 : 0.5)));
  }
  return out;
};
