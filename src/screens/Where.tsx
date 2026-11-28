import { useMemo, useState } from 'react';
import { Text, View, useWindowDimensions } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Svg, { Line, Path, Text as SvgText } from 'react-native-svg';
import type { Model } from '@/core/data/model';
import type { TransactionRow } from '@/core/data/types';
import { addDays, daysBetween, kr, parseYmd, plus, shortDate, todayYmd, ymd } from '@/core/fmt';
import { budgetColor, C, F } from '@/ui/kit/theme';
import { Empty, Header, Icon, IconBtn, List, Panel, Row, Screen, Sec, Seg, T } from '@/ui/kit/ui';
import { Gate } from '@/ui/kit/money';

type Per = 'week' | 'cycle' | 'year';
type Win = { start: string; endEx: string; label: string; prevLabel: string; prev: { start: string; endEx: string } | null };

function windowFor(m: Model, per: Per, back: number): Win | null {
  const today = m.today;
  if (per === 'cycle') {
    const i = m.cycles.findIndex((c) => c.id === m.current?.id) - back;
    const c = m.cycles[i], p = m.cycles[i - 1];
    if (!c) return null;
    return { start: c.startOn, endEx: c.endOnExclusive ?? addDays(today, 1), label: `${c.name} cycle`, prevLabel: p ? p.name : '', prev: p ? { start: p.startOn, endEx: p.endOnExclusive ?? c.startOn } : null };
  }
  if (per === 'week') {
    const d = parseYmd(today); const mon = addDays(today, -((d.getDay() + 6) % 7) - 7 * back);
    return { start: mon, endEx: addDays(mon, 7), label: back === 0 ? 'This week' : `Week of ${shortDate(mon)}`, prevLabel: 'the week before', prev: { start: addDays(mon, -7), endEx: mon } };
  }
  const y = parseYmd(today).getFullYear() - back;
  return { start: `${y}-01-01`, endEx: `${y + 1}-01-01`, label: String(y), prevLabel: String(y - 1), prev: { start: `${y - 1}-01-01`, endEx: `${y}-01-01` } };
}

type Spending = { id: string; name: string; icon: string | undefined; color: string; s: number; l: number };

/** 100 dots, each one kr. in every 100 spent: the top five categories in five hues, the rest grey. */
function Waffle({ list, spent }: { list: Spending[]; spent: number }) {
  const { width } = useWindowDimensions();
  const top = list.slice(0, 5);
  const raw = top.map((x) => (100 * x.s) / spent);
  const n = raw.map(Math.floor);
  let rest = Math.round(raw.reduce((a, v) => a + v, 0)) - n.reduce((a, v) => a + v, 0);
  for (const i of raw.map((v, i) => ({ i, r: v - (n[i] ?? 0) })).sort((a, b) => b.r - a.r).map((x) => x.i)) { if (rest-- <= 0) break; n[i] = (n[i] ?? 0) + 1; }
  const cells = n.flatMap((c, i) => Array.from({ length: c }, () => top[i]?.color ?? C.ink3));
  const cell = Math.floor((width - 32 - 32 - 9 * 6) / 10);
  return (
    <Panel style={{ padding: 16, gap: 14 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }} accessibilityLabel={top.map((x, i) => `${x.name}: ${n[i]} of every 100 kr.`).join(', ')}>
        {Array.from({ length: 100 }, (_, k) => <View key={k} style={{ width: cell, height: cell, borderRadius: cell / 2, backgroundColor: cells[k] ?? C.surface3 }} />)}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        {top.map((x, i) => <View key={x.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: x.color }} /><T k="meta">{x.name} {n[i]}</T></View>)}
      </View>
    </Panel>
  );
}

