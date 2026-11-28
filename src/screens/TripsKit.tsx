import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DateTimePicker from '@react-native-community/datetimepicker';
import { supabase } from '@/lib/supabase';
import { useStore, write } from '@/core/data/store';
import type { Model } from '@/core/data/model';
import { abroadNow, backHome, countryName, flag, HOME, isPurchase, type TripRow } from '@/core/domain/trips';
import { daysBetween, kr, parseYmd, shortDate, ymd } from '@/core/fmt';
import { budgetColor, C, F } from '@/ui/kit/theme';
import { Btn, Field, Icon, List, Panel, Press, Row, Sheet, T, tap, useToast } from '@/ui/kit/ui';
import { FormErr, Toggle } from '@/ui/kit/forms';

type Tx = Model['tx'][number];
type Input = { name: string; country_iso: string | null; start_on: string; end_on: string | null };

/** A trip's purchases: the rows applyTrips tagged with its id. */
export const rowsOf = (m: Model, trip: TripRow): Tx[] => m.tx.filter((r) => r.trip_id === trip.id);
/** What the trip cost you: your part of each purchase. */
export const totalOf = (m: Model, rows: readonly Tx[]): number => rows.reduce((a, r) => a + m.mine(r), 0);
/** Days the trip lasts, counting both ends; an open trip runs to today. */
export const daysOf = (m: Model, trip: TripRow): number => Math.max(1, daysBetween(trip.start_on, trip.end_on ?? m.today) + 1);
export const openTrip = (id: string, router: ReturnType<typeof useRouter>): void => { tap(); router.push(`/trip?id=${encodeURIComponent(id)}` as never); };

const dayNum = (s: string): string => String(parseYmd(s).getDate());
/** "12–19 Mar", "28 Feb – 3 Mar", "Since 3 Aug". */
export function dates(a: string, b: string | null): string {
  if (!b) return `Since ${shortDate(a)}`;
  if (a === b) return shortDate(a);
  const end = shortDate(b);
  // the short form only when the month is the same and the locale puts the day first
  return a.slice(0, 7) === b.slice(0, 7) && end.startsWith(dayNum(b)) ? `${dayNum(a)}–${end}` : `${shortDate(a)} – ${end}`;
}

const mostCommon = (xs: readonly string[]): string | null => {
  const n = new Map<string, number>();
  for (const x of xs) n.set(x, (n.get(x) ?? 0) + 1);
  return [...n].sort((p, q) => q[1] - p[1])[0]?.[0] ?? null;
};
/** A name for a trip found abroad: the city most of its purchases were in, else the country. */
export function nameFor(m: Model, country: string, from: string, to: string): string {
  const cities = m.tx.filter((r) => isPurchase(r) && r.occurred_on >= from && r.occurred_on <= to).flatMap((r) => {
    const p = m.placeOf(r);
    return p?.country_iso === country && p.city ? [p.city] : [];
  });
  return mostCommon(cities) ?? countryName(country);
}

export type Part = { id: string; name: string; icon: string; color: string; minor: number };
/** Where the trip's money went, by Travel child (Stay, Food...); everything else is Other, last. */
export function breakdownOf(m: Model, rows: readonly Tx[]): Part[] {
  const travel = m.cats.find((c) => !c.parent_id && /^travel$/i.test(c.name));
  const sums = new Map<string, number>();
  for (const r of rows) for (const p of m.portions(r)) {
    if (!p.minor) continue;
    const c = p.category_id ? m.byId.get(p.category_id) : undefined;
    const k = c && travel && (c.parent_id === travel.id || c.id === travel.id) ? c.id : 'other';
    sums.set(k, (sums.get(k) ?? 0) + p.minor);
  }
  return [...sums].map(([id, minor]) => {
    const c = id === 'other' ? undefined : m.byId.get(id);
    return { id, name: c?.name ?? 'Other', icon: c?.icon ?? 'other', color: c ? budgetColor(c) : C.ink3, minor };
  }).sort((a, b) => (a.id === 'other' ? 1 : b.id === 'other' ? -1 : b.minor - a.minor));
}

