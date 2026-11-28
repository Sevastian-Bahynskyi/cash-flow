import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Text, useWindowDimensions, View } from 'react-native';
import Animated, { Easing, interpolate, useAnimatedReaction, useAnimatedRef, useAnimatedScrollHandler, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming, type SharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PARTNER } from '@/core/partner';
import { Aura } from '@/ui/aura/Aura';
import { MOODS, type Mood } from '@/ui/aura/moods';
import { SharedRing } from '@/ui/aura/SharedRing';
import { C, F } from '@/ui/kit/theme';
import { Btn, Icon, tap } from '@/ui/kit/ui';

/** Set once the owner has been through the guide; the tabs open it on the first launch without it. */
export const GUIDE_SEEN = 'cashflow:guide-seen';

const CARD = 'rgba(11,11,13,0.62)';

/** A clock for a demo: 0 to 1 over `ms`, again and again while its page is on screen. Reduced motion holds it at `rest`. */
function useLoop(active: boolean, ms: number, rest = 0.6): SharedValue<number> {
  const reduce = useReducedMotion();
  const t = useSharedValue(rest);
  useEffect(() => {
    if (reduce || !active) { t.set(rest); return; }
    t.set(0);
    t.set(withRepeat(withTiming(1, { duration: ms, easing: Easing.linear }), -1, false));
  }, [active, reduce, ms, rest, t]);
  return t;
}

/** In over `a`–`b` of the loop, out again over the last tenth, so every loop starts clean. */
const show = (t: number, a: number, b: number): number => {
  'worklet';
  return interpolate(t, [a, b, 0.9, 1], [0, 1, 1, 0], 'clamp');
};

const Mini = ({ children, style }: { children: ReactNode; style?: object }) => <Text style={[{ fontFamily: F.body, fontSize: 13, color: C.ink3 }, style]}>{children}</Text>;
const Strong = ({ children, style }: { children: ReactNode; style?: object }) => <Text style={[{ fontFamily: F.strong, fontSize: 15, color: C.ink }, style]} numberOfLines={1}>{children}</Text>;
const Dot = ({ icon, color = C.ink, bg = C.surface2, size = 34 }: { icon: string; color?: string; bg?: string; size?: number }) => (
  <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}><Icon name={icon} size={size * 0.5} color={color} /></View>
);

/** A bar that fills to `to` (0–1) between `a` and `b` of the loop. The fill is absolute and childless, so its width is safe to animate. */
function Fill({ t, w, to, a, b, color, height = 8, from = 0 }: { t: SharedValue<number>; w: number; to: number; a: number; b: number; color: string; height?: number; from?: number }) {
  const s = useAnimatedStyle(() => ({ width: w * interpolate(t.get(), [a, b, 0.9, 1], [from, to, to, from], 'clamp') }));
  return <Animated.View style={[{ position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: height, backgroundColor: color }, s]} />;
}
const Track = ({ children, height = 8 }: { children?: ReactNode; height?: number }) => <View style={{ height, borderRadius: height, backgroundColor: C.track, overflow: 'hidden' }}>{children}</View>;

function Appear({ t, a, b, children, dy = 10, style }: { t: SharedValue<number>; a: number; b: number; children: ReactNode; dy?: number; style?: object }) {
  const s = useAnimatedStyle(() => { const v = show(t.get(), a, b); return { opacity: v, transform: [{ translateY: (1 - v) * dy }] }; });
  return <Animated.View style={[style, s]}>{children}</Animated.View>;
}

// ——— The demos: small working pictures of each feature, made of the app's own parts ———

function PaydayDemo({ active, w }: { active: boolean; w: number }) {
  const t = useLoop(active, 4200, 0.55);
  const line = w - 32;
  const dot = useAnimatedStyle(() => ({ transform: [{ translateX: interpolate(t.get(), [0.1, 0.8, 1], [0, line * 0.62, line * 0.62], 'clamp') - 7 }] }));
  return (
    <View style={{ gap: 14 }}>
      <Mini>Left this cycle</Mini>
      <Appear t={t} a={0} b={0.15} dy={6}><Text style={{ fontFamily: F.num, fontSize: 58, color: C.ink, letterSpacing: -1 }}>12.480 kr.</Text></Appear>
      <View style={{ height: 14, justifyContent: 'center' }}>
        <View style={{ height: 2, borderRadius: 1, backgroundColor: C.track }} />
        <Animated.View style={[{ position: 'absolute', width: 14, height: 14, borderRadius: 7, backgroundColor: C.ink }, dot]} />
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Mini>Payday</Mini><Mini>today</Mini><Mini>Next payday</Mini></View>
    </View>
  );
}

