// People from bank transfers: what went each way, and the partner's opening balance. Pure; integer minor units.
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
 * Partner and family transfers never move a balance on their own (family still counts what was sent and received).
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
    // Settle-up people keep a running balance; family only shows what went each way.
    if (!b || (b.kind !== 'settle_up' && b.kind !== 'family')) continue;
    const settle = b.kind === 'settle_up' ? 1 : 0;
    if (t.kind === 'expense') {
      b.sentMinor += t.amount_minor;
      b.balance_minor += settle * t.amount_minor;
    } else {
      b.receivedMinor += t.amount_minor;
      b.balance_minor -= settle * t.amount_minor;
    }
    if (!b.lastOn || t.occurred_on > b.lastOn) b.lastOn = t.occurred_on;
  }
  return [...out.values()]
    .filter((b) => b.balance_minor !== 0 || b.sentMinor > 0 || b.receivedMinor > 0)
    .sort((a, b) => Math.abs(b.balance_minor) - Math.abs(a.balance_minor) || a.name.localeCompare(b.name));
};
