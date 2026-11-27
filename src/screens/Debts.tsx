import type React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';
import { useStore } from '@/core/data/store';
import type { Model } from '@/core/data/model';
import type { TransactionRow } from '@/core/data/types';
import { applyEvent, DEBT_TABLES, debtSuggestions, eventKindFor, totalsOf, transfersWith, type Debt, type DebtKind } from '@/core/domain/debts';
import { canonicalId, type PersonInput } from '@/core/domain/people';
import { dayLabel, kr, parseAmount, shortDate, todayYmd } from '@/core/fmt';
import { C, F } from '@/ui/kit/theme';
import { Btn, Disc, Empty, Field, Icon, List, Panel, Row, Sec, Seg, Sheet, SheetHero, T, tap } from '@/ui/kit/ui';
import { DeleteAsk, FormErr, useSaver } from '@/ui/kit/forms';

// Debts with people: a loan (you owe) or a receivable (they owe you), with bank transfers as its payments.
// Linked transfers stop counting as spending or income; the running numbers live on the debt row.

const AMOUNT_ERR = 'Enter an amount, like 400 or 400,50.';
const WORD: Record<string, string> = { borrowed: 'Borrowed', lent: 'Lent', repaid: 'Paid back' };

export const debtTitle = (d: Pick<Debt, 'kind' | 'name'>): string => (d.kind === 'loan' ? `You owe ${d.name}` : `${d.name} owes you`);
export const debtLine = (d: Debt): string => (d.status === 'closed' ? 'Settled' : `${kr(d.remaining_minor, true)} left of ${kr(d.principal_minor, true)}`);

const peopleOf = (m: Model): PersonInput[] => m.t.transfer_people.map((p) => ({ id: p.id, name: p.name, kind: p.kind ?? 'settle_up', opening_balance_minor: p.opening_balance_minor ?? 0, alias_of: p.alias_of ?? null }));
/** A person and every name variant that points at them. */
const idsOf = (people: PersonInput[], id: string): Set<string> => new Set(people.filter((p) => canonicalId(people, p.id) === id).map((p) => p.id).concat(id));

/** Writes that link transfers to a debt: one event each, then the debt's running numbers once. */
function linkSteps(userId: string, debt: Pick<Debt, 'id' | 'kind' | 'principal_minor' | 'remaining_minor'>, txs: TransactionRow[]) {
  const d = DEBT_TABLES[debt.kind];
  let nums = { principal_minor: debt.principal_minor, remaining_minor: debt.remaining_minor, status: debt.remaining_minor === 0 ? 'closed' : 'open' } as ReturnType<typeof applyEvent>;
  const events = txs.map((t) => {
    const kind = eventKindFor(debt.kind, t);
    nums = applyEvent(nums, debt.kind, kind, t.amount_minor);
    return { [d.fk]: debt.id, user_id: userId, kind, amount_minor: t.amount_minor, occurred_on: t.occurred_on, transaction_id: t.id };
  });
  return { events, nums };
}

function useDebtSave() {
  const { userId } = useStore();
  const saver = useSaver();
  const link = async (debt: Debt, txs: TransactionRow[]): Promise<boolean> => {
    if (!userId || !txs.length) return false;
    const d = DEBT_TABLES[debt.kind];
    const { events, nums: step } = linkSteps(userId, debt, txs);
    // Debts made on People keep their whole history as events, so their numbers come from it (no drift).
    const nums = debt.person_id ? totalsOf(debt.kind, [...debt.events, ...events.map((e) => ({ kind: e.kind, amount_minor: e.amount_minor }))]) : step;
    return saver.save(txs.length > 1 ? `${txs.length} payments added` : 'Added to the debt', [
      [[d.events], () => supabase.from(d.events).insert(events)],
      [[d.table], () => supabase.from(d.table).update(nums).eq('id', debt.id)],
    ]);
  };
  const unlink = async (debt: Debt, e: Debt['events'][number]): Promise<boolean> => {
    const d = DEBT_TABLES[debt.kind];
    const nums = debt.person_id ? totalsOf(debt.kind, debt.events.filter((x) => x.id !== e.id)) : applyEvent(debt, debt.kind, e.kind, e.amount_minor, true);
    if (nums.principal_minor <= 0) { saver.setErr('That’s the whole debt. Delete the debt instead.'); return false; }
    return saver.save('Removed from the debt', [
      [[d.events], () => supabase.from(d.events).delete().eq('id', e.id)],
      [[d.table], () => supabase.from(d.table).update(nums).eq('id', debt.id)],
    ]);
  };
  /** Money outside the bank (cash), after the debt exists. */
  const record = async (debt: Debt, kind: string, amount: number): Promise<boolean> => {
    if (!userId) return false;
    const d = DEBT_TABLES[debt.kind];
    const nums = debt.person_id ? totalsOf(debt.kind, [...debt.events, { kind, amount_minor: amount }]) : applyEvent(debt, debt.kind, kind, amount);
    return saver.save('Saved', [
      [[d.events], () => supabase.from(d.events).insert({ [d.fk]: debt.id, user_id: userId, kind, amount_minor: amount, occurred_on: todayYmd() })],
      [[d.table], () => supabase.from(d.table).update(nums).eq('id', debt.id)],
    ]);
  };
  return { ...saver, userId, link, unlink, record };
}

