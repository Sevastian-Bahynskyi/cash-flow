import { useState } from 'react';
import { TextInput, View } from 'react-native';
import { supabase } from '@/lib/supabase';
import { useStore } from '@/core/data/store';
import type { Model } from '@/core/data/model';
import type { MerchantRuleRow } from '@/core/data/types';
import { findSharedTopupCategoryOption, isAllowedIncomeCategoryOption, isIncomeCategoryOption } from '@/core/domain/category-rules';
import { normalizeMerchantLookupKey } from '@/core/domain/merchant';
import { C, F } from '@/ui/kit/theme';
import { Btn, Disc, Empty, Field, Header, Icon, IconBtn, List, Panel, Row, Screen, Seg, Sheet, T } from '@/ui/kit/ui';
import { Gate } from '@/ui/kit/money';
import { DeleteAsk, FormErr, Toggle, useSaver } from '@/ui/kit/forms';

type Kind = 'expense' | 'income';
type Match = MerchantRuleRow['match_type'];
type Draft = { pattern: string; match: Match; kind: Kind; cat: string | null; block: boolean; topup: boolean; note: string };
const MATCH: Record<Match, string> = { exact: 'Is exactly', prefix: 'Starts with', contains: 'Contains', regex: 'Matches a pattern' };
const whatOf = (r: MerchantRuleRow, m: Model): string => (r.is_blocked ? 'No suggestions' : r.is_shared_topup ? 'Top-up to the pot' : m.meta[r.category_id ?? '']?.name ?? 'Category');
const iconOf = (r: MerchantRuleRow, m: Model): string => (r.is_blocked ? 'close' : r.is_shared_topup ? 'moved' : m.meta[r.category_id ?? '']?.icon ?? 'other');

function RuleSheet({ m, rule, onClose }: { m: Model; rule: MerchantRuleRow | null; onClose: () => void }) {
  const { userId } = useStore();
  const { busy, err, save } = useSaver();
  const [d, setD] = useState<Draft>({ pattern: rule?.pattern ?? '', match: rule?.match_type ?? 'exact', kind: rule?.kind ?? 'expense', cat: rule?.category_id ?? null, block: rule?.is_blocked ?? false, topup: rule?.is_shared_topup ?? false, note: rule?.notes ?? '' });
  const [e, setE] = useState<{ pattern?: string; cat?: string }>({});
  const [ask, setAsk] = useState(false);
  const set = (p: Partial<Draft>): void => setD((x) => ({ ...x, ...p }));
  const topup = d.kind === 'expense' && d.topup;
  const options = m.options.filter((o) => (d.kind === 'income' ? isAllowedIncomeCategoryOption(o) : !isIncomeCategoryOption(o)));
  const go = async (): Promise<void> => {
    // Rules match the normalized merchant key, so store the pattern the same way.
    const pattern = normalizeMerchantLookupKey(d.pattern) || d.pattern.trim().toLowerCase();
    const topupCat = topup ? findSharedTopupCategoryOption(m.options)?.id ?? null : null;
    const cat = d.block ? null : topup ? topupCat : d.cat;
    const next: typeof e = {};
    if (pattern.length < 2) next.pattern = 'Type at least two letters of the merchant’s name.';
    if (!d.block && !cat) next.cat = topup ? 'There is no Top up category to put it in.' : 'Pick a category.';
    setE(next);
    if (Object.keys(next).length) return;
    const fields = { kind: d.kind, match_type: d.match, pattern, canonical_merchant: pattern, category_id: cat, is_blocked: d.block, is_shared_topup: topup, notes: d.note.trim() || null, updated_at: new Date().toISOString() };
    const ok = await save('Rule saved', [[['merchant_category_rules'], () => (rule
      ? supabase.from('merchant_category_rules').update(fields).eq('id', rule.id)
      : supabase.from('merchant_category_rules').upsert({ user_id: userId, match_target: 'normalized_merchant', priority: 300, source: 'manual', ...fields }, { onConflict: 'user_id,kind,match_target,match_type,pattern' }))]]);
    if (ok) onClose();
  };
  const del = async (): Promise<void> => { if (rule && (await save('Rule deleted', [[['merchant_category_rules'], () => supabase.from('merchant_category_rules').delete().eq('id', rule.id)]]))) onClose(); };
  return (
    <Sheet open onClose={onClose} title={rule ? 'Edit rule' : 'New rule'}>
      <Field label="Merchant name" value={d.pattern} onChangeText={(v) => { set({ pattern: v }); setE({ ...e, pattern: undefined }); }} placeholder="for example netto" autoCapitalize="none" autoCorrect={false} hint="Matched without caring about capitals" error={e.pattern} />
      <T k="meta">Match when the name</T>
      <Seg value={d.match} onChange={(v) => set({ match: v })} options={[['exact', 'Is exactly'], ['prefix', 'Starts with'], ['contains', 'Contains']]} />
      <T k="meta">Type</T>
      <Seg value={d.kind} onChange={(v) => set({ kind: v, cat: null, topup: false })} options={[['expense', 'Expense'], ['income', 'Income']]} />
      <Panel>
        <Toggle on={d.block} onChange={(v) => { set({ block: v }); setE({ ...e, cat: undefined }); }} label="Don’t suggest a category" sub="No suggestion for this merchant" />
        {d.kind === 'expense' ? <Toggle on={d.topup} onChange={(v) => { set({ topup: v }); setE({ ...e, cat: undefined }); }} label="It’s a top-up to the pot" sub="Counted as money moved, not spending" /> : null}
      </Panel>
      {!d.block && !topup ? (
        <>
          <T k="meta">Category</T>
          <List>{options.map((o) => <Row key={o.id} selected={d.cat === o.id} lead={<Disc icon={o.icon} />} title={o.name} meta={o.parentId !== o.id ? o.parentName : undefined} end={d.cat === o.id ? <Icon name="check" strong /> : undefined} onPress={() => { set({ cat: o.id }); setE({ ...e, cat: undefined }); }} />)}</List>
        </>
      ) : null}
      {e.cat ? <T k="note" style={{ color: C.over }}>{e.cat}</T> : null}
      <Field label="Note" value={d.note} onChangeText={(v) => set({ note: v })} placeholder="Optional" multiline />
      {ask ? <DeleteAsk what="this rule" busy={busy} onYes={() => void del()} onNo={() => setAsk(false)} /> : null}
      <FormErr err={err === 'That already exists.' ? 'A rule for this name already exists.' : err} />
      <Btn label="Save" busy={busy} onPress={() => void go()} />
      {rule && !ask ? <Btn kind="danger" label="Delete…" onPress={() => setAsk(true)} /> : null}
    </Sheet>
  );
}

