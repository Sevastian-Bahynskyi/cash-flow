// Debts with people: the existing loans (you owe) and receivables (they owe you), each optionally tied to a person,
// with bank transfers linked as their payments. Pure; integer minor units.

export type DebtKind = 'loan' | 'owed'
export type DebtRow = { id: string; name: string; principal_minor: number; remaining_minor: number; status: 'open' | 'closed'; person_id?: string | null; created_at: string }
export type DebtEventRow = { id: string; kind: string; amount_minor: number; occurred_on: string; transaction_id?: string | null }
export type Debt = DebtRow & { kind: DebtKind; events: DebtEventRow[] }
type Tx = { id: string; kind: string; amount_minor: number; occurred_on: string; counterparty_person_id?: string | null; status?: string | null }

export const DEBT_TABLES = {
  loan: { table: 'loans', events: 'loan_events', fk: 'loan_id', more: 'borrowed' },
  owed: { table: 'receivables', events: 'receivable_events', fk: 'receivable_id', more: 'lent' },
} as const

/** What a transfer is for a debt: money that grows it (borrowed or lent) or a repayment. */
export const eventKindFor = (kind: DebtKind, tx: Pick<Tx, 'kind'>): string => {
  const incoming = tx.kind === 'income'
  if (kind === 'loan') return incoming ? 'borrowed' : 'repaid'
  return incoming ? 'repaid' : 'lent'
}

/** The running numbers after one more event, or after taking one away (undo = true). */
export function applyEvent(d: Pick<DebtRow, 'principal_minor' | 'remaining_minor'>, kind: DebtKind, event: string, amount: number, undo = false): { principal_minor: number; remaining_minor: number; status: 'open' | 'closed' } {
  const more = event === DEBT_TABLES[kind].more
  const sign = undo ? -1 : 1
  const principal = more ? d.principal_minor + sign * amount : d.principal_minor
  const remaining = more ? d.remaining_minor + sign * amount : d.remaining_minor - sign * amount
  const r = Math.max(0, Math.min(principal, remaining))
  return { principal_minor: principal, remaining_minor: r, status: r === 0 ? 'closed' : 'open' }
}

/** The running numbers from the whole history: what grew the debt minus what was paid back, never below 0. */
export function totalsOf(kind: DebtKind, events: readonly Pick<DebtEventRow, 'kind' | 'amount_minor'>[]): { principal_minor: number; remaining_minor: number; status: 'open' | 'closed' } {
  const more = DEBT_TABLES[kind].more
  const principal = events.filter((e) => e.kind === more).reduce((s, e) => s + e.amount_minor, 0)
  const back = events.filter((e) => e.kind !== more).reduce((s, e) => s + e.amount_minor, 0)
  const r = Math.max(0, principal - back)
  return { principal_minor: principal, remaining_minor: r, status: r === 0 ? 'closed' : 'open' }
}

/** Every debt with its events, open ones first, then newest. */
export function debtsOf(t: { loans: DebtRow[]; loan_events: (DebtEventRow & { loan_id: string })[]; receivables: DebtRow[]; receivable_events: (DebtEventRow & { receivable_id: string })[] }): Debt[] {
  const loans = t.loans.map((d) => ({ ...d, kind: 'loan' as const, events: t.loan_events.filter((e) => e.loan_id === d.id) }))
  const owed = t.receivables.map((d) => ({ ...d, kind: 'owed' as const, events: t.receivable_events.filter((e) => e.receivable_id === d.id) }))
  return [...loans, ...owed].sort((a, b) => (a.status === b.status ? b.created_at.localeCompare(a.created_at) : a.status === 'open' ? -1 : 1))
}

/** Transfers already paying into some debt. */
export const linkedIds = (debts: readonly Debt[]): Set<string> => new Set(debts.flatMap((d) => d.events.map((e) => e.transaction_id).filter((x): x is string => Boolean(x))))

/** Transfers with this person (canonical id, aliases included) that are not in any debt yet, newest first. */
export function transfersWith(personIds: ReadonlySet<string>, txs: readonly Tx[], linked: ReadonlySet<string>): Tx[] {
  return txs.filter((t) => t.counterparty_person_id && personIds.has(t.counterparty_person_id) && t.status !== 'void' && !linked.has(t.id)).sort((a, b) => b.occurred_on.localeCompare(a.occurred_on))
}

/** New transfers that probably belong to an open debt: same person, after the debt was opened. One debt each. */
export function debtSuggestions(debts: readonly Debt[], personIdsOf: (personId: string) => ReadonlySet<string>, txs: readonly Tx[], linked: ReadonlySet<string>): { debt: Debt; tx: Tx }[] {
  const out: { debt: Debt; tx: Tx }[] = []
  const used = new Set<string>()
  for (const d of debts) {
    if (d.status !== 'open' || !d.person_id) continue
    for (const tx of transfersWith(personIdsOf(d.person_id), txs, linked)) {
      if (tx.occurred_on < d.created_at.slice(0, 10) || used.has(tx.id)) continue
      used.add(tx.id)
      out.push({ debt: d, tx })
    }
  }
  return out
}
