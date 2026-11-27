import type React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, Text, View, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { qaScenario } from '@/dev/scenario';
import { useStore } from '@/core/data/store';
import type { Model } from '@/core/data/model';
import { pot } from '@/core/data/pot';
import { budgetState, goneShare } from '@/core/domain/budget-state';
import { transactionBalance } from '@/core/domain/balance';
import { kr, plus } from '@/core/fmt';
import { PARTNER } from '@/core/partner';
import { AuraPager } from '@/ui/aura/AuraPager';
import { CycleClosedMoment } from '@/ui/aura/CycleClosedMoment';
import { budgetColor, C, F } from '@/ui/kit/theme';
import { Btn, Disc, Empty, Header, List, Meter, NavRow, Panel, Row, Screen, Sec, Seg, StatePill, T, tap } from '@/ui/kit/ui';
import { Gate, SyncLine, TxRow, useDetail } from '@/ui/kit/money';
import { auraPages } from './auraPages';

const TAB_BAR = 88;
const PEEK = 72;
const CLOSED_SEEN = 'cashflow:closedCycleSeen';

function Avatar() {
  const { tables } = useStore();
  const router = useRouter();
  const p = tables?.profile;
  const initial = (p?.display_name ?? 'You').trim()[0]?.toUpperCase() ?? 'Y';
  return (
    <Pressable onPress={() => { tap(); router.push('/settings' as never); }} accessibilityRole="button" accessibilityLabel="Settings" style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
      {p?.avatar_url ? <Image source={{ uri: p.avatar_url }} style={{ width: 36, height: 36, borderRadius: 18 }} /> : (
        <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontFamily: F.strong, color: '#FFFFFF' }}>{initial}</Text></View>
      )}
    </Pressable>
  );
}

/** "Cycle closed" once for each new cycle: what the cycle before ended with, as the thermal number. */
function useClosedMoment(m: Model): [boolean, number, () => void] {
  const [open, setOpen] = useState(false);
  const c = m.current;
  const prev = m.prevOf(c);
  const kept = useMemo(() => (prev ? transactionBalance(m.tx.filter(m.inCycle(prev))) : 0), [m, prev]);
  const id = !qaScenario() && c?.real && prev?.real ? c.id : null;
  useEffect(() => {
    if (!id) return;
    AsyncStorage.getItem(CLOSED_SEEN).then((seen) => { if (seen !== id) setOpen(true); }).catch(() => undefined);
  }, [id]);
  const close = (): void => { setOpen(false); if (id) AsyncStorage.setItem(CLOSED_SEEN, id).catch(() => undefined); };
  return [open, kept, close];
}

