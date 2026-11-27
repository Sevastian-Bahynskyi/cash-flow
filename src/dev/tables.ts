import type { BankAccountRow, CategoryRow, Tables, TransactionRow } from '@/core/data/types';
import { ymd } from '@/core/fmt';
import type { QaScenario } from './scenario';

const uid = 'cashflow-qa-fixture';

/**
 * Fake money for the simulator. `budgets`: four salary cycles with personal and shared limits, joint top-ups and
 * joint purchases, a fresh personal balance and a stale joint one. `payday`: the same, but the salary arrived today.
 * `nobank`: the bank has given no balances. `empty`: a first cycle with nothing in it.
 */
export function fixtureTables(scenario: QaScenario): Tables {
  const category = (id: string, name: string, icon: string, parent_id: string | null = null): CategoryRow => ({
    id, name, icon, parent_id, user_id: null, level: parent_id ? 2 : 1, is_system: true, color: '#7C5CFF',
  });
  const categories = [
    category('income', 'Income', 'in'),
    category('salary', 'Salary', 'briefcase', 'income'),
    category('home', 'Home', 'house'),
    category('rent', 'Rent', 'key', 'home'),
    category('utilities', 'Utilities', 'bolt', 'home'),
    category('groceries', 'Groceries', 'basket'),
    category('supermarket', 'Supermarket', 'cart', 'groceries'),
    category('market', 'Food market', 'store', 'groceries'),
    category('transport', 'Transport', 'train'),
    category('train', 'Trains', 'ticket', 'transport'),
    category('bike', 'Bike', 'bike', 'transport'),
    category('fun', 'Leisure', 'gamepad'),
    category('coffee', 'Coffee', 'cup', 'fun'),
    category('gifts', 'Gifts', 'gift', 'fun'),
  ];

  const tables: Tables = {
    categories,
    transactions: [],
    budgets: [],
    shared_budgets: [],
    category_overrides: [],
    savings_accounts: [],
    savings_events: [],
    loans: [],
    loan_events: [],
    receivables: [],
    receivable_events: [],
    merchant_category_rules: [],
    merchant_logos: [],
    transfer_people: [],
    profile: { display_name: 'Cashflow QA', avatar_url: null },
    bank_connections: [],
    bank_accounts: [],
    sync_runs: [],
    transaction_splits: [],
    paybacks: [],
  };
  if (scenario === 'empty') return tables;

  const today = new Date();
  const payday = scenario === 'payday';
  const limits = { home: 840_000, groceries: 320_000, transport: 110_000, fun: 95_000 };
  const sharedLimits = { groceries: 300_000, fun: 120_000, home: 60_000 };
  const hoursAgo = (hours: number): string => new Date(today.getTime() - hours * 3_600_000).toISOString();
  const account = (id: string, role: BankAccountRow['role'], name: string, balance: number | null, syncedHoursAgo: number): BankAccountRow => ({
    id, connection_id: 'qa-bank', name, currency: 'DKK', role, balance_minor: scenario === 'nobank' ? null : balance,
    balance_at: scenario === 'nobank' ? null : hoursAgo(syncedHoursAgo), last_synced_at: hoursAgo(syncedHoursAgo), last_error: null,
  });
  tables.bank_connections.push({ id: 'qa-bank', aspsp_name: 'Example Bank', valid_until: ymd(new Date(today.getFullYear() + 1, 0, 1)), status: 'active' });
  // Personal: synced two hours ago, holding cash left from earlier cycles. Joint: last synced three days ago.
  tables.bank_accounts.push(
    account('qa-personal', 'personal', 'Everyday account', payday ? 3_684_500 : 1_284_500, 2),
    account('qa-joint', 'joint', 'Joint account', 64_100, 74),
  );
  for (const month of [-3, -2, -1, 0]) {
    const day = (date: number): string => ymd(new Date(today.getFullYear(), today.getMonth() + month, date));
    const expenseDay = (date: number): string => day(month === 0 ? Math.min(date, today.getDate()) : date);
    const current = month === 0;
    const salary = `salary-${month}`;
    const transaction = (id: string, name: string, date: number, amount: number, category_id: string | null, extra: Partial<TransactionRow> = {}): TransactionRow => {
      const isSalary = category_id === 'salary';
      // on payday the new cycle starts today
      const occurred_on = payday && current ? ymd(today) : expenseDay(date);
      return {
        id, name, occurred_on, category_id, user_id: uid,
        kind: isSalary ? 'income' : 'expense', movement: isSalary ? 'income' : 'spend', is_salary: isSalary,
        amount_minor: amount, original_amount_minor: amount, converted_amount_minor: amount,
        personal_effect_minor: isSalary ? amount : -amount, fx_rate: 1, currency_code: 'DKK',
        comment: null, country_iso: null, recurring: false, shared: false, shared_participant: null,
        is_shared_topup: false, source: 'bank', status: 'booked',
        created_at: `${occurred_on}T12:00:00Z`, updated_at: `${occurred_on}T12:00:00Z`,
        ...extra,
      };
    };
    // Into the joint account: my top-up and Anna's. Neither counts in a budget.
    const topups = [
      transaction(`topup-me-${month}`, 'Top-up to joint account', 1, 400_000, null, { is_shared_topup: true, shared_participant: 'me', movement: 'topup', personal_effect_minor: 0 }),
      transaction(`topup-gf-${month}`, 'Anna, top-up', 2, 400_000, null, { kind: 'income', is_shared_topup: true, shared_participant: 'gf', movement: 'topup', personal_effect_minor: 0 }),
    ];
    if (payday && current) {
      tables.transactions.push(transaction(salary, 'Example salary', 1, 2_450_000, 'salary'), ...topups);
    } else tables.transactions.push(
      ...topups,
      transaction(`joint-groceries-${month}`, 'Joint supermarket', 9, 158_000 + (month * 4000), 'supermarket', { shared: true }),
      transaction(`joint-dinner-${month}`, 'Dinner together', 14, 64_000, 'coffee', { shared: true }),
      transaction(`joint-cleaning-${month}`, 'Cleaning supplies', 20, 18_500, 'utilities', { shared: true }),
      transaction(salary, 'Example salary', 1, 2_450_000, 'salary'),
      transaction(`rent-${month}`, 'Example rent', 2, 635_000 + (month * 5000), 'rent'),
      transaction(`utilities-${month}`, 'Electricity bill', 4, 83_000, 'utilities'),
      transaction(`market-${month}`, 'Neighbourhood market', 6, 73_000, 'market'),
      transaction(`supermarket-${month}`, 'Supermarket shop', 12, 161_000 + (month * 15_000), 'supermarket'),
      transaction(`rail-${month}`, 'Rail pass', 16, 61_000, 'train', { needs_review: true }),
      transaction(`gift-${month}`, 'Book and coffee', 18, 38_000, 'gifts', { needs_review: true }),
      transaction(`unknown-${month}`, 'Uncategorized card payment', 21, 9750, null),
    );
    tables.transaction_splits.push({ id: `split-${month}`, user_id: uid, transaction_id: `gift-${month}`, category_id: 'coffee', amount_minor: 8000, note: null, created_at: day(18) });
    for (const [category_id, limit] of Object.entries(limits)) {
      tables.budgets.push({ id: `budget-${month}-${category_id}`, user_id: uid, category_id, salary_cycle_id: salary, amount_minor: limit, notes: null, created_at: day(1) });
    }
    for (const [category_id, limit] of Object.entries(sharedLimits)) {
      tables.shared_budgets.push({ id: `shared-budget-${month}-${category_id}`, user_id: uid, category_id, salary_cycle_id: salary, amount_minor: limit, notes: null, created_at: day(1) });
    }
  }
  return tables;
}