/** Tick the transfers that belong to a debt. */
function PickTransfers({ txs, picked, onToggle, kind }: { txs: TransactionRow[]; picked: Set<string>; onToggle: (id: string) => void; kind: DebtKind }) {
  if (!txs.length) return <Panel><Empty title="No transfers to add" sub="Money to or from this person shows up here once the bank has it." /></Panel>;
  return (
    <List>{txs.map((t) => {
      const on = picked.has(t.id);
      const incoming = t.kind === 'income';
      return (
        <Row key={t.id} selected={on} onPress={() => { tap(); onToggle(t.id); }} accessibilityLabel={`${incoming ? 'Received' : 'Sent'} ${kr(t.amount_minor)} on ${shortDate(t.occurred_on)}`}
          lead={<View style={{ width: 26, height: 26, borderRadius: 13, borderWidth: on ? 0 : 1.5, borderColor: C.ink3, backgroundColor: on ? C.ink : 'transparent', alignItems: 'center', justifyContent: 'center' }}>{on ? <Icon name="check" size={16} color={C.bg} strong /> : null}</View>}
          title={`${incoming ? 'Received' : 'Sent'} ${kr(t.amount_minor)}`} meta={`${dayLabel(t.occurred_on)}, ${WORD[eventKindFor(kind, t)]?.toLowerCase()}`} />
      );
    })}</List>
  );
}

