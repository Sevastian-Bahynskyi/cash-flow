import type React from 'react';
import { useState } from 'react';
import { Linking, View } from 'react-native';
import { supabase } from '@/lib/supabase';
import { useStore } from '@/core/data/store';
import type { Tables } from '@/core/data/types';
import { savingsTotal } from '@/core/domain/savings';
import { dayLabel, kr, minorToInput, parseAmount, shortDate, todayYmd } from '@/core/fmt';
import { C } from '@/ui/kit/theme';
import { Btn, Disc, Empty, Field, Header, Icon, IconBtn, List, Panel, Row, Screen, Sec, Seg, Sheet, T, useToast } from '@/ui/kit/ui';
import { Gate, SheetHero, SyncLine } from '@/ui/kit/money';
import { DeleteAsk, FormErr, IconPick, useSaver } from '@/ui/kit/forms';

type Ev = { id: string; kind: string; amount_minor: number; occurred_on: string; created_at: string; note?: string | null };
type Item = { id: string; name: string; value: number; goal: number | null; icon: string; history: Ev[]; synced: boolean };
const AMOUNT_ERR = 'Type an amount, like 1500 or 89,50.';
const SAVINGS_ACTS: [string, string][] = [['add', 'Put in'], ['remove', 'Take out'], ['set', 'Set balance']];
const pct = (a: number, b: number): number => (b ? Math.round((100 * a) / b) : 0);
const newestFirst = (a: Ev, b: Ev): number => b.occurred_on.localeCompare(a.occurred_on) || b.created_at.localeCompare(a.created_at);

// Debts live on People only; this screen keeps accounts and savings goals.
function itemsOf(t: Tables): Item[] {
  return t.savings_accounts.map((s) => {
    const ev = t.savings_events.filter((e) => e.savings_account_id === s.id);
    // A goal tied to a synced savings account takes the bank's balance; PSD2 has no goals, so the target stays in the app.
    const acc = s.bank_account_id ? t.bank_accounts.find((a) => a.id === s.bank_account_id) : undefined;
    return { id: s.id, name: s.name, value: acc ? acc.balance_minor ?? 0 : savingsTotal(ev), goal: s.goal_minor, icon: s.icon, history: ev.map((e) => ({ ...e, kind: e.action })).sort(newestFirst), synced: Boolean(acc) };
  });
}

const ROLE: Record<string, string> = { personal: 'Yours', joint: 'Joint', savings: 'Savings' };

function Accounts({ t }: { t: Tables }) {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const renew = async (connection_id: string): Promise<void> => {
    setBusy(connection_id);
    try {
      const res = await supabase.functions.invoke<{ url: string }>('bank-consent', { method: 'POST', body: { connection_id } });
      const url = res.data?.url;
      if (res.error || !url) throw new Error('Couldn’t start the renewal. Try again in a moment.');
      await Linking.openURL(url);
    } catch (e) { toast(e instanceof Error ? e.message : 'Couldn’t start the renewal.', undefined, 'error'); } finally { setBusy(null); }
  };
  if (!t.bank_connections.length) return <Panel><Empty title="No bank connected" sub="Cashflow reads your accounts through Enable Banking, read-only." /></Panel>;
  return (
    <>
      <SyncLine />
      {t.bank_connections.map((c) => {
        const days = Math.floor((Date.parse(c.valid_until) - Date.now()) / 86_400_000);
        const accs = t.bank_accounts.filter((a) => a.connection_id === c.id);
        return (
          <View key={c.id} style={{ gap: 10 }}>
            <Sec right={<Btn kind="link" label={busy === c.id ? 'Opening…' : 'Renew access'} disabled={busy === c.id} onPress={() => void renew(c.id)} />}>{c.aspsp_name}</Sec>
            <List>{accs.map((a) => (
              <Row key={a.id} lead={<Disc icon={a.role === 'joint' ? 'shared' : a.role === 'savings' ? 'savings' : 'bank'} />} title={`${a.name ?? ROLE[a.role]} · ${a.currency}`}
                meta={`${ROLE[a.role]}${a.last_error ? ', last sync failed' : a.last_synced_at ? `, synced ${dayLabel(a.last_synced_at.slice(0, 10)).toLowerCase()}` : ''}`}
                end={<T k="num">{a.balance_minor === null ? '–' : kr(a.balance_minor, false, a.currency)}</T>} />
            ))}</List>
            <T k="note">Read-only access {days < 0 ? 'ended' : `until ${shortDate(c.valid_until.slice(0, 10))}`}{days >= 0 && days < 14 ? `, ${days} ${days === 1 ? 'day' : 'days'} left` : ''}.</T>
          </View>
        );
      })}
    </>
  );
}


