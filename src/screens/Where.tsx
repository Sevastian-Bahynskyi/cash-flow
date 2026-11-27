import { useMemo, useState } from 'react';
import { Text, View, useWindowDimensions } from 'react-native';
import Svg, { Line, Path, Text as SvgText } from 'react-native-svg';
import type { Model } from '@/core/data/model';
import type { TransactionRow } from '@/core/data/types';
import { addDays, daysBetween, kr, parseYmd, plus, shortDate, todayYmd, ymd } from '@/core/fmt';
import { C, F } from '@/ui/kit/theme';
import { Empty, Header, Icon, IconBtn, List, Panel, Row, Screen, Sec, Seg, T } from '@/ui/kit/ui';
import { Gate } from '@/ui/kit/money';

type Per = 'week' | 'cycle' | 'year';
type Win = { start: string; endEx: string; label: string; prevLabel: string; prev: { start: string; endEx: string } | null };

function windowFor(m: Model, per: Per, back: number): Win | null {
  const today = todayYmd();
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

// Five category hues for the square, from the aura moods: told apart by lightness too.
const CAT = ['#F2F2F3', '#FF7A6B', '#FFB23D', '#7B3FD6', '#16C79A'];

/** 100 dots, each one kr. in every 100 spent: the top five categories in five hues, the rest grey. */
function Waffle({ list, spent }: { list: { cat?: { id: string; name: string }; s: number }[]; spent: number }) {
  const { width } = useWindowDimensions();
  const top = list.slice(0, 5);
  const raw = top.map((x) => (100 * x.s) / spent);
  const n = raw.map(Math.floor);
  let rest = Math.round(raw.reduce((a, v) => a + v, 0)) - n.reduce((a, v) => a + v, 0);
  for (const i of raw.map((v, i) => ({ i, r: v - (n[i] ?? 0) })).sort((a, b) => b.r - a.r).map((x) => x.i)) { if (rest-- <= 0) break; n[i] = (n[i] ?? 0) + 1; }
  const cells = n.flatMap((c, i) => Array.from({ length: c }, () => i));
  const cell = Math.floor((width - 32 - 32 - 9 * 6) / 10);
  return (
    <Panel style={{ padding: 16, gap: 14 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }} accessibilityLabel={top.map((x, i) => `${x.cat?.name}: ${n[i]} of every 100 kr.`).join(', ')}>
        {Array.from({ length: 100 }, (_, k) => <View key={k} style={{ width: cell, height: cell, borderRadius: cell / 2, backgroundColor: cells[k] === undefined ? C.surface3 : CAT[cells[k] ?? 0] }} />)}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        {top.map((x, i) => <View key={x.cat?.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: CAT[i] }} /><T k="meta">{x.cat?.name} {n[i]}</T></View>)}
      </View>
    </Panel>
  );
}

