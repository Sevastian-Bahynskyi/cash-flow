import type { CategoryRow } from '@/features/categories/types';
import type { BudgetRow } from '@/features/overview/useOverview';
import type { TransactionRow } from '@/features/transactions/types';
import type { SalaryCycle } from '@/lib/cycles';
import { computePersonalExpenseMinorByTransactionId } from '@/lib/shared';

export type BudgetState = {
  categoryId: string;
  amountMinor: number;
  spentMinor: number;
  ratio: number;
  tone: 'neutral' | 'warning' | 'critical';
};

export const mapPersonalExpenseMinorByTransactionId = (
  rows: readonly TransactionRow[],
): Map<string, number> => computePersonalExpenseMinorByTransactionId(rows);

const inCycle = (occurredOn: string, cycle: SalaryCycle | null): boolean => {
  if (!cycle) return false;
  const afterStart = occurredOn >= cycle.startOn;
  const beforeEnd = cycle.endOnExclusive === null || occurredOn < cycle.endOnExclusive;
  return afterStart && beforeEnd;
};

export const buildBudgetStateByCategory = (
  categories: readonly CategoryRow[],
  budgets: readonly BudgetRow[],
  transactions: readonly TransactionRow[],
  cycle: SalaryCycle | null,
): Record<string, BudgetState> => {
  if (!cycle) return {};

  const parentByCategoryId = new Map<string, string>();
  for (const category of categories) {
    if (category.parent_id) {
      parentByCategoryId.set(category.id, category.parent_id);
    }
  }

  const cycleRows = transactions.filter((row) => inCycle(row.occurred_on, cycle));
  const personalExpenseByTransactionId = mapPersonalExpenseMinorByTransactionId(cycleRows);

  const spendByCategory = new Map<string, number>();
  for (const row of cycleRows) {
    if (row.kind !== 'expense' || !row.category_id) continue;
    const mySpentMinor = personalExpenseByTransactionId.get(row.id) ?? 0;
    if (mySpentMinor <= 0) continue;

    spendByCategory.set(
      row.category_id,
      (spendByCategory.get(row.category_id) ?? 0) + mySpentMinor,
    );

    const parentId = parentByCategoryId.get(row.category_id);
    if (parentId) {
      spendByCategory.set(parentId, (spendByCategory.get(parentId) ?? 0) + mySpentMinor);
    }
  }

  const out: Record<string, BudgetState> = {};
  for (const budget of budgets) {
    if (budget.salary_cycle_id !== cycle.id) continue;
    const spentMinor = spendByCategory.get(budget.category_id) ?? 0;
    const ratio = budget.amount_minor === 0 ? 0 : spentMinor / budget.amount_minor;
    out[budget.category_id] = {
      categoryId: budget.category_id,
      amountMinor: budget.amount_minor,
      spentMinor,
      ratio,
      tone: ratio >= 1 ? 'critical' : ratio >= 0.8 ? 'warning' : 'neutral',
    };
  }

  return out;
};
