import type { Model } from '@/core/data/model';
import { pot } from '@/core/data/pot';
import { budgetState, goneShare } from '@/core/domain/budget-state';
import { daysBetween, kr } from '@/core/fmt';
import { PARTNER } from '@/core/partner';
import type { AuraPage } from '@/ui/aura/AuraPager';
import type { Mood } from '@/ui/aura/moods';

// Payday gets its own bright page for the first days of a new cycle.
const PAYDAY_PAGE_DAYS = 3;
const moodOf = (left: number, spent: number, amount: number, share: number): Mood => (left < 0 ? 'over' : budgetState(spent, amount, share) === 'ahead' ? 'ahead' : 'calm');

/** Home's aura: payday, this cycle, each budget (over and ahead first), the pot with the partner. */
export function auraPages(m: Model): AuraPage[] {
  const c = m.current;
  if (!c) return [];
  const b = m.budgetsOf(c);
  const share = goneShare(m, c);
  const daysLine = c.real && m.payday ? (m.daysLeft === 1 ? '1 day to payday' : `${m.daysLeft} days to payday`) : 'Before your first salary';
  const pages: AuraPage[] = [];

  const salary = b.rows.filter((r) => r.is_salary).at(-1);
  if (salary && daysBetween(salary.occurred_on, m.today) < PAYDAY_PAGE_DAYS) {
    pages.push({ key: 'payday', mood: 'pay', label: 'Payday', amountMinor: salary.amount_minor, sign: '+', line: 'Paid. A fresh cycle.', subline: 'Budgets start again today' });
  }

  if (b.list.length) {
    const mood = moodOf(b.left, b.used, b.total, share);
    pages.unshift({
      key: 'cycle', mood, label: `${c.name} cycle`, amountMinor: b.left,
      line: mood === 'over' ? 'Over your budgets.' : mood === 'ahead' ? 'Spending faster than the days.' : 'Calm. You are under pace.',
      subline: daysLine,
      bars: [{ label: 'Money used', share: b.total ? b.used / b.total : 0 }, { label: 'Days gone', share }],
    });
  } else {
    const left = b.income - b.allMine;
    pages.unshift({ key: 'cycle', mood: left < 0 ? 'over' : 'calm', label: `${c.name} cycle`, amountMinor: left, line: left < 0 ? 'More out than in so far.' : 'In minus your spending.', subline: daysLine, bars: [{ label: 'Days gone', share }] });
  }

  const rank: Record<Mood, number> = { over: 0, ahead: 1, calm: 2, shared: 3, pay: 3 };
  b.list
    .map((x) => ({ x, mood: moodOf(x.left, x.spent, x.amount, share) }))
    .sort((a, z) => rank[a.mood] - rank[z.mood] || z.x.ratio - a.x.ratio)
    .forEach(({ x, mood }) => pages.push({
      key: `budget-${x.id}`, mood, label: x.cat?.name ?? 'Budget', amountMinor: x.left,
      line: mood === 'over' ? `Over by ${kr(-x.left, true)}` : mood === 'ahead' ? 'Faster than the days.' : 'On track.',
      subline: `${kr(x.spent, true)} of ${kr(x.amount, true)} · ${Math.round(share * 100)}% of the cycle gone`,
    }));

  const p = pot(b.rows);
  if (p.totalTopupTotal || p.sharedExpenseTotal) {
    pages.push({
      key: 'shared', mood: 'shared', label: `With ${PARTNER}`, amountMinor: p.sharedBalance,
      line: p.sharedBalance < 0 ? 'More spent than put in.' : 'Left in the pot.',
      subline: `You put in ${kr(p.meTopupTotal, true)} · ${PARTNER} ${kr(p.gfTopupTotal, true)}`,
    });
  }
  return pages;
}
