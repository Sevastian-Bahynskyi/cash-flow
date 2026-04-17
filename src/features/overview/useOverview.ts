import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
  activeCycle,
  buildDefaultCycles,
  type SalaryCycle,
} from '@/lib/cycles';
import { bankBalance, transactionBalance, type BalanceTxn } from '@/lib/balance';
import { computeSharedCycle, type SharedCycleResult } from '@/lib/shared';
import { savingsTotal } from '@/lib/savings';
import { runDetached } from '@/lib/async';
import { getErrorMessage, reportDevError } from '@/lib/errors';
import type { SavingsAccountRow, SavingsEventRow } from '@/features/savings/types';
import type { LoanEventRow, LoanRow } from '@/features/loans/types';
import type { ReceivableEventRow, ReceivableRow } from '@/features/receivables/types';
import { applyCategoryOverrides } from '@/features/categories/helpers';
import type { CategoryOverrideRow, CategoryRow } from '@/features/categories/types';
import type { TransactionRow } from '@/features/transactions/types';

type TxnRow = BalanceTxn & TransactionRow;

export type BudgetRow = {
  id: string;
  user_id: string;
  category_id: string;
  salary_cycle_id: string;
  amount_minor: number;
  notes: string | null;
  created_at: string;
};

export type TopCategory = {
  categoryId: string;
  label: string;
  spentMinor: number;
};

export type BudgetAlert = {
  categoryId: string;
  label: string;
  spentMinor: number;
  amountMinor: number;
  level: 'warning' | 'critical';
};

export type MerchantRuleRow = {
  id: string;
  user_id: string;
  match_target: 'normalized_merchant' | 'raw_text' | 'bank_category' | 'sender' | 'receiver';
  match_type: 'exact' | 'prefix' | 'contains' | 'regex';
  pattern: string;
  kind: 'expense' | 'income';
  canonical_merchant: string | null;
  category_id: string | null;
  is_shared_topup: boolean;
  is_blocked: boolean;
  priority: number;
  source: 'manual' | 'bootstrap_curated' | 'bootstrap_history';
  notes: string | null;
  updated_at: string;
};

export type OverviewData = {
  loading: boolean;
  isInitialLoading: boolean;
  error: string | null;
  userId: string | null;
  cycleBalanceMinor: number;
  bankBalanceMinor: number;
  savingsMinor: number;
  savingsAccounts: SavingsAccountRow[];
  savingsEvents: SavingsEventRow[];
  savingsTotalsByAccount: Record<string, number>;
  transactions: TxnRow[];
  categories: CategoryRow[];
  budgets: BudgetRow[];
  loans: LoanRow[];
  openLoans: LoanRow[];
  loanEvents: LoanEventRow[];
  receivables: ReceivableRow[];
  openReceivables: ReceivableRow[];
  receivableEvents: ReceivableEventRow[];
  activeCycle: SalaryCycle | null;
  previousCycle: SalaryCycle | null;
  shared: SharedCycleResult;
  cycleSpendMinor: number;
  topCategories: TopCategory[];
  budgetAlerts: BudgetAlert[];
  categoryLabels: Record<string, string>;
  merchantRules: MerchantRuleRow[];
  reload: () => Promise<void>;
};

const EMPTY_SHARED: SharedCycleResult = {
  meTopupTotal: 0,
  gfTopupTotal: 0,
  totalTopupTotal: 0,
  sharedExpenseTotal: 0,
  partnerInferred: 0,
  userShareRatio: 0.5,
  userEffectiveShare: 0,
  sharedBalance: 0,
};

