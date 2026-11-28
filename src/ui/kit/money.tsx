import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Image, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useStore, write } from '@/core/data/store';
import { useModel, type Cycle, type Model, type Scope } from '@/core/data/model';
import type { BudgetRow, CategoryRow, TransactionRow } from '@/core/data/types';
import { PARTNER } from '@/core/partner';
import { normalizeMerchantLookupKey } from '@/core/domain/merchant';
import { dayLabel, kr, minorToInput, parseAmount, shortDate, todayYmd } from '@/core/fmt';
import { SharedRing } from '@/ui/aura/SharedRing';
import type { CategoryOption } from '@/core/domain/categories-types';
import { budgetColor, C, F } from './theme';
import { Btn, Disc, Divider, Empty, Field, Icon, List, outcome, Panel, Row, Sec, Seg, Sheet, SheetHero, T, useToast } from './ui';
import { countryName, flag } from '@/core/domain/trips';
import { DebtSheet, LinkToDebt, debtTitle } from '@/screens/Debts';

/* whose money a row is (two people, two colours) */
type Who = 'none' | 'shared' | 'moved' | 'annain' | 'income' | 'own';
export const whoOf = (t: TransactionRow): Who => t.is_shared_topup ? (t.shared_participant === 'gf' ? 'annain' : 'moved') : t.movement === 'moved' ? 'own' : t.kind === 'income' ? 'income' : t.shared ? 'shared' : 'none';
export const WHO_LABEL: Record<Who, string> = { none: 'Yours', shared: `Shared with ${PARTNER}`, moved: 'Put in the pot', annain: `${PARTNER} put in the pot`, income: 'Money in', own: 'Moved between your accounts' };

/** One transaction row: whose it is, name, category, amount with sign and colour. Shared rows wear the turning ring. */
/** The merchant's logo with its category as a small badge; the plain category disc when the logo fails to load.
 *  Shared rows: the logo shrinks inside the turning ring and the badge moves in with it, so the ring stays whole. */
function LogoDisc({ uri, icon, color, children }: { uri: string; icon: string; color: string; children?: ReactNode }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <Disc icon={icon} color={color}>{children}</Disc>;
  return (
    <View style={{ width: 40, height: 40 }}>
      {/* the shared ring goes first, so the logo and the category badge sit on top of it */}
      {children}
      {/* logos are drawn for white pages */}
      <Image source={{ uri }} onError={() => setFailed(true)} accessibilityIgnoresInvertColors style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#fff' }} />
      <View style={{ position: 'absolute', left: 22, top: 22, width: 24, height: 24, borderRadius: 12, backgroundColor: C.surface2, borderWidth: 2, borderColor: C.surface, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={icon} size={13} color={color} />
      </View>
    </View>
  );
}

export function TxRow({ t, m, onOpen, current, categoryId, scope }: { t: TransactionRow; m: Model; onOpen: (t: TransactionRow) => void; current?: boolean; categoryId?: string; scope?: Scope }) {
  const w = whoOf(t);
  const meta = m.meta[t.category_id ?? ''];
  const foreign = t.currency_code !== 'DKK' ? `, ${kr(t.original_amount_minor, false, t.currency_code)}` : '';
  const pending = t.status === 'pending';
  let icon: string = meta?.icon ?? (t.kind === 'income' ? 'in' : 'other');
  let sub: string, amount: string, color: string = C.ink, small: string | null = pending ? 'Pending' : null;
  let discBg: string = C.surface2, discInk: string = C.ink;
  if (w === 'moved' || w === 'annain' || w === 'own') {
    icon = 'moved'; sub = WHO_LABEL[w]; amount = kr(t.amount_minor); color = C.ink2; small = 'Moved';
    if (w === 'annain') { discBg = C.partner; discInk = C.onPartner; }
  } else if (t.kind === 'income') {
    sub = (meta?.name ?? 'Income') + foreign; amount = `+${kr(t.amount_minor)}`; color = C.in; small = small ?? 'In';
  } else {
    const more = m.splitsOf.get(t.id)?.length ?? 0;
    sub = (meta?.name ?? 'No category') + (more ? ` and ${more} more` : '') + foreign; amount = kr(t.amount_minor);
    const category = categoryId ? m.byId.get(categoryId) : undefined;
    const parent = m.parentOf(categoryId ?? t.category_id);
    if (parent) discInk = budgetColor(parent);
    if (categoryId) {
      sub = category?.name ?? 'Uncategorized';
      amount = kr(m.spendingIn(t, categoryId, scope));
      if (more) small = small ?? `of ${kr(t.amount_minor)}`;
      icon = category?.icon ?? 'other';
    }
  }
  const ring = w === 'shared' && !m.isTransfer(t.category_id) && !t.counterparty_person_id ? <View style={{ position: 'absolute', left: -5, top: -5 }}><SharedRing size={50} /></View> : null;
  const logo = w === 'moved' || w === 'annain' || w === 'own' || t.counterparty_person_id ? null : m.logoOf(t.name);
  return (
    <Row
      onPress={() => onOpen(t)}
      selected={current}
      accessibilityLabel={`${t.name}, ${sub}, ${amount}${w === 'shared' ? `, shared with ${PARTNER}` : ''}${t.needs_review ? ', not confirmed yet' : ''}`}
      lead={logo ? <LogoDisc uri={logo} icon={icon} color={discInk}>{ring}</LogoDisc> : <Disc icon={icon} bg={discBg} color={discInk}>{ring}</Disc>}
      title={<View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><T k="strong" numberOfLines={1} style={{ flexShrink: 1 }}>{t.name}</T>{t.needs_review ? <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: C.ahead }} accessibilityLabel="Not confirmed yet" /> : null}</View>}
      meta={sub}
      end={<View style={{ alignItems: 'flex-end' }}><Text style={{ fontFamily: F.strong, fontSize: 16, color, fontVariant: ['tabular-nums'] }}>{amount}</Text>{small ? <T k="meta" style={{ fontSize: 11 }}>{small}</T> : null}</View>}
    />
  );
}

