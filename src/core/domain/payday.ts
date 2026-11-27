// Danish salaries land on the last banking day of the month; the owner's lands one banking day before that.
// Only predicts the next payday: a real salary transaction still starts each cycle.

const pad = (n: number): string => String(n).padStart(2, '0');
const key = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Easter Sunday, Gregorian calendar (anonymous algorithm). */
function easter(y: number): Date {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const n = h + l - 7 * m + 114;
  return new Date(y, Math.floor(n / 31) - 1, (n % 31) + 1);
}

/** Weekdays Danish banks are closed (Store Bededag was abolished from 2024). */
function closed(y: number): Set<string> {
  const e = easter(y);
  const after = (n: number): string => key(new Date(y, e.getMonth(), e.getDate() + n));
  return new Set([
    `${y}-01-01`, after(-3), after(-2), after(1), after(39), after(40), after(50),
    `${y}-06-05`, `${y}-12-24`, `${y}-12-25`, `${y}-12-26`, `${y}-12-31`,
  ]);
}

/** The owner's payday in a month (0-based): the banking day before the month's last banking day. */
export function paydayIn(year: number, month: number): string {
  const off = closed(year);
  const d = new Date(year, month + 1, 0);
  for (let found = 0; ; d.setDate(d.getDate() - 1)) {
    if (d.getDay() !== 0 && d.getDay() !== 6 && !off.has(key(d)) && ++found === 2) return key(d);
  }
}

/** The payday after a salary that arrived on `startOn`: next month's, or this month's if the salary came early in the month. */
export function nextPayday(startOn: string): string {
  const [y = 1970, m = 1, d = 1] = startOn.split('-').map(Number);
  return d < 15 ? paydayIn(y, m - 1) : paydayIn(m === 12 ? y + 1 : y, m % 12);
}