function Actions({ x }: { x: Item }) {
  const { userId } = useStore();
  const { busy, err, save } = useSaver();
  const [act, setAct] = useState(SAVINGS_ACTS[0]![0]);
  const [amt, setAmt] = useState('');
  const [note, setNote] = useState('');
  const [amtErr, setAmtErr] = useState<string | null>(null);
  const done = Boolean(x.goal) && x.value >= x.goal!;
  const word: Record<string, string> = { add: 'Put in', remove: 'Taken out', set: 'Balance set to' };
  const go = async (): Promise<void> => {
    const m = parseAmount(amt);
    if (m === null || (m === 0 && act !== 'set')) { setAmtErr(AMOUNT_ERR); return; }
    setAmtErr(null);
    const today = todayYmd();
    const ok = await save('Saved', [[['savings_events'], () => supabase.from('savings_events').insert({ user_id: userId, savings_account_id: x.id, action: act, amount_minor: m, occurred_on: today, note: note.trim() || null })]]);
    if (ok) { setAmt(''); setNote(''); }
  };
  return (
    <>
      <SheetHero amount={kr(x.value, true)} line={x.goal ? `${done ? 'Reached the' : 'of'} ${kr(x.goal, true)} goal` : 'No goal set yet'} />
      {x.goal ? <View style={{ height: 8, borderRadius: 4, backgroundColor: C.track }}><View style={{ height: 8, borderRadius: 4, width: `${Math.min(100, pct(x.value, x.goal))}%`, backgroundColor: done ? C.in : C.ink }} /></View> : null}
      {x.synced ? <T k="note" style={{ textAlign: 'center' }}>The balance comes from your synced savings account.</T> : (
        <>
          <Seg value={act} onChange={setAct} options={SAVINGS_ACTS} />
          <Field label="Amount" keyboardType="decimal-pad" value={amt} onChangeText={(v) => { setAmt(v); setAmtErr(null); }} error={amtErr} placeholder="0" />
          <Field label="Note" value={note} onChangeText={setNote} placeholder="Optional" />
          <FormErr err={err} />
          <Btn label="Save" busy={busy} onPress={() => void go()} />
        </>
      )}
      <Sec>History</Sec>
      {x.history.length ? <List>{x.history.map((e) => (
        <Row key={e.id} lead={<Disc icon={e.kind === 'add' ? 'in' : e.kind === 'set' ? 'edit' : 'out'} />} title={word[e.kind] ?? e.kind} meta={`${dayLabel(e.occurred_on)}${e.note ? `, ${e.note}` : ''}`} end={<T k="num">{kr(e.amount_minor, true)}</T>} />
      ))}</List> : <Panel><Empty title="No history yet." sub="" /></Panel>}
    </>
  );
}

