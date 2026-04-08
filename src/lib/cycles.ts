// Salary-cycle utilities. A cycle is defined by a salary income transaction.
// Cycle label rule: if the salary day-of-month is >= 25, label = next month;
// otherwise label = current month. Cycles are ordered by salary date ascending.
import { formatMonthYearLabel } from '@/lib/format';

export type SalaryTxn = {
  id: string;
  occurred_on: string; // YYYY-MM-DD
};

export type SalaryCycle = {
  id: string; // id of the salary transaction that opens the cycle
  startOn: string; // YYYY-MM-DD inclusive
  endOnExclusive: string | null; // YYYY-MM-DD exclusive, null for the active (latest) cycle
  label: string; // e.g. "May 2026"
};

const parseYmd = (ymd: string): { y: number; m: number; d: number } => {
  const parts = ymd.split('-');
  if (parts.length !== 3) {
    throw new Error(`Invalid date format: ${ymd}`);
  }
  return {
    y: Number(parts[0]),
    m: Number(parts[1]),
    d: Number(parts[2]),
  };
};

export const labelForSalaryDate = (ymd: string): string => {
  const { y, m, d } = parseYmd(ymd);
  if (d >= 25) {
    const ny = m === 12 ? y + 1 : y;
    const nm = m === 12 ? 1 : m + 1;
    return formatMonthYearLabel(`${ny}-${String(nm).padStart(2, '0')}-01`);
  }
  return formatMonthYearLabel(`${y}-${String(m).padStart(2, '0')}-01`);
};

// Build ordered cycles from salary transactions.
// Each cycle runs from its salary date (inclusive) to the next salary date (exclusive).
// The most recent cycle has endOnExclusive = null (active).
export const buildSalaryCycles = (salaries: readonly SalaryTxn[]): SalaryCycle[] => {
  const sorted = [...salaries].sort((a, b) => a.occurred_on.localeCompare(b.occurred_on));
  return sorted.map((s, i) => {
    const next = sorted[i + 1];
    return {
      id: s.id,
      startOn: s.occurred_on,
      endOnExclusive: next ? next.occurred_on : null,
      label: labelForSalaryDate(s.occurred_on),
    };
  });
};

export const findCycleFor = (
  cycles: readonly SalaryCycle[],
  occurredOn: string,
): SalaryCycle | null => {
  for (const c of cycles) {
    const afterStart = occurredOn >= c.startOn;
    const beforeEnd = c.endOnExclusive === null || occurredOn < c.endOnExclusive;
    if (afterStart && beforeEnd) return c;
  }
  return null;
};

export const activeCycle = (cycles: readonly SalaryCycle[]): SalaryCycle | null => {
  if (cycles.length === 0) return null;
  return cycles[cycles.length - 1] ?? null;
};

// Group arbitrary rows with an `occurred_on` by cycle id.
// Rows that fall before the first cycle are placed under the special key "pre-cycle".
export const PRE_CYCLE = 'pre-cycle' as const;

export const groupByCycle = <T extends { occurred_on: string }>(
  rows: readonly T[],
  cycles: readonly SalaryCycle[],
): Map<string, T[]> => {
  const out = new Map<string, T[]>();
  for (const row of rows) {
    const cycle = findCycleFor(cycles, row.occurred_on);
    const key = cycle ? cycle.id : PRE_CYCLE;
    const bucket = out.get(key);
    if (bucket) bucket.push(row);
    else out.set(key, [row]);
  }
  return out;
};
