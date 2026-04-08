import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
  activeCycle,
  buildSalaryCycles,
  type SalaryCycle,
} from '@/lib/cycles';
import { personalBalance, type BalanceTxn } from '@/lib/balance';
import { computeSharedCycle, type SharedCycleResult } from '@/lib/shared';
import { savingsTotal } from '@/lib/savings';
import type { SavingsEventRow } from '@/features/savings/types';
import type { LoanEventRow, LoanRow } from '@/features/loans/types';
import type { CategoryRow } from '@/features/categories/types';

type TxnRow = BalanceTxn & {
  id: string;
  occurred_on: string;
  category_id: string | null;
  is_salary: boolean;
};

type BudgetRow = {
  id: string;
  category_id: string;
  salary_cycle_id: string;
  amount_minor: number;
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

export type OverviewData = {
  loading: boolean;
  error: string | null;
  personalMinor: number;
  savingsMinor: number;
  openLoans: LoanRow[];
  activeCycle: SalaryCycle | null;
  shared: SharedCycleResult;
  cycleSpendMinor: number;
  topCategories: TopCategory[];
  budgetAlerts: BudgetAlert[];
  reload: () => Promise<void>;
};

const EMPTY_SHARED: SharedCycleResult = {
  userTopupTotal: 0,
  sharedExpenseTotal: 0,
  partnerInferred: 0,
  userShareRatio: 0.5,
  userEffectiveShare: 0,
  sharedBalance: 0,
};

export const useOverview = (): OverviewData => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [personalMinor, setPersonalMinor] = useState(0);
  const [savingsMinorState, setSavingsMinorState] = useState(0);
  const [openLoans, setOpenLoans] = useState<LoanRow[]>([]);
  const [cycle, setCycle] = useState<SalaryCycle | null>(null);
  const [shared, setShared] = useState<SharedCycleResult>(EMPTY_SHARED);
  const [cycleSpendMinor, setCycleSpendMinor] = useState(0);
  const [topCategories, setTopCategories] = useState<TopCategory[]>([]);
  const [budgetAlerts, setBudgetAlerts] = useState<BudgetAlert[]>([]);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const { data: userData, error: userErr } = await supabase.auth.getUser();
      if (userErr || !userData.user) {
        setError('Not signed in');
        return;
      }

      const [txnsRes, savingsRes, loansRes, loanEventsRes, budgetsRes, catsRes] = await Promise.all([
        supabase
          .from('transactions')
          .select(
            'id, kind, amount_minor, occurred_on, shared, is_shared_topup, is_salary, category_id',
          )
          .order('occurred_on', { ascending: true }),
        supabase
          .from('savings_events')
          .select('id, user_id, action, amount_minor, occurred_on, note, created_at')
          .order('occurred_on', { ascending: true })
          .order('created_at', { ascending: true }),
        supabase
          .from('loans')
          .select('id, user_id, name, principal_minor, remaining_minor, status, created_at')
          .eq('status', 'open'),
        supabase
          .from('loan_events')
          .select('id, loan_id, user_id, kind, amount_minor, occurred_on, created_at'),
        supabase
          .from('budgets')
          .select('id, category_id, salary_cycle_id, amount_minor'),
        supabase
          .from('categories')
          .select('id, user_id, parent_id, name, level, is_system'),
      ]);

      if (txnsRes.error) throw txnsRes.error;
      if (savingsRes.error) throw savingsRes.error;
      if (loansRes.error) throw loansRes.error;
      if (loanEventsRes.error) throw loanEventsRes.error;
      if (budgetsRes.error) throw budgetsRes.error;
      if (catsRes.error) throw catsRes.error;

      const txns = (txnsRes.data ?? []) as TxnRow[];
      const savings = (savingsRes.data ?? []) as SavingsEventRow[];
      const loans = (loansRes.data ?? []) as LoanRow[];
      const loanEvents = (loanEventsRes.data ?? []) as LoanEventRow[];
      const budgets = (budgetsRes.data ?? []) as BudgetRow[];
      const cats = (catsRes.data ?? []) as CategoryRow[];

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

      const cycles = buildSalaryCycles(txns.filter((t) => t.is_salary));
      const active = activeCycle(cycles);

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

      setCycle(active);
      setShared(computeSharedCycle(cycleTopups, cycleSharedExpenses));
      setPersonalMinor(personalBalance(txns, savings, loanEvents));
      setSavingsMinorState(savingsTotal(savings));
      setOpenLoans(loans);
      setCycleSpendMinor(cycleSpend);
      setTopCategories(topCats);
      setBudgetAlerts(alerts);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load overview');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return {
    loading,
    error,
    personalMinor,
    savingsMinor: savingsMinorState,
    openLoans,
    activeCycle: cycle,
    shared,
    cycleSpendMinor,
    topCategories,
    budgetAlerts,
    reload: load,
  };
};
