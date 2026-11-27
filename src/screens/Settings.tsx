import { useState } from 'react';
import { Image, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Sharing from 'expo-sharing';
import * as Print from 'expo-print';
import { File, Paths } from 'expo-file-system';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/features/auth/AuthProvider';
import { useStore } from '@/core/data/store';
import type { Model } from '@/core/data/model';
import { kr, shortDate, todayYmd } from '@/core/fmt';
import { PARTNER } from '@/core/partner';
import { C } from '@/ui/kit/theme';
import { Btn, Field, Header, List, NavRow, Panel, Row, Screen, Sec, Seg, T, Disc, useToast } from '@/ui/kit/ui';
import { Gate } from '@/ui/kit/money';
import { FormErr, useSaver } from '@/ui/kit/forms';

type ExportRow = { occurred_on: string; name: string; kind: 'expense' | 'income'; converted_amount_minor: number; original_amount_minor: number; currency_code: string; shared: boolean; is_shared_topup: boolean; shared_participant: 'me' | 'gf' | null; categories: { name: string } | { name: string }[] | null };
const sharing = (r: ExportRow): string => (r.is_shared_topup ? `Top-up (${r.shared_participant === 'gf' ? PARTNER : 'Me'})` : r.shared ? 'Shared' : 'Personal');
const catName = (r: ExportRow): string => (Array.isArray(r.categories) ? r.categories[0]?.name : r.categories?.name) ?? (r.kind === 'income' ? 'Income' : 'Uncategorized');
// A leading = + - @ would run as a formula in a spreadsheet: prefix it with ' (CSV injection).
const csvCell = (raw: string): string => { const v = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw; return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v; };
const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

async function fetchRows(from: string, to: string): Promise<ExportRow[]> {
  const out: ExportRow[] = [];
  for (let a = 0; ; a += 1000) {
    const { data, error } = await supabase.from('transactions')
      .select('occurred_on,name,kind,converted_amount_minor,original_amount_minor,currency_code,shared,is_shared_topup,shared_participant,categories(name)')
      .gte('occurred_on', from).lte('occurred_on', to).order('occurred_on').order('id').range(a, a + 999);
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as unknown as ExportRow[]));
    if (!data || data.length < 1000) return out;
  }
}

function Me() {
  const { tables, userId } = useStore();
  const { err, save } = useSaver();
  const p = tables?.profile ?? null;
  const [name, setName] = useState(p?.display_name ?? '');
  const initial = (name || 'You').trim()[0]?.toUpperCase() ?? 'Y';
  const saveName = async (): Promise<void> => {
    const n = name.trim() || null;
    if (n === (p?.display_name ?? null)) return;
    await save('Name saved', [[['profile'], () => supabase.from('profiles').upsert({ user_id: userId, display_name: n, updated_at: new Date().toISOString() })]]);
  };
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 14 }}>
      {p?.avatar_url ? <Image source={{ uri: p.avatar_url }} style={{ width: 72, height: 72, borderRadius: 36 }} /> : <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center' }}><T k="title">{initial}</T></View>}
      <View style={{ flex: 1 }}><Field label="Name" value={name} onChangeText={setName} onBlur={() => void saveName()} onSubmitEditing={() => void saveName()} returnKeyType="done" autoComplete="name" /><FormErr err={err} /></View>
    </View>
  );
}

