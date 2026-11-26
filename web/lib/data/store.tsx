'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { idbClear, idbGet, idbSet } from './idb'
import { DEMO, demoTables } from './demo'
import type { TableName, Tables, TransactionInsert, TransactionRow } from './types'

/**
 * The user's data, loaded once per session the way the Expo app's `useOverview` did, kept on the
 * device for offline reading, and refreshed per table after a write. RLS scopes every query.
 */
type Status = 'loading' | 'ready' | 'error'
type Queued = { id: string; row: TransactionInsert & { id: string } }
type Store = {
  userId: string | null
  tables: Tables | null
  status: Status
  error: string | null
  offline: boolean
  loadedAt: number | null
  queued: number
  /** Ids saved on this device that have not reached the server yet. */
  pendingIds: ReadonlySet<string>
  reload: (only?: TableName[]) => Promise<void>
  /** Asks the bank-sync function for fresh bank rows (it throttles to once per 15 min), then reloads. */
  sync: () => Promise<void>
  syncing: boolean
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
  // A pending bank row that never booked is 'void': kept in the database, never shown or counted.
  transactions: () => all((a, b) => sb().from('transactions').select('*').neq('status', 'void').order('occurred_on').order('created_at').order('id').range(a, b)),
  categories: () => all((a, b) => sb().from('categories').select('id,user_id,parent_id,name,level,is_system,icon,color').order('level').order('name').order('id').range(a, b)),
  category_overrides: () => all((a, b) => sb().from('category_overrides').select('id,user_id,category_id,name,icon,updated_at').order('id').range(a, b)),
  budgets: () => all((a, b) => sb().from('budgets').select('id,user_id,category_id,salary_cycle_id,amount_minor,notes,created_at').order('id').range(a, b)),
  savings_accounts: () => all((a, b) => sb().from('savings_accounts').select('id,user_id,name,goal_minor,color,icon,bank_account_id,created_at').order('created_at').order('id').range(a, b)),
  savings_events: () => all((a, b) => sb().from('savings_events').select('id,user_id,savings_account_id,action,amount_minor,occurred_on,note,created_at').order('occurred_on').order('created_at').order('id').range(a, b)),
  loans: () => all((a, b) => sb().from('loans').select('id,user_id,name,principal_minor,remaining_minor,status,created_at').order('created_at', { ascending: false }).order('id').range(a, b)),
  loan_events: () => all((a, b) => sb().from('loan_events').select('*').order('occurred_on', { ascending: false }).order('created_at', { ascending: false }).order('id').range(a, b)),
  receivables: () => all((a, b) => sb().from('receivables').select('id,user_id,name,principal_minor,remaining_minor,status,created_at').order('created_at', { ascending: false }).order('id').range(a, b)),
  receivable_events: () => all((a, b) => sb().from('receivable_events').select('*').order('occurred_on', { ascending: false }).order('created_at', { ascending: false }).order('id').range(a, b)),
  merchant_category_rules: () => all((a, b) => sb().from('merchant_category_rules').select('*').order('priority', { ascending: false }).order('updated_at', { ascending: false }).order('id').range(a, b)),
  transfer_people: () => all((a, b) => sb().from('transfer_people').select('id,user_id,name,normalized_name,kind,opening_balance_minor,alias_of,created_at,updated_at').order('name').order('id').range(a, b)),
  profile: async (uid) => {
    const { data, error } = await sb().from('profiles').select('display_name,avatar_url').eq('user_id', uid).maybeSingle()
    if (error) throw new Error(error.message)
    return data
  },
  bank_connections: () => all((a, b) => sb().from('bank_connections').select('id,aspsp_name,valid_until,status').order('valid_until').order('id').range(a, b)),
  bank_accounts: () => all((a, b) => sb().from('bank_accounts').select('id,connection_id,name,currency,role,balance_minor,balance_at,last_synced_at,last_error').order('role').order('id').range(a, b)),
  sync_runs: async () => {
    const { data, error } = await sb().from('sync_runs').select('id,trigger,started_at,finished_at,ok,error').order('started_at', { ascending: false }).limit(20)
    if (error) throw new Error(error.message)
    return data ?? []
  },
  transaction_splits: () => all((a, b) => sb().from('transaction_splits').select('id,user_id,transaction_id,category_id,amount_minor,note,created_at').order('created_at').order('id').range(a, b)),
  paybacks: () => all((a, b) => sb().from('paybacks').select('id,user_id,payment_transaction_id,expense_transaction_id,amount_minor,created_at').order('created_at').order('id').range(a, b)),
}
const NAMES = Object.keys(LOAD) as TableName[]
/** Rows saved on this device but not yet on the server, shown in every list until they sync. */
function withQueued(rows: TransactionRow[], q: Queued[]): TransactionRow[] {
  const have = new Set(rows.map((r) => r.id))
  const now = new Date().toISOString()
  return sortTx([...rows, ...q.filter((x) => !have.has(x.id)).map((x) => ({ ...x.row, created_at: now, updated_at: now } as TransactionRow))])
}
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
  const queueRef = useRef<Queued[]>([])
  queueRef.current = queue
  const flushing = useRef(false)

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
        if (names.includes('transactions')) next.transactions = withQueued(next.transactions, queueRef.current)
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
    if (DEMO) { setUserId('demo'); setTables(demoTables()); setLoadedAt(Date.now()); setStatus('ready'); return }
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
      if (q?.length) { setQueue(q); queueRef.current = q }
      if (cached) { setTables({ ...cached.t, transactions: withQueued(cached.t.transactions, q ?? []) }); setLoadedAt(cached.at); setStatus('ready') }
    })()
    const { data: sub } = supabase().auth.onAuthStateChange((event) => { if (event === 'SIGNED_OUT') window.location.assign('/sign-in') })
    return () => { alive = false; sub.subscription.unsubscribe() }
  }, [])

  const [syncing, setSyncing] = useState(false)
  const sync = useCallback(async (): Promise<void> => {
    if (DEMO || !userId || !navigator.onLine) return
    setSyncing(true)
    try {
      // The user is here: the function forwards PSU headers so the bank counts it as user-present.
      const { error: e } = await supabase().functions.invoke('bank-sync', { method: 'POST', body: {} })
      if (e) console.error('[sync]', e)
      await reload()
    } finally { setSyncing(false) }
  }, [userId, reload])

  // App open: the device copy and the last server state first, then a sync.
  useEffect(() => { if (userId && !DEMO) void reload().then(() => sync()) }, [userId, reload, sync])

  // Back online: send what was saved on the device, then refresh. Each row carries its own id, so a
  // flush that reached the server but lost its answer, or a second open window, never makes a duplicate.
  const [queueError, setQueueError] = useState<string | null>(null)
  const flush = useCallback(async (): Promise<void> => {
    const batch = queueRef.current
    if (!userId || !batch.length || flushing.current) return
    flushing.current = true
    try {
      const { error: e } = await supabase().from('transactions').upsert(batch.map((q) => q.row), { onConflict: 'id', ignoreDuplicates: true })
      if (e) { setQueueError(`${batch.length} saved on this device couldn’t sync: ${e.message}`); return }
      const sent = new Set(batch.map((q) => q.id))
      const rest = queueRef.current.filter((q) => !sent.has(q.id))
      setQueue(rest); queueRef.current = rest; setQueueError(null)
      await idbSet(`queue:${userId}`, rest)
      await reload(['transactions'])
    } finally { flushing.current = false }
  }, [userId, reload])
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
      const local = rows.map((row) => { const id = crypto.randomUUID(); return { id, row: { ...row, id } } })
      const nextQ = [...queueRef.current, ...local]
      setQueue(nextQ); queueRef.current = nextQ; await idbSet(`queue:${userId}`, nextQ)
      const shown = withQueued([], local)
      patch('transactions', (t) => sortTx([...t, ...shown]))
      return shown
    }
    const { data, error: e } = await supabase().from('transactions').insert(rows).select('*')
    if (e) throw new Error(e.message)
    const saved = (data ?? []) as TransactionRow[]
    patch('transactions', (t) => sortTx([...t, ...saved]))
    return saved
  }, [userId, patch])

  const signOut = useCallback(async () => {
    if (queueRef.current.length) await flush()
    if (queueRef.current.length) throw new Error(`${queueRef.current.length} saved on this device haven’t synced yet. Connect, then sign out.`)
    await idbClear()
    try { localStorage.removeItem('cashflow:uid') } catch { /* nothing kept */ }
    if ('caches' in window) for (const k of await caches.keys()) await caches.delete(k)
    await supabase().auth.signOut()
    window.location.assign('/sign-in')
  }, [flush])

  const pendingIds = useMemo(() => new Set(queue.map((q) => q.id)), [queue])
  const value = useMemo<Store>(() => ({ userId, tables, status, error: error ?? queueError, offline, loadedAt, queued: queue.length, pendingIds, reload, sync, syncing, patch, addTransactions, signOut }),
    [userId, tables, status, error, queueError, offline, loadedAt, queue.length, pendingIds, reload, sync, syncing, patch, addTransactions, signOut])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

/** Runs one write; throws a readable error; refreshes the tables it touched. */
export async function write(store: Store, tables: TableName[], run: () => PromiseLike<{ error: { message: string; code?: string } | null }>): Promise<void> {
  if (!navigator.onLine) throw new Error('You’re offline. This change needs a connection.')
  const { error } = await run()
  if (error) {
    if (error.code === '23503') throw new Error('It’s still in use, so it can’t be deleted.')
    if (error.code === '23505') throw new Error('That already exists.')
    if (error.code === '42501' || /JWT|auth/i.test(error.message)) throw new Error('Your session ended. Sign in again.')
    console.error('[write]', error)
    throw new Error('Not saved. Try again in a moment.')
  }
  await store.reload(tables)
}