function Where({ m }: { m: Model }) {
  const { width } = useWindowDimensions();
  const router = useRouter();
  const params = useLocalSearchParams<{ cycle?: string }>();
  const [per, setPer] = useState<Per>('cycle');
  const [back, setBack] = useState(() => {
    const current = m.cycles.findIndex((cycle) => cycle.id === m.current?.id);
    const requested = m.cycles.findIndex((cycle) => cycle.id === params.cycle);
    return requested >= 0 ? Math.max(0, current - requested) : 0;
  });
  const w = useMemo(() => windowFor(m, per, back), [m, per, back]);
  const first = m.tx[0]?.occurred_on ?? todayYmd();
  const canBack = Boolean(w && w.start > first && windowFor(m, per, back + 1));
  const data = useMemo(() => {
    if (!w) return null;
    const inW = (r: TransactionRow, a: string, b: string): boolean => r.occurred_on >= a && r.occurred_on < b;
    const rows = m.tx.filter((r) => inW(r, w.start, w.endEx));
    const prevRows = w.prev ? m.tx.filter((r) => inW(r, w.prev!.start, w.prev!.endEx)) : [];
    const by = (transactions: TransactionRow[]): Map<string, number> => {
      const sums = new Map<string, number>();
      for (const row of transactions) {
        for (const part of m.portions(row)) {
          if (!part.minor) continue;
          const id = m.parentOf(part.category_id)?.id ?? 'uncategorized';
          sums.set(id, (sums.get(id) ?? 0) + part.minor);
        }
      }
      return sums;
    };
    const now = by(rows), was = by(prevRows);
    const list = [...now.entries()].map(([id, s]) => {
      const cat = m.byId.get(id);
      return { id, name: cat?.name ?? 'Uncategorized', icon: cat?.icon, color: budgetColor(cat), s, l: was.get(id) ?? 0 };
    }).sort((a, b) => b.s - a.s);
    const spent = list.reduce((a, x) => a + x.s, 0), lastSpent = [...was.values()].reduce((a, v) => a + v, 0);
    // Money in: income that isn't a transfer, a top-up or part of a debt.
    const inn = (r: TransactionRow): boolean => r.kind === 'income' && !r.is_shared_topup && !m.linked.has(r.id) && !m.isTransfer(r.category_id);
    // What you put in the pot: the joint account's side of your top-up (the personal side is the same money).
    const potIn = (r: TransactionRow): boolean => r.is_shared_topup && r.kind === 'expense' && r.shared_participant !== 'gf';
    // Your spending outside the pot: the pot already paid your share of shared purchases.
    const own = (r: TransactionRow): number => m.portions(r).reduce((a, p) => a + (p.shared ? 0 : p.minor), 0);
    const income = rows.filter(inn).reduce((a, r) => a + r.amount_minor, 0);
    const moved = rows.filter(potIn).reduce((a, r) => a + r.amount_minor, 0);
    const days = Math.max(1, daysBetween(w.start, w.endEx < addDays(todayYmd(), 1) ? w.endEx : addDays(todayYmd(), 1)));
    const run: number[] = []; let acc = 0;
    const byDay = new Map<string, number>();
    for (const r of rows) byDay.set(r.occurred_on, (byDay.get(r.occurred_on) ?? 0) + (inn(r) ? r.amount_minor : potIn(r) ? -r.amount_minor : -own(r)));
    for (let i = 0; i < days; i++) { acc += byDay.get(addDays(w.start, i)) ?? 0; run.push(acc); }
    const sharedMine = rows.reduce((a, r) => a + m.portions(r).reduce((b, p) => b + (p.shared ? p.minor : 0), 0), 0);
    return { list, spent, lastSpent, income, moved, run, sharedMine };
  }, [m, w]);

  const seg = (
    <View style={{ gap: 10 }}>
      <Seg value={per} onChange={(k) => { setPer(k); setBack(0); }} options={[['week', 'Week'], ['cycle', 'Cycle'], ['year', 'Year']]} />
      <View style={{ flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', backgroundColor: C.surface, borderRadius: 999 }}>
        <IconBtn name="back" label="Earlier" onPress={() => setBack((b) => b + 1)} disabled={!canBack} />
        <T k="strong">{w?.label ?? ''}</T>
        <IconBtn name="chev" label="Later" onPress={() => setBack((b) => b - 1)} disabled={back === 0} />
      </View>
    </View>
  );
  const header = <Header back title="Where it went" right={<IconBtn name="map" label="Spending map" onPress={() => router.push(w ? { pathname: '/map', params: { from: w.start, until: w.endEx } } : '/map')} />} />;
  if (!w || !data) return <Screen header={header}>{seg}<Panel><Empty title="Nothing yet" /></Panel></Screen>;
  const { list, spent, lastSpent, income, moved, run, sharedMine } = data;
  const leftOver = income - (spent - sharedMine) - moved;
  const diff = spent - lastSpent;
  const max = Math.max(1, ...list.map((x) => Math.max(x.s, x.l)));
  const word = (v: number): string => (v > 0 ? `${kr(v, true)} more` : v < 0 ? `${kr(-v, true)} less` : 'the same');
  const top2 = list.slice(0, 2).map((x, i) => (i ? x.name.toLowerCase() : x.name));
  const W = width - 64, H = 110, mn = Math.min(0, ...run), mx = Math.max(1, ...run);
  const X = (i: number): number => (run.length < 2 ? W / 2 : 4 + ((W - 8) * i) / (run.length - 1));
  const Y = (v: number): number => 6 + (H - 12) * (1 - (v - mn) / (mx - mn || 1));
  return (
    <Screen header={header}>
      {seg}
      {!spent ? <Panel><Empty title={`Nothing spent in ${w.label}`} sub={w.prev ? `The comparison with ${w.prevLabel} starts with the first transaction.` : ''} /></Panel> : <>
        <Text style={{ fontFamily: F.title, fontSize: 26, lineHeight: 31, color: C.ink, marginTop: 6 }}>{top2.join(' and ')} took most of it.{w.prev && lastSpent ? ` ${kr(Math.abs(diff), true)} ${diff >= 0 ? 'more' : 'less'} than ${w.prevLabel} in all.` : ''}</Text>
        <T k="note">{kr(spent, true)} spent{w.prev ? `, ${kr(lastSpent, true)} in ${w.prevLabel}` : ''}.</T>
        <Waffle list={list} spent={spent} />
        <Panel style={{ padding: 16, gap: 16 }}>{list.map((x) => (
          <View key={x.id} style={{ gap: 6 }}>
            <Row lead={<Icon name={x.icon} size={20} color={x.color} />}
              title={x.name} end={<View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><T k="num">{kr(x.s, true)}</T><Icon name="chev" size={15} color={C.ink3} /></View>}
              onPress={() => router.push({ pathname: '/spending-transactions', params: { cat: x.id, from: w.start, until: w.endEx } })} />
            <View style={{ height: 8, borderRadius: 4, backgroundColor: C.track }}>
              <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 4, width: `${(100 * x.s) / max}%`, backgroundColor: x.color }} />
              {x.l > 0 ? <View style={{ position: 'absolute', top: -3, bottom: -3, width: 2, left: `${(100 * x.l) / max}%`, backgroundColor: C.ink3 }} /> : null}
            </View>
            {w.prev ? <T k="meta">{!x.l ? `Nothing in ${w.prevLabel}` : x.s === x.l ? `The same as ${w.prevLabel}` : `${word(x.s - x.l)} than ${w.prevLabel}, ${kr(x.l, true)}`}</T> : null}
          </View>
        ))}</Panel>
        <T k="note">The tick shows {w.prevLabel || 'the period before'}. Your share of shared purchases counts.</T>
      </>}
      <Sec>Money in and out</Sec>
      <List>{([['Money in', plus(income, true), C.in], ['Spent from your own accounts', kr(spent - sharedMine, true)], ['Put in the pot', kr(moved, true)], ['Left over', leftOver > 0 ? plus(leftOver, true) : kr(leftOver, true)]] as [string, string, string?][]).map(([k, v, color]) => (
        <Row key={k} title={<T>{k}</T>} end={<T k="num" style={color ? { color } : undefined}>{v}</T>} />
      ))}</List>
      {run.length > 1 ? (
        <Panel style={{ padding: 16, gap: 8 }}>
          <Svg width={W} height={H + 18} accessibilityLabel={`Cash position through ${w.label}`}>
            <Line x1={0} x2={W} y1={Y(0)} y2={Y(0)} stroke={C.line} />
            <Path d={run.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(v).toFixed(1)}`).join('')} fill="none" stroke={C.ink} strokeWidth={2.2} strokeLinejoin="round" />
            <SvgText x={0} y={H + 14} fontSize={10} fill={C.ink3}>{shortDate(w.start)}</SvgText>
            <SvgText x={W} y={H + 14} fontSize={10} fill={C.ink3} textAnchor="end">{shortDate(ymd(new Date(Math.min(parseYmd(addDays(w.endEx, -1)).getTime(), Date.now()))))}</SvgText>
          </Svg>
          <T k="meta">Cash position through the period</T>
        </Panel>
      ) : null}
    </Screen>
  );
}

export default function WhereScreen() { return <Gate>{(m) => <Where m={m} />}</Gate>; }
