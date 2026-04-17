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

const formatRangeDate = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' });

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

type YmdParts = { y: number; m: number; d: number };

const pad2 = (value: number): string => String(value).padStart(2, '0');

export const toLocalIsoDay = (date: Date): string =>
  `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;

export const cycleMatch = (
  row: { occurred_on: string },
  cycle: SalaryCycle | null,
): boolean => {
  if (!cycle) return false;
  const afterStart = row.occurred_on >= cycle.startOn;
  const beforeEnd = cycle.endOnExclusive === null || row.occurred_on < cycle.endOnExclusive;
  return afterStart && beforeEnd;
};

const addDays = (date: Date, amount: number): Date =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate() + amount);

const addMonths = ({ y, m, d }: YmdParts, delta: number): YmdParts => {
  const idx = (y * 12 + (m - 1)) + delta;
  const ny = Math.floor(idx / 12);
  const nm = (idx % 12) + 1;
  return { y: ny, m: nm, d };
};

const monthStartYmd = (y: number, m: number): string => `${y}-${pad2(m)}-01`;

export const formatHeroCycleRange = (cycle: SalaryCycle, today: Date): string => formatCycleDisplayRange(cycle, today);

export const formatCycleDisplayRange = (cycle: SalaryCycle, today: Date): string => {
  const start = parseYmd(cycle.startOn);
  const endExclusive = cycle.endOnExclusive
    ? parseYmd(cycle.endOnExclusive)
    : { y: today.getFullYear(), m: today.getMonth() + 1, d: today.getDate() };

  const endDate = cycle.endOnExclusive && endExclusive.d === 1
    ? addDays(new Date(endExclusive.y, endExclusive.m - 1, endExclusive.d), -1)
    : new Date(endExclusive.y, endExclusive.m - 1, endExclusive.d);

  return `${formatRangeDate.format(new Date(start.y, start.m - 1, start.d))} – ${formatRangeDate.format(endDate)}`;
};

const monthKey = (ymd: string): { y: number; m: number } => {
  const { y, m } = parseYmd(ymd);
  return { y, m };
};

const anchoredYmd = (y: number, m: number, anchorDay: number): string =>
  `${y}-${pad2(m)}-${pad2(Math.min(anchorDay, new Date(y, m, 0).getDate()))}`;

const cycleStartForDate = (
  ymd: string,
  anchorDay: number,
): { y: number; m: number } => {
  const { y, m } = parseYmd(ymd);
  const currentMonthStart = anchoredYmd(y, m, anchorDay);
  if (ymd < currentMonthStart) {
    const previous = addMonths({ y, m, d: 1 }, -1);
    return { y: previous.y, m: previous.m };
  }
  return { y, m };
};

export const buildCalendarCycles = (rows: readonly { occurred_on: string }[]): SalaryCycle[] => {
  if (rows.length === 0) return [];
  const sorted = [...rows].sort((a, b) => a.occurred_on.localeCompare(b.occurred_on));
  const first = sorted[0]?.occurred_on;
  const last = sorted[sorted.length - 1]?.occurred_on;
  if (!first || !last) return [];

  const start = monthKey(first);
  const end = monthKey(last);

  const out: SalaryCycle[] = [];
  let cursor = { y: start.y, m: start.m, d: 1 };
  const endIdx = end.y * 12 + (end.m - 1);
  while (cursor.y * 12 + (cursor.m - 1) <= endIdx) {
    const startOn = monthStartYmd(cursor.y, cursor.m);
    const next = addMonths(cursor, 1);
    const endOnExclusive = monthStartYmd(next.y, next.m);
    const id = `cal-${cursor.y}-${pad2(cursor.m)}`;
    out.push({
      id,
      startOn,
      endOnExclusive,
      label: formatMonthYearLabel(startOn),
    });
    cursor = next;
  }

  // Latest calendar cycle should be considered active.
  if (out.length > 0) {
    const lastIndex = out.length - 1;
    const last = out[lastIndex];
    if (last) out[lastIndex] = { ...last, endOnExclusive: null };
  }

  return out;
};

export const buildDefaultCycles = (txns: readonly { id: string; occurred_on: string; is_salary?: boolean }[]): SalaryCycle[] => {
  const salaryCycles = buildSalaryCycles(
    txns.filter((t) => Boolean(t.is_salary)).map((t) => ({ id: t.id, occurred_on: t.occurred_on })),
  );
  if (salaryCycles.length > 0) return salaryCycles;
  return buildCalendarCycles(txns);
};

export const buildNavigableCycles = (
  txns: readonly { id: string; occurred_on: string; is_salary?: boolean }[],
): SalaryCycle[] => {
  if (txns.length === 0) return [];

  const salaryTxns = [...txns]
    .filter((txn) => Boolean(txn.is_salary))
    .sort((a, b) => a.occurred_on.localeCompare(b.occurred_on));

  if (salaryTxns.length > 1) return buildDefaultCycles(txns);

  if (salaryTxns.length === 1) {
    const sorted = [...txns].sort((a, b) => a.occurred_on.localeCompare(b.occurred_on));
    const first = sorted[0]?.occurred_on;
    const salaryDate = salaryTxns[0]?.occurred_on;
    if (!first || !salaryDate) return [];

    const startMonth = monthKey(first);
    const salaryMonth = monthKey(salaryDate);
    const cycles: SalaryCycle[] = [];

    let cursor = { y: startMonth.y, m: startMonth.m, d: 1 };
    while (true) {
      const startOn = monthStartYmd(cursor.y, cursor.m);
      const isSalaryMonth = cursor.y === salaryMonth.y && cursor.m === salaryMonth.m;

      cycles.push({
        id: isSalaryMonth ? `nav-pre-${salaryDate}` : `nav-${startOn}`,
        startOn,
        endOnExclusive: isSalaryMonth ? salaryDate : monthStartYmd(addMonths(cursor, 1).y, addMonths(cursor, 1).m),
        label: formatMonthYearLabel(startOn),
      });

      if (isSalaryMonth) break;
      cursor = addMonths(cursor, 1);
    }

    cycles.push({
      id: salaryTxns[0]?.id ?? `nav-${salaryDate}`,
      startOn: salaryDate,
      endOnExclusive: null,
      label: labelForSalaryDate(salaryDate),
    });

    return cycles;
  }

  const sorted = [...txns].sort((a, b) => a.occurred_on.localeCompare(b.occurred_on));
  const first = sorted[0]?.occurred_on;
  const last = sorted[sorted.length - 1]?.occurred_on;
  if (!first || !last) return [];

  const anchorDay = salaryTxns[0] ? parseYmd(salaryTxns[0].occurred_on).d : 1;
  const start = cycleStartForDate(first, anchorDay);
  const idsByStart = new Map(salaryTxns.map((txn) => [txn.occurred_on, txn.id]));

  const cycles: SalaryCycle[] = [];
  let cursor = { y: start.y, m: start.m, d: 1 };
  while (true) {
    const startOn = anchoredYmd(cursor.y, cursor.m, anchorDay);
    const next = addMonths(cursor, 1);
    const endOnExclusive = anchoredYmd(next.y, next.m, anchorDay);

    cycles.push({
      id: idsByStart.get(startOn) ?? `nav-${startOn}`,
      startOn,
      endOnExclusive,
      label: labelForSalaryDate(startOn),
    });

    if (last < endOnExclusive) break;
    cursor = next;
  }

  const lastIndex = cycles.length - 1;
  const latest = cycles[lastIndex];
  if (latest) cycles[lastIndex] = { ...latest, endOnExclusive: null };

  return cycles;
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
