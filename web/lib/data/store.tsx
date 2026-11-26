'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { idbClear, idbGet, idbSet } from './idb'
import type { TableName, Tables, TransactionInsert, TransactionRow } from './types'

/**
 * The user's data, loaded once per session the way the Expo app's `useOverview` did, kept on the
 * device for offline reading, and refreshed per table after a write. RLS scopes every query.
 */
type Status = 'loading' | 'ready' | 'error'
type Queued = { id: string; row: TransactionInsert }
type Store = {
  userId: string | null
  tables: Tables | null
  status: Status
  error: string | null
  offline: boolean
  loadedAt: number | null
  queued: number
  reload: (only?: TableName[]) => Promise<void>
  patch: <K extends TableName>(name: K, update: (rows: Tables[K]) => Tables[K]) => void
  addTransactions: (rows: TransactionInsert[]) => Promise<TransactionRow[]>
  signOut: () => Promise<void>
}

const Ctx = createContext<Store | null>(null)
export function useStore(): Store {
  const s = useContext(Ctx)
  if (!s) throw new Error('useStore outside DataProvider')
  return s
}

const PAGE = 1000
async function all<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  // PostgREST caps a response at 1000 rows; page so the newest rows are never dropped (DATA.md § 6).
  const out: T[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    out.push(...(data ?? []))
    if (!data || data.length < PAGE) return out
  }
}

const sb = () => supabase()
const LOAD: { [K in TableName]: (uid: string) => Promise<Tables[K]> } = {
  transactions: () => all((a, b) => sb().from('transactions').select('*').order('occurred_on').order('created_at').order('id').range(a, b)),
  categories: () => all((a, b) => sb().from('categories').select('id,user_id,parent_id,name,level,is_system,icon,color').order('level').order('name').range(a, b)),
  category_overrides: () => all((a, b) => sb().from('category_overrides').select('id,user_id,category_id,name,icon,updated_at').range(a, b)),
  budgets: () => all((a, b) => sb().from('budgets').select('id,user_id,category_id,salary_cycle_id,amount_minor,notes,created_at').range(a, b)),
  savings_accounts: () => all((a, b) => sb().from('savings_accounts').select('id,user_id,name,goal_minor,color,icon,created_at').order('created_at').range(a, b)),
  savings_events: () => all((a, b) => sb().from('savings_events').select('id,user_id,savings_account_id,action,amount_minor,occurred_on,note,created_at').order('occurred_on').order('created_at').range(a, b)),
  loans: () => all((a, b) => sb().from('loans').select('id,user_id,name,principal_minor,remaining_minor,status,created_at').order('created_at', { ascending: false }).range(a, b)),
  loan_events: () => all((a, b) => sb().from('loan_events').select('*').order('occurred_on', { ascending: false }).range(a, b)),
  receivables: () => all((a, b) => sb().from('receivables').select('id,user_id,name,principal_minor,remaining_minor,status,created_at').order('created_at', { ascending: false }).range(a, b)),
  receivable_events: () => all((a, b) => sb().from('receivable_events').select('*').order('occurred_on', { ascending: false }).range(a, b)),
  merchant_category_rules: () => all((a, b) => sb().from('merchant_category_rules').select('*').order('priority', { ascending: false }).order('updated_at', { ascending: false }).range(a, b)),
  transfer_people: () => all((a, b) => sb().from('transfer_people').select('id,user_id,name,normalized_name,created_at,updated_at').order('name').range(a, b)),
  profile: async (uid) => {
    const { data, error } = await sb().from('profiles').select('display_name,avatar_url').eq('user_id', uid).maybeSingle()
    if (error) throw new Error(error.message)
    return data
  },
}
const NAMES = Object.keys(LOAD) as TableName[]
const sortTx = (rows: TransactionRow[]): TransactionRow[] => [...rows].sort((a, b) => a.occurred_on.localeCompare(b.occurred_on) || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))

