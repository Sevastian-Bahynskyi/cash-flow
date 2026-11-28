import { useState } from 'react';
import { View } from 'react-native';
import { supabase } from '@/lib/supabase';
import { useStore } from '@/core/data/store';
import type { Model } from '@/core/data/model';
import type { CategoryRow, TransferPersonRow } from '@/core/data/types';
import { normalizeTransferPersonName } from '@/core/domain/rows';
import { kr, minorToInput, parseAmount } from '@/core/fmt';
import { C } from '@/ui/kit/theme';
import { Btn, Disc, Empty, Field, Header, Icon, IconBtn, List, Panel, Row, Screen, Sec, Seg, Sheet, T } from '@/ui/kit/ui';
import { Gate } from '@/ui/kit/money';
import { DeleteAsk, FormErr, IconPick, useSaver } from '@/ui/kit/forms';

// The category colour column stays filled for older clients; the app draws no category colours.
const DEFAULT_COLOR = '#7C5CFF';
const AMOUNT_ERR = 'Type an amount, like 1500 or 89,50.';
type Edit = { id: string } | { id: null; parentId: string | null };

function CategorySheet({ m, edit, budgetOf, onOpen, onClose }: { m: Model; edit: Edit; budgetOf: (id: string) => number | undefined; onOpen: (e: Edit) => void; onClose: () => void }) {
  const { userId } = useStore();
  const { busy, err, save } = useSaver();
  const c = edit.id ? m.byId.get(edit.id) ?? null : null;
  const parentId = c ? c.parent_id : edit.id === null ? edit.parentId : null;
  const parent = parentId ? m.byId.get(parentId) ?? null : null;
  const incomeParent = [...m.incomeParents][0] ?? null;
  const [kind, setKind] = useState<'expense' | 'income'>(parent && m.incomeParents.has(parent.id) ? 'income' : 'expense');
  const [name, setName] = useState(c?.name ?? '');
  const [icon, setIcon] = useState(c?.icon ?? parent?.icon ?? 'other');
  const oldBudget = c ? budgetOf(c.id) : undefined;
  const [budget, setBudget] = useState(oldBudget ? minorToInput(oldBudget) : '');
  const [e, setE] = useState<{ name?: string; budget?: string }>({});
  const [ask, setAsk] = useState(false);
  // A new top-level income category lives under the system Income parent (income is decided by the parent).
  const newParentId = parent?.id ?? (kind === 'income' ? incomeParent : null);
  const level: 1 | 2 = c ? c.level : newParentId ? 2 : 1;
  const isIncome = c ? m.incomeParents.has(c.id) || (c.parent_id !== null && m.incomeParents.has(c.parent_id)) : kind === 'income';
  const readOnly = Boolean(c?.is_system && c.level === 1);
  const override = Boolean(c?.is_system && c.level === 2);
  const hasBudget = level === 1 && !isIncome && Boolean(m.current?.real);
  const kids = c && c.level === 1 ? m.cats.filter((x) => x.parent_id === c.id) : [];
  const go = async (): Promise<void> => {
    const n = name.trim();
    const b = budget.trim() ? parseAmount(budget) : 0;
    const next: typeof e = {};
    if (!n) next.name = 'Give it a name.';
    if (hasBudget && b === null) next.budget = AMOUNT_ERR;
    setE(next);
    if (Object.keys(next).length || b === null) return;
    let id = c?.id ?? null;
    const steps: Parameters<typeof save>[1] = [];
    if (c && override) steps.push([['category_overrides'], () => supabase.from('category_overrides').upsert({ user_id: userId, category_id: c.id, name: n, icon }, { onConflict: 'user_id,category_id' })]);
    else if (c) steps.push([['categories'], () => supabase.from('categories').update({ name: n, icon }).eq('id', c.id)]);
    else steps.push([['categories'], async () => {
      const r = await supabase.from('categories').insert({ user_id: userId, parent_id: newParentId, name: n, level, is_system: false, icon, color: parent?.color ?? (newParentId ? m.byId.get(newParentId)?.color : undefined) ?? DEFAULT_COLOR }).select('id').single<{ id: string }>();
      id = r.data?.id ?? null;
      return r;
    }]);
    const cycle = m.current;
    if (hasBudget && cycle && b !== (oldBudget ?? 0)) {
      const existing = c ? m.t.budgets.find((x) => x.category_id === c.id && x.salary_cycle_id === cycle.id) : undefined;
      if (b > 0) steps.push([['budgets'], () => supabase.from('budgets').upsert({ user_id: userId, category_id: id, salary_cycle_id: cycle.id, amount_minor: b }, { onConflict: 'user_id,category_id,salary_cycle_id' })]);
      else if (existing) steps.push([['budgets'], () => supabase.from('budgets').delete().eq('id', existing.id)]);
    }
    if (await save('Category saved', steps)) onClose();
  };
  const del = async (): Promise<void> => {
    if (c && (await save(`Deleted ${c.name}`, [[['categories', 'category_overrides', 'budgets'], () => supabase.from('categories').delete().eq('id', c.id)]]))) onClose();
  };
  const kidsList = c && c.level === 1 ? (
    <View style={{ gap: 6 }}>
      <T k="meta">Subcategories</T>
      {kids.length ? <List>{kids.map((k) => <Row key={k.id} lead={<Disc icon={k.icon} />} title={k.name} end={<Icon name="chev" size={16} color={C.ink3} />} onPress={() => onOpen({ id: k.id })} />)}</List> : <Panel><Empty title="No subcategories" sub="" /></Panel>}
      <Btn kind="link" icon="add" label="Add subcategory" onPress={() => onOpen({ id: null, parentId: c.id })} />
    </View>
  ) : null;
  if (c && readOnly) return (
    <Sheet open onClose={onClose} title={c.name}>
      <View style={{ alignItems: 'center', gap: 10, paddingVertical: 12 }}><Disc icon={c.icon} /><T k="note" style={{ textAlign: 'center' }}>{c.name} is a system category. It can’t be changed or deleted.</T></View>
      {kidsList}
    </Sheet>
  );
  return (
    <Sheet open onClose={onClose} title={!c ? (parent ? 'New subcategory' : 'New category') : c.level === 2 ? 'Subcategory' : 'Edit category'}>
      {!c && !parent && incomeParent ? <Seg value={kind} onChange={setKind} options={[['expense', 'Expense'], ['income', 'Income']]} /> : null}
      <Field label="Name" value={name} onChangeText={(v) => { setName(v); setE({ ...e, name: undefined }); }} placeholder="Category name" error={e.name} />
      <IconPick value={icon} onPick={setIcon} />
      {override ? <T k="note">A system category. Your name and icon show only for you.</T> : null}
      {parent || (!c && newParentId) ? <T k="note">Part of {(parent ?? m.byId.get(newParentId ?? ''))?.name}.</T> : null}
      {hasBudget ? <Field label={`Budget for the ${m.current?.name} cycle`} keyboardType="decimal-pad" value={budget} onChangeText={(v) => { setBudget(v); setE({ ...e, budget: undefined }); }} error={e.budget} hint="Empty means no budget" /> : null}
      {level === 1 && !isIncome && !m.current?.real ? <T k="note">Add a salary to set budgets.</T> : null}
      {kidsList}
      {ask && c ? <DeleteAsk what="this category" busy={busy} onYes={() => void del()} onNo={() => setAsk(false)} /> : null}
      <FormErr err={err} />
      <Btn label="Save" busy={busy} onPress={() => void go()} />
      {c && !c.is_system && !ask ? <Btn kind="danger" label="Delete…" onPress={() => setAsk(true)} /> : null}
    </Sheet>
  );
}

