import { useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type { Model } from '@/core/data/model';
import { countryName, isDomestic, pastTrips, type PastTrip, type TripRow } from '@/core/domain/trips';
import { addDays, daysBetween, kr, shortDate } from '@/core/fmt';
import { C } from '@/ui/kit/theme';
import { Btn, Disc, Empty, Header, Icon, List, Panel, Row, Screen, Sec, T } from '@/ui/kit/ui';
import { DayList, Gate, SheetHero, useDetail } from '@/ui/kit/money';
import { DeleteAsk, FormErr } from '@/ui/kit/forms';
import { BackHome, Bar, breakdownOf, dates, daysOf, FlagDisc, nameFor, openTrip, rowsOf, totalOf, TripForm, TripNow, useTrips } from './TripsKit';

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

function TripLine({ m, trip }: { m: Model; trip: TripRow }) {
  const router = useRouter();
  const rows = rowsOf(m, trip);
  const total = totalOf(m, rows);
  const when = dates(trip.start_on, trip.end_on);
  return (
    <Row onPress={() => openTrip(trip.id, router)} accessibilityLabel={`${trip.name}, ${when}, ${kr(total, true)}`}
      lead={<FlagDisc iso={trip.country_iso} />} title={trip.name}
      meta={<View><T k="meta" numberOfLines={1}>{when}{rows.length ? '' : ', nothing spent'}</T><Bar parts={breakdownOf(m, rows)} /></View>}
      end={<View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><T k="num">{kr(total, true)}</T><Icon name="chev" size={16} color={C.ink3} strong /></View>} />
  );
}

const notTripKey = (p: PastTrip): string => `cashflow:not-a-trip:${p.country}:${p.start_on}`;

/** Stays abroad no trip covers yet, named as Add will save them. Not a trip hides one on this phone. */
function Found({ m, found }: { m: Model; found: PastTrip[] }) {
  const trips = useTrips();
  const [hidden, setHidden] = useState<Set<string> | null>(null);
  const [err, setErr] = useState<{ key: string; msg: string } | null>(null);
  const keys = found.map(notTripKey).join('|');
  useEffect(() => {
    if (!keys) return;
    AsyncStorage.multiGet(keys.split('|')).then((kv) => setHidden(new Set(kv.filter(([, v]) => v).map(([k]) => k))), () => setHidden(new Set()));
  }, [keys]);
  const shown = hidden ? found.filter((p) => !hidden.has(notTripKey(p))) : [];
  if (!shown.length) return null;
  const hide = (key: string): void => {
    setHidden((h) => new Set([...(h ?? []), key]));
    AsyncStorage.setItem(key, '1').catch(() => undefined);
  };
  const add = async (p: PastTrip, key: string): Promise<void> => {
    const e = await trips.place(m, { name: nameFor(m, p.country, p.start_on, p.end_on), country_iso: p.country, start_on: p.start_on, end_on: p.end_on });
    setErr(e ? { key, msg: e } : null);
  };
  return (
    <>
      <Sec>Earlier trips found</Sec>
      <List>{shown.map((p) => {
        const key = notTripKey(p);
        return (
          <View key={key}>
            <Row lead={<FlagDisc iso={p.country} />} title={nameFor(m, p.country, p.start_on, p.end_on)}
              meta={<T k="meta" numberOfLines={2}>{countryName(p.country)}, {dates(p.start_on, p.end_on)}, {plural(p.count, 'purchase', 'purchases')}, {kr(p.minor, true)}</T>} />
            <View style={{ flexDirection: 'row', gap: 10, paddingLeft: 66, paddingRight: 14, paddingBottom: 12 }}>
              <View style={{ flex: 1 }}><Btn kind="link" label="Not a trip" disabled={trips.busy} onPress={() => hide(key)} /></View>
              <View style={{ flex: 1 }}><Btn kind="ghost" label="Add" disabled={trips.busy} onPress={() => void add(p, key)} /></View>
            </View>
            {err?.key === key ? <View style={{ paddingLeft: 66, paddingRight: 14, paddingBottom: 12 }}><FormErr err={err.msg} /></View> : null}
          </View>
        );
      })}</List>
      <T k="note">Purchases abroad that no trip covers yet. Add moves them to Travel.</T>
    </>
  );
}

function Trips({ m }: { m: Model }) {
  const [form, setForm] = useState(false);
  const now = m.tripOf({ occurred_on: m.today });
  const list = useMemo(() => m.t.trips.filter((x) => x.id !== now?.id).sort((a, b) => b.start_on.localeCompare(a.start_on)), [m.t.trips, now]);
  const found = useMemo(() => pastTrips(m.tx, m.places, m.t.trips, m.today, (t) => m.mine(t as Parameters<typeof m.mine>[0])), [m]);
  return (
    <Screen header={<Header back title="Trips" />}>
      <TripNow m={m} />
      {list.length ? <List>{list.map((x) => <TripLine key={x.id} m={m} trip={x} />)}</List>
        : !now ? <Panel><Empty title="No trips yet" sub="While a trip runs, purchases on it go to Travel." /></Panel> : null}
      <Btn kind="ghost" icon="add" label="Start a trip" onPress={() => setForm(true)} />
      <Found m={m} found={found} />
      {form ? <TripForm m={m} onClose={() => setForm(false)} /> : null}
    </Screen>
  );
}

/** Each day's spending through the trip, the dearest day lit. */
function Daily({ m, rows, from, days }: { m: Model; rows: readonly Model['tx'][number][]; from: string; days: number }) {
  const by = new Map<string, number>();
  for (const r of rows) by.set(r.occurred_on, (by.get(r.occurred_on) ?? 0) + m.mine(r));
  const xs = Array.from({ length: days }, (_, i) => by.get(addDays(from, i)) ?? 0);
  const top = Math.max(...xs);
  const peak = xs.indexOf(top);
  if (days < 2 || !top) return null;
  return (
    <Panel style={{ padding: 16, gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 72, gap: days > 20 ? 1 : 3 }} accessibilityLabel={`Most on ${shortDate(addDays(from, peak))}, ${kr(top, true)}`}>
        {xs.map((v, i) => <View key={i} style={{ flex: 1, height: v ? `${Math.max(6, (100 * v) / top)}%` : 2, borderRadius: 3, backgroundColor: i === peak ? C.ink : v ? C.ink3 : C.track }} />)}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><T k="meta">{shortDate(from)}</T><T k="meta">{shortDate(addDays(from, days - 1))}</T></View>
      <T k="note">Most on {shortDate(addDays(from, peak))}, {kr(top, true)}</T>
    </Panel>
  );
}

function TripDetail({ m, id }: { m: Model; id: string }) {
  const router = useRouter();
  const open = useDetail();
  const trips = useTrips();
  const [edit, setEdit] = useState(false);
  const [ask, setAsk] = useState(false);
  const trip = m.t.trips.find((x) => x.id === id);
  if (!trip) return <Screen header={<Header back title="Trip" />}><Panel><Empty title="This trip isn’t here" sub="It may have been deleted." /></Panel></Screen>;
  const rows = rowsOf(m, trip);
  const total = totalOf(m, rows);
  const parts = breakdownOf(m, rows);
  const days = daysOf(m, trip);
  const ongoing = !trip.end_on;
  const avg = Math.round(total / days);
  const line = !total ? 'Nothing spent yet'
    : `${ongoing ? `Day ${days}` : plural(days, 'day', 'days')}, ${kr(avg, true)} a day`;
  // the day of the last purchase on the trip, else today
  const endOn = rows.map((r) => r.occurred_on).sort().at(-1) ?? m.today;
  const remove = async (): Promise<void> => { const e = await trips.remove(trip.id); if (e) trips.say(e); else router.back(); };
  return (
    <Screen header={<Header back title={trip.name} sub={`${isDomestic(trip) ? 'Inside Denmark' : countryName(trip.country_iso)}, ${dates(trip.start_on, trip.end_on)}`} />}>
      <SheetHero amount={kr(total, true)} line={line} />
      <BackHome m={m} trip={trip} />
      <Bar parts={parts} height={8} />
      <Daily m={m} rows={rows} from={trip.start_on} days={Math.min(days, Math.max(1, daysBetween(trip.start_on, m.today) + 1))} />
      {parts.length ? (
        <List>{parts.map((p) => (
          <Row key={p.id} lead={<Disc icon={p.icon} color={p.color} />} title={p.name}
            meta={`${Math.round((100 * p.minor) / Math.max(1, total))}%`} end={<T k="num">{kr(p.minor, true)}</T>} />
        ))}</List>
      ) : null}
      <Sec>Purchases</Sec>
      {rows.length ? <DayList rows={[...rows].reverse()} m={m} onOpen={open} />
        : <Panel><Empty title="No purchases yet" sub={isDomestic(trip) ? 'Shops more than 30 km from Aarhus, from the start date, show up here.' : 'Purchases outside Denmark from the start date show up here.'} /></Panel>}
      <Sec>Trip</Sec>
      <List>{[
        <Row key="e" lead={<Disc icon="edit" />} title="Edit trip" meta="Name, where, dates" onPress={() => setEdit(true)} />,
        ongoing ? <Row key="x" disabled={trips.busy} lead={<Disc icon="check" />} title="End trip" meta={`Ends on ${shortDate(endOn)}`}
          onPress={() => void trips.edit(trip.id, { end_on: endOn < trip.start_on ? trip.start_on : endOn }, 'Trip ended').then(trips.say)} /> : null,
        <Row key="d" lead={<Disc icon="trash" color={C.over} />} title={<T k="strong" style={{ color: C.over }}>Delete trip…</T>} onPress={() => setAsk(true)} />,
      ]}</List>
      {ask ? <DeleteAsk what={trip.name} busy={trips.busy} onYes={() => void remove()} onNo={() => setAsk(false)} /> : null}
      {ask ? <T k="note">The purchases stay. They go back to their own categories.</T> : null}
      {edit ? <TripForm m={m} trip={trip} onClose={() => setEdit(false)} /> : null}
    </Screen>
  );
}

export default function TripsScreen() { return <Gate>{(m) => <Trips m={m} />}</Gate>; }

export function TripScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  return <Gate>{(m) => <TripDetail m={m} id={id ?? ''} />}</Gate>;
}