/** Day groups with each day's spending, newest first. */
export function DayList({ rows, m, onOpen, categoryId, scope }: { rows: TransactionRow[]; m: Model; onOpen: (t: TransactionRow) => void; categoryId?: string; scope?: Scope }) {
  const days = [...new Set(rows.map((t) => t.occurred_on))].map((d) => {
    const items = rows.filter((t) => t.occurred_on === d);
    return { d, items, tot: items.reduce((a, t) => a + (categoryId ? m.spendingIn(t, categoryId, scope) : m.mine(t)), 0) };
  });
  // Each day's spend as a thin bar against a typical heavy day (the 90th percentile), so one rent day doesn't flatten the rest.
  const sorted = days.map((x) => x.tot).filter(Boolean).sort((a, z) => a - z);
  const top = Math.max(1, (sorted[Math.floor(sorted.length * 0.9)] ?? 1) * 1.15);
  const today = todayYmd();
  return (
    <>{days.map(({ d, items, tot }) => (
      <View key={d} style={{ gap: 8, marginTop: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 4 }}>
          <T k="strong" style={{ fontSize: 14, color: d === today ? C.ink : C.ink2 }}>{dayLabel(d)}</T>
          {tot > 0 ? <View style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: C.track }}><View style={{ width: `${Math.min(100, (100 * tot) / top)}%`, height: 4, borderRadius: 2, backgroundColor: C.ink3 }} /></View> : <View style={{ flex: 1 }} />}
          {tot ? <T k="num" style={{ fontSize: 14, color: C.ink2 }}>{kr(tot)}</T> : null}
        </View>
        <List>{items.map((t) => <TxRow key={t.id} t={t} m={m} onOpen={onOpen} categoryId={categoryId} scope={scope} />)}</List>
      </View>
    ))}</>
  );
}

export const hhmm = (iso: string): string => new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
const DAY = 86_400_000;