/** New debt: who, which way, an optional amount outside the bank, and the transfers that belong to it. */
export function DebtForm({ m, personId, from, onClose }: { m: Model; personId?: string; from?: TransactionRow; onClose: () => void }) {
  const people = useMemo(() => peopleOf(m), [m]);
  const choices = people.filter((p) => canonicalId(people, p.id) === p.id && p.kind !== 'self' && p.kind !== 'ignore');
  const [who, setWho] = useState<string | null>(personId ?? null);
  const [name, setName] = useState(personId ? people.find((p) => p.id === personId)?.name ?? '' : '');
  // Started from a transfer: money in usually means they lent it to you.
  const [kind, setKind] = useState<DebtKind>(from?.kind === 'income' ? 'loan' : 'owed');
  const [total, setTotal] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set(from ? [from.id] : []));
  const [e, setE] = useState<{ name?: string; total?: string }>({});
  const { busy, err, setErr, save, userId } = useDebtSave();
  const txs = useMemo(() => (who ? transfersWith(idsOf(people, who), m.tx, m.linked) as TransactionRow[] : []), [who, people, m.tx, m.linked]);
  const go = async (): Promise<void> => {
    const n = name.trim();
    const t = total.trim() ? parseAmount(total) : 0;
    const next: typeof e = {};
    if (!n) next.name = 'Who is it with?';
    if (t === null) next.total = AMOUNT_ERR;
    setE(next);
    if (Object.keys(next).length || !userId) return;
    const chosen = txs.filter((x) => picked.has(x.id)).sort((a, b) => a.occurred_on.localeCompare(b.occurred_on));
    const start = t ?? 0;
    const { events, nums } = linkSteps(userId, { id: '', kind, principal_minor: start, remaining_minor: start }, chosen);
    if (nums.principal_minor <= 0) { setErr(kind === 'owed' ? 'Add how much you lent, or tick the transfer you lent it with.' : 'Add how much you borrowed, or tick the transfer you got it with.'); return; }
    const d = DEBT_TABLES[kind];
    let id: string | null = null;
    const ok = await save('Debt saved', [
      [[d.table], async () => { const r = await supabase.from(d.table).insert({ user_id: userId, name: n, person_id: who, ...nums }).select('id').single<{ id: string }>(); id = r.data?.id ?? null; return r; }],
      ...(start > 0 ? [[[d.events], () => supabase.from(d.events).insert({ [d.fk]: id, user_id: userId, kind: d.more, amount_minor: start, occurred_on: todayYmd() })]] as Parameters<typeof save>[1] : []),
      ...(events.length ? [[[d.events], () => supabase.from(d.events).insert(events.map((x) => ({ ...x, [d.fk]: id })))]] as Parameters<typeof save>[1] : []),
    ]);
    // Not atomic: if the events failed after the debt row was made, take the row away again.
    if (!ok && id) await supabase.from(d.table).delete().eq('id', id);
    if (ok) onClose();
  };
  return (
    <Sheet open onClose={onClose} title="New debt">
      <Seg value={kind} onChange={setKind} options={[['owed', 'They owe me'], ['loan', 'I owe them']]} />
      {choices.length ? (
        <View style={{ gap: 6 }}>
          <T k="meta">Who</T>
          <List>{choices.map((p) => (
            <Row key={p.id} selected={who === p.id} title={p.name} end={who === p.id ? <Icon name="check" strong /> : undefined}
              onPress={() => { setWho(p.id); setName(p.name); setPicked(new Set()); setE({ ...e, name: undefined }); }} />
          ))}</List>
        </View>
      ) : null}
      {!who ? <Field label={choices.length ? 'Or someone else' : 'Who'} value={name} onChangeText={(v) => { setName(v); setE({ ...e, name: undefined }); }} placeholder="Their name" error={e.name} /> : null}
      <Field label={kind === 'owed' ? 'Lent outside the bank' : 'Borrowed outside the bank'} keyboardType="decimal-pad" value={total} onChangeText={(v) => { setTotal(v); setE({ ...e, total: undefined }); }}
        placeholder="0" error={e.total} hint="Optional: cash, or money from before the bank sync. Transfers below add up by themselves." />
      {who ? (
        <>
          <Sec>Transfers with {name || 'them'}</Sec>
          <PickTransfers txs={txs} picked={picked} kind={kind} onToggle={(id) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; })} />
        </>
      ) : null}
      <FormErr err={err} />
      <Btn label="Save debt" busy={busy} disabled={!name.trim() || (!picked.size && !(parseAmount(total) ?? 0))} onPress={() => void go()} />
    </Sheet>
  );
}