export const useOverview = (): OverviewData => {
  const [loading, setLoading] = useState(true);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [cycleBalanceMinor, setCycleBalanceMinor] = useState(0);
  const [bankBalanceMinor, setBankBalanceMinor] = useState(0);
  const [savingsMinorState, setSavingsMinorState] = useState(0);
  const [savingsAccounts, setSavingsAccounts] = useState<SavingsAccountRow[]>([]);
  const [savingsEvents, setSavingsEvents] = useState<SavingsEventRow[]>([]);
  const [savingsTotalsByAccount, setSavingsTotalsByAccount] = useState<Record<string, number>>({});
  const [transactions, setTransactions] = useState<TxnRow[]>([]);
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [budgets, setBudgets] = useState<BudgetRow[]>([]);
  const [loansState, setLoansState] = useState<LoanRow[]>([]);
  const [openLoans, setOpenLoans] = useState<LoanRow[]>([]);
  const [loanEvents, setLoanEvents] = useState<LoanEventRow[]>([]);
  const [receivablesState, setReceivablesState] = useState<ReceivableRow[]>([]);
  const [openReceivables, setOpenReceivables] = useState<ReceivableRow[]>([]);
  const [receivableEvents, setReceivableEvents] = useState<ReceivableEventRow[]>([]);
  const [cycle, setCycle] = useState<SalaryCycle | null>(null);
  const [previousCycleState, setPreviousCycleState] = useState<SalaryCycle | null>(null);
  const [shared, setShared] = useState<SharedCycleResult>(EMPTY_SHARED);
  const [cycleSpendMinor, setCycleSpendMinor] = useState(0);
  const [topCategories, setTopCategories] = useState<TopCategory[]>([]);
  const [budgetAlerts, setBudgetAlerts] = useState<BudgetAlert[]>([]);
  const [categoryLabels, setCategoryLabels] = useState<Record<string, string>>({});
  const [merchantRulesState, setMerchantRulesState] = useState<MerchantRuleRow[]>([]);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const { data: userData, error: userErr } = await supabase.auth.getUser();
      if (userErr || !userData.user) {
        setUserId(null);
        setError('Not signed in');
        return;
      }
      setUserId(userData.user.id);

      const [txnsRes, savingsAccountsRes, savingsRes, loansRes, loanEventsRes, receivablesRes, receivableEventsRes, budgetsRes, catsRes, categoryOverridesRes, merchantRulesRes] = await Promise.all([
        supabase
          .from('transactions')
          .select(
            'id, user_id, kind, amount_minor, occurred_on, name, comment, category_id, country_iso, recurring, shared, shared_participant, is_shared_topup, is_salary, currency_code, original_amount_minor, converted_amount_minor, fx_rate, personal_effect_minor, shared_effect_minor, is_neutral_display, created_at, updated_at',
          )
          .order('occurred_on', { ascending: true }),
        supabase
          .from('savings_accounts')
          .select('id, user_id, name, goal_minor, color, icon, created_at')
          .order('created_at', { ascending: true }),
        supabase
          .from('savings_events')
          .select('id, user_id, savings_account_id, action, amount_minor, occurred_on, note, created_at')
          .order('occurred_on', { ascending: true })
          .order('created_at', { ascending: true }),
        supabase
          .from('loans')
          .select('id, user_id, name, principal_minor, remaining_minor, status, created_at')
          .order('created_at', { ascending: false }),
        supabase
          .from('loan_events')
          .select('id, loan_id, user_id, kind, amount_minor, occurred_on, created_at'),
        supabase
          .from('receivables')
          .select('id, user_id, name, principal_minor, remaining_minor, status, created_at')
          .order('created_at', { ascending: false }),
        supabase
          .from('receivable_events')
          .select('id, receivable_id, user_id, kind, amount_minor, occurred_on, created_at'),
        supabase
          .from('budgets')
          .select('id, user_id, category_id, salary_cycle_id, amount_minor, notes, created_at'),
        supabase
          .from('categories')
          .select('id, user_id, parent_id, name, level, is_system, icon, color'),
        supabase
          .from('category_overrides')
          .select('id, user_id, category_id, name, icon, updated_at'),
        supabase
          .from('merchant_category_rules')
          .select('id, user_id, match_target, match_type, pattern, kind, canonical_merchant, category_id, is_shared_topup, is_blocked, priority, source, notes, updated_at')
          .order('priority', { ascending: false })
          .order('updated_at', { ascending: false }),
      ]);

      if (txnsRes.error) throw txnsRes.error;
      if (savingsAccountsRes.error) throw savingsAccountsRes.error;
      if (savingsRes.error) throw savingsRes.error;
      if (loansRes.error) throw loansRes.error;
      if (loanEventsRes.error) throw loanEventsRes.error;
      if (receivablesRes.error) throw receivablesRes.error;
      if (receivableEventsRes.error) throw receivableEventsRes.error;
      if (budgetsRes.error) throw budgetsRes.error;
      if (catsRes.error) throw catsRes.error;
      if (categoryOverridesRes.error) throw categoryOverridesRes.error;
      if (merchantRulesRes.error) throw merchantRulesRes.error;

      const txns = (txnsRes.data ?? []) as TxnRow[];
      const savingsAccountsRows = (savingsAccountsRes.data ?? []) as SavingsAccountRow[];
      const savings = (savingsRes.data ?? []) as SavingsEventRow[];
      const loans = (loansRes.data ?? []) as LoanRow[];
      const loanEvents = (loanEventsRes.data ?? []) as LoanEventRow[];
      const receivables = (receivablesRes.data ?? []) as ReceivableRow[];
      const receivableEventsRows = (receivableEventsRes.data ?? []) as ReceivableEventRow[];
      const budgets = (budgetsRes.data ?? []) as BudgetRow[];
      const merchantRules = (merchantRulesRes.data ?? []) as MerchantRuleRow[];
      const cats = applyCategoryOverrides(
        (catsRes.data ?? []) as CategoryRow[],
        (categoryOverridesRes.data ?? []) as CategoryOverrideRow[],
      );

      const catLabels = new Map<string, string>();
      const parents = new Map<string, string>();
      for (const c of cats) if (c.level === 1) parents.set(c.id, c.name);
      for (const c of cats) {
        if (c.level === 2 && c.parent_id) {
          catLabels.set(c.id, `${parents.get(c.parent_id) ?? ''} · ${c.name}`);
        } else {
          catLabels.set(c.id, c.name);
        }
      }

      const cycles = buildDefaultCycles(txns);
      const active = activeCycle(cycles);
      const previousCycle = cycles.length > 1 ? cycles[cycles.length - 2] ?? null : null;

      const inActive = (occurredOn: string): boolean => {
        if (!active) return false;
        const afterStart = occurredOn >= active.startOn;
        const beforeEnd = active.endOnExclusive === null || occurredOn < active.endOnExclusive;
        return afterStart && beforeEnd;
      };

      const cycleTopups = txns.filter((t) => t.is_shared_topup && inActive(t.occurred_on));
      const cycleSharedExpenses = txns.filter((t) => t.shared && inActive(t.occurred_on));

      // Personal cycle spend + per-category totals (personal expenses only).
      let cycleSpend = 0;
      const perCategory = new Map<string, number>();
      for (const t of txns) {
        if (t.kind !== 'expense') continue;
        if (t.shared || t.is_shared_topup) continue;
        if (!inActive(t.occurred_on)) continue;
        cycleSpend += t.amount_minor;
        if (t.category_id) {
          perCategory.set(t.category_id, (perCategory.get(t.category_id) ?? 0) + t.amount_minor);
        }
      }

      const topCats: TopCategory[] = [...perCategory.entries()]
        .map(([categoryId, spentMinor]) => ({
          categoryId,
          label: catLabels.get(categoryId) ?? 'Category',
          spentMinor,
        }))
        .sort((a, b) => b.spentMinor - a.spentMinor)
        .slice(0, 5);

      const alerts: BudgetAlert[] = [];
      if (active) {
        for (const b of budgets) {
          if (b.salary_cycle_id !== active.id) continue;
          const spent = perCategory.get(b.category_id) ?? 0;
          const ratio = spent / b.amount_minor;
          if (ratio >= 1) {
            alerts.push({
              categoryId: b.category_id,
              label: catLabels.get(b.category_id) ?? 'Category',
              spentMinor: spent,
              amountMinor: b.amount_minor,
              level: 'critical',
            });
          } else if (ratio >= 0.8) {
            alerts.push({
              categoryId: b.category_id,
              label: catLabels.get(b.category_id) ?? 'Category',
              spentMinor: spent,
              amountMinor: b.amount_minor,
              level: 'warning',
            });
          }
        }
      }

      const totalsByAccount: Record<string, number> = {};
      for (const account of savingsAccountsRows) {
        totalsByAccount[account.id] = savingsTotal(
          savings.filter((event) => event.savings_account_id === account.id),
        );
      }
      const totalSavingsMinor = savingsTotal(savings);
      const openLoanRows = loans.filter((loan) => loan.status === 'open');
      const openReceivableRows = receivables.filter((receivable) => receivable.status === 'open');
      const totalLoanRemainingMinor = openLoanRows.reduce((sum, loan) => sum + loan.remaining_minor, 0);
      const currentCycleBalanceMinor = active
        ? transactionBalance(txns.filter((txn) => inActive(txn.occurred_on)))
        : 0;

      setTransactions(txns);
      setCategories(cats);
      setBudgets(budgets);
      setCycle(active);
      setPreviousCycleState(previousCycle);
      setShared(
        computeSharedCycle(
          cycleTopups.map((t) => ({
            amount_minor: t.amount_minor,
            shared_participant: t.shared_participant,
          })),
          cycleSharedExpenses.map((t) => ({ amount_minor: t.amount_minor })),
        ),
      );
      setCycleBalanceMinor(currentCycleBalanceMinor);
      setBankBalanceMinor(bankBalance(totalSavingsMinor, totalLoanRemainingMinor));
      setSavingsAccounts(savingsAccountsRows);
      setSavingsEvents(savings);
      setSavingsTotalsByAccount(totalsByAccount);
      setSavingsMinorState(totalSavingsMinor);
      setLoansState(loans);
      setOpenLoans(openLoanRows);
      setLoanEvents(loanEvents);
      setReceivablesState(receivables);
      setOpenReceivables(openReceivableRows);
      setReceivableEvents(receivableEventsRows);
      setCycleSpendMinor(cycleSpend);
      setTopCategories(topCats);
      setBudgetAlerts(alerts);
      setCategoryLabels(Object.fromEntries(catLabels.entries()));
      setMerchantRulesState(merchantRules);
    } catch (e) {
      reportDevError('overview.load', e);
      setError(getErrorMessage(e, 'Failed to load overview'));
    } finally {
      setLoading(false);
      setHasLoadedOnce(true);
    }
  }, []);

  useEffect(() => {
    runDetached(load(), 'overview.load');
  }, [load]);

  return {
    loading,
    isInitialLoading: loading && !hasLoadedOnce,
    error,
    userId,
    cycleBalanceMinor,
    bankBalanceMinor,
    savingsMinor: savingsMinorState,
    savingsAccounts,
    savingsEvents,
    savingsTotalsByAccount,
    transactions,
    categories,
    budgets,
    loans: loansState,
    openLoans,
    loanEvents,
    receivables: receivablesState,
    openReceivables,
    receivableEvents,
    activeCycle: cycle,
    previousCycle: previousCycleState,
    shared,
    cycleSpendMinor,
    topCategories,
    budgetAlerts,
    categoryLabels,
    merchantRules: merchantRulesState,
    reload: load,
  };
};