export function PersonSheet({ p, onClose }: { p: TransferPersonRow | null; onClose: () => void }) {
  const { userId } = useStore();
  const { busy, err, save } = useSaver();
  const [name, setName] = useState(p?.name ?? '');
  const [nameErr, setNameErr] = useState<string | null>(null);
  const [ask, setAsk] = useState(false);
  const go = async (): Promise<void> => {
    const n = name.trim(), norm = normalizeTransferPersonName(n);
    if (!norm) { setNameErr('Give them a name.'); return; }
    const ok = await save('Saved', [[['transfer_people'], () => (p
      ? supabase.from('transfer_people').update({ name: n, normalized_name: norm, updated_at: new Date().toISOString() }).eq('id', p.id)
      : supabase.from('transfer_people').insert({ user_id: userId, name: n, normalized_name: norm }))]]);
    if (ok) onClose();
  };
  const del = async (): Promise<void> => { if (p && (await save(`Deleted ${p.name}`, [[['transfer_people'], () => supabase.from('transfer_people').delete().eq('id', p.id)]]))) onClose(); };
  return (
    <Sheet open onClose={onClose} title={p ? 'Edit person' : 'Add person'}>
      <Field label="Name" value={name} onChangeText={(v) => { setName(v); setNameErr(null); }} placeholder="Person name" error={nameErr} hint="Transfers to or from them go under Transfers." />
      {ask ? <DeleteAsk what="this person" busy={busy} onYes={() => void del()} onNo={() => setAsk(false)} /> : null}
      <FormErr err={err === 'That already exists.' ? `${name.trim()} is already in the list.` : err} />
      <Btn label="Save" busy={busy} onPress={() => void go()} />
      {p && !ask ? <Btn kind="danger" label="Delete…" onPress={() => setAsk(true)} /> : null}
    </Sheet>
  );
}

