import type { BankAccountRow, CategoryRow, Tables, TransactionRow } from '@/core/data/types';
import { ymd } from '@/core/fmt';
import type { QaScenario } from './scenario';

const uid = 'cashflow-qa-fixture';

/**
 * Fake money for the simulator. `budgets`: four salary cycles with personal and shared limits, joint top-ups and
 * joint purchases, a fresh personal balance and a stale joint one. `payday`: the same, but the salary arrived today.
 * `nobank`: the bank has given no balances. `empty`: a first cycle with nothing in it. `travel`: the same as
 * `budgets`, but two purchases in Lisbon since yesterday and no trip, so the app asks whether you are travelling.
 * Every scenario with data has a saved Barcelona trip last month, an unsaved stay in Rome three months ago,
 * places for the map, and a debt with Mother that one new transfer probably belongs to.
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
    category('travel', 'Travel', 'plane'),
    category('travel-food', 'Food', 'utensils', 'travel'),
    category('travel-transport', 'Transport', 'train', 'travel'),
    category('travel-shopping', 'Shopping', 'bag', 'travel'),
    category('travel-stay', 'Stay', 'house', 'travel'),
    category('travel-fun', 'Entertainment', 'ticket', 'travel'),
    category('transfers', 'Transfers', 'moved'),
    category('mobilepay', 'MobilePay', 'wallet', 'transfers'),
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
    trips: [],
    merchant_places: [],
    transfer_people: [],
    profile: { display_name: 'Cashflow QA', avatar_url: null },
    bank_connections: [],
    bank_accounts: [],
    sync_runs: [],
    transaction_splits: [],
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
    tables.transaction_splits.push({ id: `split-${month}`, user_id: uid, transaction_id: `gift-${month}`, category_id: 'coffee', amount_minor: 8000, shared: false, note: null, created_at: day(18) });
    for (const [category_id, limit] of Object.entries(limits)) {
      tables.budgets.push({ id: `budget-${month}-${category_id}`, user_id: uid, category_id, salary_cycle_id: salary, amount_minor: limit, notes: null, created_at: day(1) });
    }
    for (const [category_id, limit] of Object.entries(sharedLimits)) {
      tables.shared_budgets.push({ id: `shared-budget-${month}-${category_id}`, user_id: uid, category_id, salary_cycle_id: salary, amount_minor: limit, notes: null, created_at: day(1) });
    }
  }

  // Places for the map and trips. Home merchants sit in Aarhus; the trips are abroad.
  const place = (key: string, country_iso: string | null, city: string | null, lat: number | null, lng: number | null, online = false) => tables.merchant_places.push({ key, country_iso, city, lat, lng, online });
  for (const key of ['supermarket shop', 'neighbourhood market', 'book and coffee', 'joint supermarket', 'cleaning supplies']) place(key, 'DK', 'Aarhus', 56.1572, 10.2107);
  place('dinner together', 'DK', 'Copenhagen', 55.6761, 12.5683);
  place('rail pass', 'DK', 'Aarhus', 56.1572, 10.2107);
  place('electricity bill', null, null, null, null, true);
  const abroad = (id: string, name: string, on: Date, amount: number, category_id: string, key: string): TransactionRow => {
    const d = ymd(on);
    return { id, name, occurred_on: d, category_id, user_id: uid, kind: 'expense', movement: 'spend', is_salary: false, amount_minor: amount, original_amount_minor: amount, converted_amount_minor: amount,
      personal_effect_minor: -amount, fx_rate: 1, currency_code: 'DKK', comment: null, country_iso: null, recurring: false, shared: false, shared_participant: null,
      is_shared_topup: false, source: 'bank', status: 'booked', merchant_key: key, created_at: `${d}T12:00:00Z`, updated_at: `${d}T12:00:00Z` };
  };
  const at = (months: number, date: number): Date => new Date(today.getFullYear(), today.getMonth() + months, date);
  // Barcelona last month, saved as a trip: groceries, metro and a museum move to Travel.
  tables.trips.push({ id: 'trip-bcn', user_id: uid, name: 'Barcelona', country_iso: 'ES', start_on: ymd(at(-1, 22)), end_on: ymd(at(-1, 26)), created_at: ymd(at(-1, 22)) });
  tables.transactions.push(
    abroad('bcn-1', 'Mercadona', at(-1, 22), 28_300, 'supermarket', 'mercadona cl del garbi'),
    abroad('bcn-2', 'Metro Barcelona', at(-1, 23), 3_800, 'train', 'metro barcelona'),
    abroad('bcn-3', 'Museu de la Xocolata', at(-1, 24), 8_400, 'coffee', 'museu de la xocolata'),
    abroad('bcn-4', 'Terrazza Ravello', at(-1, 25), 60_300, 'coffee', 'terrazza ravello'),
  );
  place('mercadona cl del garbi', 'ES', 'Barcelona', 41.3874, 2.1686);
  place('metro barcelona', 'ES', 'Barcelona', 41.3874, 2.1686);
  place('museu de la xocolata', 'ES', 'Barcelona', 41.3874, 2.1686);
  place('terrazza ravello', 'ES', 'Barcelona', 41.3874, 2.1686);
  // Rome three months ago, never saved as a trip: the app offers it.
  tables.transactions.push(
    abroad('rome-1', 'Trattoria da Enzo', at(-3, 10), 42_000, 'coffee', 'trattoria da enzo'),
    abroad('rome-2', 'Trenitalia', at(-3, 11), 31_000, 'train', 'trenitalia roma'),
    abroad('rome-3', 'Conad', at(-3, 12), 19_500, 'supermarket', 'conad roma'),
  );
  for (const key of ['trattoria da enzo', 'trenitalia roma', 'conad roma']) place(key, 'IT', 'Rome', 41.9028, 12.4964);
  if (scenario === 'travel') {
    tables.transactions.push(
      abroad('lis-1', 'Pastéis de Belém', new Date(today.getTime() - 86_400_000), 9_200, 'coffee', 'pasteis de belem'),
      abroad('lis-2', 'Pingo Doce', today, 21_400, 'supermarket', 'pingo doce lisboa'),
    );
    for (const key of ['pasteis de belem', 'pingo doce lisboa']) place(key, 'PT', 'Lisbon', 38.7223, -9.1393);
  }

  // People and a debt: Mother lent you money in parts; two transfers are linked, a third just arrived.
  tables.transfer_people.push(
    { id: 'p-mother', user_id: uid, name: 'Mother', normalized_name: 'mother', kind: 'family', opening_balance_minor: 0, alias_of: null, created_at: ymd(at(-3, 1)), updated_at: ymd(at(-3, 1)) },
    { id: 'p-jonas', user_id: uid, name: 'Jonas', normalized_name: 'jonas', kind: 'settle_up', opening_balance_minor: 0, alias_of: null, created_at: ymd(at(-3, 1)), updated_at: ymd(at(-3, 1)) },
  );
  const transfer = (id: string, who: string, on: Date, amount: number, incoming: boolean): TransactionRow => {
    const d = ymd(on);
    return { id, name: who === 'p-mother' ? 'Mother' : 'Jonas', occurred_on: d, category_id: 'mobilepay', user_id: uid, kind: incoming ? 'income' : 'expense', movement: 'person',
      is_salary: false, amount_minor: amount, original_amount_minor: amount, converted_amount_minor: amount, personal_effect_minor: incoming ? amount : -amount, fx_rate: 1,
      currency_code: 'DKK', comment: null, country_iso: null, recurring: false, shared: false, shared_participant: null, is_shared_topup: false, source: 'bank', status: 'booked',
      counterparty_person_id: who, reason_source: 'person', created_at: `${d}T12:00:00Z`, updated_at: `${d}T12:00:00Z` };
  };
  tables.transactions.push(
    transfer('mom-1', 'p-mother', at(-2, 3), 40_000, true),
    transfer('mom-2', 'p-mother', at(-1, 5), 50_000, true),
    transfer('mom-3', 'p-mother', new Date(today.getTime() - 2 * 86_400_000), 30_000, true),
    transfer('jonas-1', 'p-jonas', at(-1, 12), 25_000, false),
  );
  tables.loans.push({ id: 'loan-mother', user_id: uid, name: 'Mother', principal_minor: 90_000, remaining_minor: 90_000, status: 'open', person_id: 'p-mother', created_at: `${ymd(at(-2, 3))}T12:00:00Z` });
  tables.loan_events.push(
    { id: 'le-1', loan_id: 'loan-mother', user_id: uid, kind: 'borrowed', amount_minor: 40_000, occurred_on: ymd(at(-2, 3)), transaction_id: 'mom-1', created_at: ymd(at(-2, 3)) },
    { id: 'le-2', loan_id: 'loan-mother', user_id: uid, kind: 'borrowed', amount_minor: 50_000, occurred_on: ymd(at(-1, 5)), transaction_id: 'mom-2', created_at: ymd(at(-1, 5)) },
  );
  tables.transactions.sort((a, b) => a.occurred_on.localeCompare(b.occurred_on));
  return tables;
}