/** One debt: what is left, its payments, add more transfers, remove one, delete the debt. */
export function DebtSheet({ m, debt, onClose }: { m: Model; debt: Debt; onClose: () => void }) {
  const people = useMemo(() => peopleOf(m), [m]);
  const [adding, setAdding] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [ask, setAsk] = useState(false);
  const { busy, err, save, link, unlink, record } = useDebtSave();
  const [cash, setCash] = useState<string | null>(null);
  const [cashAmt, setCashAmt] = useState('');
  const live = m.debts.find((d) => d.id === debt.id && d.kind === debt.kind) ?? debt;
  const txById = useMemo(() => new Map(m.tx.map((t) => [t.id, t])), [m.tx]);
  const open = live.person_id ? transfersWith(idsOf(people, canonicalId(people, live.person_id)), m.tx, m.linked) as TransactionRow[] : [];
  const paid = live.principal_minor - live.remaining_minor;
  const events = [...live.events].sort((a, b) => b.occurred_on.localeCompare(a.occurred_on));
  const del = async (): Promise<void> => {
    const d = DEBT_TABLES[live.kind];
    if (await save('Debt deleted', [[[d.table, d.events], () => supabase.from(d.table).delete().eq('id', live.id)]])) onClose();
  };
  return (
    <Sheet open onClose={onClose} title={debtTitle(live)}>
      <SheetHero amount={live.status === 'closed' ? 'Settled' : kr(live.remaining_minor, true)} line={live.status === 'closed' ? `${kr(live.principal_minor, true)} paid back` : `left of ${kr(live.principal_minor, true)}`} />
      <View style={{ height: 8, borderRadius: 4, backgroundColor: C.track }}>
        <View style={{ height: 8, borderRadius: 4, width: `${live.principal_minor ? Math.min(100, Math.round((paid / live.principal_minor) * 100)) : 0}%`, backgroundColor: live.status === 'closed' ? C.in : C.ink }} />
      </View>
      {live.person_id ? (adding ? (
        <>
          <Sec>Add transfers</Sec>
          <PickTransfers txs={open} picked={picked} kind={live.kind} onToggle={(id) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; })} />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}><Btn kind="ghost" label="Cancel" onPress={() => { setAdding(false); setPicked(new Set()); }} /></View>
            <View style={{ flex: 1 }}><Btn label={picked.size ? `Add ${picked.size}` : 'Add'} disabled={!picked.size} busy={busy}
              onPress={() => void link(live, open.filter((t) => picked.has(t.id)).sort((a, b) => a.occurred_on.localeCompare(b.occurred_on))).then((ok) => { if (ok) { setAdding(false); setPicked(new Set()); } })} /></View>
          </View>
        </>
      ) : <Btn kind="ghost" icon="add" label={open.length ? `Add transfers (${open.length} with ${live.name})` : 'Add transfers'} onPress={() => setAdding(true)} />) : null}
      {cash ? (
        <Panel style={{ padding: 14, gap: 10 }}>
          <Seg value={cash} onChange={setCash} options={[['repaid', 'Paid back'], [DEBT_TABLES[live.kind].more, live.kind === 'loan' ? 'Borrowed more' : 'Lent more']]} />
          <Field label="Amount, outside the bank" keyboardType="decimal-pad" value={cashAmt} onChangeText={setCashAmt} placeholder="0" error={cashAmt && !parseAmount(cashAmt) ? AMOUNT_ERR : null} />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}><Btn kind="ghost" label="Cancel" onPress={() => { setCash(null); setCashAmt(''); }} /></View>
            <View style={{ flex: 1 }}><Btn label="Save" disabled={!parseAmount(cashAmt)} busy={busy} onPress={() => void record(live, cash, parseAmount(cashAmt) ?? 0).then((ok) => { if (ok) { setCash(null); setCashAmt(''); } })} /></View>
          </View>
        </Panel>
      ) : <Btn kind="link" label="Cash or other money outside the bank…" onPress={() => setCash('repaid')} />}
      <Sec>History</Sec>
      {events.length ? <List>{events.map((e) => {
        const t = e.transaction_id ? txById.get(e.transaction_id) : undefined;
        const grows = e.kind !== 'repaid';
        return (
          <Row key={e.id} lead={<Disc icon={grows ? 'in' : 'out'} />} title={WORD[e.kind] ?? e.kind}
            meta={`${dayLabel(e.occurred_on)}${t ? ', bank transfer' : ', outside the bank'}`}
            end={<View style={{ alignItems: 'flex-end' }}><T k="num">{kr(e.amount_minor, true)}</T>{t ? <Btn kind="link" label="Remove" disabled={busy} onPress={() => void unlink(live, e)} /> : null}</View>} />
        );
      })}</List> : <Panel><Empty title="No payments yet" /></Panel>}
      <T k="note">Transfers in a debt don’t count as spending or income.</T>
      <FormErr err={err} />
      {ask ? <DeleteAsk what="this debt" busy={busy} onYes={() => void del()} onNo={() => setAsk(false)} /> : <Btn kind="danger" label="Delete debt…" onPress={() => setAsk(true)} />}
    </Sheet>
  );
}

