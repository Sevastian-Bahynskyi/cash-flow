
import { useMemo } from 'react'
import { nextPayday } from '@/core/domain/payday'
import { applyCategoryOverrides, buildCategoryMeta, getDisplayCategoryName, type CategoryMeta } from '@/core/domain/category-helpers'
import type { CategoryOption } from '@/core/domain/categories-types'
import { findIncomeParentIds } from '@/core/domain/category-rules'
import { buildNavigableCycles, findCycleFor, type SalaryCycle } from '@/core/domain/cycles'
import { shareOn } from '@/core/domain/shared'
import { costOf, partsOf, type Portion } from '@/core/domain/splits'
import { applyTrips, placeOf as placeOfRow, travelCategoryFor, tripOn, type PlaceRow } from '@/core/domain/trips'
import { debtsOf, linkedIds } from '@/core/domain/debts'
import { addDays, daysBetween, todayYmd } from '@/core/fmt'
import { supabaseUrl } from '@/lib/supabase'
import { useStore } from './store'
import type { BudgetRow, CategoryRow, Tables, TransactionRow } from './types'

export type Cycle = SalaryCycle & { name: string; endInclusive: string; real: boolean }
/** Whose budgets: yours (your purchases and your share of joint ones) or the joint account's (joint purchases in full). */
export type Scope = 'personal' | 'shared'
/** The latest synced balance of the personal or the joint account(s); null when the bank has given none. */
export type BankBalance = { minor: number; at: string; accounts: number }
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
  const places = new Map<string, PlaceRow>(t.merchant_places.map((p) => [p.key, p]))
  // Rows as the screens see them: purchases on a trip move to their Travel category (see trips.ts).
  const tx = applyTrips(t.transactions, t.trips, places, cats, today)
  const placeOf = (r: TransactionRow): PlaceRow | null => placeOfRow(r, places)
  const tripOf = (r: { occurred_on: string }) => tripOn(t.trips, r.occurred_on, today)
  const debts = debtsOf(t)
  // Transfers paying into a debt are neither spending nor income.
  const linked = linkedIds(debts)
  /** The Inbox: unsure guesses from the last 30 days, newest first. */
  const inbox = [...tx].reverse().filter((r) => r.needs_review && r.occurred_on >= addDays(today, -30))
  // Keyed like scripts/logos.ts logoKey.
  const logos = new Map(t.merchant_logos.map((l) => [l.key, `${supabaseUrl}/storage/v1/object/public/merchant-logos/${encodeURIComponent(l.path)}`]))
  const logoOf = (name: string): string | null => logos.get(name.trim().toLowerCase()) ?? null
  const raw = buildNavigableCycles(tx)
  // My share of joint spending on a day: the cycle's top-ups (trailing 90 days, then half, when a cycle has none).
  const ratioOn = shareOn(tx, raw, today)
  const splitsOf = new Map<string, typeof t.transaction_splits>()
  for (const sp of t.transaction_splits) splitsOf.set(sp.transaction_id, [...(splitsOf.get(sp.transaction_id) ?? []), sp])
  const NEUTRAL = new Set(['moved', 'topup', 'ignore'])
  /** Spending at all: not money moved, top-ups, transfers, void rows or transfers paying into a debt. */
  const counts = (r: TransactionRow): boolean => r.kind === 'expense' && r.status !== 'void' && !r.is_shared_topup && !linked.has(r.id) && !NEUTRAL.has(r.movement ?? '') && !isTransfer(r.category_id)
  /**
   * A row's cost by category for one scope: split parts go to their own category and are yours or shared each,
   * the rest stays on the row's category and whose. Personal: your share of shared parts.
   * Shared: what the joint account pays (budgets and analytics sum these).
   */
  const portions = (r: TransactionRow, scope: Scope = 'personal'): Portion[] => {
    if (!counts(r)) return [{ category_id: r.category_id, gross: r.amount_minor, shared: r.shared, minor: 0 }]
    // on a trip the row moved to Travel; its parts follow to their Travel category when there is one
    const trip = (r as { home_category_id?: string | null }).home_category_id !== undefined
    const sp = (splitsOf.get(r.id) ?? []).map((x) => ({ ...x, category_id: (trip && travelCategoryFor(cats, x.category_id)) || x.category_id }))
    return costOf(partsOf(r, sp), scope, ratioOn(r.occurred_on))
  }
  /** What this row costs you, all parts together. */
  const mine = (r: TransactionRow): number => portions(r).reduce((a, p) => a + p.minor, 0)
  /** Some of it is shared with the partner: the whole row or one of its parts. */
  const sharedSome = (r: TransactionRow): boolean => r.shared || (splitsOf.get(r.id) ?? []).some((x) => x.shared)
  const spendingIn = (r: TransactionRow, categoryId: string, scope: Scope = 'personal'): number => {
    const category = byId.get(categoryId)
    return portions(r, scope).reduce((sum, part) => {
      const parent = parentOf(part.category_id)
      const matches = categoryId === 'uncategorized' ? !parent : category?.level === 1 ? parent?.id === categoryId : part.category_id === categoryId
      return matches ? sum + part.minor : sum
    }, 0)
  }

  const cycles: Cycle[] = raw.map((c) => {
    const real = isReal(c)
    const endInclusive = c.endOnExclusive ? addDays(c.endOnExclusive, -1) : expectedPayday(c, raw) ? addDays(expectedPayday(c, raw) as string, -1) : today
    return { ...c, real, endInclusive, name: c.label.replace(/ \d{4}$/, (y) => (y.trim() === today.slice(0, 4) ? '' : y)) }
  })
  const current = (findCycleFor(cycles, today) as Cycle | null) ?? cycles[cycles.length - 1] ?? null
  const inCycle = (c: Cycle | null) => (r: { occurred_on: string }): boolean => Boolean(c && r.occurred_on >= c.startOn && (c.endOnExclusive === null || r.occurred_on < c.endOnExclusive))
  const prevOf = (c: Cycle | null): Cycle | null => { const i = c ? cycles.findIndex((x) => x.id === c.id) : -1; return i > 0 ? cycles[i - 1] ?? null : null }

  /** Budgets of a cycle by parent category, with what was spent there (child rows roll up to the parent). Each salary cycle has its own limits; unused room never carries over. */
  function budgetsOf(c: Cycle | null, scope: Scope = 'personal') {
    const rows = c ? tx.filter(inCycle(c)) : []
    const spent = new Map<string, number>()
    for (const r of rows) for (const x of portions(r, scope)) { const p = parentOf(x.category_id); if (p && x.minor) spent.set(p.id, (spent.get(p.id) ?? 0) + x.minor) }
    const limits = scope === 'shared' ? t.shared_budgets : t.budgets
    const list = (c ? limits.filter((b) => b.salary_cycle_id === c.id) : []).map((b: BudgetRow) => {
      const cat = byId.get(b.category_id)
      const s = spent.get(b.category_id) ?? 0
      return { budget: b, cat, id: b.category_id, spent: s, amount: b.amount_minor, left: b.amount_minor - s, ratio: b.amount_minor ? s / b.amount_minor : 0 }
    }).filter((x) => x.cat).sort((a, b) => b.ratio - a.ratio)
    const total = list.reduce((a, b) => a + b.amount, 0)
    const used = list.reduce((a, b) => a + b.spent, 0)
    const unbudgeted = [...spent.entries()].filter(([id]) => !list.some((b) => b.id === id) && !incomeParents.has(id) && !isTransfer(id)).map(([id, s]) => ({ cat: byId.get(id) as CategoryRow, spent: s })).filter((x) => x.cat)
    const salary = rows.filter((r) => r.is_salary).reduce((a, r) => a + r.amount_minor, 0)
    const moneyIn = rows.filter((r) => r.kind === 'income' && !r.is_shared_topup && !linked.has(r.id) && !isTransfer(r.category_id))
    const income = moneyIn.reduce((a, r) => a + r.amount_minor, 0)
    // A refund gives spending back (it has no category of its own to come off).
    const refunds = moneyIn.filter((r) => r.movement === 'refund').reduce((a, r) => a + r.amount_minor, 0)
    const allMine = rows.reduce((a, r) => a + mine(r), 0) - refunds
    return { rows, list, total, used, left: total - used, spent, unbudgeted, salary, income, allMine }
  }

  // The composer's options, as the Expo app built them: every parent except Income, plus every child.
  const options: CategoryOption[] = [
    ...cats.filter((r) => r.level === 1 && r.name.trim().toLowerCase() !== 'income').map((r) => ({ id: r.id, name: r.name, parentName: r.name, searchKey: r.name.toLowerCase(), parentId: r.id, icon: r.icon, color: r.color, parentColor: r.color, parentIcon: r.icon })),
    ...cats.filter((r) => r.level === 2 && r.parent_id).map((r) => { const p = byId.get(r.parent_id as string); const pn = p?.name ?? ''; const n = getDisplayCategoryName(pn, r.name); return { id: r.id, name: n, parentName: pn, searchKey: `${pn} ${n} ${r.name}`.toLowerCase(), parentId: r.parent_id as string, icon: r.icon, color: r.color, parentColor: p?.color ?? r.color, parentIcon: p?.icon ?? r.icon } }),
  ]

  /** What is in the bank now: the personal or joint account(s), summed; the time is the oldest of their syncs. It spans every cycle. */
  const bankOf = (scope: Scope): BankBalance | null => {
    const accounts = t.bank_accounts.filter((a) => a.role === (scope === 'shared' ? 'joint' : 'personal') && a.balance_minor !== null)
    if (!accounts.length) return null
    const at = accounts.map((a) => a.balance_at ?? a.last_synced_at ?? '').sort()[0] ?? ''
    return { minor: accounts.reduce((sum, a) => sum + (a.balance_minor ?? 0), 0), at, accounts: accounts.length }
  }

  const days = current ? Math.max(1, daysBetween(current.startOn, current.endInclusive) + 1) : 0
  const daysLeft = current ? Math.max(0, daysBetween(today, current.endInclusive) + 1) : 0

  return { t, today, options, cats, byId, meta, parentOf, logoOf, places, placeOf, tripOf, debts, linked, inbox, incomeParents, isTransfer, tx, mine, sharedSome, portions, spendingIn, splitsOf, cycles, current, inCycle, prevOf, budgetsOf, bankOf, days, daysLeft,
    payday: current ? addDays(current.endInclusive, 1) : null, hasSalary: tx.some((r) => r.is_salary) }
}

/** Next salary is expected on the owner's Danish payday: a banking day before the month's last banking day. */
function expectedPayday(c: SalaryCycle, all: SalaryCycle[]): string | null {
  if (c.endOnExclusive || !all.some((x) => x.id === c.id && isReal(x))) return null
  return nextPayday(c.startOn)
}

/** The derived model for the screens; null until the first data arrives. */
// One model per tables object, shared by every screen (each useMemo alone would rebuild it per caller).
let last: { t: Tables; m: Model } | null = null
export function useModel(): Model | null {
  const { tables } = useStore()
  return useMemo(() => {
    if (!tables) return null
    if (last?.t !== tables) last = { t: tables, m: derive(tables) }
    return last.m
  }, [tables])
}