function Home({ m }: { m: Model }) {
  const open = useDetail();
  const router = useRouter();
  const store = useStore();
  const { height } = useWindowDimensions();
  const [per, setPer] = useState<'cycle' | 'year' | 'all'>('cycle');
  const [moment, kept, closeMoment] = useClosedMoment(m);
  const { pages, currentIndex } = useMemo(() => auraPages(m), [m]);
  const pagerKey = pages.map((page) => page.key).join(':');
  const [cycleSelection, setCycleSelection] = useState<{ pagerKey: string; selectedId: string }>();
  const selectedId = cycleSelection?.pagerKey === pagerKey ? cycleSelection.selectedId : undefined;
  const c = m.cycles.find((cycle) => cycle.id === selectedId) ?? m.current;
  const isCurrent = c?.id === m.current?.id;
  const b = m.budgetsOf(c);
  const prev = m.budgetsOf(m.prevOf(c));
  const share = goneShare(m, c);
  const needs = b.list.filter((x) => x.left < 0 || budgetState(x.spent, x.amount, share) === 'ahead');
  const p = pot(b.rows);
  const latest = [...(isCurrent ? m.tx : b.rows)].reverse().slice(0, 5);
  const yearRows = m.tx.filter((r) => r.occurred_on.slice(0, 4) === m.today.slice(0, 4));
  const bal = transactionBalance(per === 'cycle' ? b.rows : per === 'year' ? yearRows : m.tx);
  const header = <Header overAura title={m.current ? 'Cycle' : 'Cashflow'} right={<Avatar />} />;

  return (
    <Screen onRefresh={store.sync} pad={false} header={pages.length ? <AuraPager key={pagerKey} pages={pages} height={height - TAB_BAR - PEEK} header={header}
      navigation={{ currentIndex, onChange: (page) => setCycleSelection({ pagerKey, selectedId: page.key }) }} /> : header}>
      <CycleClosedMoment visible={moment} keptMinor={kept} onClose={closeMoment} />
      <View style={{ paddingHorizontal: 16, gap: 12, paddingTop: 16 }}>
        <SyncLine />
        {!m.hasSalary && !m.tx.length ? (
          <Panel style={{ padding: 18, gap: 6 }}><T k="sec">Your first cycle starts on payday</T><T k="note">Cashflow counts from one salary to the next. The cycle starts when your salary arrives from the bank.</T></Panel>
        ) : null}
        <List>{[
          m.tx.length ? <NavRow key="w" href={c ? `/where?cycle=${c.id}` : '/where'} icon="where" name="Where it went" sub={`${kr(b.allMine, true)} spent${prev.allMine ? `, ${kr(Math.abs(b.allMine - prev.allMine), true)} ${b.allMine >= prev.allMine ? 'more' : 'less'} than ${m.prevOf(c)?.name}` : ''}`} /> : null,
          <NavRow key="b" href={c ? `/budgets?cycle=${c.id}` : '/budgets'} icon="budgets" name={b.list.length ? 'Budgets' : 'Set your budgets'} sub={b.list.length ? `${b.list.length} categories, ${kr(Math.abs(b.left), true)} ${b.left < 0 ? 'over' : 'left'}` : 'Then the aura shows what is left to spend'} />,
        ].filter(Boolean) as React.JSX.Element[]}</List>

        {needs.length ? (
          <>
            <Sec>Needs a look</Sec>
            <List>{needs.map((x) => (
              <Row key={x.id} onPress={() => router.push({ pathname: '/budget-detail', params: { cat: x.id, cycle: c?.id } })} lead={<Disc icon={x.cat?.icon} color={budgetColor(x.cat)} />}
                title={<View><T k="strong">{x.cat?.name}</T><Meter spent={x.spent} amount={x.amount} share={share} color={budgetColor(x.cat)} /></View>}
                meta={`${kr(x.spent, true)} of ${kr(x.amount, true)}`}
                end={<StatePill left={x.left} st={budgetState(x.spent, x.amount, share)} />} />
            ))}</List>
          </>
        ) : null}

        <Sec>Balance</Sec>
        <Panel style={{ padding: 16, gap: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <Seg value={per} onChange={setPer} options={[['cycle', 'Cycle'], ['year', 'Year'], ['all', 'All time']]} />
            <Text style={{ fontFamily: F.num, fontSize: 26, color: bal > 0 ? C.in : C.ink }}>{bal > 0 ? plus(bal, true) : kr(bal, true)}</Text>
          </View>
          <T k="note">Money in minus your spending and what you moved to the pot.</T>
        </Panel>

        <Sec>With {PARTNER}</Sec>
        {p.totalTopupTotal || p.sharedExpenseTotal ? (
          <Pressable disabled={!isCurrent} onPress={() => { tap(); router.push('/shared' as never); }} style={({ pressed }) => [{ opacity: pressed ? 0.85 : 1 }]}>
            <Panel style={{ padding: 16, gap: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}><Text style={{ fontFamily: F.num, fontSize: 40, color: C.ink }}>{kr(p.sharedBalance, true)}</Text><T k="meta">left in the pot</T></View>
              {[[`${PARTNER} moved in`, p.gfTopupTotal], ['You moved in', p.meTopupTotal], ['Spent together', p.sharedExpenseTotal], ['Your part, from what you put in', p.userEffectiveShare]].map(([k, v]) => (
                <View key={k as string} style={{ flexDirection: 'row', justifyContent: 'space-between' }}><T k="meta" style={{ fontSize: 14 }}>{k}</T><T k="num" style={{ fontSize: 14 }}>{kr(v as number, true)}</T></View>
              ))}
            </Panel>
          </Pressable>
        ) : <Panel><Empty title="Nothing in the pot this cycle" sub={`Top-ups and shared spending with ${PARTNER} show here.`} /></Panel>}

        <Sec right={isCurrent ? <Btn kind="link" label="All" onPress={() => router.push('/activity' as never)} /> : undefined}>Latest</Sec>
        {latest.length ? <List>{latest.map((t) => <TxRow key={t.id} t={t} m={m} onOpen={open} />)}</List> : <Panel><Empty title="No transactions yet" /></Panel>}
      </View>
    </Screen>
  );
}

export default function CycleScreen() {
  return <Gate>{(m) => <Home m={m} />}</Gate>;
}