export function DataProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [userId, setUserId] = useState<string | null>(null)
  const [tables, setTables] = useState<Tables | null>(null)
  const [status, setStatus] = useState<Status>('loading')
  const [error, setError] = useState<string | null>(null)
  const [offline, setOffline] = useState(false)
  const [loadedAt, setLoadedAt] = useState<number | null>(null)
  const [queue, setQueue] = useState<Queued[]>([])
  const tablesRef = useRef<Tables | null>(null)
  tablesRef.current = tables

  const save = useCallback(async (uid: string, t: Tables, at: number) => { await idbSet(`data:${uid}`, { t, at }) }, [])

  const reload = useCallback(async (only?: TableName[]): Promise<void> => {
    const uid = userId
    if (!uid) return
    const names = only ?? NAMES
    try {
      const loaded = await Promise.all(names.map((n) => LOAD[n](uid)))
      const at = Date.now()
      setTables((prev) => {
        const next = { ...(prev ?? ({} as Tables)) } as Tables
        names.forEach((n, i) => { (next as Record<TableName, unknown>)[n] = loaded[i] })
        void save(uid, next, at)
        return next
      })
      setLoadedAt(at); setStatus('ready'); setError(null); setOffline(false)
    } catch (e) {
      const isOffline = typeof navigator !== 'undefined' && !navigator.onLine
      setOffline(isOffline)
      if (tablesRef.current) { setStatus('ready'); setError(isOffline ? null : 'Couldn’t refresh. Showing what was loaded before.') }
      else { setStatus('error'); setError(isOffline ? 'You’re offline, and nothing is saved on this device yet.' : e instanceof Error ? e.message : 'Couldn’t load your data.') }
    }
  }, [userId, save])

  // Who is signed in; then the device copy first (instant, and offline), then the network.
  useEffect(() => {
    let alive = true
    void (async () => {
      const { data } = await supabase().auth.getSession()
      let uid = data.session?.user.id ?? null
      if (!uid) { try { uid = localStorage.getItem('cashflow:uid') } catch { uid = null } }
      if (!alive) return
      if (!uid) { window.location.assign('/sign-in'); return }
      try { localStorage.setItem('cashflow:uid', uid) } catch { /* storage blocked: offline copy only lasts this visit */ }
      setUserId(uid)
      const cached = await idbGet<{ t: Tables; at: number }>(`data:${uid}`)
      const q = await idbGet<Queued[]>(`queue:${uid}`)
      if (!alive) return
      if (cached) { setTables(cached.t); setLoadedAt(cached.at); setStatus('ready') }
      if (q?.length) setQueue(q)
    })()
    const { data: sub } = supabase().auth.onAuthStateChange((event) => { if (event === 'SIGNED_OUT') window.location.assign('/sign-in') })
    return () => { alive = false; sub.subscription.unsubscribe() }
  }, [])

  useEffect(() => { if (userId) void reload() }, [userId, reload])

  // Back online: send what was saved on the device, then refresh.
  const flush = useCallback(async (): Promise<void> => {
    if (!userId || !queue.length) return
    const { error: e } = await supabase().from('transactions').insert(queue.map((q) => q.row))
    if (e) return
    setQueue([]); await idbSet(`queue:${userId}`, [])
    await reload(['transactions'])
  }, [userId, queue, reload])
  useEffect(() => {
    const on = (): void => { setOffline(false); void flush().then(() => reload()) }
    const off = (): void => setOffline(true)
    window.addEventListener('online', on); window.addEventListener('offline', off)
    if (!navigator.onLine) setOffline(true)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [flush, reload])
  useEffect(() => { if (queue.length && navigator.onLine) void flush() }, [queue.length, flush])

  const patch = useCallback(<K extends TableName>(name: K, update: (rows: Tables[K]) => Tables[K]) => {
    setTables((prev) => prev ? { ...prev, [name]: update(prev[name]) } : prev)
  }, [])

  const addTransactions = useCallback(async (rows: TransactionInsert[]): Promise<TransactionRow[]> => {
    if (!userId) throw new Error('Not signed in.')
    const now = new Date().toISOString()
    if (!navigator.onLine) {
      // Saved on this device; it syncs when the connection is back. A typed amount is never lost.
      const local = rows.map((row, i) => ({ id: `local-${Date.now()}-${i}`, row }))
      const nextQ = [...queue, ...local]
      setQueue(nextQ); await idbSet(`queue:${userId}`, nextQ)
      const shown = local.map(({ id, row }) => ({ ...row, id, created_at: now, updated_at: now } as TransactionRow))
      patch('transactions', (t) => sortTx([...t, ...shown]))
      return shown
    }
    const { data, error: e } = await supabase().from('transactions').insert(rows).select('*')
    if (e) throw new Error(e.message)
    const saved = (data ?? []) as TransactionRow[]
    patch('transactions', (t) => sortTx([...t, ...saved]))
    return saved
  }, [userId, queue, patch])

  const signOut = useCallback(async () => {
    await idbClear()
    try { localStorage.removeItem('cashflow:uid') } catch { /* nothing kept */ }
    await supabase().auth.signOut()
    window.location.assign('/sign-in')
  }, [])

  const value = useMemo<Store>(() => ({ userId, tables, status, error, offline, loadedAt, queued: queue.length, reload, patch, addTransactions, signOut }),
    [userId, tables, status, error, offline, loadedAt, queue.length, reload, patch, addTransactions, signOut])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

/** Runs one write; throws a readable error; refreshes the tables it touched. */
export async function write(store: Store, tables: TableName[], run: () => PromiseLike<{ error: { message: string; code?: string } | null }>): Promise<void> {
  if (!navigator.onLine) throw new Error('You’re offline. This change needs a connection.')
  const { error } = await run()
  if (error) throw new Error(error.code === '23503' ? 'It’s still in use, so it can’t be deleted.' : error.code === '23505' ? 'That already exists.' : error.message)
  await store.reload(tables)
}