/** Bank sync health: quiet "Synced 08:12"; amber when old, failing, or the bank consent ends within 14 days. */
export function SyncLine() {
  const { tables, sync, syncing, error, reload } = useStore();
  const router = useRouter();
  if (error) return <Panel style={{ padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10 }}><T k="note" style={{ flex: 1, color: C.over }}>{error}</T><Btn kind="link" label="Retry" onPress={() => void reload()} /></Panel>;
  if (!tables?.bank_accounts.length) return null;
  const last = tables.bank_accounts.map((a) => a.last_synced_at).filter((x): x is string => Boolean(x)).sort().at(-1) ?? null;
  const age = last ? Date.now() - Date.parse(last) : Infinity;
  const failing = tables.sync_runs[0]?.ok === false || tables.bank_accounts.some((a) => a.last_error);
  const ends = tables.bank_connections.map((c) => c.valid_until).sort()[0];
  const consentDays = ends ? Math.floor((Date.parse(ends) - Date.now()) / DAY) : null;
  const renew = consentDays !== null && consentDays < 14;
  const text = syncing ? 'Syncing…'
    : age > 3 * DAY ? `Not synced for ${Math.floor(age / DAY)} days. Bank history older than 90 days can’t be fetched later.`
    : failing ? `Sync is failing${last ? `. Last synced ${dayLabel(last.slice(0, 10)).toLowerCase()} at ${hhmm(last)}` : ''}.`
    : age > DAY && last ? `Last synced ${dayLabel(last.slice(0, 10)).toLowerCase()} at ${hhmm(last)}`
    : last ? `Synced ${hhmm(last)}` : 'Not synced yet';
  const amber = !syncing && (age > DAY || failing);
  return (
    <>
      {renew ? (
        <Panel style={{ padding: 14, gap: 10 }}>
          <T k="strong" style={{ color: C.ahead }}>Bank access ends {consentDays <= 0 ? 'today' : `in ${consentDays} ${consentDays === 1 ? 'day' : 'days'}`}.</T>
          <T k="note">Renew it, or new transactions stop coming in.</T>
          <Btn label="Renew" onPress={() => router.push('/bank' as never)} />
        </Panel>
      ) : null}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4 }}>
        <T k="note" style={{ flex: 1, color: amber ? C.ahead : C.ink3 }}>{text}</T>
        {!syncing ? <Btn kind="link" label="Sync now" onPress={() => void sync()} /> : <ActivityIndicator color={C.ink3} />}
      </View>
    </>
  );
}

const GATE_IN = FadeIn.duration(260);

/** Renders the screen once data is here; until then a spinner, or one clear error. */
export function Gate({ children }: { children: (m: Model) => ReactNode }) {
  const { status, error, reload } = useStore();
  const m = useModel();
  // content that kept you waiting fades in; content already cached is simply there
  const [waited] = useState(!m);
  if (m) return waited ? <Animated.View entering={GATE_IN} style={{ flex: 1 }}>{children(m)}</Animated.View> : <>{children(m)}</>;
  if (status === 'error') return <View style={{ flex: 1, backgroundColor: C.bg, justifyContent: 'center', padding: 24, gap: 12 }}><T k="sec">Couldn’t load your money</T><T k="note">{error}</T><Btn label="Retry" onPress={() => void reload()} /></View>;
  return <View style={{ flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={C.ink} /></View>;
}

/* the transaction detail and its actions: one sheet for every list */
const DetailCtx = createContext<(t: TransactionRow) => void>(() => undefined);
export const useDetail = () => useContext(DetailCtx);
export function DetailProvider({ children }: { children: ReactNode }) {
  const [id, setId] = useState<string | null>(null);
  const open = useCallback((t: TransactionRow) => setId(t.id), []);
  return <DetailCtx.Provider value={open}>{children}{id ? <Detail id={id} onClose={() => setId(null)} /> : null}</DetailCtx.Provider>;
}

function Detail({ id, onClose }: { id: string; onClose: () => void }) {
  const m = useModel();
  const t = m?.tx.find((x) => x.id === id);
  if (!m || !t) return null;
  return <Sheet open onClose={onClose} title={t.is_shared_topup || t.movement === 'moved' ? 'Moved' : t.kind === 'income' ? 'Money in' : 'Expense'}><DetailBody t={t} m={m} onDone={onClose} /></Sheet>;
}

const SOURCE: Record<string, string> = { transfer: 'Money moved', salary: 'Salary', person: 'A person', rule: 'Rule', memory: 'Seen before', mcc: 'Bank merchant code', ai: 'AI guess', you: 'You', manual: 'Logged by hand' };
type BankText = { creditor_name: string | null; debtor_name: string | null; remittance: string | null; mcc: string | null; bank_code: string | null; booking_date: string | null; status: string };

function BankTextRows({ id }: { id: string }) {
  const [b, setB] = useState<BankText | null | 'err'>(null);
  useEffect(() => {
    let alive = true;
    void supabase.from('bank_transactions').select('creditor_name,debtor_name,remittance,mcc,bank_code,booking_date,status').eq('id', id).maybeSingle()
      .then(({ data, error }) => { if (alive) setB(error || !data ? 'err' : (data as BankText)); });
    return () => { alive = false; };
  }, [id]);
  if (b === 'err') return <T k="note">Couldn’t load the bank’s text.</T>;
  if (!b) return <T k="note">Loading the bank’s text…</T>;
  const rows: [string, string | null][] = [['To', b.creditor_name], ['From', b.debtor_name], ['Text', b.remittance], ['Merchant code', b.mcc], ['Bank code', b.bank_code], ['Booked', b.booking_date ? shortDate(b.booking_date) : b.status === 'PDNG' ? 'Pending' : null]];
  return <Facts rows={rows.filter(([, v]) => v) as [string, string][]} />;
}

/** Label and value pairs. */
export function Facts({ rows }: { rows: [string, string][] }) {
  return (
    <Panel style={{ paddingVertical: 4 }}>
      {rows.map(([k, v], i) => (
        <View key={k + i}>
          {i > 0 ? <Divider /> : null}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 16, paddingHorizontal: 16, paddingVertical: 12 }}>
            <T k="meta" style={{ fontSize: 15 }}>{k}</T><T style={{ flexShrink: 1, textAlign: 'right' }}>{v}</T>
          </View>
        </View>
      ))}
    </Panel>
  );
}

