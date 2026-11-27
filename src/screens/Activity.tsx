import { useMemo, useState } from 'react';
import { TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeInUp, FadeOut } from 'react-native-reanimated';
import { useLocalSearchParams } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useStore, write } from '@/core/data/store';
import type { Model } from '@/core/data/model';
import type { TransactionRow } from '@/core/data/types';
import { addDays, kr, shortDate } from '@/core/fmt';
import { C, F } from '@/ui/kit/theme';
import { Btn, Empty, Header, Icon, IconBtn, List, Panel, Screen, Sec, Seg, T, useToast } from '@/ui/kit/ui';
import { DayList, Gate, SyncLine, TxRow, useDetail } from '@/ui/kit/money';
import { InboxHelp } from './InboxGuide';

type Filter = 'all' | 'mine' | 'shared';

const SEARCH_IN = FadeInUp.duration(200);
const SEARCH_OUT = FadeOut.duration(120);
const LIST_SWAP = FadeIn.duration(200);

/** A search token matches a name, note or category, or a date written as 24.11, 24.11.2026, 2026-11 or 2026. */
function matches(t: TransactionRow, m: Model, q: string): boolean {
  const meta = m.meta[t.category_id ?? ''];
  const text = `${t.name} ${t.comment ?? ''} ${meta?.label ?? ''}`.toLowerCase();
  const [y = '', mo = '', d = ''] = t.occurred_on.split('-');
  const dates = [t.occurred_on, `${+d}.${+mo}`, `${d}.${mo}`, `${+d}.${+mo}.${y}`, `${d}.${mo}.${y}`, `${+mo}.${y}`, `${y}-${mo}`, y, `${+d}/${+mo}`];
  return q.toLowerCase().split(/\s+/).filter(Boolean).every((tok) => text.includes(tok) || dates.some((x) => x === tok || x.startsWith(tok + '.')));
}

/** Unsure rows from the last 30 days: the best guess already counts, one tap confirms it. */
function Inbox({ m }: { m: Model }) {
  const store = useStore();
  const toast = useToast();
  const open = useDetail();
  const [busy, setBusy] = useState<string | null>(null);
  const since = addDays(m.today, -30);
  const items = [...m.tx].reverse().filter((t) => t.needs_review && t.occurred_on >= since);
  if (!items.length) return null;
  const confirm = async (ids: string[]): Promise<void> => {
    setBusy(ids.length > 1 ? 'all' : ids[0]!);
    try { await write(store, ['transactions'], () => supabase.from('transactions').update({ needs_review: false }).in('id', ids)); toast(ids.length > 1 ? `Confirmed ${ids.length}` : 'Confirmed'); }
    catch (e) { toast(e instanceof Error ? e.message : 'Not saved.', undefined, 'error'); } finally { setBusy(null); }
  };
  const ready = items.filter((t) => t.category_id).map((t) => t.id);
  return (
    <>
      <Sec right={
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          {ready.length > 1 ? <Btn kind="link" label="All look right" disabled={Boolean(busy)} onPress={() => void confirm(ready)} /> : null}
          <InboxHelp />
        </View>
      }>Inbox, {items.length} to check</Sec>
      <List animate>{items.map((t) => (
        <View key={t.id} style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ flex: 1 }}><TxRow t={t} m={m} onOpen={open} /></View>
          <View style={{ paddingRight: 10 }}><Btn kind="ghost" label={busy === t.id ? '…' : 'Yes'} disabled={Boolean(busy) || !t.category_id} onPress={() => void confirm([t.id])} /></View>
        </View>
      ))}</List>
      <T k="note">Each one already counts with its best guess. Tap one to change it.</T>
    </>
  );
}