function BudgetsDemo({ active, w }: { active: boolean; w: number }) {
  const t = useLoop(active, 4600);
  const bar = w - 32;
  const rows: [string, string, number, string, string][] = [
    ['basket', 'Groceries', 0.5, C.bar, '1.250 kr. left'],
    ['utensils', 'Eating out', 0.82, C.ahead, '310 kr. left, going fast'],
    ['bag', 'Shopping', 1, C.over, '140 kr. over'],
  ];
  return (
    <View style={{ gap: 14 }}>
      {rows.map(([icon, name, to, color, line], i) => (
        <View key={name} style={{ gap: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><Icon name={icon} size={16} color={C.ink2} /><Strong style={{ flex: 1 }}>{name}</Strong><Appear t={t} a={0.3 + i * 0.08} b={0.42 + i * 0.08} dy={4}><Mini style={{ color: i ? color : C.ink3 }}>{line}</Mini></Appear></View>
          <Track><Fill t={t} w={bar} to={to} a={0.05 + i * 0.06} b={0.4 + i * 0.06} color={color} /><View style={{ position: 'absolute', left: bar * 0.6, top: 0, bottom: 0, width: 2, backgroundColor: C.ink3 }} /></Track>
        </View>
      ))}
      <Mini>The line is how much of the cycle has gone.</Mini>
    </View>
  );
}

function ActivityDemo({ active }: { active: boolean }) {
  const t = useLoop(active, 5200, 0.8);
  const rows: [string, string, string, string][] = [['cart', 'Netto', 'Groceries', '184 kr.'], ['cup', 'Lagkagehuset', 'Eating out', '62 kr.'], ['train', 'Unknown shop', 'Best guess: Transport', '240 kr.']];
  const pulse = useAnimatedStyle(() => ({ transform: [{ scale: interpolate(t.get(), [0.5, 0.56, 0.62], [1, 0.92, 1], 'clamp') }], opacity: interpolate(t.get(), [0.62, 0.7], [1, 0], 'clamp') }));
  const done = useAnimatedStyle(() => ({ opacity: interpolate(t.get(), [0.64, 0.72, 0.9, 1], [0, 1, 1, 0], 'clamp'), transform: [{ scale: interpolate(t.get(), [0.64, 0.72], [0.9, 1], 'clamp') }] }));
  const amber = useAnimatedStyle(() => ({ opacity: interpolate(t.get(), [0.62, 0.68], [1, 0], 'clamp') }));
  return (
    <View style={{ gap: 12 }}>
      {rows.map(([icon, name, sub, amount], i) => (
        <Appear key={name} t={t} a={0.04 + i * 0.1} b={0.16 + i * 0.1} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Dot icon={icon} />
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><Strong>{name}</Strong>{i === 2 ? <Animated.View style={[{ width: 7, height: 7, borderRadius: 4, backgroundColor: C.ahead }, amber]} /> : null}</View>
            <Mini>{sub}</Mini>
          </View>
          {i === 2 ? (
            <View style={{ width: 64, height: 34, alignItems: 'center', justifyContent: 'center' }}>
              <Animated.View style={[{ position: 'absolute', paddingHorizontal: 16, height: 34, borderRadius: 17, backgroundColor: C.surface3, justifyContent: 'center' }, pulse]}><Strong>Yes</Strong></Animated.View>
              <Animated.View style={[{ position: 'absolute' }, done]}><Icon name="check" color={C.in} strong /></Animated.View>
            </View>
          ) : <Strong style={{ fontFamily: F.strong }}>{amount}</Strong>}
        </Appear>
      ))}
    </View>
  );
}

function SplitDemo({ active, w }: { active: boolean; w: number }) {
  const t = useLoop(active, 5000, 0.75);
  const bar = w - 32, gap = 4;
  const parts: [number, string, string, string, boolean][] = [[300, '#EDA9D2', 'Gifts', 'Yours', false], [200, '#77D4CE', 'Groceries', `Shared with ${PARTNER}`, true], [345, '#C6AAFF', 'Shopping', 'The rest, yours', false]];
  const whole = useAnimatedStyle(() => ({ opacity: interpolate(t.get(), [0.25, 0.4, 0.92, 1], [1, 0, 0, 1], 'clamp') }));
  let x = 0;
  return (
    <View style={{ gap: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}><Strong>Føtex</Strong><Text style={{ fontFamily: F.num, fontSize: 30, color: C.ink }}>845 kr.</Text></View>
      <View style={{ height: 14 }}>
        {parts.map(([v, color], i) => {
          const width = (bar - gap * 2) * (v / 845), left = x;
          x += width + gap;
          return <Appear key={i} t={t} a={0.28 + i * 0.05} b={0.42 + i * 0.05} dy={0} style={{ position: 'absolute', left, width, top: 0, bottom: 0, borderRadius: 7, backgroundColor: color }}>{null}</Appear>;
        })}
        <Animated.View style={[{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, borderRadius: 7, backgroundColor: C.ink }, whole]} />
      </View>
      {parts.map(([v, color, name, whose, shared], i) => (
        <Appear key={name} t={t} a={0.42 + i * 0.08} b={0.54 + i * 0.08} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ width: 22, height: 22, alignItems: 'center', justifyContent: 'center' }}>
            <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: color }} />
            {shared ? <View style={{ position: 'absolute' }}><SharedRing size={22} stroke={2} /></View> : null}
          </View>
          <Strong style={{ flex: 1 }}>{name}</Strong><Mini>{whose}</Mini><Strong style={{ width: 64, textAlign: 'right' }}>{v} kr.</Strong>
        </Appear>
      ))}
    </View>
  );
}

