import { useState } from 'react';
import { View, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { useStore } from '@/core/data/store';
import type { Model } from '@/core/data/model';
import { pot } from '@/core/data/pot';
import { kr, shortDate } from '@/core/fmt';
import { PARTNER } from '@/core/partner';
import { AuraPager } from '@/ui/aura/AuraPager';
import { C } from '@/ui/kit/theme';
import { Btn, Empty, Header, Icon, List, Panel, Press, Row, Screen, Sec, Seg, T, tap } from '@/ui/kit/ui';
import { Gate, TxRow, useDetail } from '@/ui/kit/money';

type Per = 'cycle' | 'year' | 'all';

/** The pot you share: who put in what, what you spent together, and your part, inferred from top-ups. */
function Shared({ m }: { m: Model }) {
  const open = useDetail();
  const router = useRouter();
  const store = useStore();
  const { height } = useWindowDimensions();
  const [per, setPer] = useState<Per>('cycle');
  const year = m.today.slice(0, 4);
  const rows = per === 'cycle' ? m.tx.filter(m.inCycle(m.current)) : per === 'year' ? m.tx.filter((r) => r.occurred_on.startsWith(year)) : m.tx;
  const p = pot(rows);
  const byCat = new Map<string, number>();
  for (const r of p.spentRows) { const c = m.parentOf(r.category_id); if (c) byCat.set(c.id, (byCat.get(c.id) ?? 0) + r.amount_minor); }
  const cats = [...byCat.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const max = cats[0]?.[1] ?? 1;
  const recent = [...rows].reverse().filter((r) => r.shared || r.is_shared_topup);
  const tops = [...p.topups].reverse();
  const label = per === 'cycle' ? `${m.current?.name ?? 'This'} cycle` : per === 'year' ? year : 'All time';
  const header = <Header overAura back title={`With ${PARTNER}`} sub={label} />;
  const empty = !p.totalTopupTotal && !p.sharedExpenseTotal;

  return (
    <Screen onRefresh={store.sync} pad={false} header={
      <AuraPager height={Math.round(height * 0.6)} header={header} pages={[{
        key: 'shared', mood: 'shared', label: 'The pot you share', amountMinor: p.sharedBalance,
        line: empty ? 'Nothing shared yet.' : p.sharedBalance < 0 ? 'More spent than put in.' : 'Left in the pot.',
        subline: `You put in ${kr(p.meTopupTotal, true)} · ${PARTNER} ${kr(p.gfTopupTotal, true)}`,
        bars: p.totalTopupTotal ? [{ label: 'You put in', share: p.meTopupTotal / p.totalTopupTotal }, { label: `${PARTNER} put in`, share: p.gfTopupTotal / p.totalTopupTotal }] : undefined,
      }]} />
    }>
      <View style={{ paddingHorizontal: 16, gap: 12, paddingTop: 16 }}>
        <Seg value={per} onChange={setPer} options={[['cycle', 'Cycle'], ['year', 'Year'], ['all', 'All time']]} />
        {empty ? <Panel><Empty title={`Nothing shared ${per === 'cycle' ? 'this cycle' : per === 'year' ? `in ${year}` : 'yet'}`} sub="Top-ups into the joint account and what you spend from it arrive from the bank." /></Panel> : (
          <>
            <Panel style={{ padding: 16, gap: 6 }}>
              <T>Your part of {kr(p.sharedExpenseTotal, true)} spent together is <T k="strong">{kr(p.userEffectiveShare, true)}</T></T>
              <T k="note">{p.totalTopupTotal ? `It follows what you each put in: ${p.myPct} of every 100 kr. is yours.` : 'Nothing was put in yet, so it’s split half and half.'} Nobody types a ratio.</T>
            </Panel>
            <Sec>Spent together</Sec>
            <Panel style={{ padding: 16, gap: 14 }}>{cats.length ? cats.map(([id, s]) => {
              const c = m.byId.get(id);
              const mine = (100 * s * p.userShareRatio) / max, hers = (100 * s * (1 - p.userShareRatio)) / max;
              return c ? (
                <Press key={id} scale={0.98} onPress={() => { tap(); router.push(`/activity?shared=1&cat=${id}` as never); }} style={{ gap: 6 }} accessibilityRole="button">
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><Icon name={c.icon} size={18} /><T k="strong" style={{ flex: 1 }}>{c.name}</T><T k="num">{kr(s, true)}</T></View>
                  <View style={{ flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden', backgroundColor: C.track }}>
                    <View style={{ width: `${mine}%`, backgroundColor: C.ink }} /><View style={{ width: `${hers}%`, backgroundColor: C.partner }} />
                  </View>
                </Press>
              ) : null;
            }) : <Empty title="Nothing spent together yet." sub="" />}
              {cats.length ? <View style={{ flexDirection: 'row', gap: 16 }}><T k="meta">● Your part</T><T k="meta" style={{ color: C.partner }}>● {PARTNER}’s part</T></View> : null}
            </Panel>
            <Sec>Into the pot</Sec>
            {tops.length ? <List>{tops.slice(0, 12).map((t) => (
              <Row key={t.id} onPress={() => open(t)} lead={<View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: t.shared_participant === 'gf' ? C.partner : C.ink, alignItems: 'center', justifyContent: 'center' }}><Icon name="in" color={C.bg} /></View>}
                title={t.shared_participant === 'gf' ? `${PARTNER} moved in` : 'You moved in'} meta={shortDate(t.occurred_on)} end={<T k="num">{kr(t.amount_minor, true)}</T>} />
            ))}</List> : <Panel><Empty title={`No top-ups ${per === 'cycle' ? 'this cycle' : 'yet'}.`} sub="" /></Panel>}
            <Sec right={<Btn kind="link" label="All" onPress={() => router.push('/activity?shared=1' as never)} />}>Latest together</Sec>
            {recent.length ? <List>{recent.slice(0, 8).map((t) => <TxRow key={t.id} t={t} m={m} onOpen={open} />)}</List> : <Panel><Empty title="Nothing yet." sub="" /></Panel>}
          </>
        )}
      </View>
    </Screen>
  );
}

export default function SharedScreen() {
  return <Gate>{(m) => <Shared m={m} />}</Gate>;
}
