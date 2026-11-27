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
import { budgetColor, C, F } from '@/ui/kit/theme';
import { Btn, Disc, Empty, Header, Icon, IconBtn, List, Meter, NavRow, Panel, Row, Screen, Sec, StatePill, T } from '@/ui/kit/ui';
import { BudgetEditor, Gate, RichNote, TxRow, useDetail } from '@/ui/kit/money';

function CyclePick({ m, idx, onPick }: { m: Model; idx: number; onPick: (id: string) => void }) {
  const c = m.cycles[idx];
  return (
    <Panel style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 6 }}>
      <IconBtn name="back" label="Previous cycle" disabled={idx <= 0} onPress={() => { const p = m.cycles[idx - 1]; if (p) onPick(p.id); }} />
      <View style={{ flex: 1, alignItems: 'center' }}>
        <T k="strong">{c?.name} cycle</T>
        {c ? <T k="meta">{shortDate(c.startOn)} – {shortDate(c.endInclusive)}</T> : null}
      </View>
      <IconBtn name="chev" label="Next cycle" disabled={idx >= m.cycles.length - 1} onPress={() => { const n = m.cycles[idx + 1]; if (n) onPick(n.id); }} />
    </Panel>
  );
}

/** Spent by day in one category this cycle, against the cycle before and the budget line. */
function Pace({ m, c, cat, budget }: { m: Model; c: Cycle; cat: CategoryRow; budget: number }) {
  const { width } = useWindowDimensions();
  const prev = m.prevOf(c);
  const n = daysBetween(c.startOn, c.endInclusive) + 1;
  const cum = (rows: TransactionRow[], start: string, len: number): number[] => {
    const a = new Array<number>(Math.max(0, len)).fill(0);
    for (const r of rows) { const i = daysBetween(start, r.occurred_on); if (i >= 0 && i < len) a[i] = (a[i] ?? 0) + m.spendingIn(r, cat.id); }
    for (let i = 1; i < len; i++) a[i] = (a[i] ?? 0) + (a[i - 1] ?? 0);
    return a;
  };
  const nowLen = Math.min(n, daysBetween(c.startOn, m.today < c.endInclusive ? m.today : c.endInclusive) + 1);
  const now = cum(m.tx.filter(m.inCycle(c)), c.startOn, nowLen);
  const last = prev ? cum(m.tx.filter(m.inCycle(prev)), prev.startOn, Math.min(n, daysBetween(prev.startOn, prev.endInclusive) + 1)) : [];
  const W = width - 64, H = 150, top = 14;
  const color = budgetColor(m.parentOf(cat.id));
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
        {now.length > 0 ? <Path d={`${path(now)}L${X(now.length - 1).toFixed(1)} ${H}L${X(0).toFixed(1)} ${H}Z`} fill={color} opacity={0.16} /> : null}
        {now.length > 0 ? <Path d={path(now)} fill="none" stroke={color} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" /> : null}
        {now.length > 0 ? <Circle cx={X(now.length - 1)} cy={Y(end)} r={5} fill={color} stroke={C.surface} strokeWidth={2.5} /> : null}
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

function BudgetList({ m, c, b }: { m: Model; c: Cycle; b: ReturnType<Model['budgetsOf']> }) {
  const router = useRouter();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const groups = m.cats.filter((cat) => cat.level === 1 && !m.incomeParents.has(cat.id) && !m.isTransfer(cat.id));
  const budgeted = new Map(b.list.map((item) => [item.id, item]));
  const parents = [...b.list.flatMap(({ cat }) => cat?.level === 1 ? [cat] : []), ...groups.filter((cat) => !budgeted.has(cat.id))];
  const children = new Map<string, CategoryRow[]>();
  for (const cat of m.cats) {
    if (cat.parent_id) {
      const siblings = children.get(cat.parent_id) ?? [];
      siblings.push(cat);
      children.set(cat.parent_id, siblings);
    }
  }
  const firstWithChildren = parents.find((cat) => children.has(cat.id))?.id;
  const childSpend = new Map<string, number>();
  for (const row of b.rows) {
    for (const part of m.portions(row)) {
      if (part.category_id) childSpend.set(part.category_id, (childSpend.get(part.category_id) ?? 0) + part.minor);
    }
  }
  const share = goneShare(m, c);
  const detail = (id: string): void => router.push({ pathname: '/budget-detail', params: { cat: id, cycle: c.id } });

  if (!parents.length) return <Panel><Empty title="No spending categories yet" /></Panel>;
  return (
    <View style={{ gap: 10 }}>
      {parents.map((cat) => {
        const item = budgeted.get(cat.id);
        const spent = b.spent.get(cat.id) ?? 0;
        const kids = children.get(cat.id) ?? [];
        const isOpen = kids.length > 0 && (expanded[cat.id] ?? firstWithChildren === cat.id);
        const color = budgetColor(cat);
        const subtitle = item ? `${kr(spent, true)} of ${kr(item.amount, true)}` : `${kr(spent, true)} spent`;
        const state = item ? budgetState(spent, item.amount, share) : 'none';
        const remaining = item ? `${kr(Math.abs(item.left), true)} ${item.left < 0 ? 'over' : 'left'}${state === 'ahead' ? ', ahead of pace' : ''}` : 'No budget';
        return (
          <List key={cat.id}>{[
            <Row key={cat.id} expanded={kids.length ? isOpen : undefined} accessibilityLabel={`${cat.name}, ${subtitle}, ${remaining}`}
              onPress={() => kids.length ? setExpanded((state) => ({ ...state, [cat.id]: !isOpen })) : detail(cat.id)}
              lead={<Disc icon={cat.icon} color={color} />}
              title={<View style={{ gap: 5 }}><T k="strong">{cat.name}</T>{item ? <Meter spent={spent} amount={item.amount} share={share} height={5} color={color} /> : null}</View>}
              meta={subtitle}
              end={<View style={{ alignItems: 'flex-end', gap: 4 }}>
                {item ? <StatePill left={item.left} st={state} /> : <T k="meta">No budget</T>}
                <Icon name={isOpen ? 'down' : 'chev'} size={15} color={C.ink3} />
              </View>} />,
            ...(isOpen ? kids.map((kid) => (
              <Row key={kid.id} lead={<View style={{ marginLeft: 22 }}><Disc icon={kid.icon} color={color} /></View>}
                title={kid.name} end={<T k="num">{kr(childSpend.get(kid.id) ?? 0, true)}</T>} onPress={() => detail(kid.id)} />
            )) : []),
            ...(isOpen ? [<Row key="details" title={<T k="meta" style={{ marginLeft: 22 }}>{cat.name} budget details</T>}
              end={<Icon name="chev" size={15} color={C.ink3} />} onPress={() => detail(cat.id)} />] : []),
          ]}</List>
        );
      })}
    </View>
  );
}

function Budgets({ m }: { m: Model }) {
  const params = useLocalSearchParams<{ cycle?: string; cat?: string }>();
  const router = useRouter();
  const store = useStore();
  const open = useDetail();
  const { height } = useWindowDimensions();
  const requested = m.cycles.findIndex((cycle) => cycle.id === params.cycle);
  const cycleIdx = requested >= 0 ? requested : m.cycles.findIndex((cycle) => cycle.id === m.current?.id);
  const c = m.cycles[cycleIdx] ?? null;
  const b = useMemo(() => m.budgetsOf(c), [m, c]);
  const [editing, setEditing] = useState(false);
  const sel = m.byId.get(params.cat ?? '');
  const header = <Header back title={sel?.name ?? 'Budgets'} sub={sel ? m.parentOf(sel.id)?.id !== sel.id ? m.parentOf(sel.id)?.name : 'Budget details' : undefined} />;
  if (!c || !m.hasSalary) return <Screen header={header}><Panel><Empty title="No salary yet" sub="Budgets run from payday to payday. The first cycle starts when your salary arrives from the bank." /></Panel></Screen>;

  const picker = <CyclePick m={m} idx={cycleIdx} onPick={(id) => router.setParams({ cycle: id })} />;
  if (!sel) {
    return (
      <Screen onRefresh={store.sync} header={header}>
        {picker}
        {b.list.length ? <T k="note">{kr(b.used, true)} spent of {kr(b.total, true)} budgeted</T> : <T k="note">No budgets set for this cycle.</T>}
        {c.real ? <List>{[<NavRow key="plan" href={`/budgets-plan?cycle=${c.id}`} icon="sack" name="Cycle plan" />]}</List> : null}
        <BudgetList m={m} c={c} b={b} />
      </Screen>
    );
  }

  const parent = m.parentOf(sel.id);
  const item = b.list.find((x) => x.id === sel.id);
  const prev = m.prevOf(c);
  const spent = (cycle: Cycle | null): number => m.tx.filter(m.inCycle(cycle)).reduce((sum, row) => sum + m.spendingIn(row, sel.id), 0);
  const spentSel = spent(c);
  const lastSpent = spent(prev);
  const amount = item?.amount ?? 0;
  const inCat = b.rows.filter((row) => m.spendingIn(row, sel.id) > 0).reverse();
  const st = budgetState(spentSel, amount, goneShare(m, c));
  const mood: Mood = st === 'over' ? 'over' : st === 'ahead' ? 'ahead' : 'calm';
  const line = amount ? (spentSel > amount ? `${kr(spentSel - amount, true)} over budget` : `${kr(amount - spentSel, true)} left in budget`) : 'Spent this cycle';
  const allCharges = (): void => router.push({ pathname: '/spending-transactions', params: { cat: sel.id, from: c.startOn, until: c.endOnExclusive ?? '', cycle: c.id } });

  return (
    <Screen onRefresh={store.sync} header={header}>
      {picker}
      <View style={{ borderRadius: 28, overflow: 'hidden' }}>
        <AuraPager height={Math.round(height * 0.32)} pages={[{ key: sel.id, mood, label: sel.name, amountMinor: amount ? Math.abs(amount - spentSel) : spentSel, line,
          subline: amount ? `${kr(spentSel, true)} of ${kr(amount, true)}` : parent?.id !== sel.id ? parent?.name : undefined }]} />
      </View>
      {item?.budget.notes ? <RichNote text={item.budget.notes} /> : null}
      {sel.level === 1 && c.real ? <Btn kind="ghost" icon="edit" label={item ? 'Change budget' : 'Set budget'} onPress={() => setEditing(true)} /> : null}
      {inCat.length ? <><Sec>Pace through the cycle</Sec><Pace m={m} c={c} cat={sel} budget={amount} /></> : null}
      <Sec right={inCat.length ? <Btn kind="link" label="All" onPress={allCharges} /> : undefined}>Transactions</Sec>
      {inCat.length ? <List>{inCat.slice(0, 12).map((t) => <TxRow key={t.id} t={t} m={m} onOpen={open} categoryId={sel.id} />)}</List> : <Panel><Empty title="Nothing spent here this cycle" /></Panel>}
      {editing ? <BudgetEditor cat={sel} cycle={c} budget={item?.budget} spent={spentSel} last={lastSpent} onClose={() => setEditing(false)} /> : null}
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

export function BudgetsScreen(): React.JSX.Element { return <Gate>{(m) => <Budgets m={m} />}</Gate>; }
export function PlanScreen() { return <Gate>{(m) => <Plan m={m} />}</Gate>; }