/** One slim bar split by where the money went. */
export function Bar({ parts, height = 6 }: { parts: readonly Part[]; height?: number }) {
  if (!parts.some((p) => p.minor > 0)) return null;
  return (
    <View style={{ flexDirection: 'row', height, borderRadius: height / 2, overflow: 'hidden', gap: 2, marginTop: 6 }}
      accessibilityLabel={parts.map((p) => `${p.name} ${kr(p.minor, true)}`).join(', ')}>
      {parts.map((p) => <View key={p.id} style={{ flex: p.minor, backgroundColor: p.color }} />)}
    </View>
  );
}

/** The country's flag in a disc; a trip inside Denmark wears Denmark's. */
export const FlagDisc = ({ iso }: { iso: string | null }) => (
  <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center' }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    <Text style={{ fontSize: 20 }}>{flag(iso ?? HOME)}</Text>
  </View>
);

/** The first trip whose days meet start..end (no end: still running). */
export const overlapOf = (m: Model, start: string, end: string | null, except?: string): TripRow | undefined =>
  m.t.trips.find((x) => x.id !== except && x.start_on <= (end ?? '9999-12-31') && start <= (x.end_on ?? m.today));

/** Trip writes. Each returns the error to show, or null once saved and reloaded. */
export function useTrips() {
  const store = useStore();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const run = async (msg: string, q: () => PromiseLike<{ error: { message: string; code?: string } | null }>): Promise<string | null> => {
    setBusy(true);
    try { await write(store, ['trips'], q); toast(msg); return null; } catch (e) { return e instanceof Error ? e.message : 'Not saved.'; } finally { setBusy(false); }
  };
  const say = (err: string | null): void => { if (err) toast(err, undefined, 'error'); };
  const add = (x: Input): Promise<string | null> => (store.userId ? run('Trip saved', () => supabase.from('trips').insert({ user_id: store.userId, ...x })) : Promise.resolve('Your session ended. Sign in again.'));
  const edit = (id: string, patch: Partial<Input>, msg = 'Saved'): Promise<string | null> => run(msg, () => supabase.from('trips').update(patch).eq('id', id));
  return {
    busy, say, add, edit,
    /** A found trip: new, or merged into the trip it overlaps in the same country; another country's trip blocks it. */
    place: (m: Model, x: Input): Promise<string | null> => {
      const o = overlapOf(m, x.start_on, x.end_on);
      if (!o) return add(x);
      if ((o.country_iso ?? HOME) !== (x.country_iso ?? HOME)) return Promise.resolve(`Overlaps ${o.name}, ${dates(o.start_on, o.end_on)}. Change that trip’s dates first.`);
      const end = o.end_on === null || x.end_on === null ? null : o.end_on > x.end_on ? o.end_on : x.end_on;
      return edit(o.id, { start_on: o.start_on < x.start_on ? o.start_on : x.start_on, end_on: end }, `Added to ${o.name}`);
    },
    remove: (id: string): Promise<string | null> => run('Trip deleted. Its purchases are back in their own categories.', () => supabase.from('trips').delete().eq('id', id)),
  };
}

/** "Back home?": end the trip on the day of its last purchase abroad. */
export function BackHome({ m, trip }: { m: Model; trip: TripRow }) {
  const trips = useTrips();
  const day = backHome(trip, m.tx, m.places, m.today);
  if (!day) return null;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
      <T k="strong">Back home?</T>
      <Btn kind="ghost" label={`End the trip on ${shortDate(day)}`} busy={trips.busy} onPress={() => void trips.edit(trip.id, { end_on: day }, 'Trip ended').then(trips.say)} />
    </View>
  );
}