function PotDemo({ active, w }: { active: boolean; w: number }) {
  const t = useLoop(active, 5200, 0.7);
  const bar = w - 32;
  const spent = useAnimatedStyle(() => ({ width: bar * interpolate(t.get(), [0.45, 0.7, 0.9, 1], [0, 0.3, 0.3, 0], 'clamp') }));
  return (
    <View style={{ gap: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ width: 44, height: 44 }}><Dot icon="shared" size={44} /><View style={{ position: 'absolute', left: -5, top: -5 }}><SharedRing size={54} /></View></View>
        <View style={{ flex: 1 }}><Strong>With {PARTNER}</Strong><Mini>left in the pot this cycle</Mini></View>
        <Text style={{ fontFamily: F.num, fontSize: 30, color: C.ink }}>5.595 kr.</Text>
      </View>
      <Track height={12}>
        <Fill t={t} w={bar} to={0.5} a={0.05} b={0.3} color={C.ink} height={12} />
        <View style={{ position: 'absolute', left: bar / 2, top: 0, bottom: 0, width: bar / 2 }}><Track height={12}><Fill t={t} w={bar / 2} to={1} a={0.15} b={0.4} color={C.partner} height={12} /></Track></View>
        <Animated.View style={[{ position: 'absolute', right: 0, top: 0, bottom: 0, backgroundColor: C.surface }, spent]} />
      </Track>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Appear t={t} a={0.1} b={0.3}><Mini style={{ color: C.ink2 }}>You put in 4.000</Mini></Appear>
        <Appear t={t} a={0.2} b={0.4}><Mini style={{ color: C.partner }}>{PARTNER} put in 4.000</Mini></Appear>
      </View>
      <Appear t={t} a={0.6} b={0.75}><Mini>Spent together 2.405 kr. Your share of it 1.202 kr.</Mini></Appear>
    </View>
  );
}