function Export({ m }: { m: Model }) {
  const toast = useToast();
  const prev = m.prevOf(m.current);
  const ranges: Record<string, [string, string]> = {
    cycle: [m.current?.startOn ?? m.today, todayYmd()],
    last: [prev?.startOn ?? m.today, prev?.endInclusive ?? m.today],
    year: [`${m.today.slice(0, 4)}-01-01`, todayYmd()],
    all: [m.tx[0]?.occurred_on ?? m.today, todayYmd()],
  };
  const [range, setRange] = useState<'cycle' | 'last' | 'year' | 'all'>('cycle');
  const [fmt, setFmt] = useState<'csv' | 'pdf'>('csv');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [from, to] = ranges[range]!;
  const go = async (): Promise<void> => {
    setBusy(true); setErr(null);
    try {
      const rows = await fetchRows(from, to);
      let uri: string;
      if (fmt === 'csv') {
        const head = ['Date', 'Name', 'Category', 'Type', 'Sharing', 'Amount (DKK)', 'Currency', 'Original amount'];
        const lines = rows.map((r) => [r.occurred_on, csvCell(r.name), csvCell(catName(r)), r.kind, sharing(r), ((r.kind === 'expense' ? -r.converted_amount_minor : r.converted_amount_minor) / 100).toFixed(2), r.currency_code, (r.original_amount_minor / 100).toFixed(2)].join(','));
        const file = new File(Paths.cache, `cashflow_${from}_to_${to}.csv`);
        if (file.exists) file.delete();
        file.create();
        file.write([head.join(','), ...lines].join('\n'));
        uri = file.uri;
      } else {
        const inc = rows.filter((r) => r.kind === 'income').reduce((a, r) => a + r.converted_amount_minor, 0);
        const exp = rows.filter((r) => r.kind === 'expense').reduce((a, r) => a + r.converted_amount_minor, 0);
        const html = `<html><body style="font-family:-apple-system;font-size:11px"><h2>Cashflow, ${esc(shortDate(from))} – ${esc(shortDate(to))}</h2><p>Money in ${esc(kr(inc))}. Money out ${esc(kr(exp))}. Net ${esc(kr(inc - exp))}. Shared spending at its full amount.</p><table style="width:100%;border-collapse:collapse">${rows.map((r) => `<tr><td>${r.occurred_on}</td><td>${esc(r.name)}</td><td>${esc(catName(r))}</td><td>${sharing(r)}</td><td style="text-align:right">${esc((r.kind === 'income' ? '+' : '') + kr(r.kind === 'expense' ? -r.converted_amount_minor : r.converted_amount_minor))}</td></tr>`).join('')}</table></body></html>`;
        uri = (await Print.printToFileAsync({ html })).uri;
      }
      if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing isn’t available on this device.');
      await Sharing.shareAsync(uri, { mimeType: fmt === 'csv' ? 'text/csv' : 'application/pdf', UTI: fmt === 'csv' ? 'public.comma-separated-values-text' : 'com.adobe.pdf' });
      toast(`Exported ${rows.length} transactions`);
    } catch (e) { setErr(`Not exported. ${e instanceof Error ? e.message : 'Try again.'}`); } finally { setBusy(false); }
  };
  return (
    <Panel style={{ padding: 16, gap: 12 }}>
      <Seg value={range} onChange={setRange} options={[['cycle', 'Cycle'], ['last', 'Last cycle'], ['year', 'Year'], ['all', 'All']]} />
      <T k="note">{shortDate(from)} – {shortDate(to)}</T>
      <Seg value={fmt} onChange={setFmt} options={[['csv', 'CSV'], ['pdf', 'PDF']]} />
      <FormErr err={err} />
      <Btn icon="export" label={`Export ${fmt.toUpperCase()}`} busy={busy} onPress={() => void go()} />
    </Panel>
  );
}

function SettingsBody({ m }: { m: Model }) {
  const { signOut } = useAuth();
  const { userId } = useStore();
  const toast = useToast();
  const [out, setOut] = useState(false);
  return (
    <Screen header={<Header title="Settings" />}>
      <Me />
      <List>{[
        <NavRow key="b" href="/bank" icon="bank" name="Accounts & sync" sub="Banks, balances, savings goals" />,
        <NavRow key="c" href="/categories" icon="tag" name="Categories" />,
        <NavRow key="r" href="/rules" icon="rule" name="Merchant rules" />,
        <NavRow key="t" href="/trips" icon="plane" name="Trips" sub="Spending abroad, trip by trip" />,
      ]}</List>
      <Sec>Export</Sec>
      <Export m={m} />
      <List>{[
        <Row key="o" disabled={out} lead={<Disc icon="signout" color={C.over} />} title={<T k="strong" style={{ color: C.over }}>{out ? 'Signing out…' : 'Sign out'}</T>}
          onPress={() => { setOut(true); (async () => { try { if (userId) await AsyncStorage.removeItem(`cashflow:data:${userId}`); await signOut(); } catch { setOut(false); toast('Not signed out. Check the connection and try again.', undefined, 'error'); } })().catch(() => undefined); }} />,
      ]}</List>
    </Screen>
  );
}

export default function SettingsScreen() { return <Gate>{(m) => <SettingsBody m={m} />}</Gate>; }
