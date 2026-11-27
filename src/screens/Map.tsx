import { useCallback, useMemo, useRef, useState } from 'react';
import { ScrollView, View, useWindowDimensions } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { LinearGradient } from 'expo-linear-gradient';
import { useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import type { Model } from '@/core/data/model';
import type { TripRow } from '@/core/domain/trips';
import { countryName, flag } from '@/core/domain/trips';
import { addDays, kr, range, shortDate } from '@/core/fmt';
import { C, F, R } from '@/ui/kit/theme';
import { Header, List, Panel, Press, Sheet, T, tap } from '@/ui/kit/ui';
import { Gate, SheetHero, TxRow, useDetail } from '@/ui/kit/money';
import { clusters, fitRegion, type Cam, type Cluster } from './map/cluster';
import { monthOf, monthsBetween, nextMonth, pointsOf } from './map/data';
import { Glow, glowBox } from './map/Glow';
import { Strip } from './map/Strip';

type Win = { from: string; toEx: string; label: string; pick: string };
const TOP = 112;
// room kept free above the panel for the Apple Maps logo and Legal, so no glow or label lands under them
const LOGO = 72;
const FLY = 900;
const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;
const monthName = (ym: string, withYear: boolean): string =>
  new Intl.DateTimeFormat(undefined, withYear ? { month: 'short', year: 'numeric' } : { month: 'short' }).format(new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1, 1));