function DebtDemo({ active, w }: { active: boolean; w: number }) {
  const t = useLoop(active, 5200, 0.8);
  const bar = w - 32;
  const progress = useAnimatedStyle(() => ({ width: bar * interpolate(t.get(), [0, 0.3, 0.38, 0.58, 0.66, 0.9, 1], [0.2, 0.2, 0.45, 0.45, 0.7, 0.7, 0.2], 'clamp') }));
  const ticks = [0.3, 0.58].map((at) => ({ at }));
  return (
    <View style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Dot icon="owed" />
        <View style={{ flex: 1 }}><Strong>You owe Mother</Strong><Mini>Paid back as you tick transfers</Mini></View>
      </View>
      <Track><Animated.View style={[{ position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 8, backgroundColor: C.in }, progress]} /></Track>
      {ticks.map(({ at }, i) => <Tick key={at} t={t} at={at} label={`Sent ${i ? '500' : '400'} kr.`} day={i ? '20 Nov' : '2 Nov'} />)}
    </View>
  );
}
function Tick({ t, at, label, day }: { t: SharedValue<number>; at: number; label: string; day: string }) {
  const on = useAnimatedStyle(() => ({ opacity: interpolate(t.get(), [at, at + 0.05, 0.9, 1], [0, 1, 1, 0], 'clamp'), transform: [{ scale: interpolate(t.get(), [at, at + 0.05], [0.9, 1], 'clamp') }] }));
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <View style={{ width: 26, height: 26, borderRadius: 13, borderWidth: 1.5, borderColor: C.ink3, alignItems: 'center', justifyContent: 'center' }}>
        <Animated.View style={[{ position: 'absolute', left: -1.5, top: -1.5, width: 26, height: 26, borderRadius: 13, backgroundColor: C.ink, alignItems: 'center', justifyContent: 'center' }, on]}><Icon name="check" size={16} color={C.bg} strong /></Animated.View>
      </View>
      <Strong style={{ flex: 1 }}>{label}</Strong><Mini>{day}</Mini>
    </View>
  );
}

function TripDemo({ active }: { active: boolean }) {
  const t = useLoop(active, 5200, 0.8);
  const press = useAnimatedStyle(() => ({ transform: [{ scale: interpolate(t.get(), [0.22, 0.27, 0.32], [1, 0.94, 1], 'clamp') }] }));
  const rows: [string, string, string, string][] = [['cart', 'Mercadona', 'Groceries', 'Travel, Food'], ['train', 'Metro Barcelona', 'Transport', 'Travel, Transport']];
  return (
    <View style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Text style={{ fontSize: 28 }}>🇪🇸</Text>
        <View style={{ flex: 1 }}><Strong>Are you in Spain?</Strong><Mini>Two card payments there today</Mini></View>
        <Animated.View style={[{ paddingHorizontal: 14, height: 34, borderRadius: 17, backgroundColor: C.ink, justifyContent: 'center' }, press]}><Strong style={{ color: C.bg }}>Start trip</Strong></Animated.View>
      </View>
      {rows.map(([icon, name, before, after], i) => <Retag key={name} t={t} at={0.38 + i * 0.1} icon={icon} name={name} before={before} after={after} />)}
    </View>
  );
}
function Retag({ t, at, icon, name, before, after }: { t: SharedValue<number>; at: number; icon: string; name: string; before: string; after: string }) {
  const out = useAnimatedStyle(() => ({ opacity: interpolate(t.get(), [at, at + 0.06, 0.92, 1], [1, 0, 0, 1], 'clamp') }));
  const inn = useAnimatedStyle(() => ({ opacity: show(t.get(), at, at + 0.06), transform: [{ translateY: (1 - show(t.get(), at, at + 0.06)) * 6 }] }));
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <Dot icon={icon} />
      <View style={{ flex: 1 }}>
        <Strong>{name}</Strong>
        <View style={{ height: 18 }}>
          <Animated.View style={[{ position: 'absolute' }, out]}><Mini>{before}</Mini></Animated.View>
          <Animated.View style={[{ position: 'absolute', flexDirection: 'row', alignItems: 'center', gap: 4 }, inn]}><Icon name="plane" size={12} color={C.ahead} /><Mini style={{ color: C.ahead }}>{after}</Mini></Animated.View>
        </View>
      </View>
    </View>
  );
}