function Categories({ m }: { m: Model }) {
  const [edit, setEdit] = useState<Edit | null>(null);
  const budgets = m.current ? m.t.budgets.filter((b) => b.salary_cycle_id === m.current?.id) : [];
  const budgetOf = (id: string): number | undefined => budgets.find((b) => b.category_id === id)?.amount_minor;
  const parents = m.cats.filter((c) => c.level === 1);
  const childrenOf = (id: string): CategoryRow[] => m.cats.filter((c) => c.parent_id === id);
  const row = (c: CategoryRow, sub: boolean) => {
    const b = c.level === 1 ? budgetOf(c.id) : undefined;
    return (
      <Row key={c.id} onPress={() => setEdit({ id: c.id })} lead={<View style={{ marginLeft: sub ? 24 : 0 }}><Disc icon={c.icon} /></View>} title={c.name}
        meta={b ? `Budget ${kr(b, true)}` : c.is_system ? 'System' : undefined} end={<Icon name="chev" size={16} color={C.ink3} />} />
    );
  };
  const tree = (list: CategoryRow[]) => list.flatMap((p) => [row(p, false), ...childrenOf(p.id).map((c) => row(c, true))]);
  const exp = parents.filter((p) => !m.incomeParents.has(p.id)), inc = parents.filter((p) => m.incomeParents.has(p.id));
  return (
    <Screen header={<Header back title="Categories" right={<IconBtn name="add" label="New category" onPress={() => setEdit({ id: null, parentId: null })} />} />}>
      <Sec>Expenses</Sec>
      {exp.length ? <List>{tree(exp)}</List> : <Panel><Empty title="No expense categories yet." sub="" /></Panel>}
      <Btn kind="ghost" icon="add" label="New category" onPress={() => setEdit({ id: null, parentId: null })} />
      <Sec>Income</Sec>
      {inc.length ? <List>{tree(inc)}</List> : <Panel><Empty title="No income categories." sub="" /></Panel>}
      {edit ? <CategorySheet key={edit.id ?? `new-${edit.parentId}`} m={m} edit={edit} budgetOf={budgetOf} onOpen={setEdit} onClose={() => setEdit(null)} /> : null}
    </Screen>
  );
}

export default function CategoriesScreen() { return <Gate>{(m) => <Categories m={m} />}</Gate>; }
