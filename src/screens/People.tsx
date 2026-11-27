import type React from 'react';
import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useStore, write } from '@/core/data/store';
import type { Model } from '@/core/data/model';
import { pot } from '@/core/data/pot';
import { canonicalId, owedBalances, paybackSuggestions, type PersonInput, type PersonKind } from '@/core/domain/people';
import { kr, shortDate } from '@/core/fmt';
import { PARTNER } from '@/core/partner';
import { SharedRing } from '@/ui/aura/SharedRing';
import { C, F } from '@/ui/kit/theme';
import { Btn, Empty, Header, Icon, List, Panel, Row, Screen, Sec, Sheet, T, tap, useToast } from '@/ui/kit/ui';
import { Gate, SheetHero, TxRow, useDetail } from '@/ui/kit/money';

const KIND: [PersonKind, string, string][] = [
  ['settle_up', 'We settle up', 'What you send and get back keeps a running balance'],
  ['family', 'Family', 'Ask me each time: a gift, or something they pay back'],
  ['partner', 'Partner', 'Shares the joint account with you'],
  ['ignore', 'Ignore', 'Not spending, no balance'],
];
const owes = (v: number): string => (v > 0 ? `owes you ${kr(v, true)}` : v < 0 ? `you owe ${kr(-v, true)}` : 'all square');

const Initial = ({ name }: { name: string }) => (
  <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontFamily: F.strong, color: C.ink, fontSize: 16 }}>{name.trim()[0]?.toUpperCase()}</Text></View>
);