function EditForm({ x, t, onDone }: { x: Item | null; t: Tables; onDone: () => void }) {
  const { userId } = useStore();
  const { busy, err, save } = useSaver();
  const [name, setName] = useState(x?.name ?? '');
  const [amt, setAmt] = useState(x?.goal ? minorToInput(x.goal) : '');
  const [icon, setIcon] = useState(x?.icon ?? 'savings');
  const savingsAccs = t.bank_accounts.filter((a) => a.role === 'savings');
  const [acc, setAcc] = useState<string>((x ? t.savings_accounts.find((r) => r.id === x.id)?.bank_account_id : null) ?? savingsAccs[0]?.id ?? '');
  const [e, setE] = useState<{ name?: string; amt?: string }>({});
  const [ask, setAsk] = useState(false);
  const go = async (): Promise<void> => {
    const n = name.trim();
    const m = amt.trim() ? parseAmount(amt) : null;
    const next: typeof e = {};
    if (!n) next.name = 'Give it a name.';
    if (amt.trim() && m === null) next.amt = AMOUNT_ERR;
    setE(next);
    if (Object.keys(next).length) return;
    const ok = await save('Saved', [[['savings_accounts'], () => (x
      ? supabase.from('savings_accounts').update({ name: n, goal_minor: m, icon, bank_account_id: acc || null }).eq('id', x.id)
      : supabase.from('savings_accounts').insert({ user_id: userId, name: n, goal_minor: m, icon, bank_account_id: acc || null }))]]);
    if (ok) onDone();
  };
  const del = async (): Promise<void> => {
    if (!x) return;
    if (await save('Deleted', [[['savings_accounts', 'savings_events'] as never, () => supabase.from('savings_accounts').delete().eq('id', x.id)]])) onDone();
  };
  return (
    <>
      <Field label="Name" value={name} onChangeText={(v) => { setName(v); setE({ ...e, name: undefined }); }} placeholder="Emergency fund" error={e.name} />
      <Field label="Goal" keyboardType="decimal-pad" value={amt} onChangeText={(v) => { setAmt(v); setE({ ...e, amt: undefined }); }} error={e.amt} hint="Optional" />
      {savingsAccs.length > 0 ? (
        <View style={{ gap: 6 }}><T k="meta">Balance from</T>
          <List>{[...savingsAccs.map((a) => <Row key={a.id} selected={acc === a.id} title={`${a.name ?? 'Savings'} (${a.currency})`} end={acc === a.id ? <Icon name="check" strong /> : undefined} onPress={() => setAcc(a.id)} />),
            <Row key="none" selected={!acc} title="Not synced, I track it here" end={!acc ? <Icon name="check" strong /> : undefined} onPress={() => setAcc('')} />]}</List>
        </View>
      ) : null}
      <IconPick value={icon} onPick={setIcon} extra={['savings']} />
      {ask ? <DeleteAsk what="it" busy={busy} onYes={() => void del()} onNo={() => setAsk(false)} /> : null}
      <FormErr err={err} />
      <Btn label="Save" busy={busy} onPress={() => void go()} />
      {x && !ask ? <Btn kind="danger" label="Delete…" onPress={() => setAsk(true)} /> : null}
    </>
  );
}

function BankSheet({ x, t, onClose }: { x: Item | null; t: Tables; onClose: () => void }) {
  const [editing, setEditing] = useState(!x);
  return (
    <Sheet open onClose={onClose} title={editing ? (x ? 'Edit' : 'New savings') : x?.name ?? ''} right={!editing ? <IconBtn name="edit" label="Edit" onPress={() => setEditing(true)} /> : undefined}>
      {editing || !x ? <EditForm x={x} t={t} onDone={onClose} /> : <Actions x={x} />}
    </Sheet>
  );
}

function Bank({ t }: { t: Tables }) {
  const [open, setOpen] = useState<{ id: string | null } | null>(null);
  const sv = itemsOf(t);
  const row = (x: Item, right: string, sub: string, prog: number | null) => (
    <Row key={x.id} onPress={() => setOpen({ id: x.id })} lead={<Disc icon={x.icon} />}
      title={<View><T k="strong">{x.name}</T>{prog !== null ? <View style={{ height: 6, borderRadius: 3, backgroundColor: C.track, marginTop: 6 }}><View style={{ height: 6, borderRadius: 3, width: `${prog}%`, backgroundColor: prog >= 100 ? C.in : C.ink }} /></View> : null}</View>}
      meta={sub} end={<T k="num">{right}</T>} />
  );
  const cur = open?.id ? sv.find((x) => x.id === open.id) ?? null : null;
  const list = sv.map((s) => row(s, kr(s.value, true), s.goal ? (s.value >= s.goal ? `Goal reached, ${kr(s.goal, true)}` : `${pct(s.value, s.goal)} of 100 toward ${kr(s.goal, true)}`) : 'No goal set yet', s.goal ? Math.min(100, pct(s.value, s.goal)) : null));
  return (
    <>
      <Accounts t={t} />
      <View style={{ gap: 10 }}>
        <Sec right={<Btn kind="link" label="New" onPress={() => setOpen({ id: null })} />}>Savings goals</Sec>
        {list.length ? <List>{list}</List> : <Panel><Empty title="No goals yet. Name one and tie it to your savings account." sub="" /><View style={{ padding: 12 }}><Btn kind="ghost" icon="add" label="New goal" onPress={() => setOpen({ id: null })} /></View></Panel>}
      </View>
      {open && (open.id === null || cur) ? <BankSheet key={open.id ?? 'new'} x={cur} t={t} onClose={() => setOpen(null)} /> : null}
    </>
  );
}

export default function BankScreen() {
  const store = useStore();
  return <Gate>{() => <Screen onRefresh={store.sync} header={<Header back title="Accounts & sync" sub="Your banks, balances and savings goals" />}>{store.tables ? <Bank t={store.tables} /> : null}</Screen>}</Gate>;
}
