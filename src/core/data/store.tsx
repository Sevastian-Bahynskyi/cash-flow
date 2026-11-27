import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/features/auth/AuthProvider';
import type { TableName, Tables } from './types';
import { qaScenario } from '@/dev/scenario';

/**
 * The user's data, loaded the way the PWA loads it (web/lib/data/store.tsx): every table once per session,
 * kept on the device so the app opens with the last numbers, refreshed per table after a write. RLS scopes every query.
 * Transactions come only from the bank, so there is no offline write queue here.
 */
type Status = 'loading' | 'ready' | 'error';
export type Store = {
  userId: string | null;
  tables: Tables | null;
  status: Status;
  error: string | null;
  loadedAt: number | null;
  reload: (only?: TableName[]) => Promise<void>;
  /** Asks the bank-sync function for fresh bank rows (it throttles to once per 15 min), then reloads. */
  sync: () => Promise<void>;
  syncing: boolean;
  patch: <K extends TableName>(name: K, update: (rows: Tables[K]) => Tables[K]) => void;
};

const Ctx = createContext<Store | null>(null);
export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStore outside DataProvider');
  return s;
}

const PAGE = 1000;
async function all<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  // PostgREST caps a response at 1000 rows; page so the newest rows are never dropped.
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) return out;
  }
}

const sb = supabase;
const LOAD: { [K in TableName]: (uid: string) => Promise<Tables[K]> } = {
  // A pending bank row that never booked is 'void': kept in the database, never shown or counted.
  transactions: () => all((a, b) => sb.from('transactions').select('*').neq('status', 'void').order('occurred_on').order('created_at').order('id').range(a, b)),
  categories: () => all((a, b) => sb.from('categories').select('id,user_id,parent_id,name,level,is_system,icon,color').order('level').order('name').order('id').range(a, b)),
  category_overrides: () => all((a, b) => sb.from('category_overrides').select('id,user_id,category_id,name,icon,updated_at').order('id').range(a, b)),
  budgets: () => all((a, b) => sb.from('budgets').select('id,user_id,category_id,salary_cycle_id,amount_minor,notes,created_at').order('id').range(a, b)),
  shared_budgets: () => all((a, b) => sb.from('shared_budgets').select('id,user_id,category_id,salary_cycle_id,amount_minor,notes,created_at').order('id').range(a, b)),
  savings_accounts: () => all((a, b) => sb.from('savings_accounts').select('id,user_id,name,goal_minor,color,icon,bank_account_id,created_at').order('created_at').order('id').range(a, b)),
  savings_events: () => all((a, b) => sb.from('savings_events').select('id,user_id,savings_account_id,action,amount_minor,occurred_on,note,created_at').order('occurred_on').order('created_at').order('id').range(a, b)),
  loans: () => all((a, b) => sb.from('loans').select('id,user_id,name,principal_minor,remaining_minor,status,created_at').order('created_at', { ascending: false }).order('id').range(a, b)),
  loan_events: () => all((a, b) => sb.from('loan_events').select('*').order('occurred_on', { ascending: false }).order('created_at', { ascending: false }).order('id').range(a, b)),
  receivables: () => all((a, b) => sb.from('receivables').select('id,user_id,name,principal_minor,remaining_minor,status,created_at').order('created_at', { ascending: false }).order('id').range(a, b)),
  receivable_events: () => all((a, b) => sb.from('receivable_events').select('*').order('occurred_on', { ascending: false }).order('created_at', { ascending: false }).order('id').range(a, b)),
  merchant_category_rules: () => all((a, b) => sb.from('merchant_category_rules').select('*').order('priority', { ascending: false }).order('updated_at', { ascending: false }).order('id').range(a, b)),
  transfer_people: () => all((a, b) => sb.from('transfer_people').select('id,user_id,name,normalized_name,kind,opening_balance_minor,alias_of,created_at,updated_at').order('name').order('id').range(a, b)),
  profile: async (uid) => {
    const { data, error } = await sb.from('profiles').select('display_name,avatar_url').eq('user_id', uid).maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  },
  bank_connections: () => all((a, b) => sb.from('bank_connections').select('id,aspsp_name,valid_until,status').order('valid_until').order('id').range(a, b)),
  bank_accounts: () => all((a, b) => sb.from('bank_accounts').select('id,connection_id,name,currency,role,balance_minor,balance_at,last_synced_at,last_error').order('role').order('id').range(a, b)),
  sync_runs: async () => {
    const { data, error } = await sb.from('sync_runs').select('id,trigger,started_at,finished_at,ok,error').order('started_at', { ascending: false }).limit(20);
    if (error) throw new Error(error.message);
    return data ?? [];
  },
  transaction_splits: () => all((a, b) => sb.from('transaction_splits').select('id,user_id,transaction_id,category_id,amount_minor,note,created_at').order('created_at').order('id').range(a, b)),
  paybacks: () => all((a, b) => sb.from('paybacks').select('id,user_id,payment_transaction_id,expense_transaction_id,amount_minor,created_at').order('created_at').order('id').range(a, b)),
};
const NAMES = Object.keys(LOAD) as TableName[];
const cacheKey = (uid: string): string => `cashflow:data:${uid}`;

