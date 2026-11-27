import type { Cycle, Model } from '@/core/data/model';
import { budgetState, goneShare } from '@/core/domain/budget-state';
import { kr, shortDate } from '@/core/fmt';
import type { AuraPage } from '@/ui/aura/AuraPager';

export function auraPages(m: Model): { pages: AuraPage[]; currentIndex: number } {
  const current = m.current;
  if (!current) return { pages: [], currentIndex: 0 };

  const cycles = m.cycles.slice(0, m.cycles.indexOf(current) + 1);
  const summary = (cycle: Cycle): AuraPage => {
    const b = m.budgetsOf(cycle);
    const active = cycle.id === current.id;
    const dates = `${shortDate(cycle.startOn)} – ${shortDate(cycle.endInclusive)}`;
    const balance = b.list.length ? b.left : b.income - b.allMine;
    const warning = b.list.length ? budgetState(b.used, b.total, goneShare(m, cycle)) : 'none';
    return {
      key: cycle.id,
      navigationLabel: `${cycle.name} cycle`,
      mood: balance < 0 ? 'over' : active && warning === 'ahead' ? 'ahead' : 'calm',
      label: !active ? `${cycle.name} cycle` : b.list.length ? 'Left in budgets' : 'Income minus spending',
      amountMinor: balance,
      line: b.list.length
        ? (balance < 0 ? 'Over budget' : active ? `${m.daysLeft} ${m.daysLeft === 1 ? 'day' : 'days'} to payday` : 'Left at cycle close')
        : (active && cycle.real ? `${m.daysLeft} ${m.daysLeft === 1 ? 'day' : 'days'} to payday` : 'Income minus spending'),
      subline: dates,
    };
  };

  const b = m.budgetsOf(current);
  const share = goneShare(m, current);
  const ahead = b.list.filter((item) => budgetState(item.spent, item.amount, share) === 'ahead').length;
  const over = b.list.filter((item) => item.left < 0).length;
  const warnings = [over ? `${over} over budget` : '', ahead ? `${ahead} spending quickly` : ''].filter(Boolean);
  const budget: AuraPage = {
    key: 'budget-status',
    mood: over ? 'over' : ahead ? 'ahead' : 'calm',
    label: 'Budget status',
    amountMinor: b.used,
    line: b.list.length ? `Spent of ${kr(b.total, true)} budgeted` : 'No budgets set for this cycle',
    subline: warnings.length ? warnings.join(' · ') : b.list.length ? 'Budgets on pace' : undefined,
    bars: b.total ? [{ label: 'Budget used', share: b.used / b.total }, { label: 'Cycle elapsed', share }] : undefined,
  };
  return { pages: [...cycles.map(summary), budget], currentIndex: cycles.length - 1 };
}
