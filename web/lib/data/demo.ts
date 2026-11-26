// Demo data for looking at screens without signing in (NEXT_PUBLIC_DEMO=1, never in production).
// Built from the redesign's fake data (docs/redesign/data); nothing here is real.
import raw from './demo-data.json'
import type { Tables, TransactionRow } from './types'

type FakeCat = { id: string; name: string; budget_minor: number | null; mark: string; kind: string }
type FakeTx = { id: string; date: string; amount_minor: number; kind: string; category: string | null; name: string; shared: boolean; paid_by: string; note?: string }

export const DEMO = process.env.NEXT_PUBLIC_DEMO === '1' && process.env.NODE_ENV !== 'production'

export function demoTables(): Tables {
  const u = 'demo', at = '2026-11-01T08:00:00Z'
  const cat = (id: string, name: string, icon: string, parent: string | null) => ({ id, user_id: null, parent_id: parent, name, level: (parent ? 2 : 1) as 1 | 2, is_system: true, icon, color: '#7C5CFF' })
  const fc = raw.categories as FakeCat[]
  const categories = [
    ...fc.filter((c) => c.kind === 'expense').map((c) => cat(`c-${c.id}`, c.name, c.mark, null)),
    cat('c-income', 'Income', 'in', null), cat('c-salary', 'Salary', 'briefcase', 'c-income'), cat('c-other_income', 'Others', 'in', 'c-income'),
    cat('c-transfers', 'Transfers', 'moved', null), cat('c-topup', 'Top up', 'moved', 'c-transfers'), cat('c-transfer', 'Transfer', 'moved', 'c-transfers'),
  ]
  const transactions: TransactionRow[] = (raw.transactions as FakeTx[]).map((t, i) => {
    const topup = t.kind === 'topup', income = t.kind === 'income', transfer = t.kind === 'transfer'
    const kind = income ? 'income' : 'expense'
    const shared = !topup && t.shared
    const participant = topup ? (t.paid_by === 'me' ? 'me' : 'gf') : shared ? 'me' : null
    const personal = income ? t.amount_minor : shared ? 0 : topup && participant === 'gf' ? 0 : -t.amount_minor
    return {
      id: t.id, user_id: u, kind, amount_minor: t.amount_minor, occurred_on: t.date, name: t.name, comment: t.note ?? null,
      category_id: topup ? 'c-topup' : transfer ? 'c-transfer' : `c-${t.category}`, country_iso: null, recurring: false, shared,
      shared_participant: participant, is_salary: t.category === 'salary', is_shared_topup: topup, currency_code: 'DKK',
      original_amount_minor: t.amount_minor, converted_amount_minor: t.amount_minor, fx_rate: 1, personal_effect_minor: personal,
      created_at: `${t.date}T12:00:${String(i % 60).padStart(2, '0')}Z`, updated_at: `${t.date}T12:00:${String(i % 60).padStart(2, '0')}Z`,
    } as TransactionRow
  }).sort((a, b) => a.occurred_on.localeCompare(b.occurred_on) || a.created_at.localeCompare(b.created_at))
  const salaries = transactions.filter((t) => t.is_salary).map((t) => t.id)
  const budgets = salaries.flatMap((sid) => fc.filter((c) => c.budget_minor).map((c) => ({ id: `b-${sid}-${c.id}`, user_id: u, category_id: `c-${c.id}`, salary_cycle_id: sid, amount_minor: c.budget_minor as number, notes: null, created_at: at })))
  return {
    transactions, categories, category_overrides: [], budgets,
    savings_accounts: [{ id: 's1', user_id: u, name: 'Emergency fund', goal_minor: 6000000, color: '#3DD68C', icon: 'piggy-bank-outline', created_at: at }, { id: 's2', user_id: u, name: 'Summer trip', goal_minor: 1500000, color: '#3DD68C', icon: 'airplane', created_at: at }],
    savings_events: [
      { id: 'e1', user_id: u, savings_account_id: 's1', action: 'set', amount_minor: 3400000, occurred_on: '2026-08-29', note: null, created_at: at },
      { id: 'e2', user_id: u, savings_account_id: 's1', action: 'add', amount_minor: 400000, occurred_on: '2026-09-30', note: null, created_at: at },
      { id: 'e3', user_id: u, savings_account_id: 's1', action: 'add', amount_minor: 400000, occurred_on: '2026-10-30', note: null, created_at: at },
      { id: 'e4', user_id: u, savings_account_id: 's2', action: 'add', amount_minor: 600000, occurred_on: '2026-10-01', note: null, created_at: at },
      { id: 'e5', user_id: u, savings_account_id: 's2', action: 'add', amount_minor: 250000, occurred_on: '2026-11-02', note: null, created_at: at },
    ],
    loans: [{ id: 'l1', user_id: u, name: 'Student loan', principal_minor: 12000000, remaining_minor: 7450000, status: 'open', created_at: at }, { id: 'l2', user_id: u, name: 'New phone', principal_minor: 600000, remaining_minor: 0, status: 'closed', created_at: at }],
    loan_events: [{ id: 'le1', loan_id: 'l1', user_id: u, kind: 'repaid', amount_minor: 150000, occurred_on: '2026-11-02', created_at: at }, { id: 'le2', loan_id: 'l1', user_id: u, kind: 'borrowed', amount_minor: 12000000, occurred_on: '2023-08-15', created_at: at }],
    receivables: [{ id: 'o1', user_id: u, name: 'Jonas', principal_minor: 120000, remaining_minor: 60000, status: 'open', created_at: at }],
    receivable_events: [{ id: 're1', receivable_id: 'o1', user_id: u, kind: 'repaid', amount_minor: 60000, occurred_on: '2026-11-14', created_at: at }, { id: 're2', receivable_id: 'o1', user_id: u, kind: 'lent', amount_minor: 120000, occurred_on: '2026-11-03', created_at: at }],
    merchant_category_rules: [
      { id: 'r1', user_id: u, match_target: 'normalized_merchant', match_type: 'prefix', pattern: 'rema 1000', kind: 'expense', canonical_merchant: 'Rema 1000', category_id: 'c-groceries', is_shared_topup: false, is_blocked: false, priority: 300, source: 'manual', notes: null, updated_at: at },
      { id: 'r2', user_id: u, match_target: 'normalized_merchant', match_type: 'exact', pattern: 'mobilepay', kind: 'income', canonical_merchant: null, category_id: null, is_shared_topup: false, is_blocked: true, priority: 300, source: 'manual', notes: null, updated_at: at },
    ],
    transfer_people: [{ id: 'p1', user_id: u, name: 'Jonas', normalized_name: 'jonas', created_at: at, updated_at: at }],
    profile: { display_name: 'Seva', avatar_url: null },
  }
}
