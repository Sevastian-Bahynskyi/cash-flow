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

type Kind = 'savings' | 'loan' | 'owed';
type Ev = { id: string; kind: string; amount_minor: number; occurred_on: string; created_at: string; note?: string | null };
type Item = { id: string; name: string; value: number; goal: number | null; principal: number; icon: string; history: Ev[]; synced: boolean };
const AMOUNT_ERR = 'Type an amount, like 1500 or 89,50.';
const DEBT = {
  loan: { table: 'loans', events: 'loan_events', fk: 'loan_id', more: 'borrowed', acts: [['repaid', 'Repayment'], ['borrowed', 'Borrow more']] as [string, string][] },
  owed: { table: 'receivables', events: 'receivable_events', fk: 'receivable_id', more: 'lent', acts: [['repaid', 'Money returned'], ['lent', 'Lend more']] as [string, string][] },
} as const;
const SAVINGS_ACTS: [string, string][] = [['add', 'Put in'], ['remove', 'Take out'], ['set', 'Set balance']];
const pct = (a: number, b: number): number => (b ? Math.round((100 * a) / b) : 0);
const newestFirst = (a: Ev, b: Ev): number => b.occurred_on.localeCompare(a.occurred_on) || b.created_at.localeCompare(a.created_at);

function itemsOf(t: Tables, kind: Kind): Item[] {
  if (kind === 'savings') return t.savings_accounts.map((s) => {
    const ev = t.savings_events.filter((e) => e.savings_account_id === s.id);
    // A goal tied to a synced savings account takes the bank's balance; PSD2 has no goals, so the target stays in the app.
    const acc = s.bank_account_id ? t.bank_accounts.find((a) => a.id === s.bank_account_id) : undefined;
    return { id: s.id, name: s.name, value: acc ? acc.balance_minor ?? 0 : savingsTotal(ev), goal: s.goal_minor, principal: 0, icon: s.icon, history: ev.map((e) => ({ ...e, kind: e.action })).sort(newestFirst), synced: Boolean(acc) };
  });
  const rows = kind === 'loan' ? t.loans : t.receivables;
  const ev: (Ev & { parent: string })[] = kind === 'loan' ? t.loan_events.map((e) => ({ ...e, parent: e.loan_id })) : t.receivable_events.map((e) => ({ ...e, parent: e.receivable_id }));
  return rows.map((r) => ({ id: r.id, name: r.name, value: r.remaining_minor, goal: null, principal: r.principal_minor, icon: kind === 'loan' ? 'loan' : 'owed', history: ev.filter((e) => e.parent === r.id).sort(newestFirst), synced: false }));
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

const WORDS: Record<Kind, [string, string, string]> = { savings: ['New savings', 'Emergency fund', 'Goal'], loan: ['New loan', 'Student loan', 'Original amount'], owed: ['Someone owes you', 'Name', 'Amount lent'] };

function Actions({ kind, x, t }: { kind: Kind; x: Item; t: Tables }) {
  const { userId } = useStore();
  const { busy, err, save } = useSaver();
  const acts = kind === 'savings' ? SAVINGS_ACTS : DEBT[kind].acts;
  const [act, setAct] = useState(acts[0]![0]);
  const [amt, setAmt] = useState('');
  const [note, setNote] = useState('');
  const [amtErr, setAmtErr] = useState<string | null>(null);
  const done = kind === 'savings' ? Boolean(x.goal) && x.value >= x.goal! : !x.value;
  const word: Record<string, string> = { add: 'Put in', remove: 'Taken out', set: 'Balance set to', repaid: kind === 'loan' ? 'Repaid' : 'Returned', borrowed: 'Borrowed', lent: 'Lent' };
  const go = async (): Promise<void> => {
    const m = parseAmount(amt);
    if (m === null || (m === 0 && act !== 'set')) { setAmtErr(AMOUNT_ERR); return; }
    setAmtErr(null);
    const today = todayYmd();
    let ok: boolean;
    if (kind === 'savings') {
      ok = await save('Saved', [[['savings_events'], () => supabase.from('savings_events').insert({ user_id: userId, savings_account_id: x.id, action: act, amount_minor: m, occurred_on: today, note: note.trim() || null })]]);
    } else {
      const d = DEBT[kind];
      const row = (kind === 'loan' ? t.loans : t.receivables).find((r) => r.id === x.id);
      if (!row) return;
      const more = act === d.more;
      const principal = more ? row.principal_minor + m : row.principal_minor;
      const remaining = more ? row.remaining_minor + m : Math.max(0, row.remaining_minor - m);
      // Two calls: the event, then the running numbers (not transactional).
      ok = await save('Saved', [
        [[d.events], () => supabase.from(d.events).insert({ [d.fk]: x.id, user_id: userId, kind: act, amount_minor: m, occurred_on: today })],
        [[d.table], () => supabase.from(d.table).update({ principal_minor: principal, remaining_minor: remaining, status: remaining === 0 ? 'closed' : 'open' }).eq('id', x.id)],
      ]);
    }
    if (ok) { setAmt(''); setNote(''); }
  };
  return (
    <>
      <SheetHero amount={x.value ? kr(x.value, true) : 'Settled'} line={kind === 'savings' ? (x.goal ? `${done ? 'Reached the' : 'of'} ${kr(x.goal, true)} goal` : 'No goal set yet') : done ? (kind === 'loan' ? `${kr(x.principal, true)} repaid` : 'Returned in full') : kind === 'loan' ? `left to repay of ${kr(x.principal, true)}` : `still owed of ${kr(x.principal, true)}`} />
      {kind === 'savings' && x.goal ? <View style={{ height: 8, borderRadius: 4, backgroundColor: C.track }}><View style={{ height: 8, borderRadius: 4, width: `${Math.min(100, pct(x.value, x.goal))}%`, backgroundColor: done ? C.in : C.ink }} /></View> : null}
      {x.synced ? <T k="note" style={{ textAlign: 'center' }}>The balance comes from your synced savings account.</T> : (
        <>
          <Seg value={act} onChange={setAct} options={acts} />
          <Field label="Amount" keyboardType="decimal-pad" value={amt} onChangeText={(v) => { setAmt(v); setAmtErr(null); }} error={amtErr} placeholder="0" />
          {kind === 'savings' ? <Field label="Note" value={note} onChangeText={setNote} placeholder="Optional" /> : null}
          <FormErr err={err} />
          <Btn label="Save" busy={busy} onPress={() => void go()} />
        </>
      )}
      <Sec>History</Sec>
      {x.history.length ? <List>{x.history.map((e) => (
        <Row key={e.id} lead={<Disc icon={e.kind === 'add' || e.kind === 'lent' || e.kind === 'borrowed' ? 'in' : e.kind === 'set' ? 'edit' : 'out'} />} title={word[e.kind] ?? e.kind} meta={`${dayLabel(e.occurred_on)}${e.note ? `, ${e.note}` : ''}`} end={<T k="num">{kr(e.amount_minor, true)}</T>} />
      ))}</List> : <Panel><Empty title="No history yet." sub="" /></Panel>}
    </>
  );
}

function EditForm({ kind, x, t, onDone }: { kind: Kind; x: Item | null; t: Tables; onDone: () => void }) {
  const { userId } = useStore();
  const { busy, err, save } = useSaver();
  const debt = kind === 'savings' ? null : (kind === 'loan' ? t.loans : t.receivables).find((r) => r.id === x?.id) ?? null;
  const [name, setName] = useState(x?.name ?? '');
  const [amt, setAmt] = useState(x ? (kind === 'savings' ? (x.goal ? minorToInput(x.goal) : '') : minorToInput(x.principal)) : '');
  const [left, setLeft] = useState(debt ? minorToInput(debt.remaining_minor) : '');
  const [icon, setIcon] = useState(x?.icon ?? 'savings');
  const savingsAccs = t.bank_accounts.filter((a) => a.role === 'savings');
  const [acc, setAcc] = useState<string>((kind === 'savings' && x ? t.savings_accounts.find((r) => r.id === x.id)?.bank_account_id : null) ?? savingsAccs[0]?.id ?? '');
  const [e, setE] = useState<{ name?: string; amt?: string; left?: string }>({});
  const [ask, setAsk] = useState(false);
  const W = WORDS[kind];
  const go = async (): Promise<void> => {
    const n = name.trim();
    const m = amt.trim() ? parseAmount(amt) : null;
    const next: typeof e = {};
    if (!n) next.name = 'Give it a name.';
    if (amt.trim() && m === null) next.amt = AMOUNT_ERR;
    if (kind !== 'savings' && !m) next.amt = AMOUNT_ERR;
    const l = kind === 'savings' ? null : left.trim() ? parseAmount(left) : m;
    if (kind !== 'savings' && left.trim() && l === null) next.left = AMOUNT_ERR;
    else if (kind !== 'savings' && m && l !== null && l > m) next.left = 'Can’t be more than the original amount.';
    setE(next);
    if (Object.keys(next).length) return;
    let ok: boolean;
    if (kind === 'savings') {
      ok = await save('Saved', [[['savings_accounts'], () => (x
        ? supabase.from('savings_accounts').update({ name: n, goal_minor: m, icon, bank_account_id: acc || null }).eq('id', x.id)
        : supabase.from('savings_accounts').insert({ user_id: userId, name: n, goal_minor: m, icon, bank_account_id: acc || null }))]]);
    } else {
      const d = DEBT[kind];
      const principal = m as number, remaining = l as number;
      const status = remaining === 0 ? 'closed' : 'open';
      if (x) ok = await save('Saved', [[[d.table], () => supabase.from(d.table).update({ name: n, principal_minor: principal, remaining_minor: remaining, status }).eq('id', x.id)]]);
      else {
        let id: string | null = null;
        ok = await save('Saved', [
          [[d.table], async () => { const r = await supabase.from(d.table).insert({ user_id: userId, name: n, principal_minor: principal, remaining_minor: remaining, status }).select('id').single<{ id: string }>(); id = r.data?.id ?? null; return r; }],
          [[d.events], () => supabase.from(d.events).insert({ [d.fk]: id, user_id: userId, kind: d.more, amount_minor: principal, occurred_on: todayYmd() })],
        ]);
      }
    }
    if (ok) onDone();
  };
  const del = async (): Promise<void> => {
    if (!x) return;
    const table = kind === 'savings' ? 'savings_accounts' : DEBT[kind].table;
    const also = kind === 'savings' ? 'savings_events' : DEBT[kind].events;
    if (await save('Deleted', [[[table, also] as never, () => supabase.from(table).delete().eq('id', x.id)]])) onDone();
  };
  return (
    <>
      <Field label={kind === 'owed' ? 'Who' : 'Name'} value={name} onChangeText={(v) => { setName(v); setE({ ...e, name: undefined }); }} placeholder={W[1]} error={e.name} />
      <Field label={W[2]} keyboardType="decimal-pad" value={amt} onChangeText={(v) => { setAmt(v); setE({ ...e, amt: undefined }); }} error={e.amt} hint={kind === 'savings' ? 'Optional' : undefined} />
      {kind !== 'savings' ? <Field label={kind === 'loan' ? 'Still to repay' : 'Still owed'} keyboardType="decimal-pad" value={left} onChangeText={(v) => { setLeft(v); setE({ ...e, left: undefined }); }} error={e.left} hint={x ? undefined : 'Leave empty if nothing is paid back yet'} /> : null}
      {kind === 'savings' && savingsAccs.length > 0 ? (
        <View style={{ gap: 6 }}><T k="meta">Balance from</T>
          <List>{[...savingsAccs.map((a) => <Row key={a.id} selected={acc === a.id} title={`${a.name ?? 'Savings'} (${a.currency})`} end={acc === a.id ? <Icon name="check" strong /> : undefined} onPress={() => setAcc(a.id)} />),
            <Row key="none" selected={!acc} title="Not synced, I track it here" end={!acc ? <Icon name="check" strong /> : undefined} onPress={() => setAcc('')} />]}</List>
        </View>
      ) : null}
      {kind === 'savings' ? <IconPick value={icon} onPick={setIcon} extra={['savings']} /> : null}
      {ask ? <DeleteAsk what="it" busy={busy} onYes={() => void del()} onNo={() => setAsk(false)} /> : null}
      <FormErr err={err} />
      <Btn label="Save" busy={busy} onPress={() => void go()} />
      {x && !ask ? <Btn kind="danger" label="Delete…" onPress={() => setAsk(true)} /> : null}
    </>
  );
}

function BankSheet({ kind, x, t, onClose }: { kind: Kind; x: Item | null; t: Tables; onClose: () => void }) {
  const [editing, setEditing] = useState(!x);
  return (
    <Sheet open onClose={onClose} title={editing ? (x ? 'Edit' : WORDS[kind][0]) : x?.name ?? ''} right={!editing ? <IconBtn name="edit" label="Edit" onPress={() => setEditing(true)} /> : undefined}>
      {editing || !x ? <EditForm kind={kind} x={x} t={t} onDone={onClose} /> : <Actions kind={kind} x={x} t={t} />}
    </Sheet>
  );
}

function Bank({ t }: { t: Tables }) {
  const [open, setOpen] = useState<{ kind: Kind; id: string | null } | null>(null);
  const sv = itemsOf(t, 'savings'), lo = itemsOf(t, 'loan'), ow = itemsOf(t, 'owed');
  const row = (kind: Kind, x: Item, right: string, sub: string, prog: number | null) => (
    <Row key={x.id} onPress={() => setOpen({ kind, id: x.id })} lead={<Disc icon={x.icon} />}
      title={<View><T k="strong">{x.name}</T>{prog !== null ? <View style={{ height: 6, borderRadius: 3, backgroundColor: C.track, marginTop: 6 }}><View style={{ height: 6, borderRadius: 3, width: `${prog}%`, backgroundColor: prog >= 100 ? C.in : C.ink }} /></View> : null}</View>}
      meta={sub} end={<T k="num">{right}</T>} />
  );
  const sec = (title: string, kind: Kind, list: React.JSX.Element[], empty: string, newLabel: string) => (
    <View style={{ gap: 10 }}>
      <Sec right={<Btn kind="link" label="New" onPress={() => setOpen({ kind, id: null })} />}>{title}</Sec>
      {list.length ? <List>{list}</List> : <Panel><Empty title={empty} sub="" /><View style={{ padding: 12 }}><Btn kind="ghost" icon="add" label={newLabel} onPress={() => setOpen({ kind, id: null })} /></View></Panel>}
    </View>
  );
  const all = { savings: sv, loan: lo, owed: ow };
  const cur = open?.id ? all[open.kind].find((x) => x.id === open.id) ?? null : null;
  return (
    <>
      <Accounts t={t} />
      {sec('Savings goals', 'savings', sv.map((s) => row('savings', s, kr(s.value, true), s.goal ? (s.value >= s.goal ? `Goal reached, ${kr(s.goal, true)}` : `${pct(s.value, s.goal)} of 100 toward ${kr(s.goal, true)}`) : 'No goal set yet', s.goal ? Math.min(100, pct(s.value, s.goal)) : null)), 'No goals yet. Name one and tie it to your savings account.', 'New goal')}
      {lo.length > 0 ? sec('Loans', 'loan', lo.map((l) => row('loan', l, l.value ? kr(l.value, true) : 'Settled', l.value ? `left of ${kr(l.principal, true)}` : `${kr(l.principal, true)} repaid`, l.value ? 100 - pct(l.value, l.principal) : null)), '', 'New loan') : null}
      {ow.length > 0 ? sec('Owed to you', 'owed', ow.map((o) => row('owed', o, o.value ? kr(o.value, true) : 'Settled', o.value ? `still owed of ${kr(o.principal, true)}` : 'Returned in full', o.value ? 100 - pct(o.value, o.principal) : null)), '', 'Someone owes you') : null}
      {open && (open.id === null || cur) ? <BankSheet key={`${open.kind}-${open.id ?? 'new'}`} kind={open.kind} x={cur} t={t} onClose={() => setOpen(null)} /> : null}
    </>
  );
}

export default function BankScreen() {
  const store = useStore();
  return <Gate>{() => <Screen onRefresh={store.sync} header={<Header back title="Accounts & sync" sub="Your banks, balances and savings goals" />}>{store.tables ? <Bank t={store.tables} /> : null}</Screen>}</Gate>;
}
