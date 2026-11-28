import { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useStore } from '@/core/data/store';
import type { Model } from '@/core/data/model';
import { pot } from '@/core/data/pot';
import { canonicalId, owedBalances, type PersonInput } from '@/core/domain/people';
import { kr, shortDate } from '@/core/fmt';
import { PARTNER } from '@/core/partner';
import { SharedRing } from '@/ui/aura/SharedRing';
import { C, F } from '@/ui/kit/theme';
import { Btn, Empty, Header, Icon, List, Panel, Press, Row, Screen, Sec, Sheet, T, tap } from '@/ui/kit/ui';
import { Gate, TxRow, useDetail } from '@/ui/kit/money';
import type { Debt } from '@/core/domain/debts';
import { DebtForm, DebtList, DebtSheet, DebtSuggestions } from './Debts';

const owes = (v: number): string => (v > 0 ? `owes you ${kr(v, true)}` : v < 0 ? `you owe ${kr(-v, true)}` : 'all square');

const Initial = ({ name }: { name: string }) => (
  <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontFamily: F.strong, color: C.ink, fontSize: 16 }}>{name.trim()[0]?.toUpperCase()}</Text></View>
);

function People({ m }: { m: Model }) {
  const store = useStore();
  const open = useDetail();
  const router = useRouter();
  const [edit, setEdit] = useState<string | null>(null);
  const [debt, setDebt] = useState<Debt | null>(null);
  const [newDebt, setNewDebt] = useState<string | null | undefined>(undefined);
  const people: PersonInput[] = useMemo(() => m.t.transfer_people.map((p) => ({ id: p.id, name: p.name, kind: p.kind ?? 'settle_up', opening_balance_minor: p.opening_balance_minor ?? 0, alias_of: p.alias_of ?? null })), [m.t.transfer_people]);
  // Transfers in a debt are counted there, not in the partner's balance.
  const txs = useMemo(() => m.tx.filter((t) => !m.linked.has(t.id)).map((t) => ({ ...t, counterparty_person_id: t.counterparty_person_id ?? null })), [m.tx, m.linked]);
  const balances = useMemo(() => owedBalances(people, txs), [people, txs]);
  const p = pot(m.tx.filter(m.inCycle(m.current)));
  const partner = balances.find((b) => b.kind === 'partner');
  // Names only: a person owes or is owed only through a debt the owner made.
  const list = balances.filter((b) => b.kind === 'settle_up' || b.kind === 'family').sort((a, b) => (b.lastOn ?? '').localeCompare(a.lastOn ?? ''));
  const recent = (id: string) => [...m.tx].reverse().filter((t) => t.counterparty_person_id && canonicalId(people, t.counterparty_person_id) === id).slice(0, 6);

  const editing = edit ? balances.find((b) => b.person_id === edit) : undefined;

  return (
    <Screen onRefresh={store.sync} header={<Header title="People" sub={`Debts, and the pot with ${PARTNER}`} />}>
      <Press scale={0.98} onPress={() => { tap(); router.push('/shared' as never); }} accessibilityRole="button" accessibilityLabel={`The pot with ${PARTNER}`}>
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
      </Press>

      <DebtSuggestions m={m} />

      <Sec right={<Btn kind="link" label="New debt" onPress={() => setNewDebt(null)} />}>Debts</Sec>
      {m.debts.length ? <DebtList m={m} onOpen={setDebt} /> : <Panel><Empty title="No debts" sub="When you lend or borrow money, add a debt and tick the transfers that belong to it." /></Panel>}

      <Sec>People</Sec>
      {list.length ? <List>{list.map((b) => (
        <Row key={b.person_id} onPress={() => setEdit(b.person_id)} lead={<Initial name={b.name} />} title={b.name} meta={b.lastOn ? `Last transfer ${shortDate(b.lastOn)}` : 'No transfers yet'} />
      ))}</List> : <Panel><Empty title="Nobody yet" sub="People you send money to by bank or MobilePay show up here." /></Panel>}
      <T k="note">Tap a person to see their transfers or start a debt.</T>

      {editing ? (
        <Sheet open onClose={() => setEdit(null)} title={editing.name}>
          <DebtList m={m} personId={editing.person_id} onOpen={(d) => { setEdit(null); setDebt(d); }} />
          <Btn kind="ghost" icon="add" label={`New debt with ${editing.name}`} onPress={() => { const id = editing.person_id; setEdit(null); setNewDebt(id); }} />
          <Sec>Latest</Sec>
          <List>{recent(editing.person_id).map((t) => <TxRow key={t.id} t={t} m={m} onOpen={(x) => { setEdit(null); open(x); }} />)}</List>
        </Sheet>
      ) : null}
      {debt ? <DebtSheet m={m} debt={debt} onClose={() => setDebt(null)} /> : null}
      {newDebt !== undefined ? <DebtForm m={m} personId={newDebt ?? undefined} onClose={() => setNewDebt(undefined)} /> : null}
    </Screen>
  );
}

export default function PeopleScreen() {
  return <Gate>{(m) => <People m={m} />}</Gate>;
}