function Where({ m }: { m: Model }) {
  const { width } = useWindowDimensions();
  const [per, setPer] = useState<Per>('cycle');
  const [back, setBack] = useState(0);
  const w = windowFor(m, per, back);
  const first = m.tx[0]?.occurred_on ?? todayYmd();
  const canBack = Boolean(w && w.start > first && windowFor(m, per, back + 1));
  const data = useMemo(() => {
    if (!w) return null;
    const inW = (r: TransactionRow, a: string, b: string): boolean => r.occurred_on >= a && r.occurred_on < b;
    const rows = m.tx.filter((r) => inW(r, w.start, w.endEx));
    const prevRows = w.prev ? m.tx.filter((r) => inW(r, w.prev!.start, w.prev!.endEx)) : [];
    const by = (L: TransactionRow[]): Map<string, number> => { const o = new Map<string, number>(); for (const r of L) for (const x of m.portions(r)) { const p = m.parentOf(x.category_id); if (p && x.minor) o.set(p.id, (o.get(p.id) ?? 0) + x.minor); } return o; };
    const now = by(rows), was = by(prevRows);
    const list = [...now.entries()].map(([id, s]) => ({ cat: m.byId.get(id), s, l: was.get(id) ?? 0 })).filter((x) => x.cat).sort((a, b) => b.s - a.s);
    const spent = list.reduce((a, x) => a + x.s, 0), lastSpent = [...was.values()].reduce((a, v) => a + v, 0);
    const income = rows.filter((r) => r.kind === 'income' && !m.isTransfer(r.category_id)).reduce((a, r) => a + r.amount_minor, 0);
    const moved = rows.filter((r) => r.kind === 'expense' && (r.is_shared_topup || r.movement === 'moved' || r.movement === 'topup' || m.isTransfer(r.category_id)) && r.shared_participant !== 'gf').reduce((a, r) => a + r.amount_minor, 0);
    const days = Math.max(1, daysBetween(w.start, w.endEx < addDays(todayYmd(), 1) ? w.endEx : addDays(todayYmd(), 1)));
    const run: number[] = []; let acc = 0;
    for (let i = 0; i < days; i++) { const d = addDays(w.start, i); for (const r of rows) if (r.occurred_on === d) acc += r.personal_effect_minor ?? (r.kind === 'income' ? r.amount_minor : -m.mine(r)); run.push(acc); }
    const sharedMine = rows.filter((r) => r.shared).reduce((a, r) => a + m.mine(r), 0);
    return { list, spent, lastSpent, income, moved, run, sharedMine };
  }, [m, w]);

  const seg = (
    <View style={{ gap: 10 }}>
      <Seg value={per} onChange={(k) => { setPer(k); setBack(0); }} options={[['week', 'Week'], ['cycle', 'Cycle'], ['year', 'Year']]} />
      <View style={{ flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', backgroundColor: C.surface, borderRadius: 999 }}>
        <IconBtn name="back" label="Earlier" onPress={() => { if (canBack) setBack((b) => b + 1); }} color={canBack ? C.ink : C.surface3} />
        <T k="strong">{w?.label ?? ''}</T>
        <IconBtn name="chev" label="Later" onPress={() => { if (back > 0) setBack((b) => b - 1); }} color={back > 0 ? C.ink : C.surface3} />
      </View>
    </View>
  );
  const header = <Header back title="Where it went" />;
  if (!w || !data) return <Screen header={header}>{seg}<Panel><Empty title="Nothing yet" /></Panel></Screen>;
  const { list, spent, lastSpent, income, moved, run, sharedMine } = data;
  const leftOver = income - (spent - sharedMine) - moved;
  const diff = spent - lastSpent;
  const max = Math.max(1, ...list.map((x) => Math.max(x.s, x.l)));
  const word = (v: number): string => (v > 0 ? `${kr(v, true)} more` : v < 0 ? `${kr(-v, true)} less` : 'the same');
  const top2 = list.slice(0, 2).map((x, i) => (i ? x.cat!.name.toLowerCase() : x.cat!.name));
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
          <View key={x.cat!.id} style={{ gap: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><Icon name={x.cat!.icon} size={18} /><T k="strong" style={{ flex: 1 }}>{x.cat!.name}</T><T k="num">{kr(x.s, true)}</T></View>
            <View style={{ height: 8, borderRadius: 4, backgroundColor: C.track }}>
              <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 4, width: `${(100 * Math.min(x.s, x.l || x.s)) / max}%`, backgroundColor: C.ink }} />
              {x.l && x.s > x.l ? <View style={{ position: 'absolute', top: 0, bottom: 0, borderRadius: 4, left: `${(100 * x.l) / max}%`, width: `${(100 * (x.s - x.l)) / max}%`, backgroundColor: C.over }} /> : null}
              {x.l > 0 ? <View style={{ position: 'absolute', top: -3, bottom: -3, width: 2, left: `${(100 * x.l) / max}%`, backgroundColor: C.ink3 }} /> : null}
            </View>
            {w.prev ? <T k="meta">{!x.l ? `Nothing in ${w.prevLabel}` : x.s === x.l ? `The same as ${w.prevLabel}` : `${word(x.s - x.l)} than ${w.prevLabel}, ${kr(x.l, true)}`}</T> : null}
          </View>
        ))}</Panel>
        <T k="note">Coral is more than {w.prevLabel || 'before'}; the tick is {w.prevLabel || 'the period before'}. Your part of shared expenses counts. Not counted as spending: {kr(moved, true)} moved to the pot, to savings or between accounts.</T>
      </>}
      <Sec>Money in and out</Sec>
      <List>{([['Money in', plus(income, true), C.in], ['Your spending', kr(spent, true)], ['Moved, not spent', kr(moved, true), C.ink2], ['Left over', leftOver > 0 ? plus(leftOver, true) : kr(leftOver, true)]] as [string, string, string?][]).map(([k, v, color]) => (
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