function SpendingMap({ m }: { m: Model }) {
  const { width, height } = useWindowDimensions();
  const params = useLocalSearchParams<{ from?: string; until?: string }>();
  const insets = useSafeAreaInsets();
  const reduce = useReducedMotion();
  const openTx = useDetail();
  const map = useRef<MapView>(null);
  const [bottom, setBottom] = useState(260);
  const top = insets.top + TOP;

  const { pts, online, unplaced, rows } = useMemo(() => pointsOf(m), [m]);
  const tomorrow = addDays(m.today, 1);
  const months = useMemo(() => (pts.length ? monthsBetween(monthOf(pts.reduce((a, p) => (p.on < a ? p.on : a), m.today)), monthOf(m.today)) : []), [pts, m.today]);
  const perMonth = useMemo(() => {
    const at = new Map(months.map((ym, i) => [ym, i]));
    const out = months.map(() => 0);
    for (const p of pts) { const i = at.get(monthOf(p.on)); if (i !== undefined) out[i] = (out[i] ?? 0) + p.minor; }
    return out;
  }, [months, pts]);

  const quick = useMemo((): Win[] => {
    const year = months[Math.max(0, months.length - 12)] ?? monthOf(m.today);
    const c = m.current;
    return [
      ...(c ? [{ from: c.startOn, toEx: c.endOnExclusive ?? tomorrow, label: `${c.name} cycle`, pick: 'cycle' }] : []),
      { from: `${year}-01`, toEx: tomorrow, label: 'Last 12 months', pick: 'year' },
      { from: '0000-01-01', toEx: tomorrow, label: months[0] ? `Since ${monthName(months[0], true)}` : 'All', pick: 'all' },
    ];
  }, [m, months, tomorrow]);
  const trips = useMemo(() => [...m.t.trips].sort((a, b) => b.start_on.localeCompare(a.start_on)), [m.t.trips]);
  const tripWin = (tr: TripRow): Win => ({ from: tr.start_on, toEx: addDays(tr.end_on ?? m.today, 1), label: `${tr.name}, ${range(tr.start_on, tr.end_on ?? m.today)}`, pick: tr.id });

  const [win, setWin] = useState<Win>(() => {
    // opened for a period (Where it went passes the one it shows): `until` is exclusive, like /spending-transactions
    const ymd = /^\d{4}-\d{2}-\d{2}$/;
    const { from, until } = params;
    if (from && until && ymd.test(from) && ymd.test(until) && from < until) {
      const toEx = until < tomorrow ? until : tomorrow;
      const same = quick.find((q) => q.from === from && q.toEx === toEx);
      return same ?? { from, toEx, label: range(from, addDays(toEx, -1)), pick: 'param' };
    }
    return quick.find((q) => q.pick === 'year') ?? quick[0]!;
  });
  const inWin = useMemo(() => pts.filter((p) => p.on >= win.from && p.on < win.toEx), [pts, win]);
  const [cam, setCam] = useState<Cam>(() => fitRegion(inWin.length ? inWin : pts, width, height - top - bottom, LOGO));
  const [initial] = useState(cam);
  const glows = useMemo(() => clusters(inWin, cam, width, height), [inWin, cam, width, height]);

  const fly = useCallback((ps: readonly { lat: number; lng: number }[]) => {
    if (ps.length) map.current?.animateToRegion(fitRegion(ps, width, height - top - bottom, LOGO), reduce ? 0 : FLY);
  }, [width, height, top, bottom, reduce]);
  const choose = (w: Win): void => {
    setWin(w);
    const ps = pts.filter((p) => p.on >= w.from && p.on < w.toEx);
    // a trip flies to the purchases it is about: the ones away from home
    const away = ps.filter((p) => rows.get(p.id)?.trip_id === w.pick);
    fly(away.length ? away : ps);
  };

  // the trip's path, from purchase to purchase in date order
  const path = useMemo(() => {
    const ps = inWin.filter((p) => rows.get(p.id)?.trip_id === win.pick).sort((a, b) => a.on.localeCompare(b.on));
    const line: { latitude: number; longitude: number }[] = [];
    for (const p of ps) { const last = line.at(-1); if (!last || last.latitude !== p.lat || last.longitude !== p.lng) line.push({ latitude: p.lat, longitude: p.lng }); }
    return line.length > 1 ? line : null;
  }, [inWin, rows, win.pick]);

  const total = inWin.reduce((a, p) => a + p.minor, 0);
  const countries = new Set(inWin.map((p) => p.country).filter(Boolean));
  const cities = new Set(inWin.filter((p) => p.city).map((p) => `${p.country}|${p.city}`));
  const country = countryName([...countries][0]);
  const where = countries.size !== 1 ? `in ${plural(countries.size, 'country', 'countries')} and ${plural(cities.size, 'city', 'cities')}`
    : cities.size > 1 ? `in ${plural(cities.size, 'city', 'cities')} in ${country}` : `in ${[...cities][0]?.split('|')[1] ?? country}`;
  const off = (xs: { on: string; minor: number }[]): number => xs.filter((x) => x.on >= win.from && x.on < win.toEx).reduce((a, x) => a + x.minor, 0);
  const offline = [[off(online), 'online'], [off(unplaced), 'with no place yet']].filter(([v]) => v).map(([v, w]) => `${kr(v as number, true)} ${w}`);
  const sel = useMemo((): [number, number] | null => {
    const idx = months.map((ym, i) => (`${ym}-01` < win.toEx && `${nextMonth(ym)}-01` > win.from ? i : -1)).filter((i) => i >= 0);
    return idx.length ? [idx[0]!, idx.at(-1)!] : null;
  }, [months, win]);
  const pickMonths = (a: number, b: number): void => {
    const first = months[a], last = months[b];
    if (!first || !last) return;
    const yr = first.slice(0, 4) !== m.today.slice(0, 4) || last.slice(0, 4) !== m.today.slice(0, 4);
    choose({ from: `${first}-01`, toEx: `${nextMonth(last)}-01` < tomorrow ? `${nextMonth(last)}-01` : tomorrow, label: a === b ? monthName(first, yr) : `${monthName(first, yr)} – ${monthName(last, yr)}`, pick: `m:${a}-${b}` });
  };

  const [open, setOpen] = useState<Cluster | null>(null);
  const openRows = useMemo(() => (open ? open.ids.map((id) => rows.get(id)).filter((t) => t !== undefined).sort((a, b) => b.occurred_on.localeCompare(a.occurred_on)) : []), [open, rows]);
  // the sheet names the place: the country, the city, or (merged glows) the biggest city and how many more
  const title = (c: Cluster): string => {
    const name = c.level === 'country' ? countryName(c.country) : c.names.length > 1 ? `${c.names[0] ?? ''} and ${plural(c.names.length - 1, 'more city', 'more cities')}` : c.names[0] ?? '';
    return `${flag(c.country)} ${name}`.trim();
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <MapView
        ref={map}
        style={{ flex: 1 }}
        initialRegion={initial}
        onRegionChangeComplete={(r) => setCam(r)}
        userInterfaceStyle="dark"
        mapType="mutedStandard"
        showsPointsOfInterest={false}
        showsBuildings={false}
        showsTraffic={false}
        showsIndoors={false}
        showsCompass={false}
        showsScale={false}
        pitchEnabled={false}
        rotateEnabled={false}
        toolbarEnabled={false}
        // shortcut: ~40 km camera distance stands in for the 0.3° floor of fitRegion; tune on a device if it stops too early or late
        cameraZoomRange={{ minCenterCoordinateDistance: 40_000 }}
        // MapKit fits regions inside this padding and keeps its logo and Legal above the panel (fitRegion keeps LOGO free for them)
        mapPadding={{ top, left: 8, right: 8, bottom }}
        accessibilityLabel="Map of where you spent"
      >
        {path ? <Polyline coordinates={path} strokeColor={C.ahead} strokeWidth={2} lineDashPattern={[2, 6]} lineCap="round" /> : null}
        {glows.map((g, i) => {
          const amount = kr(g.minor, true);
          const name = g.names.length > 1 ? `${g.names[0]} +${g.names.length - 1}` : g.names[0] ?? '';
          return (
            <Marker key={g.id} coordinate={{ latitude: g.lat, longitude: g.lng }} centerOffset={{ x: 0, y: glowBox(g.size).dy }} zIndex={i} tracksViewChanges={false}
              onPress={() => { tap(); setOpen(g); }}>
              <Glow id={g.id} size={g.size} amount={amount} flag={g.level === 'country' ? flag(g.country) : ''} name={g.level === 'country' ? countryName(g.country) : name} />
            </Marker>
          );
        })}
      </MapView>

      <LinearGradient colors={[`${C.bg}F0`, `${C.bg}00`]} style={{ position: 'absolute', top: 0, left: 0, right: 0, height: top + 24 }} pointerEvents="none" />
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0 }}>
        <Header back title={pts.length ? kr(total, true) : 'Spending map'} sub={pts.length ? (inWin.length ? where : `Nothing with a place in ${win.label}`) : undefined} />
      </View>

      {!pts.length ? (
        <View style={{ position: 'absolute', left: 16, right: 16, bottom: insets.bottom + 24 }}>
          <Panel style={{ padding: 20, gap: 6 }}>
            <T k="sec">No places yet</T>
            <T k="note">Places appear after the next bank sync. Each shop gets its city, and purchases show here as glows.</T>
          </Panel>
        </View>
      ) : (
        <View style={{ position: 'absolute', left: 8, right: 8, bottom: insets.bottom + 4 }} onLayout={(e) => setBottom(e.nativeEvent.layout.height + insets.bottom + 4)}>
          <View style={{ borderRadius: R.card, paddingVertical: 14, gap: 12, overflow: 'hidden', backgroundColor: `${C.bg}E6` }}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 14 }}>
              {quick.map((q) => <Chip key={q.pick} on={win.pick === q.pick} label={q.pick === 'cycle' ? 'This cycle' : q.pick === 'year' ? '12 months' : 'All'} onPress={() => choose(q)} />)}
              {trips.map((tr) => <Chip key={tr.id} on={win.pick === tr.id} label={`${flag(tr.country_iso)} ${tr.name}`} sub={tr.end_on && tr.end_on !== tr.start_on ? range(tr.start_on, tr.end_on) : shortDate(tr.start_on)} onPress={() => choose(tripWin(tr))} />)}
            </ScrollView>
            <View style={{ paddingHorizontal: 16, gap: 8 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                <T k="strong" numberOfLines={1} style={{ flexShrink: 1 }}>{win.label}</T>
                <T k="meta" numberOfLines={1}>{plural(inWin.length, 'purchase', 'purchases')}</T>
              </View>
              <Strip months={months} values={perMonth} sel={sel} label={win.label} onPick={pickMonths} />
              {offline.length ? <T k="note">{offline.join(' and ')}, not on the map</T> : null}
            </View>
          </View>
        </View>
      )}

      <Sheet open={open !== null} onClose={() => setOpen(null)} title={open ? title(open) : ''}>
        {open ? (
          <>
            <SheetHero amount={kr(open.minor, true)} line={`${plural(openRows.length, 'purchase', 'purchases')}, ${openRows.length > 1 ? range(openRows.at(-1)!.occurred_on, openRows[0]!.occurred_on) : shortDate(openRows[0]?.occurred_on ?? m.today)}`} />
            <T k="note">What it cost you. Your part of shared purchases counts.</T>
            <List>{openRows.map((t) => <TxRow key={t.id} t={t} m={m} onOpen={(x) => { setOpen(null); openTx(x); }} />)}</List>
          </>
        ) : null}
      </Sheet>
    </View>
  );
}

function Chip({ label, sub, on, onPress }: { label: string; sub?: string; on: boolean; onPress: () => void }) {
  return (
    <Press onPress={() => { if (!on) tap(); onPress(); }} scale={0.95} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={sub ? `${label}, ${sub}` : label}
      style={{ minHeight: 44, paddingHorizontal: 14, borderRadius: R.pill, justifyContent: 'center', backgroundColor: on ? C.ink : C.surface2 }}>
      <T k="strong" style={{ fontSize: 14, color: on ? C.bg : C.ink }} numberOfLines={1}>{label}</T>
      {sub ? <T k="meta" style={{ fontSize: 11, marginTop: -2, color: on ? C.surface3 : C.ink3, fontFamily: F.body }} numberOfLines={1}>{sub}</T> : null}
    </Press>
  );
}

export default function MapScreen() { return <Gate>{(m) => <SpendingMap m={m} />}</Gate>; }
