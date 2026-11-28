// Joint-account share math, all amounts in integer minor units.
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

/** My share of joint spending on a day: that day's cycle's share, or half outside every cycle. */
export const shareOn = (rows: readonly ShareRow[], cycles: readonly ShareSpan[], today: string): ((day: string) => number) => {
  const shares = new Map(cycles.map((c) => [c.id, shareForCycle(rows, c, today).ratio]));
  return (day) => {
    const c = cycles.find((x) => day >= x.startOn && (x.endOnExclusive === null || day < x.endOnExclusive));
    return c ? shares.get(c.id) ?? 0.5 : 0.5;
  };
};