const sinceWords = (since: string, today: string): string => {
  const d = daysBetween(since, today);
  return d === 0 ? 'today' : d === 1 ? 'since yesterday' : `since ${shortDate(since)}`;
};

/** Activity's trip card: the trip you're on, or "Are you in Portugal?" when purchases abroad say so. Nothing otherwise. */
export function TripNow({ m }: { m: Model }) {
  const router = useRouter();
  const trips = useTrips();
  const now = m.tripOf({ occurred_on: m.today });
  const away = now ? null : abroadNow(m.tx, m.places, m.t.trips, m.today);
  const key = away ? `cashflow:trip-not-now:${away.country}` : null;
  const [err, setErr] = useState<string | null>(null);
  // per country: missing while reading storage, then whether Not now was tapped in the last 14 days
  const [dismissed, setDismissed] = useState<Record<string, boolean>>({});
  useEffect(() => {
    if (!key || key in dismissed) return;
    AsyncStorage.getItem(key).then((v) => setDismissed((s) => ({ ...s, [key]: Boolean(v && /^\d{4}-\d{2}-\d{2}$/.test(v) && daysBetween(v, m.today) < 14) })), () => setDismissed((s) => ({ ...s, [key]: false })));
  }, [key, dismissed, m.today]);

  if (now) {
    const rows = rowsOf(m, now);
    const total = totalOf(m, rows);
    const day = daysBetween(now.start_on, m.today) + 1;
    return (
      <Press scale={0.98} onPress={() => openTrip(now.id, router)} accessibilityRole="button" accessibilityLabel={`${now.name}, day ${day}, ${kr(total, true)} so far`}>
        <Panel style={{ padding: 16, gap: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <FlagDisc iso={now.country_iso} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <T k="strong" numberOfLines={1}>{now.name}</T>
              <T k="meta">Day {day}{rows.length ? '' : ', nothing spent yet'}</T>
            </View>
            <Text style={{ fontFamily: F.num, fontSize: 30, color: C.ink }} numberOfLines={1}>{kr(total, true)}</Text>
          </View>
          <BackHome m={m} trip={now} />
        </Panel>
      </Press>
    );
  }
  if (!away || !key || dismissed[key] !== false) return null;
  const notNow = (): void => {
    setDismissed((s) => ({ ...s, [key]: true }));
    AsyncStorage.setItem(key, m.today).catch(() => undefined);
  };
  const start = (): Promise<void> => trips.place(m, { name: nameFor(m, away.country, away.since, m.today), country_iso: away.country, start_on: away.since, end_on: null }).then(setErr);
  return (
    <Panel style={{ padding: 16, gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <FlagDisc iso={away.country} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <T k="strong">Are you in {countryName(away.country)}?</T>
          <T k="meta">{away.count} purchases {sinceWords(away.since, m.today)}</T>
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1 }}><Btn kind="ghost" label="Not now" disabled={trips.busy} onPress={notNow} /></View>
        <View style={{ flex: 1 }}><Btn label="Start trip" busy={trips.busy} onPress={() => void start()} /></View>
      </View>
      <FormErr err={err} />
    </Panel>
  );
}

// trips.ts names the countries it knows; list those rather than copy its table
const COUNTRIES: string[] = (() => {
  const out: string[] = [];
  for (let a = 65; a < 91; a++) for (let b = 65; b < 91; b++) { const iso = String.fromCharCode(a, b); if (iso !== HOME && countryName(iso) !== iso) out.push(iso); }
  return out.sort((x, y) => countryName(x).localeCompare(countryName(y)));
})();

function CountryPick({ value, onPick, onClose }: { value: string | null; onPick: (iso: string | null) => void; onClose: () => void }) {
  const [q, setQ] = useState('');
  const s = q.trim().toLowerCase();
  const opts: [string | null, string][] = [[null, 'Inside Denmark'] as [string | null, string], ...COUNTRIES.map((c): [string, string] => [c, countryName(c)])].filter(([, n]) => !s || n.toLowerCase().includes(s));
  return (
    <Sheet open onClose={onClose} title="Where">
      <Field label="Search" value={q} onChangeText={setQ} placeholder="Country" autoCorrect={false} returnKeyType="search" />
      {opts.length ? (
        <List>{opts.map(([iso, n]) => (
          <Row key={iso ?? 'home'} selected={iso === value} lead={<FlagDisc iso={iso} />} title={n} end={iso === value ? <Icon name="check" strong /> : undefined} onPress={() => { onPick(iso); onClose(); }} />
        ))}</List>
      ) : <T k="note">No country called {q.trim()}.</T>}
    </Sheet>
  );
}

function DateRow({ label, value, onChange }: { label: string; value: string; onChange: (d: string) => void }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingHorizontal: 16, paddingVertical: 8, minHeight: 56 }}>
      <T k="strong">{label}</T>
      {/* iOS only: the compact pill opens the system calendar */}
      <DateTimePicker value={parseYmd(value)} mode="date" display="compact" themeVariant="dark" accentColor={C.ink} accessibilityLabel={label}
        onChange={(_, d) => { if (d) onChange(ymd(d)); }} />
    </View>
  );
}

