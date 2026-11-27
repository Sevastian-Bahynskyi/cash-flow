import { useMemo, useState } from 'react';
import { Text, View, useWindowDimensions } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';
import { useStore } from '@/core/data/store';
import type { Cycle, Model } from '@/core/data/model';
import type { CategoryRow, TransactionRow } from '@/core/data/types';
import { budgetState, goneShare } from '@/core/domain/budget-state';
import { daysBetween, kr, plus, shortDate } from '@/core/fmt';
import { AuraPager } from '@/ui/aura/AuraPager';
import type { Mood } from '@/ui/aura/moods';
import { C, F } from '@/ui/kit/theme';
import { Btn, Disc, Empty, Header, IconBtn, List, Meter, NavRow, Panel, Row, Screen, Sec, StatePill, T } from '@/ui/kit/ui';
import { BudgetEditor, Gate, RichNote, TxRow, useDetail } from '@/ui/kit/money';

function CyclePick({ m, idx, onPick }: { m: Model; idx: number; onPick: (id: string) => void }) {
  const c = m.cycles[idx];
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', backgroundColor: C.surface, borderRadius: 999 }}>
      <IconBtn name="back" label="Previous cycle" onPress={() => { const p = m.cycles[idx - 1]; if (p) onPick(p.id); }} color={idx <= 0 ? C.surface3 : C.ink} />
      <T k="strong" style={{ paddingHorizontal: 4 }}>{c?.name} cycle</T>
      <IconBtn name="chev" label="Next cycle" onPress={() => { const n = m.cycles[idx + 1]; if (n) onPick(n.id); }} color={idx >= m.cycles.length - 1 ? C.surface3 : C.ink} />
    </View>
  );
}