export { SheetHero };

/** Categories as the Categories screen shows them: each parent in its budget colour, its children indented under it in the same colour. */
export function CategoryTree({ m, options, selected, disabled, onPick }: { m: Model; options: CategoryOption[]; selected: string | null; disabled?: boolean; onPick: (o: CategoryOption) => void }) {
  const groups = [...new Set(options.map((o) => o.parentId))];
  return (
    <List>{groups.flatMap((pid) => {
      const color = budgetColor(m.byId.get(pid));
      const parent = options.find((o) => o.id === pid);
      return [parent, ...options.filter((o) => o.parentId === pid && o.id !== pid)].filter((o): o is CategoryOption => Boolean(o)).map((o) => (
        <Row key={o.id} disabled={disabled} selected={o.id === selected} title={o.name} onPress={() => onPick(o)}
          lead={<View style={{ marginLeft: parent && o.id !== pid ? 24 : 0 }}><Disc icon={o.icon} color={color} bg={o.id === selected ? C.surface3 : undefined} /></View>}
          end={o.id === selected ? <Icon name="check" strong /> : undefined} />
      ));
    })}</List>
  );
}

function CategoryPick({ t, m, onClose }: { t: TransactionRow; m: Model; onClose: () => void }) {
  const store = useStore();
  const toast = useToast();
  const [picked, setPicked] = useState<{ id: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const key = t.merchant_key ?? normalizeMerchantLookupKey(t.name);
  const income = t.kind === 'income';
  const same = m.tx.filter((x) => x.id !== t.id && x.needs_review && x.merchant_key && x.merchant_key === t.merchant_key);
  // is_salary stays as the sync set it: flipping it on an existing row would start a cycle without its budgets.
  const choose = async (o: { id: string; name: string }): Promise<void> => {
    setBusy(true);
    try {
      await write(store, ['transactions'], () => supabase.from('transactions').update({ category_id: o.id, needs_review: false, reason_source: 'you', reason: `You chose ${o.name}`, confidence: 1 }).eq('id', t.id));
      setPicked(o);
    } catch (e) { toast(e instanceof Error ? e.message : 'Not saved.', undefined, 'error'); } finally { setBusy(false); }
  };
  const always = async (): Promise<void> => {
    if (!picked || !store.userId) return;
    setBusy(true);
    try {
      await write(store, ['merchant_category_rules'], () => supabase.from('merchant_category_rules').upsert({ user_id: store.userId, match_target: 'normalized_merchant', match_type: 'exact', pattern: key, kind: t.kind, canonical_merchant: t.name, category_id: picked.id, is_shared_topup: false, is_blocked: false, priority: 300, source: 'manual' }, { onConflict: 'user_id,kind,match_target,match_type,pattern' }));
      if (same.length) await write(store, ['transactions'], () => supabase.from('transactions').update({ category_id: picked.id, needs_review: false, reason_source: 'rule', reason: `Your rule: ${t.name}`, confidence: 1 }).in('id', same.map((x) => x.id)));
      toast(`${t.name} always goes to ${picked.name}`); onClose();
    } catch (e) { toast(e instanceof Error ? e.message : 'Not saved.', undefined, 'error'); } finally { setBusy(false); }
  };
  // A pick on a trip, or a Travel category, is about this trip; never make it a rule for home.
  const tripPick = Boolean((t as { trip_id?: string }).trip_id) || (picked ? m.parentOf(picked.id)?.name.toLowerCase() === 'travel' : false);
  if (picked && tripPick) return (
    <Sheet open onClose={onClose} title="Saved">
      <SheetHero amount="Saved" line={`${t.name} is now in ${picked.name}.`} />
      <Btn label="Done" onPress={onClose} />
    </Sheet>
  );
  if (picked) return (
    <Sheet open onClose={onClose} title="Saved">
      <SheetHero amount="Saved" line={`${t.name} is now in ${picked.name}.`} />
      <T k="note" style={{ textAlign: 'center' }}>Always put {t.name} in {picked.name}?{same.length ? ` ${same.length} more waiting in the Inbox follow too.` : ''}</T>
      <View style={{ flexDirection: 'row', gap: 10 }}><View style={{ flex: 1 }}><Btn kind="ghost" label="Just this one" onPress={onClose} /></View><View style={{ flex: 1 }}><Btn label="Always" busy={busy} onPress={() => void always()} /></View></View>
    </Sheet>
  );
  return (
    <Sheet open onClose={onClose} title={`Category for ${t.name}`}>
      <CategoryTree m={m} disabled={busy} selected={t.category_id} onPick={(o) => void choose({ id: o.id, name: o.name })}
        options={m.options.filter((o) => (income ? o.parentName.toLowerCase() === 'income' && o.parentId !== o.id : o.parentName.toLowerCase() !== 'income'))} />
    </Sheet>
  );
}

/** One purchase cut into parts: each part has its own category and is yours or shared. The rest stays on the purchase's category. */
function PartsSheet({ t, m, onClose }: { t: TransactionRow; m: Model; onClose: () => void }) {
  const store = useStore();
  const toast = useToast();
  const parts = m.splitsOf.get(t.id) ?? [];
  const [edit, setEdit] = useState<string | null>(null);
  const editing = parts.find((x) => x.id === edit);
  const used = parts.reduce((a, x) => a + (x.id === edit ? 0 : x.amount_minor), 0);
  const [amount, setAmount] = useState('');
  const [cat, setCat] = useState<string | null>(null);
  const [whose, setWhose] = useState<'mine' | 'shared'>(t.shared ? 'shared' : 'mine');
  const [busy, setBusy] = useState(false);
  const left = t.amount_minor - used;
  const v = parseAmount(amount);
  const bad = v === null || v <= 0 || v >= left;
  const reset = (): void => { setEdit(null); setAmount(''); setCat(null); setWhose(t.shared ? 'shared' : 'mine'); };
  const open = (id: string): void => {
    const x = parts.find((p) => p.id === id);
    if (!x) return;
    setEdit(id); setAmount(minorToInput(x.amount_minor)); setCat(x.category_id); setWhose(x.shared ? 'shared' : 'mine');
  };
  const run = async (label: string, go: () => PromiseLike<{ error: { message: string } | null }>): Promise<void> => {
    setBusy(true);
    try { await write(store, ['transaction_splits'], go); reset(); toast(label); }
    catch (e) { toast(e instanceof Error ? e.message : 'Not saved.', undefined, 'error'); } finally { setBusy(false); }
  };
  const save = async (): Promise<void> => {
    if (bad || !cat || !store.userId) return;
    const row = { category_id: cat, amount_minor: v, shared: whose === 'shared' };
    await run('Part saved', () => (edit ? supabase.from('transaction_splits').update(row).eq('id', edit) : supabase.from('transaction_splits').insert({ ...row, user_id: store.userId, transaction_id: t.id })));
  };
  const name = (id: string | null): string => m.meta[id ?? '']?.label ?? 'No category';
  const whoseOf = (shared: boolean): string => (shared ? `Shared with ${PARTNER}` : 'Yours');
  return (
    <Sheet open onClose={onClose} title="Parts">
      <SheetHero amount={kr(t.amount_minor)} line={t.name} />
      <List>{[
        ...parts.map((x) => <Row key={x.id} selected={x.id === edit} onPress={() => open(x.id)} lead={<Disc icon={m.meta[x.category_id]?.icon ?? 'tag'} />} title={name(x.category_id)} meta={whoseOf(x.shared)} end={<T k="num">{kr(x.amount_minor)}</T>} />),
        <Row key="rest" lead={<Disc icon={m.meta[t.category_id ?? '']?.icon ?? 'tag'} />} title={name(t.category_id)} meta={`The rest, ${whoseOf(t.shared).toLowerCase()}`} end={<T k="num">{kr(t.amount_minor - parts.reduce((a, x) => a + x.amount_minor, 0))}</T>} />,
      ]}</List>
      <Sec>{editing ? 'Change this part' : 'Add a part'}</Sec>
      <Field label="Amount" keyboardType="decimal-pad" value={amount} onChangeText={setAmount} placeholder="300" error={amount && v === null ? 'Type an amount, like 300 or 89,50.' : amount && bad ? `Only ${kr(left)} left.` : null} />
      {cat ? <List>{[<Row key="c" lead={<Disc icon={m.meta[cat]?.icon ?? 'tag'} />} title={name(cat)} meta="Tap to change" onPress={() => setCat(null)} />]}</List>
        : <CategoryTree m={m} selected={cat} onPick={(o) => setCat(o.id)} options={m.options.filter((o) => o.parentName.toLowerCase() !== 'income')} />}
      <Seg value={whose} onChange={setWhose} options={[['mine', 'Yours'], ['shared', `Shared with ${PARTNER}`]]} />
      <Btn label={editing ? 'Save' : `Add ${v && !bad ? kr(v) : 'part'}`} disabled={bad || !cat} busy={busy} onPress={() => void save()} />
      {editing ? <Btn kind="ghost" label="Remove this part" disabled={busy} onPress={() => void run('Part removed', () => supabase.from('transaction_splits').delete().eq('id', editing.id))} /> : null}
      {editing ? <Btn kind="link" label="Cancel" onPress={reset} /> : null}
    </Sheet>
  );
}

export function DetailBody({ t, m, onDone }: { t: TransactionRow; m: Model; onDone?: () => void }) {
  const store = useStore();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [pick, setPick] = useState<null | 'cat' | 'split' | 'debt'>(null);
  const [raw, setRaw] = useState(false);
  const w = whoOf(t);
  const meta = m.meta[t.category_id ?? ''];
  const act = async (label: string, run: () => PromiseLike<{ error: { message: string } | null }>): Promise<void> => {
    setBusy(true);
    try { await write(store, ['transactions'], run); toast(label); } catch (e) { toast(e instanceof Error ? e.message : 'Not saved.', undefined, 'error'); } finally { setBusy(false); }
  };
  const neutral = t.is_shared_topup || t.movement === 'moved' || t.movement === 'ignore';
  // money to or from a person counts as moved, unless it is given a spending category or added to a debt
  const toPerson = t.movement === 'person' && m.isTransfer(t.category_id);
  const splits = m.splitsOf.get(t.id) ?? [];
  const day = dayLabel(t.occurred_on);
  // Where it was bought, its trip (and its usual category when the trip moved it), and its debt.
  const place = m.placeOf(t);
  const where = place && !place.online && place.country_iso ? `${flag(place.country_iso)} ${place.city ? `${place.city}, ` : ''}${countryName(place.country_iso)}` : null;
  const onTrip = (t as { trip_id?: string }).trip_id;
  // Any purchase inside a trip's dates can be counted in or left out of it.
  const trip = onTrip ? m.t.trips.find((x) => x.id === onTrip) : t.kind === 'expense' && !t.counterparty_person_id && !t.is_shared_topup ? m.tripOf(t) : null;
  const [debtOpen, setDebtOpen] = useState(false);
  const home = (t as { home_category_id?: string | null }).home_category_id;
  const debt = m.linked.has(t.id) ? m.debts.find((d) => d.events.some((e) => e.transaction_id === t.id)) : undefined;
  const facts: [string, string][] = [
    ['Date', `${day}${day.includes(' ') ? '' : `, ${shortDate(t.occurred_on)}`}${t.status === 'pending' ? ', pending' : ''}`],
    ...(meta && !neutral ? [['Category', `${meta.label}${splits.length ? `, ${kr(t.amount_minor - splits.reduce((a, x) => a + x.amount_minor, 0))}` : ''}`] as [string, string]] : []),
    ...splits.map((x) => ['Part', `${m.meta[x.category_id]?.label ?? 'Category'}, ${kr(x.amount_minor)}${x.shared ? `, shared` : ''}`] as [string, string]),
    ...(w === 'income' || w === 'own' ? [] : [['Whose', `${WHO_LABEL[w]}${t.shared && t.paid_by ? `, paid by ${t.paid_by === 'me' ? 'you' : PARTNER}` : ''}`] as [string, string]]),
    ...(m.sharedSome(t) && !neutral ? [['Your share', kr(m.mine(t))] as [string, string]] : []),
    ...(neutral || (toPerson && !debt) ? [['Counts as spending', 'No, it’s money moved'] as [string, string]] : []),
    ...(t.currency_code !== 'DKK' ? [['Paid', kr(t.original_amount_minor, false, t.currency_code)] as [string, string]] : []),
    ...(t.comment ? [['Note', t.comment] as [string, string]] : []),
    ...(where ? [['Where', where] as [string, string]] : []),
    ...(trip && onTrip ? [['Trip', `${flag(trip.country_iso)} ${trip.name}`] as [string, string]] : []),
    ...(home && m.meta[home] ? [['Usually', m.meta[home].label] as [string, string]] : []),
    ...(debt ? [['Debt', debtTitle(debt)] as [string, string], [t.kind === 'income' ? 'Counts as income' : 'Counts as spending', 'No, it’s part of the debt'] as [string, string]] : []),
  ];
  return (
    <>
      <SheetHero amount={t.kind === 'income' ? `+${kr(t.amount_minor)}` : kr(t.amount_minor)} color={t.kind === 'income' ? C.in : undefined} line={t.name} />
      {t.needs_review ? (
        <Panel style={{ padding: 14, gap: 10 }}>
          <T>Best guess: <Text style={{ fontFamily: F.strong }}>{meta?.label ?? 'no category yet'}</Text>. Right?</T>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}><Btn kind="ghost" label="Change" onPress={() => setPick('cat')} /></View>
            <View style={{ flex: 1 }}><Btn label="Yes" disabled={!t.category_id} busy={busy} onPress={() => void act('Confirmed', () => supabase.from('transactions').update({ needs_review: false }).eq('id', t.id))} /></View>
          </View>
        </Panel>
      ) : null}
      <Facts rows={facts} />
      {t.reason || t.reason_source ? (
        <Panel style={{ padding: 16, gap: 4 }}>
          <T k="strong">Why</T>
          <T>{t.reason ?? SOURCE[t.reason_source ?? '']}</T>
          <T k="note">{SOURCE[t.reason_source ?? ''] ?? ''}{t.confidence !== null && t.confidence !== undefined && t.reason_source !== 'you' ? `, ${t.confidence >= 0.8 ? 'sure' : 'a best guess'}` : ''}</T>
        </Panel>
      ) : null}
      {t.bank_transaction_id ? (raw ? <BankTextRows id={t.bank_transaction_id} /> : <Btn kind="link" label="Show the bank’s text" onPress={() => setRaw(true)} />) : null}
      <List>{[
        !neutral ? <Row key="c" lead={<Disc icon="tag" />} title="Change category" onPress={() => setPick('cat')} /> : null,
        !neutral && !toPerson && t.kind === 'expense' ? <Row key="s" lead={<Disc icon="split" />} title={splits.length ? 'Change parts' : 'Split into parts'} meta={splits.length ? undefined : 'Part of it was something else'} onPress={() => setPick('split')} /> : null,
        trip && onTrip ? <Row key="t" disabled={busy} lead={<Disc icon="plane" />} title="Not part of the trip" meta={`It goes back to ${home && m.meta[home] ? m.meta[home].label : 'its own category'}`}
          onPress={() => void act('Left out of the trip', () => supabase.from('transactions').update({ trip_exclude: true, trip_include: false }).eq('id', t.id))} /> : null,
        trip && !onTrip ? <Row key="t2" disabled={busy} lead={<Disc icon="plane" />} title={`Count it in ${trip.name}`}
          onPress={() => void act(`Counted in ${trip.name}`, () => supabase.from('transactions').update({ trip_exclude: false, trip_include: true }).eq('id', t.id))} /> : null,
        debt ? <Row key="dd" lead={<Disc icon={debt.kind === 'loan' ? 'loan' : 'owed'} />} title="See the debt" meta={debtTitle(debt)} onPress={() => setDebtOpen(true)} /> : null,
        t.counterparty_person_id && !debt ? <Row key="d" lead={<Disc icon="owed" />} title="Add to a debt" meta="Lent, borrowed or paid back" onPress={() => setPick('debt')} /> : null,
        t.source !== 'bank' && t.kind === 'expense' && !t.is_shared_topup ? (
          <Row key="w" disabled={busy} lead={<Disc icon={t.shared ? 'profile' : 'shared'} />} title={t.shared ? 'Make it yours only' : `Share with ${PARTNER}`}
            onPress={() => void act(t.shared ? 'Now yours only' : `Shared with ${PARTNER}`, () => supabase.from('transactions').update(t.shared ? { shared: false, shared_participant: null, is_shared_topup: false } : { shared: true, shared_participant: 'me' }).eq('id', t.id))} />
        ) : null,
      ].filter(Boolean) as ReactNode[]}</List>
      {t.source === 'bank' && t.shared ? <T k="note">Everything on the joint account is shared.</T> : null}
      {pick === 'cat' ? <CategoryPick t={t} m={m} onClose={() => { setPick(null); onDone?.(); }} /> : null}
      {pick === 'split' ? <PartsSheet t={t} m={m} onClose={() => setPick(null)} /> : null}
      {pick === 'debt' ? <LinkToDebt m={m} t={t} onClose={() => setPick(null)} /> : null}
      {debtOpen && debt ? <DebtSheet m={m} debt={debt} onClose={() => setDebtOpen(false)} /> : null}
    </>
  );
}