/** Start a trip by hand, or edit one: name, where, the dates. No end date means still travelling. */
export function TripForm({ m, trip, onClose }: { m: Model; trip?: TripRow; onClose: () => void }) {
  const trips = useTrips();
  const [name, setName] = useState(trip?.name ?? '');
  const [iso, setIso] = useState<string | null>(trip?.country_iso === HOME ? null : trip?.country_iso ?? null);
  const [start, setStart] = useState(trip?.start_on ?? m.today);
  const [end, setEnd] = useState<string | null>(trip ? trip.end_on : null);
  const [pick, setPick] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const clash = overlapOf(m, start, end, trip?.id);
  const bad = end !== null && end < start ? 'The end can’t be before the start.'
    : clash ? `Overlaps ${clash.name}, ${dates(clash.start_on, clash.end_on)}.` : null;
  const save = async (): Promise<void> => {
    const x: Input = { name: name.trim(), country_iso: iso, start_on: start, end_on: end };
    const e = trip ? await trips.edit(trip.id, x) : await trips.add(x);
    if (e) setErr(e); else onClose();
  };
  return (
    <Sheet open onClose={onClose} title={trip ? 'Edit trip' : 'Start a trip'}>
      <Field label="Name" value={name} onChangeText={(v) => { setName(v); setErr(null); }} placeholder={iso ? countryName(iso) : 'Skagen'} autoFocus={!trip} returnKeyType="done" maxLength={60} />
      <List>{[
        <Row key="w" lead={<FlagDisc iso={iso} />} title="Where" meta={iso ? countryName(iso) : 'Inside Denmark'} end={<Icon name="chev" size={16} color={C.ink3} strong />} onPress={() => setPick(true)} />,
        <DateRow key="s" label="Start" value={start} onChange={(d) => { setStart(d); setErr(null); }} />,
        <Toggle key="t" label="Still travelling" on={end === null} onChange={(v) => setEnd(v ? null : start > m.today ? start : m.today)} />,
        end !== null ? <DateRow key="e" label="End" value={end} onChange={(d) => { setEnd(d); setErr(null); }} /> : null,
      ]}</List>
      <T k="note">{iso ? 'Purchases outside Denmark on these days go to Travel.' : 'Shops more than 30 km from Aarhus go to Travel on these days.'}</T>
      <FormErr err={bad ?? err} />
      <Btn label={trip ? 'Save' : 'Start trip'} disabled={!name.trim() || Boolean(bad)} busy={trips.busy} onPress={() => void save()} />
      {pick ? <CountryPick value={iso} onClose={() => setPick(false)} onPick={(v) => { setIso(v); if (!name.trim() && v) setName(countryName(v)); }} /> : null}
    </Sheet>
  );
}