export function DataProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const [tables, setTables] = useState<Tables | null>(null);
  const [status, setStatus] = useState<Status>('loading');
  const [error, setError] = useState<string | null>(null);
  const [loadedAt, setLoadedAt] = useState<number | null>(null);
  const [syncing, setSyncing] = useState(false);
  const tablesRef = useRef<Tables | null>(null);
  tablesRef.current = tables;

  const reload = useCallback(async (only?: TableName[]): Promise<void> => {
    if (!userId) return;
    const names = only ?? NAMES;
    try {
      const loaded = await Promise.all(names.map((n) => LOAD[n](userId)));
      const at = Date.now();
      setTables((prev) => {
        const next = { ...(prev ?? ({} as Tables)) } as Tables;
        names.forEach((n, i) => { (next as Record<TableName, unknown>)[n] = loaded[i]; });
        AsyncStorage.setItem(cacheKey(userId), JSON.stringify({ t: next, at })).catch(() => undefined);
        return next;
      });
      setLoadedAt(at); setStatus('ready'); setError(null);
    } catch (e) {
      if (tablesRef.current) { setStatus('ready'); setError('Couldn’t refresh. Showing what was loaded before.'); }
      else { setStatus('error'); setError(e instanceof Error ? e.message : 'Couldn’t load your data.'); }
    }
  }, [userId]);

  const sync = useCallback(async (): Promise<void> => {
    if (!userId) return;
    setSyncing(true);
    try {
      // The user is here: the function forwards PSU headers so the bank counts it as user-present.
      const res = await supabase.functions.invoke<unknown>('bank-sync', { method: 'POST', body: {} });
      if (res.error) console.warn('[sync]', res.error);
      await reload();
    } finally { setSyncing(false); }
  }, [userId, reload]);

  // Signed in: the device copy first (instant), then the server, then a bank sync.
  useEffect(() => {
    let alive = true;
    setTables(null); setStatus('loading'); setError(null);
    if (!userId) return;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(cacheKey(userId));
        const cached = raw ? (JSON.parse(raw) as { t: Omit<Tables, 'shared_budgets'> & Partial<Tables>; at: number }) : null;
        // a device copy from before shared budgets existed has no such table yet
        if (alive && cached && !tablesRef.current) { setTables({ shared_budgets: [], ...cached.t }); setLoadedAt(cached.at); setStatus('ready'); }
      } catch { /* no device copy */ }
      if (alive) await reload();
      if (alive) await sync();
    })().catch(() => undefined);
    return () => { alive = false; };
  }, [userId, reload, sync]);

  // Back in the app after a while: refresh.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active' && loadedAt && Date.now() - loadedAt > 5 * 60_000) reload().catch(() => undefined);
    });
    return () => sub.remove();
  }, [loadedAt, reload]);

  const patch = useCallback(<K extends TableName>(name: K, update: (rows: Tables[K]) => Tables[K]) => {
    setTables((prev) => (prev ? { ...prev, [name]: update(prev[name]) } : prev));
  }, []);

  const value = useMemo<Store>(() => ({ userId, tables, status, error, loadedAt, reload, sync, syncing, patch }),
    [userId, tables, status, error, loadedAt, reload, sync, syncing, patch]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function FixtureDataProvider({ children, tables }: { children: React.ReactNode; tables: Tables }): React.JSX.Element {
  const value = useMemo<Store>(() => ({
    userId: null, tables, status: 'ready', error: null, loadedAt: null, syncing: false,
    reload: () => Promise.resolve(), sync: () => Promise.resolve(), patch: () => undefined,
  }), [tables]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Runs one write; throws a readable error; refreshes the tables it touched. */
export async function write(store: Store, tables: TableName[], run: () => PromiseLike<{ error: { message: string; code?: string } | null }>): Promise<void> {
  if (qaScenario()) throw new Error('These are read-only examples.');
  const { error } = await run();
  if (error) {
    if (error.code === '23503') throw new Error('It’s still in use, so it can’t be deleted.');
    if (error.code === '23505') throw new Error('That already exists.');
    if (error.code === '42501' || /JWT|auth/i.test(error.message)) throw new Error('Your session ended. Sign in again.');
    console.warn('[write]', error);
    throw new Error('Not saved. Try again in a moment.');
  }
  await store.reload(tables);
}
