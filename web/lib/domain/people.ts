// Who owes whom, and which incoming payment pays back which expense. Pure; integer minor units.
// Sign: + they owe me, - I owe them. Name variants (alias_of) count for their canonical person.

export type PersonKind = 'self' | 'partner' | 'settle_up' | 'family' | 'ignore';

export type PersonInput = {
  id: string;
  name: string;
  kind: PersonKind;
  opening_balance_minor: number;
  alias_of: string | null;
};

export type PeopleTx = {
  id: string;
  kind: 'expense' | 'income';
  amount_minor: number;
  occurred_on: string;
  counterparty_person_id: string | null;
  movement?: string | null;
  status?: string | null;
};

export type OwedBalance = {
  person_id: string; // canonical
  name: string;
  kind: PersonKind;
  balance_minor: number;
  sentMinor: number;
  receivedMinor: number;
  lastOn: string | null;
};

/** The canonical id of a person (alias_of followed, one hop; a broken link stays on itself). */
export const canonicalId = (people: readonly PersonInput[], id: string): string => {
  const p = people.find((x) => x.id === id);
  if (!p?.alias_of) return id;
  return people.some((x) => x.id === p.alias_of) ? p.alias_of : id;
};

/**
 * Balances per canonical person: opening balance plus, for settle-up people only, money I sent (+) minus money I got (-).
 * Partner and family transfers never move a balance on their own; their opening balance still shows.
 */
export const owedBalances = (people: readonly PersonInput[], txs: readonly PeopleTx[]): OwedBalance[] => {
  const out = new Map<string, OwedBalance>();
  for (const p of people) {
    if (p.alias_of && canonicalId(people, p.id) !== p.id) continue;
    out.set(p.id, { person_id: p.id, name: p.name, kind: p.kind, balance_minor: 0, sentMinor: 0, receivedMinor: 0, lastOn: null });
  }
  for (const p of people) {
    const b = out.get(canonicalId(people, p.id));
    if (b) b.balance_minor += p.opening_balance_minor;
  }
  for (const t of txs) {
    if (!t.counterparty_person_id || t.status === 'void') continue;
    const b = out.get(canonicalId(people, t.counterparty_person_id));
    if (!b || b.kind !== 'settle_up') continue;
    if (t.kind === 'expense') {
      b.sentMinor += t.amount_minor;
      b.balance_minor += t.amount_minor;
    } else {
      b.receivedMinor += t.amount_minor;
      b.balance_minor -= t.amount_minor;
    }
    if (!b.lastOn || t.occurred_on > b.lastOn) b.lastOn = t.occurred_on;
  }
  return [...out.values()]
    .filter((b) => b.balance_minor !== 0 || b.sentMinor > 0 || b.receivedMinor > 0)
    .sort((a, b) => Math.abs(b.balance_minor) - Math.abs(a.balance_minor) || a.name.localeCompare(b.name));
};

export type PaybackSuggestion = {
  payment_transaction_id: string;
  person_id: string;
  ratio: 1 | 0.5;
  /** One entry per expense, ready for the paybacks table. */
  items: { expense_transaction_id: string; amount_minor: number }[];
  diffMinor: number;
};

const WINDOW_DAYS = 7;
const TOLERANCE_MINOR = 200; // ±2 kr
const MAX_EXPENSES = 3;
const DAY_MS = 86_400_000;
const NOT_SPENDING = new Set(['moved', 'topup', 'ignore', 'person']);

const daysBetween = (from: string, to: string): number => Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS);

const combos = <T,>(items: readonly T[], max: number): T[][] => {
  const out: T[][] = [];
  const walk = (start: number, picked: T[]): void => {
    if (picked.length > 0) out.push(picked);
    if (picked.length === max) return;
    items.slice(start).forEach((item, i) => walk(start + i + 1, [...picked, item]));
  };
  walk(0, []);
  return out;
};

/**
 * For each incoming payment from a person: expenses of mine in the 7 days before it whose full amount or half,
 * alone or summed (at most 3), is within ±2 kr of the payment. Best first: fewer expenses, smaller gap, full before half.
 * Expenses already paid back (`taken`) are skipped. At most 3 suggestions per payment.
 */
export const paybackSuggestions = (
  people: readonly PersonInput[],
  txs: readonly PeopleTx[],
  taken: ReadonlySet<string> = new Set(),
): PaybackSuggestion[] => {
  const expenses = txs.filter((t) => t.kind === 'expense' && t.status !== 'void' && !t.counterparty_person_id && !NOT_SPENDING.has(t.movement ?? '') && !taken.has(t.id));
  const payments = txs.filter((t) => t.kind === 'income' && t.status !== 'void' && t.counterparty_person_id && !taken.has(t.id));
  const out: PaybackSuggestion[] = [];
  for (const pay of payments) {
    const near = expenses.filter((e) => {
      const d = daysBetween(e.occurred_on, pay.occurred_on);
      return d >= 0 && d <= WINDOW_DAYS && e.amount_minor <= pay.amount_minor * 2 + TOLERANCE_MINOR;
    });
    const found: PaybackSuggestion[] = [];
    for (const group of combos(near, MAX_EXPENSES)) {
      const sum = group.reduce((a, e) => a + e.amount_minor, 0);
      for (const ratio of [1, 0.5] as const) {
        const diff = Math.abs(pay.amount_minor - Math.round(sum * ratio));
        if (diff > TOLERANCE_MINOR) continue;
        found.push({
          payment_transaction_id: pay.id,
          person_id: canonicalId(people, pay.counterparty_person_id ?? ''),
          ratio,
          items: group.map((e) => ({ expense_transaction_id: e.id, amount_minor: Math.round(e.amount_minor * ratio) })),
          diffMinor: diff,
        });
      }
    }
    found.sort((a, b) => a.items.length - b.items.length || a.diffMinor - b.diffMinor || b.ratio - a.ratio);
    out.push(...found.slice(0, 3));
  }
  return out;
};