function MapDemo({ active, w }: { active: boolean; w: number }) {
  const t = useLoop(active, 3600, 0.5);
  const h = 170;
  const spots: [number, number, number, string, string][] = [[0.68, 0.2, 64, '#83B8FF', 'Aarhus'], [0.3, 0.72, 48, '#EDA9D2', 'Barcelona'], [0.58, 0.8, 36, '#C6AAFF', 'Rome']];
  return (
    <View style={{ height: h, borderRadius: 18, overflow: 'hidden', backgroundColor: '#111317' }}>
      {[0.25, 0.5, 0.75].map((y) => <View key={`h${y}`} style={{ position: 'absolute', left: 0, right: 0, top: h * y, height: 1, backgroundColor: C.line }} />)}
      {[0.25, 0.5, 0.75].map((x) => <View key={`v${x}`} style={{ position: 'absolute', top: 0, bottom: 0, left: (w - 32) * x, width: 1, backgroundColor: C.line }} />)}
      {spots.map(([x, y, size, color, name], i) => <Glow key={name} t={t} phase={i / 3} x={(w - 32) * x} y={h * y} size={size} color={color} name={name} />)}
    </View>
  );
}
function Glow({ t, phase, x, y, size, color, name }: { t: SharedValue<number>; phase: number; x: number; y: number; size: number; color: string; name: string }) {
  const s = useAnimatedStyle(() => { const v = Math.sin(((t.get() + phase) % 1) * Math.PI * 2); return { opacity: 0.35 + 0.2 * v, transform: [{ scale: 1 + 0.12 * v }] }; });
  return (
    <View style={{ position: 'absolute', left: x - size / 2, top: y - size / 2, width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={[{ position: 'absolute', width: size, height: size, borderRadius: size / 2, backgroundColor: color }, s]} />
      <View style={{ width: size * 0.32, height: size * 0.32, borderRadius: size, backgroundColor: color }} />
      <Mini style={{ position: 'absolute', top: size / 2 + size * 0.2, color: C.ink2, fontSize: 11, width: 80, textAlign: 'center' }}>{name}</Mini>
    </View>
  );
}

function SettingsDemo({ active }: { active: boolean }) {
  const t = useLoop(active, 4400, 0.8);
  const rows: [string, string][] = [['tag', 'Categories'], ['rule', 'Merchant rules'], ['bank', 'Accounts & sync'], ['plane', 'Trips'], ['help', 'How Cashflow works']];
  return (
    <View style={{ gap: 10 }}>
      {rows.map(([icon, name], i) => (
        <Appear key={name} t={t} a={0.04 + i * 0.07} b={0.16 + i * 0.07} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Dot icon={icon} size={30} /><Strong style={{ flex: 1 }}>{name}</Strong><Icon name="chev" size={14} color={C.ink3} />
        </Appear>
      ))}
    </View>
  );
}

// ——— The chapters ———

type Chapter = { mood: Mood; title: string; why: string; how: string[]; demo: (p: { active: boolean; w: number }) => ReactNode };
const CHAPTERS: Chapter[] = [
  { mood: 'pay', title: 'Your money, payday to payday', why: 'Cashflow reads your banks by itself and shows what is left until the next salary.', demo: PaydayDemo,
    how: ['A cycle starts the day your salary lands and ends the day before the next one.', 'The banks sync three times a day. Pull down on any screen to sync now.', 'On Cycle, swipe the big number sideways to see earlier cycles.'] },
  { mood: 'calm', title: 'Budgets', why: 'A limit for each category in this cycle, so you know what you can still spend.', demo: BudgetsDemo,
    how: ['Budgets tab, tap a category, then Set budget.', 'White is fine. Amber means going fast: more spent than days gone. Coral is over.', 'Cycle plan shows what you can really save: salary, minus spending, minus the room left in budgets.'] },
  { mood: 'ahead', title: 'Activity and the Inbox', why: 'Every payment from the bank, already sorted into a category.', demo: ActivityDemo,
    how: ['A red number on Activity means something new waits in the Inbox.', 'The Inbox holds only purchases the app was unsure about. Tap Yes, or change it.', 'Search finds a name, a note, a category or a date like 24.11.'] },
  { mood: 'over', title: 'Fix one purchase', why: 'When a category is wrong, or one payment was really several things.', demo: SplitDemo,
    how: ['Tap a purchase, then Change category. Always makes that shop go there every time.', 'Split into parts: 300 kr. was a gift, the rest was shopping. Each part counts in its own category.', `Mark a part Shared with ${PARTNER} and only your share of it counts.`] },
  { mood: 'shared', title: `The pot with ${PARTNER}`, why: 'The joint account you both put money into for shared things.', demo: PotDemo,
    how: [`People, then With ${PARTNER}: what each of you put in and what you spent together.`, 'Your share follows what you each put in. Nobody types a ratio.', 'Shared purchases carry a turning ring.'] },
  { mood: 'calm', title: 'Debts, only when you say so', why: 'Lent money or borrowed it? Keep track until it is settled.', demo: DebtDemo,
    how: ['People, then New debt. Pick the person and which way it goes.', 'Tick their bank transfers that belong to it, or type cash paid outside the bank.', 'When they send money again, People asks: add it to the debt? You say Add or No.'] },
  { mood: 'pay', title: 'Trips', why: 'Holiday spending stays apart from your everyday budgets.', demo: TripDemo,
    how: ['After two card payments abroad, Activity asks if you are there. Tap Start trip.', 'Shops there move to Travel. Rent and subscriptions stay where they are.', 'Settings, then Trips: every trip with its total. A purchase can be left out with Not part of the trip.'] },
  { mood: 'over', title: 'Where it went', why: 'Which categories took the most, against the cycle before.', demo: MapDemo,
    how: ['Cycle, then Where it went. Look at a week, a cycle or a year.', 'Tap a category to see its purchases.', 'The map button shows a glow wherever you paid, city by city.'] },
  { mood: 'calm', title: 'Make it yours', why: 'Categories, rules and your bank connection live in Settings.', demo: SettingsDemo,
    how: ['Categories: add, rename and pick icons.', 'Merchant rules: one shop name always goes to one category.', 'Accounts & sync: your banks, balances and savings goals. This guide is here too, any time.'] },
];

/** One chapter. As it slides, its words and picture move at different speeds, so the page has depth. */
function Page({ c, i, pos, active, w, top }: { c: Chapter; i: number; pos: SharedValue<number>; active: boolean; w: number; top: number }) {
  const reduce = useReducedMotion();
  const head = useAnimatedStyle(() => {
    const d = i - pos.get();
    return { opacity: interpolate(Math.abs(d), [0, 0.8], [1, 0], 'clamp'), transform: [{ translateX: reduce ? 0 : d * 60 }] };
  });
  const card = useAnimatedStyle(() => {
    const d = i - pos.get();
    return { opacity: interpolate(Math.abs(d), [0, 0.8], [1, 0], 'clamp'), transform: [{ translateX: reduce ? 0 : d * 30 }, { scale: reduce ? 1 : interpolate(Math.abs(d), [0, 1], [1, 0.92], 'clamp') }] };
  });
  const body = useAnimatedStyle(() => {
    const d = i - pos.get();
    return { opacity: interpolate(Math.abs(d), [0, 0.8], [1, 0], 'clamp'), transform: [{ translateX: reduce ? 0 : d * 140 }] };
  });
  const ink = MOODS[c.mood].ink;
  const inner = w - 48;
  return (
    <Animated.ScrollView style={{ width: w }} contentContainerStyle={{ paddingTop: top + 56, paddingHorizontal: 24, paddingBottom: 140, gap: 22 }} showsVerticalScrollIndicator={false}>
      <Animated.View style={[{ gap: 6 }, head]}>
        <Text style={{ fontFamily: F.label, fontSize: 14, color: ink, opacity: 0.75 }}>{i + 1} of {CHAPTERS.length}</Text>
        <Text style={{ fontFamily: F.title, fontSize: 36, lineHeight: 40, color: ink }} accessibilityRole="header">{c.title}</Text>
      </Animated.View>
      <Animated.View style={[{ borderRadius: 28, padding: 16, backgroundColor: CARD, borderWidth: 1, borderColor: C.line }, card]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {c.demo({ active, w: inner })}
      </Animated.View>
      <Animated.View style={[{ gap: 16 }, body]}>
        <Text style={{ fontFamily: F.strong, fontSize: 19, lineHeight: 26, color: C.ink }}>{c.why}</Text>
        {c.how.map((step, n) => (
          <View key={n} style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center', marginTop: 1 }}><Text style={{ fontFamily: F.strong, fontSize: 13, color: C.ink }}>{n + 1}</Text></View>
            <Text style={{ flex: 1, fontFamily: F.body, fontSize: 16, lineHeight: 23, color: C.ink2 }}>{step}</Text>
          </View>
        ))}
      </Animated.View>
    </Animated.ScrollView>
  );
}

export default function GuideScreen() {
  const { width: w, height: h } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  // ?page=3 opens a chapter straight away
  const { page } = useLocalSearchParams<{ page?: string }>();
  const start = Math.max(0, Math.min(CHAPTERS.length - 1, Number(page) || 0));
  const pos = useSharedValue(start);
  const [active, setActive] = useState(start);
  const scroller = useAnimatedRef<Animated.ScrollView>();
  const last = CHAPTERS.length - 1;
  const onScroll = useAnimatedScrollHandler((e) => { pos.set(e.contentOffset.x / w); });
  // A new chapter starts its picture and gives one tick, the moment the swipe settles past half way.
  const settle = useRef((i: number) => { setActive(i); tap(); });
  useAnimatedReaction(() => Math.round(pos.get()), (i, prev) => { if (prev !== null && i !== prev) scheduleOnRN(settle.current, i); });
  const finish = (): void => {
    AsyncStorage.setItem(GUIDE_SEEN, '1').catch(() => undefined);
    if (router.canGoBack()) router.back(); else router.replace('/');
  };
  const next = (): void => { if (active >= last) finish(); else scroller.current?.scrollTo({ x: (active + 1) * w, animated: true }); };
  const pill = useAnimatedStyle(() => ({ transform: [{ translateX: pos.get() * 14 }] }));
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Aura moods={CHAPTERS.map((c) => c.mood)} position={pos} style={{ position: 'absolute', left: 0, right: 0, top: 0, height: h * 0.62 }} />
      <LinearGradient colors={['rgba(11,11,13,0)', C.bg]} style={{ position: 'absolute', left: 0, right: 0, top: h * 0.62 - 220, height: 221 }} pointerEvents="none" />
      <Animated.ScrollView ref={scroller} horizontal pagingEnabled contentOffset={{ x: start * w, y: 0 }} showsHorizontalScrollIndicator={false} onScroll={onScroll} scrollEventThrottle={16} style={{ flex: 1 }}>
        {CHAPTERS.map((c, i) => <Page key={c.title} c={c} i={i} pos={pos} active={active === i} w={w} top={insets.top} />)}
      </Animated.ScrollView>
      <View style={{ position: 'absolute', top: insets.top + 8, right: 16, borderRadius: 999, backgroundColor: CARD }}><Btn kind="link" label="Skip" onPress={finish} /></View>
      <LinearGradient colors={['rgba(11,11,13,0)', C.bg, C.bg]} locations={[0, 0.35, 1]} style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingTop: 40, paddingBottom: insets.bottom + 12, paddingHorizontal: 24, gap: 18 }} pointerEvents="box-none">
        <View style={{ flexDirection: 'row', alignSelf: 'center', gap: 6 }} accessibilityLabel={`Chapter ${active + 1} of ${CHAPTERS.length}`}>
          {CHAPTERS.map((c) => <View key={c.title} style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: C.track }} />)}
          <Animated.View style={[{ position: 'absolute', left: 0, width: 8, height: 8, borderRadius: 4, backgroundColor: C.ink }, pill]} />
        </View>
        <Btn label={active >= last ? 'Start using Cashflow' : 'Next'} onPress={next} />
      </LinearGradient>
    </View>
  );
}
