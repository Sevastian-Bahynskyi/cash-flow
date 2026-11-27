
import { useMemo } from 'react'
import { applyCategoryOverrides, buildCategoryMeta, getDisplayCategoryName, type CategoryMeta } from '@/core/domain/category-helpers'
import type { CategoryOption } from '@/core/domain/categories-types'
import { findIncomeParentIds } from '@/core/domain/category-rules'
import { buildNavigableCycles, findCycleFor, type SalaryCycle } from '@/core/domain/cycles'
import { computeMyCostByTransactionId } from '@/core/domain/shared'
import { addDays, daysBetween, parseYmd, todayYmd, ymd } from '@/core/fmt'
import { useStore } from './store'
import type { BudgetRow, CategoryRow, Tables, TransactionRow } from './types'

export type Cycle = SalaryCycle & { name: string; endInclusive: string; real: boolean }
export type Model = ReturnType<typeof derive>

const TRANSFER = 'transfers'
/** A salary cycle's id is the salary transaction's id; navigable cycles before the first salary have made-up ids. */
const isReal = (c: SalaryCycle): boolean => !/^(nav|cal)-/.test(c.id)

function derive(t: Tables) {
  const today = todayYmd()
  const cats = applyCategoryOverrides(t.categories, t.category_overrides)
  const byId = new Map(cats.map((c) => [c.id, c]))
  const meta: Record<string, CategoryMeta> = buildCategoryMeta(cats)
  const parentOf = (id: string | null): CategoryRow | undefined => { const c = id ? byId.get(id) : undefined; return c?.parent_id ? byId.get(c.parent_id) : c }
  const incomeParents = findIncomeParentIds(cats)
  const isTransfer = (id: string | null): boolean => (parentOf(id)?.name.toLowerCase() ?? '') === TRANSFER
  const tx = t.transactions
  // My cost of each expense: joint spending at my share of the cycle's top-ups (trailing 90 days, then half, when a cycle has none).
  const share = computeMyCostByTransactionId(tx, buildNavigableCycles(tx), today)
  const paidBack = new Map<string, number>()
  for (const p of t.paybacks) paidBack.set(p.expense_transaction_id, (paidBack.get(p.expense_transaction_id) ?? 0) + p.amount_minor)
  const splitsOf = new Map<string, typeof t.transaction_splits>()
  for (const sp of t.transaction_splits) splitsOf.set(sp.transaction_id, [...(splitsOf.get(sp.transaction_id) ?? []), sp])
  const NEUTRAL = new Set(['moved', 'topup', 'ignore'])
  /** What this row costs you: your share of a shared expense, less what people paid back; nothing for money moved, top-ups or transfers. */
  const mine = (r: TransactionRow): number => r.kind !== 'expense' || r.is_shared_topup || NEUTRAL.has(r.movement ?? '') || isTransfer(r.category_id) ? 0
    : Math.max(0, (share.get(r.id) ?? r.amount_minor) - (paidBack.get(r.id) ?? 0))
  /** Your cost of a row by category: split parts go to their own category, the rest stays on the row's (budgets and analytics sum these). */
  const portions = (r: TransactionRow): { category_id: string | null; minor: number }[] => {
    const v = mine(r)
    const sp = splitsOf.get(r.id)
    if (!v || !sp?.length || !r.amount_minor) return [{ category_id: r.category_id, minor: v }]
    const parts = sp.map((x) => ({ category_id: x.category_id, minor: Math.round((v * x.amount_minor) / r.amount_minor) }))
    return [...parts, { category_id: r.category_id, minor: v - parts.reduce((a, x) => a + x.minor, 0) }]
  }
  const spendingIn = (r: TransactionRow, categoryId: string): number => {
    const category = byId.get(categoryId)
    return portions(r).reduce((sum, part) => {
      const parent = parentOf(part.category_id)
      const matches = categoryId === 'uncategorized' ? !parent : category?.level === 1 ? parent?.id === categoryId : part.category_id === categoryId
      return matches ? sum + part.minor : sum
    }, 0)
  }

  const raw = buildNavigableCycles(tx)
  const cycles: Cycle[] = raw.map((c) => {
    const real = isReal(c)
    const endInclusive = c.endOnExclusive ? addDays(c.endOnExclusive, -1) : expectedPayday(c, raw) ? addDays(expectedPayday(c, raw) as string, -1) : today
    return { ...c, real, endInclusive, name: c.label.replace(/ \d{4}$/, (y) => (y.trim() === today.slice(0, 4) ? '' : y)) }
  })
  const current = (findCycleFor(cycles, today) as Cycle | null) ?? cycles[cycles.length - 1] ?? null
  const inCycle = (c: Cycle | null) => (r: { occurred_on: string }): boolean => Boolean(c && r.occurred_on >= c.startOn && (c.endOnExclusive === null || r.occurred_on < c.endOnExclusive))
  const prevOf = (c: Cycle | null): Cycle | null => { const i = c ? cycles.findIndex((x) => x.id === c.id) : -1; return i > 0 ? cycles[i - 1] ?? null : null }

  /** Budgets of a cycle by parent category, with what you spent there (child rows roll up to the parent). */
  function budgetsOf(c: Cycle | null) {
    const rows = c ? tx.filter(inCycle(c)) : []
    const spent = new Map<string, number>()
    for (const r of rows) for (const x of portions(r)) { const p = parentOf(x.category_id); if (p && x.minor) spent.set(p.id, (spent.get(p.id) ?? 0) + x.minor) }
    const list = (c ? t.budgets.filter((b) => b.salary_cycle_id === c.id) : []).map((b: BudgetRow) => {
      const cat = byId.get(b.category_id)
      const s = spent.get(b.category_id) ?? 0
      return { budget: b, cat, id: b.category_id, spent: s, amount: b.amount_minor, left: b.amount_minor - s, ratio: b.amount_minor ? s / b.amount_minor : 0 }
    }).filter((x) => x.cat).sort((a, b) => b.ratio - a.ratio)
    const total = list.reduce((a, b) => a + b.amount, 0)
    const used = list.reduce((a, b) => a + b.spent, 0)
    const unbudgeted = [...spent.entries()].filter(([id]) => !list.some((b) => b.id === id) && !incomeParents.has(id) && !isTransfer(id)).map(([id, s]) => ({ cat: byId.get(id) as CategoryRow, spent: s })).filter((x) => x.cat)
    const salary = rows.filter((r) => r.is_salary).reduce((a, r) => a + r.amount_minor, 0)
    const income = rows.filter((r) => r.kind === 'income' && !isTransfer(r.category_id)).reduce((a, r) => a + r.amount_minor, 0)
    const allMine = rows.reduce((a, r) => a + mine(r), 0)
    return { rows, list, total, used, left: total - used, spent, unbudgeted, salary, income, allMine }
  }

  // The composer's options, as the Expo app built them: every parent except Income, plus every child.
  const options: CategoryOption[] = [
    ...cats.filter((r) => r.level === 1 && r.name.trim().toLowerCase() !== 'income').map((r) => ({ id: r.id, name: r.name, parentName: r.name, searchKey: r.name.toLowerCase(), parentId: r.id, icon: r.icon, color: r.color, parentColor: r.color, parentIcon: r.icon })),
    ...cats.filter((r) => r.level === 2 && r.parent_id).map((r) => { const p = byId.get(r.parent_id as string); const pn = p?.name ?? ''; const n = getDisplayCategoryName(pn, r.name); return { id: r.id, name: n, parentName: pn, searchKey: `${pn} ${n} ${r.name}`.toLowerCase(), parentId: r.parent_id as string, icon: r.icon, color: r.color, parentColor: p?.color ?? r.color, parentIcon: p?.icon ?? r.icon } }),
  ]

  const days = current ? Math.max(1, daysBetween(current.startOn, current.endInclusive) + 1) : 0
  const daysLeft = current ? Math.max(0, daysBetween(today, current.endInclusive) + 1) : 0

  return { t, today, options, cats, byId, meta, parentOf, incomeParents, isTransfer, tx, share, mine, portions, spendingIn, splitsOf, paidBack, cycles, current, inCycle, prevOf, budgetsOf, days, daysLeft,
    payday: current ? addDays(current.endInclusive, 1) : null, hasSalary: tx.some((r) => r.is_salary) }
}

/** Next salary is expected on the same day next month as the cycle's salary (clamped to the month's end). */
function expectedPayday(c: SalaryCycle, all: SalaryCycle[]): string | null {
  if (c.endOnExclusive || !all.some((x) => x.id === c.id && isReal(x))) return null
  const d = parseYmd(c.startOn)
  const day = d.getDate()
  const next = new Date(d.getFullYear(), d.getMonth() + 1, 1)
  next.setDate(Math.min(day, new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate()))
  return ymd(next)
}

/** The derived model for the screens; null until the first data arrives. */
export function useModel(): Model | null {
  const { tables } = useStore()
  return useMemo(() => (tables ? derive(tables) : null), [tables])
}
