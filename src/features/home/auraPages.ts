import type { OverviewData } from '@/features/overview/useOverview';
import { buildBudgetStateByCategory } from '@/features/budgets/helpers';
import { transactionBalance } from '@/lib/balance';
import type { SalaryCycle } from '@/lib/cycles';
import type { AuraPage } from '@/ui/aura/AuraPager';
import { moodForPace, type Mood } from '@/ui/aura/moods';
import { bigAmount } from '@/ui/aura/type';

const DAY_MS = 86_400_000;
const FALLBACK_CYCLE_DAYS = 30;
// Payday gets its own bright page for the first days of a new cycle.
const PAYDAY_PAGE_DAYS = 3;

const ymdToDate = (ymd: string): Date => {
  const [y = 1970, m = 1, d = 1] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d);
};
const daysBetween = (from: Date, to: Date): number => Math.round((to.getTime() - from.getTime()) / DAY_MS);
const pct = (share: number): string => `${Math.round(share * 100)}%`;
const inCycle = (ymd: string, cycle: SalaryCycle): boolean =>
  ymd >= cycle.startOn && (cycle.endOnExclusive === null || ymd < cycle.endOnExclusive);

const LINE: Record<Exclude<Mood, 'shared' | 'pay'>, string> = {
  calm: 'Calm. You are under pace.',
  ahead: 'Spending faster than the days.',
  over: 'Over your budgets.',
};

export type AuraHome = {
  pages: AuraPage[];
  /** What the previous cycle ended with, for the "Cycle closed" moment; null when there is no previous cycle. */
  previousKeptMinor: number | null;
};

/** The money screens of Home's aura: this cycle, payday, each budget, and the shared account. */
export const buildAuraHome = (data: OverviewData, today = new Date()): AuraHome => {
  const cycle = data.activeCycle;
  if (!cycle) return { pages: [], previousKeptMinor: null };

  const start = ymdToDate(cycle.startOn);
  const prev = data.previousCycle;
  const length = prev?.endOnExclusive
    ? Math.max(1, daysBetween(ymdToDate(prev.startOn), ymdToDate(prev.endOnExclusive)))
    : FALLBACK_CYCLE_DAYS;
  const gone = Math.max(1, daysBetween(start, today) + 1);
  const daysShare = Math.min(1, gone / length);
  const toPayday = Math.max(0, length - gone);
  const paydayLine = toPayday === 1 ? '1 day to payday' : `${toPayday} days to payday`;

  const budgets = data.budgets.filter((budget) => budget.salary_cycle_id === cycle.id);
  const states = buildBudgetStateByCategory(data.categories, budgets, data.transactions, cycle);
  const budgetStates = budgets.map((budget) => states[budget.category_id]).filter((state) => state !== undefined);

  const pages: AuraPage[] = [];

  const salary = data.transactions.find((row) => row.is_salary && inCycle(row.occurred_on, cycle));
  if (salary && daysBetween(ymdToDate(salary.occurred_on), today) < PAYDAY_PAGE_DAYS) {
    pages.push({ key: 'payday', mood: 'pay', label: 'Payday', amountMinor: salary.amount_minor, sign: '+', line: 'Paid. A fresh cycle.', subline: 'Budgets start again today' });
  }

  if (budgetStates.length > 0) {
    const total = budgetStates.reduce((sum, state) => sum + state.amountMinor, 0);
    const spent = budgetStates.reduce((sum, state) => sum + state.spentMinor, 0);
    const left = total - spent;
    const used = total > 0 ? spent / total : 0;
    const mood = moodForPace(left, used, daysShare);
    pages.unshift({
      key: 'cycle', mood, label: 'This cycle', amountMinor: left, line: LINE[mood as keyof typeof LINE], subline: paydayLine,
      bars: [{ label: 'Money used', share: used }, { label: 'Days gone', share: daysShare }],
    });
  } else {
    const left = data.cycleBalanceMinor;
    pages.unshift({
      key: 'cycle', mood: left < 0 ? 'over' : 'calm', label: 'This cycle', amountMinor: left,
      line: left < 0 ? 'More out than in so far.' : 'In minus out so far.', subline: paydayLine,
      bars: [{ label: 'Days gone', share: daysShare }],
    });
  }

  const rank: Record<Mood, number> = { over: 0, ahead: 1, calm: 2, shared: 3, pay: 3 };
  budgetStates
    .map((state) => {
      const left = state.amountMinor - state.spentMinor;
      const used = state.amountMinor > 0 ? state.spentMinor / state.amountMinor : 0;
      return { state, left, used, mood: moodForPace(left, used, daysShare) };
    })
    .sort((a, b) => rank[a.mood] - rank[b.mood] || b.used - a.used)
    .forEach(({ state, left, used, mood }) => {
      pages.push({
        key: `budget-${state.categoryId}`,
        mood,
        label: data.categoryLabels[state.categoryId] ?? 'Budget',
        amountMinor: left,
        line: mood === 'over' ? `Over by ${bigAmount(-left)} kr.` : mood === 'ahead' ? 'Faster than the days.' : 'On track.',
        subline: `${pct(used)} used · ${pct(daysShare)} of the cycle gone`,
      });
    });

  const shared = data.shared;
  if (shared.totalTopupTotal > 0 || shared.sharedExpenseTotal > 0) {
    pages.push({
      key: 'shared', mood: 'shared', label: 'Shared', amountMinor: shared.sharedBalance,
      line: shared.sharedBalance >= 0 ? 'Left in the shared account.' : 'The shared account is short.',
      subline: `You added ${bigAmount(shared.meTopupTotal)} kr. · your partner ${bigAmount(shared.gfTopupTotal)} kr.`,
    });
  }

  const previousKeptMinor = prev ? transactionBalance(data.transactions.filter((row) => inCycle(row.occurred_on, prev))) : null;
  return { pages, previousKeptMinor };
};