function Transactions({ m }: { m: Model }) {
  const params = useLocalSearchParams<{ cat?: string; shared?: string; from?: string; until?: string; cycle?: string; scope?: string }>();
  // a drill-down from a shared budget counts joint purchases in full
  const scope = params.scope === 'shared' ? 'shared' : 'personal';
  const open = useDetail();
  const store = useStore();
  const catParam = params.cat === 'uncategorized' || (params.cat && m.byId.has(params.cat)) ? params.cat : undefined;
  const validDate = (value: string | undefined): string | undefined => value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined;
  const from = validDate(params.from);
  const until = validDate(params.until);
  const [filter, setFilter] = useState<Filter>(params.shared === '1' ? 'shared' : 'all');
  const [q, setQ] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [shown, setShown] = useState(1);

  const scoped = useMemo(() => {
    let L = [...m.tx].reverse();
    if (catParam) L = L.filter((t) => (!from || t.occurred_on >= from) && (!until || t.occurred_on < until) && m.spendingIn(t, catParam, scope) > 0);
    if (filter === 'mine') L = L.filter((t) => !t.shared && !t.is_shared_topup);
    if (filter === 'shared') L = L.filter((t) => t.shared || t.is_shared_topup);
    if (q.trim()) L = L.filter((t) => matches(t, m, q));
    return L;
  }, [m, catParam, from, until, filter, q, scope]);

  // This cycle first; older cycles one at a time. Searching shows every match.
  const groups = useMemo(() => {
    const cycles = [...m.cycles].reverse();
    const out: { key: string; title: string; rows: TransactionRow[] }[] = [];
    for (const c of cycles) {
      const rows = scoped.filter((t) => t.occurred_on >= c.startOn && (c.endOnExclusive === null || t.occurred_on < c.endOnExclusive));
      if (rows.length || c === cycles[0]) out.push({ key: c.id, title: `${c.name} cycle`, rows });
    }
    const before = scoped.filter((t) => !m.cycles.length || t.occurred_on < (m.cycles[0]?.startOn ?? '0'));
    if (before.length) out.push({ key: 'pre', title: 'Before salary cycles', rows: before });
    return out;
  }, [m, scoped]);
  const visible = q.trim() || catParam ? groups : groups.slice(0, shown);
  const total = scoped.reduce((a, t) => a + (catParam ? m.spendingIn(t, catParam, scope) : m.mine(t)), 0);
  const catName = catParam === 'uncategorized' ? 'Uncategorized' : catParam ? m.byId.get(catParam)?.name : null;
  const cycle = m.cycles.find((item) => item.id === params.cycle) ?? m.current;
  const heading = catParam && from
    ? (until ? `${shortDate(from)} – ${shortDate(addDays(until, -1))}` : `Since ${shortDate(from)}`)
    : cycle ? `${cycle.name} cycle, ${shortDate(cycle.startOn)} – ${shortDate(cycle.endInclusive)}` : undefined;

  return (
    <Screen onRefresh={store.sync} header={
      <Header title={catName ?? 'Activity'} back={Boolean(catParam)} sub={heading}
        right={<IconBtn name={searchOpen ? 'close' : 'search'} label="Search" onPress={() => { setSearchOpen((s) => !s); if (searchOpen) setQ(''); }} />} />
    }>
      {!catParam ? <SyncLine /> : null}
      {searchOpen ? (
        <Animated.View entering={SEARCH_IN} exiting={SEARCH_OUT} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.surface, borderRadius: 16, paddingHorizontal: 14 }}>
          <Icon name="search" size={18} color={C.ink3} />
          <TextInput autoFocus value={q} onChangeText={setQ} placeholder="Name, note, category or date" placeholderTextColor={C.ink3} style={{ flex: 1, minHeight: 48, color: C.ink, fontFamily: F.body, fontSize: 16 }} autoCorrect={false} keyboardAppearance="dark" clearButtonMode="while-editing" returnKeyType="search" />
        </Animated.View>
      ) : null}
      {!catParam && !q.trim() ? <Inbox m={m} /> : null}
      <Seg value={filter} onChange={setFilter} options={[['all', 'All'], ['mine', 'Yours'], ['shared', 'Shared']]} />
      {(q.trim() || catParam || filter !== 'all') && scoped.length > 0 ? (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 4 }}><T k="note">{scoped.length} {scoped.length === 1 ? 'transaction' : 'transactions'}</T><T k="note">{scope === 'shared' ? 'Joint spending' : 'Your spending'} {kr(total)}</T></View>
      ) : null}
      {/* a new filter fades the list in rather than snapping it */}
      <Animated.View key={filter} entering={LIST_SWAP} style={{ gap: 12 }}>
      {!m.tx.length ? <Panel><Empty title="No transactions yet" sub="What you spend, what comes in and what you move to the pot arrives from your bank, day by day." /></Panel>
        : !scoped.length ? <Panel><Empty title="Nothing matches" sub="Try another name or a date like 24.11." /></Panel>
        : catParam && from ? <DayList rows={scoped} m={m} onOpen={open} categoryId={catParam} scope={scope} />
        : visible.map((g, i) => (
          <View key={g.key}>
            {i > 0 || q.trim() ? <Sec>{g.title}</Sec> : null}
            {g.rows.length ? <DayList rows={g.rows} m={m} onOpen={open} categoryId={catParam} /> : <Panel><Empty title="Nothing yet this cycle" /></Panel>}
          </View>
        ))}
      </Animated.View>
      {!q.trim() && !catParam && groups.length > shown ? <Btn kind="ghost" label="Load older" onPress={() => setShown((s) => s + 1)} /> : null}
      {!q.trim() && !catParam && groups.length > 0 && groups.length <= shown && shown > 1 ? <T k="note" style={{ textAlign: 'center' }}>Nothing older.</T> : null}
    </Screen>
  );
}

export default function ActivityScreen() {
  return <Gate>{(m) => <Transactions m={m} />}</Gate>;
}