function Rules({ m }: { m: Model }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<MerchantRuleRow | 'new' | null>(null);
  const rules = m.t.merchant_category_rules;
  const s = q.trim().toLowerCase();
  const list = s ? rules.filter((r) => `${r.pattern} ${whatOf(r, m)} ${m.meta[r.category_id ?? '']?.label ?? ''} ${r.kind}`.toLowerCase().includes(s)) : rules;
  return (
    <Screen header={<Header back title="Merchant rules" sub="A rule always wins over a suggestion" right={<IconBtn name="add" label="New rule" onPress={() => setOpen('new')} />} />}>
      {rules.length > 0 ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.surface, borderRadius: 16, paddingHorizontal: 14 }}>
          <Icon name="search" size={18} color={C.ink3} />
          <TextInput value={q} onChangeText={setQ} placeholder="Search" placeholderTextColor={C.ink3} style={{ flex: 1, minHeight: 48, color: C.ink, fontFamily: F.body, fontSize: 16 }} autoCorrect={false} autoCapitalize="none" />
        </View>
      ) : null}
      {list.length ? <List>{list.map((r) => <Row key={r.id} onPress={() => setOpen(r)} lead={<Disc icon={iconOf(r, m)} />} title={r.pattern} meta={`${MATCH[r.match_type]}, then ${whatOf(r, m)}${r.kind === 'income' ? ', income' : ''}`} end={<Icon name="chev" size={16} color={C.ink3} />} />)}</List>
        : s ? <Panel><Empty title="No rule matches" sub="Try part of the merchant name." /></Panel>
        : <Panel><Empty title="No rules yet" sub="Make one from any transaction, or here." /><View style={{ padding: 12 }}><Btn icon="add" label="Add rule" onPress={() => setOpen('new')} /></View></Panel>}
      {open ? <RuleSheet key={open === 'new' ? 'new' : open.id} m={m} rule={open === 'new' ? null : open} onClose={() => setOpen(null)} /> : null}
    </Screen>
  );
}

export default function RulesScreen() { return <Gate>{(m) => <Rules m={m} />}</Gate>; }