/** Sets one category's personal or shared budget for one salary cycle, with notes (**bold** works). Empty or 0 removes it. */
export function BudgetEditor({ cat, cycle, budget, spent, last, onClose, scope = 'personal' }: { cat: CategoryRow; cycle: Cycle; budget?: BudgetRow; spent: number; last: number; onClose: () => void; scope?: Scope }) {
  const table = scope === 'shared' ? 'shared_budgets' : 'budgets';
  const store = useStore();
  const toast = useToast();
  const [amt, setAmt] = useState(budget ? minorToInput(budget.amount_minor) : '');
  const [notes, setNotes] = useState(budget?.notes ?? '');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function save(remove = false): Promise<void> {
    const minor = remove || !amt.trim() ? 0 : parseAmount(amt);
    if (minor === null) { setErr('Type an amount, like 1500 or 89,50.'); return; }
    if (!store.userId) return;
    setBusy(true); setErr(null);
    try {
      if (minor === 0) { if (budget) await write(store, [table], () => supabase.from(table).delete().eq('id', budget.id)); }
      else await write(store, [table], () => supabase.from(table).upsert({ user_id: store.userId, category_id: cat.id, salary_cycle_id: cycle.id, amount_minor: minor, notes: notes.trim() || null }, { onConflict: 'user_id,category_id,salary_cycle_id' }));
      const what = scope === 'shared' ? `${cat.name}, shared` : cat.name;
      toast(minor ? `${what}: ${kr(minor, true)} this cycle` : `${what} keeps no budget now`);
      onClose();
    } catch (e) {
      outcome(false);
      // until the shared-budgets migration is live, say so instead of a database message
      setErr(e instanceof Error ? (/shared_budgets/.test(e.message) ? 'Shared budgets aren’t switched on in the database yet.' : e.message) : 'Not saved.');
    } finally { setBusy(false); }
  }
  return (
    <Sheet open onClose={onClose} title={scope === 'shared' ? `${cat.name} shared budget` : `${cat.name} budget`}>
      <T k="note">{kr(spent, true)} spent in the {cycle.name} cycle{last ? `, ${kr(last, true)} the cycle before` : ''}.</T>
      <Field label="Budget this cycle" keyboardType="decimal-pad" autoFocus value={amt} placeholder="0" onChangeText={(v) => { setAmt(v); setErr(null); }} onSubmitEditing={() => void save()} error={err} style={{ fontFamily: F.num, fontSize: 34 }} />
      <Field label="Notes" value={notes} onChangeText={setNotes} placeholder="Optional" multiline hint="**bold** works" />
      <T k="note">{scope === 'shared' ? 'Counts each joint purchase in full. ' : 'Counts your purchases and your share of joint ones. '}The next salary starts a new cycle with this limit again. Money left unspent isn’t added to it.</T>
      <Btn label="Save" busy={busy} onPress={() => void save()} />
      {budget ? <Btn kind="danger" label="Remove budget" disabled={busy} onPress={() => void save(true)} /> : null}
    </Sheet>
  );
}

/** Notes keep **bold**; everything else is plain text. */
export function RichNote({ text }: { text: string }) {
  return <T k="note">{text.split(/(\*\*[^*]+\*\*)/g).map((part, i) => (part.startsWith('**') && part.endsWith('**') ? <Text key={i} style={{ fontFamily: F.strong, color: C.ink2 }}>{part.slice(2, -2)}</Text> : part))}</T>;
}

export { Empty, Sec };
export const Loading = () => <View style={{ padding: 24, alignItems: 'center' }}><ActivityIndicator color={C.ink} /></View>;
