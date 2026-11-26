'use client'

import { useMemo } from 'react'
import { applyCategoryOverrides, buildCategoryMeta, getDisplayCategoryName, type CategoryMeta } from '@/lib/domain/category-helpers'
import type { CategoryOption } from '@/lib/domain/categories-types'
import { findIncomeParentIds } from '@/lib/domain/category-rules'
import { buildNavigableCycles, findCycleFor, type SalaryCycle } from '@/lib/domain/cycles'
import { computePersonalExpenseMinorByTransactionId } from '@/lib/domain/shared'
import { addDays, daysBetween, parseYmd, todayYmd, ymd } from '@/lib/fmt'
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
  const share = computePersonalExpenseMinorByTransactionId(tx.map((r) => ({ ...r, shared_participant: r.shared_participant ?? null })))
  /** What this row costs you: your share of a shared expense, nothing for money moved to the pot or a transfer. */
  const mine = (r: TransactionRow): number => r.kind !== 'expense' || r.is_shared_topup || isTransfer(r.category_id) ? 0 : share.get(r.id) ?? r.amount_minor

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
    for (const r of rows) { const p = parentOf(r.category_id); const m = mine(r); if (p && m) spent.set(p.id, (spent.get(p.id) ?? 0) + m) }
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

  return { t, today, options, cats, byId, meta, parentOf, incomeParents, isTransfer, tx, share, mine, cycles, current, inCycle, prevOf, budgetsOf, days, daysLeft,
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
