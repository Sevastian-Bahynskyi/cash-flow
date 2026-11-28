// People from bank transfers. Name variants (alias_of) count for their canonical person. Pure.

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

/** The canonical id of a person (alias_of followed, one hop; a broken link stays on itself). */
export const canonicalId = (people: readonly PersonInput[], id: string): string => {
  const p = people.find((x) => x.id === id);
  if (!p?.alias_of) return id;
  return people.some((x) => x.id === p.alias_of) ? p.alias_of : id;
};

export type PersonSeen = {
  person_id: string; // canonical
  name: string;
  kind: PersonKind;
  lastOn: string | null;
};

/** Every person (name variants folded into their canonical one) with the day of their latest transfer. No balances: debts are only what the owner makes. */
export const peopleSeen = (people: readonly PersonInput[], txs: readonly PeopleTx[]): PersonSeen[] => {
  const out = new Map<string, PersonSeen>();
  for (const p of people) if (canonicalId(people, p.id) === p.id) out.set(p.id, { person_id: p.id, name: p.name, kind: p.kind, lastOn: null });
  for (const t of txs) {
    if (!t.counterparty_person_id || t.status === 'void') continue;
    const b = out.get(canonicalId(people, t.counterparty_person_id));
    if (b && (!b.lastOn || t.occurred_on > b.lastOn)) b.lastOn = t.occurred_on;
  }
  return [...out.values()].sort((a, b) => (b.lastOn ?? '').localeCompare(a.lastOn ?? '') || a.name.localeCompare(b.name));
};