function People({ m }: { m: Model }) {
  const store = useStore();
  const toast = useToast();
  const open = useDetail();
  const router = useRouter();
  const [edit, setEdit] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const people: PersonInput[] = useMemo(() => m.t.transfer_people.map((p) => ({ id: p.id, name: p.name, kind: p.kind ?? 'settle_up', opening_balance_minor: p.opening_balance_minor ?? 0, alias_of: p.alias_of ?? null })), [m.t.transfer_people]);
  const txs = useMemo(() => m.tx.map((t) => ({ ...t, counterparty_person_id: t.counterparty_person_id ?? null })), [m.tx]);
  const balances = useMemo(() => owedBalances(people, txs), [people, txs]);
  const taken = useMemo(() => new Set(m.t.paybacks.flatMap((p) => [p.payment_transaction_id, p.expense_transaction_id])), [m.t.paybacks]);
  const suggestions = useMemo(() => paybackSuggestions(people, txs, taken), [people, txs, taken]);
  const byId = new Map(m.tx.map((t) => [t.id, t]));
  const p = pot(m.tx.filter(m.inCycle(m.current)));
  const partner = balances.find((b) => b.kind === 'partner');
  const list = balances.filter((b) => b.kind === 'settle_up' || b.kind === 'family').sort((a, b) => Math.abs(b.balance_minor) - Math.abs(a.balance_minor) || (b.lastOn ?? '').localeCompare(a.lastOn ?? ''));
  const recent = (id: string) => [...m.tx].reverse().filter((t) => t.counterparty_person_id && canonicalId(people, t.counterparty_person_id) === id).slice(0, 6);

  const accept = async (s: (typeof suggestions)[number]): Promise<void> => {
    if (!store.userId) return;
    setBusy(true);
    try {
      await write(store, ['paybacks'], () => supabase.from('paybacks').insert(s.items.map((i) => ({ user_id: store.userId, payment_transaction_id: s.payment_transaction_id, expense_transaction_id: i.expense_transaction_id, amount_minor: i.amount_minor }))));
      toast('Paid back. That part no longer counts as your spending.');
    } catch (e) { toast(e instanceof Error ? e.message : 'Not saved.'); } finally { setBusy(false); }
  };
  const setKind = async (id: string, kind: PersonKind): Promise<void> => {
    setBusy(true);
    try { await write(store, ['transfer_people'], () => supabase.from('transfer_people').update({ kind }).eq('id', id)); setEdit(null); }
    catch (e) { toast(e instanceof Error ? e.message : 'Not saved.'); } finally { setBusy(false); }
  };
  const editing = edit ? balances.find((b) => b.person_id === edit) : undefined;

  return (
    <Screen onRefresh={store.sync} header={<Header title="People" sub={`Who owes whom, and the pot with ${PARTNER}`} />}>
      <Pressable onPress={() => { tap(); router.push('/shared' as never); }} accessibilityRole="button" accessibilityLabel={`The pot with ${PARTNER}`}>
        <Panel style={{ padding: 16, gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ width: 40, height: 40 }}><View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center' }}><Icon name="shared" /></View><View style={{ position: 'absolute', left: -5, top: -5 }}><SharedRing size={50} /></View></View>
            <View style={{ flex: 1 }}><T k="strong">With {PARTNER}</T><T k="meta">left in the joint account this cycle</T></View>
            <Text style={{ fontFamily: F.num, fontSize: 30, color: C.ink }}>{kr(p.sharedBalance, true)}</Text>
          </View>
          {[[`${PARTNER} moved in`, kr(p.gfTopupTotal, true)], ['You moved in', kr(p.meTopupTotal, true)], [`Your part, ${p.myPct} of every 100 kr.`, kr(p.userEffectiveShare, true)], ...(partner && partner.balance_minor !== 0 ? [['Between you', owes(partner.balance_minor)]] : [])].map(([k, v]) => (
            <View key={k} style={{ flexDirection: 'row', justifyContent: 'space-between' }}><T k="meta" style={{ fontSize: 14 }}>{k}</T><T k="num" style={{ fontSize: 14 }}>{v}</T></View>
          ))}
        </Panel>
      </Pressable>

      {suggestions.length > 0 ? (
        <>
          <Sec>Paid back?</Sec>
          <List>{suggestions.map((s) => {
            const pay = byId.get(s.payment_transaction_id);
            const who = balances.find((b) => b.person_id === canonicalId(people, s.person_id))?.name ?? 'Someone';
            const what = s.items.map((i) => byId.get(i.expense_transaction_id)?.name ?? 'an expense').join(', ');
            return pay ? <Row key={s.payment_transaction_id + s.items.map((i) => i.expense_transaction_id).join()} lead={<Initial name={who} />} title={`${who} sent ${kr(pay.amount_minor)}`} meta={`${s.ratio === 1 ? 'All' : 'Half'} of ${what}, ${shortDate(pay.occurred_on)}`} end={<Btn kind="ghost" label="Yes" disabled={busy} onPress={() => void accept(s)} />} /> : null;
          }).filter(Boolean) as React.JSX.Element[]}</List>
          <T k="note">Yes takes that part out of your spending.</T>
        </>
      ) : null}

      <Sec>Who owes whom</Sec>
      {list.length ? <List>{list.map((b) => (
        <Row key={b.person_id} onPress={() => setEdit(b.person_id)} lead={<Initial name={b.name} />} title={b.name} meta={b.kind === 'family' ? 'Family, asked each time' : b.lastOn ? `Last ${shortDate(b.lastOn)}` : 'No transfers yet'}
          end={<T k="num" style={{ color: b.balance_minor > 0 ? C.in : C.ink }}>{b.kind === 'family' ? '' : owes(b.balance_minor)}</T>} />
      ))}</List> : <Panel><Empty title="Nobody yet" sub="People you send money to by bank or MobilePay show up here." /></Panel>}
      <T k="note">From transfers to and from each person. Tap one to change what kind of person they are.</T>

      {editing ? (
        <Sheet open onClose={() => setEdit(null)} title={editing.name}>
          <SheetHero amount={editing.kind === 'family' ? kr(editing.sentMinor, true) : owes(editing.balance_minor)} line={`${kr(editing.sentMinor, true)} sent, ${kr(editing.receivedMinor, true)} received`} />
          <List>{KIND.map(([k, label, sub]) => <Row key={k} disabled={busy} selected={editing.kind === k} title={label} meta={sub} end={editing.kind === k ? <Icon name="check" strong /> : undefined} onPress={() => void setKind(editing.person_id, k)} />)}</List>
          <Sec>Latest</Sec>
          <List>{recent(editing.person_id).map((t) => <TxRow key={t.id} t={t} m={m} onOpen={(x) => { setEdit(null); open(x); }} />)}</List>
        </Sheet>
      ) : null}
    </Screen>
  );
}

export default function PeopleScreen() {
  return <Gate>{(m) => <People m={m} />}</Gate>;
}