/** Spent by day in one category this cycle, against the cycle before and the budget line. */
function Pace({ m, c, cat, budget }: { m: Model; c: Cycle; cat: CategoryRow; budget: number }) {
  const { width } = useWindowDimensions();
  const prev = m.prevOf(c);
  const n = daysBetween(c.startOn, c.endInclusive) + 1;
  const cum = (rows: TransactionRow[], start: string, len: number): number[] => {
    const a = new Array<number>(Math.max(0, len)).fill(0);
    for (const r of rows) { const i = daysBetween(start, r.occurred_on); if (i >= 0 && i < len && m.parentOf(r.category_id)?.id === cat.id) a[i] = (a[i] ?? 0) + m.mine(r); }
    for (let i = 1; i < len; i++) a[i] = (a[i] ?? 0) + (a[i - 1] ?? 0);
    return a;
  };
  const nowLen = Math.min(n, daysBetween(c.startOn, m.today < c.endInclusive ? m.today : c.endInclusive) + 1);
  const now = cum(m.tx.filter(m.inCycle(c)), c.startOn, nowLen);
  const last = prev ? cum(m.tx.filter(m.inCycle(prev)), prev.startOn, Math.min(n, daysBetween(prev.startOn, prev.endInclusive) + 1)) : [];
  const W = width - 64, H = 150, top = 14;
  const max = Math.max(budget, now.at(-1) ?? 0, last.at(-1) ?? 0, 1) * 1.08;
  const X = (i: number): number => ((W - 4) * (i + 1)) / n;
  const Y = (v: number): number => top + (H - top) * (1 - v / max);
  const path = (a: number[]): string => a.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(v).toFixed(1)}`).join('');
  const end = now.at(-1) ?? 0;
  return (
    <Panel style={{ padding: 16, gap: 10 }}>
      <Svg width={W} height={H + 22} accessibilityLabel={`${cat.name}: spent by day this cycle against the cycle before and the budget`}>
        <Line x1={0} x2={W - 4} y1={H} y2={H} stroke={C.line} />
        {budget > 0 ? <Line x1={0} x2={W - 4} y1={Y(budget)} y2={Y(budget)} stroke={C.ink2} strokeWidth={1.4} strokeDasharray="5 5" /> : null}
        {budget > 0 ? <SvgText x={0} y={Y(budget) - 6} fontSize={11} fill={C.ink2}>{`Budget ${kr(budget, true)}`}</SvgText> : null}
        {last.length > 0 ? <Path d={path(last)} fill="none" stroke={C.ink3} strokeWidth={2} opacity={0.6} /> : null}
        {now.length > 0 ? <Path d={`${path(now)}L${X(now.length - 1).toFixed(1)} ${H}L${X(0).toFixed(1)} ${H}Z`} fill={C.ink} opacity={0.1} /> : null}
        {now.length > 0 ? <Path d={path(now)} fill="none" stroke={C.ink} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" /> : null}
        {now.length > 0 ? <Circle cx={X(now.length - 1)} cy={Y(end)} r={5} fill={C.ink} stroke={C.surface} strokeWidth={2.5} /> : null}
        <SvgText x={0} y={H + 17} fontSize={11} fill={C.ink3}>{shortDate(c.startOn)}</SvgText>
        <SvgText x={W - 4} y={H + 17} fontSize={11} fill={C.ink3} textAnchor="end">{shortDate(c.endInclusive)}</SvgText>
      </Svg>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14 }}>
        <T k="meta">This cycle <T k="strong" style={{ fontSize: 13 }}>{kr(end, true)}</T></T>
        {prev ? <T k="meta">{prev.name} <T k="strong" style={{ fontSize: 13 }}>{kr(last.at(-1) ?? 0, true)}</T></T> : null}
      </View>
    </Panel>
  );
}

function Budgets({ m }: { m: Model }) {
  const params = useLocalSearchParams<{ cycle?: string; cat?: string }>();
  const router = useRouter();
  const store = useStore();
  const open = useDetail();
  const { height } = useWindowDimensions();
  const cycleIdx = (() => { const i = m.cycles.findIndex((c) => c.id === params.cycle); return i >= 0 ? i : m.cycles.findIndex((c) => c.id === m.current?.id); })();
  const c = m.cycles[cycleIdx] ?? null;
  const b = useMemo(() => m.budgetsOf(c), [m, c]);
  const prevB = useMemo(() => m.budgetsOf(m.prevOf(c)), [m, c]);
  const parents = m.cats.filter((x) => x.level === 1 && !m.incomeParents.has(x.id) && !m.isTransfer(x.id));
  const sel = m.byId.get(params.cat ?? '') ?? b.list[0]?.cat ?? parents[0];
  const [editing, setEditing] = useState<CategoryRow | null>(null);
  const go = (q: Record<string, string>): void => router.setParams(q);
  const header = <Header back title="Budgets" sub={b.list.length ? `${kr(Math.abs(b.left), true)} ${b.left < 0 ? 'over' : 'left'} across ${b.list.length}` : undefined} />;
  if (!c || !m.hasSalary) return <Screen header={header}><Panel><Empty title="No salary yet" sub="Budgets run from payday to payday. The first cycle starts when your salary arrives from the bank." /></Panel></Screen>;

  const item = sel ? b.list.find((x) => x.id === sel.id) : undefined;
  const spentSel = sel ? b.spent.get(sel.id) ?? 0 : 0;
  const amount = item?.amount ?? 0;
  const inCat = sel ? b.rows.filter((r) => m.parentOf(r.category_id)?.id === sel.id && r.kind === 'expense' && !r.is_shared_topup).reverse() : [];
  const lastSpent = sel ? prevB.spent.get(sel.id) ?? 0 : 0;
  const isCurrent = c.id === m.current?.id;
  const days = isCurrent ? m.daysLeft : 0;
  const share = goneShare(m, c);
  const st = budgetState(spentSel, amount, share);
  const kept = c.real && amount > 0 && spentSel <= amount && m.today > c.endInclusive;
  const mood: Mood = st === 'over' ? 'over' : st === 'ahead' ? 'ahead' : 'calm';
  const unbudgeted = parents.filter((p) => !b.list.some((x) => x.id === p.id));
  const line = !spentSel ? 'Nothing spent here yet.' : !amount ? 'No budget set.' : st === 'over' ? `${kr(spentSel - amount, true)} over${days ? ` with ${days} days to payday` : ''}.` : kept ? `Kept. ${kr(amount - spentSel, true)} left at payday.` : `${kr(amount - spentSel, true)} left${days ? ` for ${days} days` : ''}${st === 'ahead' ? ', ahead of the days' : ''}.`;

  const row = (cat: CategoryRow) => {
    const x = b.list.find((y) => y.id === cat.id);
    const s = b.spent.get(cat.id) ?? 0;
    return (
      <Row key={cat.id} selected={sel?.id === cat.id} onPress={() => go({ cat: cat.id })} lead={<Disc icon={cat.icon} />}
        title={<View><T k="strong" numberOfLines={1}>{cat.name}</T>{x ? <Meter spent={s} amount={x.amount} share={share} /> : null}</View>}
        meta={x ? `${kr(s, true)} of ${kr(x.amount, true)}` : s ? `${kr(s, true)} spent` : undefined}
        end={x ? <StatePill left={x.left} st={budgetState(s, x.amount, share)} /> : <T k="meta">No budget</T>} />
    );
  };

  return (
    <Screen onRefresh={store.sync} header={header}>
      <CyclePick m={m} idx={cycleIdx} onPick={(id) => go({ cycle: id })} />
      <List>{[<NavRow key="p" href={`/budgets-plan?cycle=${c.id}`} icon="sack" name="Cycle plan" sub={`Salary ${kr(b.salary, true)}${b.list.length ? `, ${kr(Math.max(0, b.salary - b.total), true)} to save if every budget is spent` : ''}`} />]}</List>
      {!c.real ? <T k="note">This stretch is before your first salary, so it can’t hold budgets.</T> : null}
      {sel ? (
        <View style={{ borderRadius: 28, overflow: 'hidden' }}>
          <AuraPager height={Math.round(height * 0.42)} pages={[{ key: sel.id, mood, label: sel.name, amountMinor: amount ? amount - spentSel : spentSel, line, subline: amount ? `${kr(spentSel, true)} of ${kr(amount, true)} · ${m.prevOf(c)?.name ?? 'Before'}: ${kr(lastSpent, true)}` : 'spent this cycle' }]} />
        </View>
      ) : null}
      {sel && item?.budget.notes ? <RichNote text={item.budget.notes} /> : null}
      {sel && c.real ? <Btn kind="ghost" icon="edit" label={item ? 'Change budget' : 'Set budget'} onPress={() => setEditing(sel)} /> : null}
      {sel ? <><Sec>Pace through the cycle</Sec>{inCat.length ? <Pace m={m} c={c} cat={sel} budget={amount} /> : <Panel><Empty title={`No ${sel.name.toLowerCase()} yet this cycle`} sub="The pace line starts with the first one." /></Panel>}</> : null}
      {sel ? <>
        <Sec right={inCat.length ? <Btn kind="link" label="All" onPress={() => router.push(`/activity?cat=${sel.id}` as never)} /> : undefined}>In {sel.name.toLowerCase()} this cycle</Sec>
        {inCat.length ? <List>{inCat.slice(0, 12).map((t) => <TxRow key={t.id} t={t} m={m} onOpen={open} />)}</List> : <Panel><Empty title="Nothing here yet." sub="" /></Panel>}
      </> : null}
      <Sec>All budgets</Sec>
      <List>{[...b.list.map((x) => row(x.cat as CategoryRow)), ...unbudgeted.map(row)]}</List>
      {b.list.length ? <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 4 }}><T k="note">All budgets</T><T k="note">{kr(b.used, true)} of {kr(b.total, true)}</T></View> : null}
      {editing ? <BudgetEditor cat={editing} cycle={c} budget={b.list.find((x) => x.id === editing.id)?.budget} spent={b.spent.get(editing.id) ?? 0} last={prevB.spent.get(editing.id) ?? 0} onClose={() => setEditing(null)} /> : null}
    </Screen>
  );
}

/** The cycle budget check: salary, all budgets, and what is really left to save. */
function Plan({ m }: { m: Model }) {
  const params = useLocalSearchParams<{ cycle?: string }>();
  const router = useRouter();
  const idx = (() => { const i = m.cycles.findIndex((c) => c.id === params.cycle); return i >= 0 ? i : m.cycles.findIndex((c) => c.id === m.current?.id); })();
  const c = m.cycles[idx] ?? null;
  const b = m.budgetsOf(c);
  const [editing, setEditing] = useState<CategoryRow | null>(null);
  const header = <Header back title="Cycle plan" />;
  if (!c) return <Screen header={header}><Panel><Empty title="No salary yet" sub="The plan starts with your first salary." /></Panel></Screen>;
  const ifAll = b.salary - b.total;
  const real = b.salary - b.allMine;
  const flow: [string, string, string?][] = [['Money in', plus(b.income, true), C.in], ['If every budget is fully spent', ifAll < 0 ? kr(ifAll, true) : `${kr(ifAll, true)} to save`], ['Real available to save, after what you spent', kr(real, true), real < 0 ? C.over : undefined]];
  return (
    <Screen header={header}>
      <CyclePick m={m} idx={idx} onPick={(id) => router.setParams({ cycle: id })} />
      <View style={{ flexDirection: 'row', gap: 12 }}>
        {[[kr(b.salary, true), 'Salary this cycle'], [kr(b.total, true), 'All budgets']].map(([v, k]) => (
          <Panel key={k} style={{ flex: 1, padding: 16, gap: 2 }}><Text style={{ fontFamily: F.num, fontSize: 30, color: C.ink }} adjustsFontSizeToFit numberOfLines={1}>{v}</Text><T k="meta">{k}</T></Panel>
        ))}
      </View>
      <Sec>Cycle budget check</Sec>
      <List>{flow.map(([k, v, color]) => <Row key={k} title={<T style={{ flexShrink: 1 }}>{k}</T>} end={<T k="num" style={color ? { color } : undefined}>{v}</T>} />)}</List>
      <T k="note">Your spending counts your part of shared expenses. Money moved to the pot doesn’t count.</T>
      <Sec>Used categories with no budget</Sec>
      {b.unbudgeted.length ? <List>{b.unbudgeted.map((x) => (
        <Row key={x.cat.id} disabled={!c.real} onPress={() => setEditing(x.cat)} lead={<Disc icon={x.cat.icon} />} title={x.cat.name} meta={`${kr(x.spent, true)} spent`} end={<T k="strong">Set</T>} />
      ))}</List> : <Panel><Empty title="All used categories have a budget." sub="" /></Panel>}
      {editing ? <BudgetEditor cat={editing} cycle={c} spent={b.spent.get(editing.id) ?? 0} last={m.budgetsOf(m.prevOf(c)).spent.get(editing.id) ?? 0} onClose={() => setEditing(null)} /> : null}
    </Screen>
  );
}

export function BudgetsScreen() { return <Gate>{(m) => <Budgets m={m} />}</Gate>; }
export function PlanScreen() { return <Gate>{(m) => <Plan m={m} />}</Gate>; }