/** From a transfer's detail: put it into an open debt with that person, or start a new one with it. */
export function LinkToDebt({ m, t, onClose }: { m: Model; t: TransactionRow; onClose: () => void }) {
  const people = useMemo(() => peopleOf(m), [m]);
  const person = t.counterparty_person_id ? canonicalId(people, t.counterparty_person_id) : null;
  const mine = m.debts.filter((d) => d.status === 'open' && d.person_id && person && canonicalId(people, d.person_id) === person);
  const [creating, setCreating] = useState(mine.length === 0);
  const { busy, err, link } = useDebtSave();
  if (creating) return <DebtForm m={m} personId={person ?? undefined} from={t} onClose={onClose} />;
  return (
    <Sheet open onClose={onClose} title="Add to a debt">
      <List>{mine.map((d) => (
        <Row key={d.id} disabled={busy} title={debtTitle(d)} meta={`${debtLine(d)}. Adds it as ${WORD[eventKindFor(d.kind, t)]?.toLowerCase()}.`}
          end={<Btn kind="ghost" label="Add" disabled={busy} onPress={() => void link(d, [t]).then((ok) => { if (ok) onClose(); })} />} />
      ))}</List>
      <FormErr err={err} />
      <Btn kind="ghost" icon="add" label="New debt" onPress={() => setCreating(true)} />
    </Sheet>
  );
}

const DISMISS = 'cashflow:debt-dismissed';

/** New transfers that probably belong to an open debt, with one-tap add. Dismissed ones stay hidden on this phone. */
export function DebtSuggestions({ m }: { m: Model }) {
  const people = useMemo(() => peopleOf(m), [m]);
  const [hidden, setHidden] = useState<Set<string> | null>(null);
  const { busy, link } = useDebtSave();
  useEffect(() => {
    AsyncStorage.getItem(DISMISS).then((raw) => setHidden(new Set(raw ? (JSON.parse(raw) as string[]) : []))).catch(() => setHidden(new Set()));
  }, []);
  if (hidden === null) return null;
  const list = debtSuggestions(m.debts, (id) => idsOf(people, canonicalId(people, id)), m.tx, m.linked).filter((s) => !hidden.has(s.tx.id));
  if (!list.length) return null;
  const dismiss = (id: string): void => {
    const next = new Set(hidden).add(id);
    setHidden(next);
    AsyncStorage.setItem(DISMISS, JSON.stringify([...next].slice(-200))).catch(() => undefined);
  };
  return (
    <>
      <Sec>Part of a debt?</Sec>
      <List>{list.map(({ debt, tx }) => (
        <Row key={tx.id} title={`${tx.kind === 'income' ? `${debt.name} sent` : `You sent ${debt.name}`} ${kr(tx.amount_minor)}`}
          meta={`${shortDate(tx.occurred_on)}, ${debtTitle(debt).toLowerCase()}. Add it as ${WORD[eventKindFor(debt.kind, tx)]?.toLowerCase()}?`}
          end={<View style={{ flexDirection: 'row', gap: 4 }}><Btn kind="link" label="No" onPress={() => dismiss(tx.id)} /><Btn kind="ghost" label="Add" disabled={busy} onPress={() => void link(debt, [tx as TransactionRow])} /></View>} />
      ))}</List>
    </>
  );
}

/** Open debts first; settled ones fold away. */
export function DebtList({ m, personId, onOpen }: { m: Model; personId?: string; onOpen: (d: Debt) => void }) {
  const people = useMemo(() => peopleOf(m), [m]);
  const [showClosed, setShowClosed] = useState(false);
  const all = m.debts.filter((d) => !personId || (d.person_id && canonicalId(people, d.person_id) === personId));
  const open = all.filter((d) => d.status === 'open');
  const closed = all.filter((d) => d.status === 'closed');
  const row = (d: Debt): React.JSX.Element => (
    <Row key={`${d.kind}-${d.id}`} onPress={() => onOpen(d)} lead={<Disc icon={d.kind === 'loan' ? 'loan' : 'owed'} />} title={debtTitle(d)} meta={debtLine(d)}
      end={<Text style={{ fontFamily: F.num, fontSize: 18, color: d.status === 'closed' ? C.ink3 : d.kind === 'owed' ? C.in : C.ink }}>{d.status === 'closed' ? '✓' : kr(d.remaining_minor, true)}</Text>} />
  );
  if (!all.length) return null;
  return (
    <>
      {open.length ? <List>{open.map(row)}</List> : <T k="note">No open debts.</T>}
      {closed.length ? (showClosed ? <List>{closed.map(row)}</List> : <Btn kind="link" label={`Settled (${closed.length})`} onPress={() => setShowClosed(true)} />) : null}
    </>
  );
}
