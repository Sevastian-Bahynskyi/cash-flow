import { createContext, isValidElement, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View, type PressableProps, type StyleProp, type TextInputProps, type TextStyle, type ViewStyle } from 'react-native';
import Animated, { Easing, FadeIn, FadeInDown, FadeOut, FadeOutDown, LayoutAnimationConfig, LinearTransition, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { C, F, R } from './theme';
import { iconFor } from './iconMap';
import { kr } from '@/core/fmt';
import { budgetState, type BudgetState } from '@/core/domain/budget-state';

/** A tick for a discrete choice: a row, a tab, an option. */
export const tap = (): void => { Haptics.selectionAsync().catch(() => undefined); };
/** A light knock for a button that does something. */
export const knock = (): void => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined); };
/** The outcome of a save, felt as well as read. */
export const outcome = (ok: boolean): void => {
  Haptics.notificationAsync(ok ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error).catch(() => undefined);
};

const SLIDE = { duration: 320, dampingRatio: 0.82 } as const;
// CSS transitions take a keyword here: Expo's web style types reject a cubicBezier() object
const PRESS = { transitionProperty: 'transform', transitionDuration: '140ms', transitionTimingFunction: 'ease-out' } as const;
const GROW = { duration: 650, easing: Easing.bezier(0.23, 1, 0.32, 1) } as const;
const MOVE = LinearTransition.duration(240).easing(Easing.bezier(0.77, 0, 0.175, 1));
const ROW_IN = FadeIn.duration(220).delay(60);
const ROW_OUT = FadeOut.duration(140);
const TOAST_IN = FadeInDown.duration(280).easing(Easing.bezier(0.23, 1, 0.32, 1));
const TOAST_OUT = FadeOutDown.duration(180);

// iOS 26 liquid glass; older systems get a quiet translucent fill
const GLASS = isLiquidGlassAvailable() && isGlassEffectAPIAvailable();
export function Glass({ style, interactive, children }: { style?: StyleProp<ViewStyle>; interactive?: boolean; children?: ReactNode }) {
  if (!GLASS) return <View style={[{ backgroundColor: 'rgba(255,255,255,0.1)' }, style]}>{children}</View>;
  return <GlassView glassEffectStyle="regular" colorScheme="dark" isInteractive={interactive} style={style}>{children}</GlassView>;
}

/** A pressable that gives a little under the finger: it sinks on press-in and springs back on release. */
export function Press({ style, scale = 0.97, children, onPressIn, onPressOut, ...rest }: Omit<PressableProps, 'style' | 'children'> & { style?: StyleProp<ViewStyle>; scale?: number; children: ReactNode }) {
  const [down, setDown] = useState(false);
  return (
    <Pressable {...rest} pressRetentionOffset={16} onPressIn={(e) => { setDown(true); onPressIn?.(e); }} onPressOut={(e) => { setDown(false); onPressOut?.(e); }}>
      <Animated.View style={[style, PRESS, { transform: [{ scale: down ? scale : 1 }] }]}>{children}</Animated.View>
    </Pressable>
  );
}

const ACTIONS = new Set(['add', 'close', 'back', 'chev', 'down', 'check', 'done', 'search', 'filter', 'edit', 'trash', 'more', 'swap', 'split', 'undo', 'retry', 'signout', 'export', 'import', 'in', 'out', 'moved', 'sync']);

export function Icon({ name, size = 22, color = C.ink, strong }: { name: string | null | undefined; size?: number; color?: string; strong?: boolean }): React.JSX.Element {
  const I = iconFor(name);
  return <I size={size} color={color} strokeWidth={strong ? 2.4 : ACTIONS.has(name ?? '') ? 2 : 1.8} />;
}

export function T({ children, style, k = 'body', numberOfLines, maxFontSizeMultiplier }: { children: ReactNode; style?: StyleProp<TextStyle>; k?: keyof typeof TS; numberOfLines?: number; maxFontSizeMultiplier?: number }) {
  return <Text style={[TS[k], style]} numberOfLines={numberOfLines} maxFontSizeMultiplier={maxFontSizeMultiplier}>{children}</Text>;
}
const TS = StyleSheet.create({
  body: { fontFamily: F.body, fontSize: 16, color: C.ink },
  strong: { fontFamily: F.strong, fontSize: 16, color: C.ink },
  meta: { fontFamily: F.body, fontSize: 13, color: C.ink3 },
  note: { fontFamily: F.body, fontSize: 13, lineHeight: 18, color: C.ink3 },
  sec: { fontFamily: F.title, fontSize: 20, color: C.ink },
  title: { fontFamily: F.title, fontSize: 30, color: C.ink },
  num: { fontFamily: F.strong, fontSize: 16, color: C.ink, fontVariant: ['tabular-nums'] },
  big: { fontFamily: F.num, fontSize: 56, color: C.ink, letterSpacing: -1 },
});

/** A scrolling screen on the black ground; pull to refresh asks the bank for news. */
export function Screen({ children, onRefresh, header, pad = true }: { children: ReactNode; onRefresh?: () => Promise<void>; header?: ReactNode; pad?: boolean }) {
  const [busy, setBusy] = useState(false);
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 140 }}
        refreshControl={onRefresh ? <RefreshControl tintColor={C.ink} refreshing={busy} onRefresh={() => { knock(); setBusy(true); onRefresh().then(() => setBusy(false), () => setBusy(false)); }} /> : undefined}
      >
        {header}
        <View style={pad ? { paddingHorizontal: 16, gap: 12 } : undefined}>{children}</View>
      </ScrollView>
    </View>
  );
}

/** A screen title with Back when it is not a tab. */
export function Header({ title, sub, back, right, overAura, wrapTitle }: { title: string; sub?: string; back?: boolean; right?: ReactNode; overAura?: boolean; wrapTitle?: boolean }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  return (
    <View style={[st.header, { paddingTop: insets.top + 8 }]}>
      <View style={st.headerRow}>
        {back ? (
          <IconBtn name="back" label="Back" color={overAura ? '#FFFFFF' : C.ink} onPress={() => { if (router.canGoBack()) router.back(); else router.replace('/'); }} />
        ) : null}
        <View style={{ flex: 1 }}>
          <T k="title" style={overAura ? { color: '#FFFFFF' } : undefined} numberOfLines={wrapTitle ? undefined : 1} maxFontSizeMultiplier={wrapTitle ? 2.5 : undefined}>{title}</T>
          {sub ? <T k="meta" style={overAura ? { color: 'rgba(255,255,255,0.8)' } : undefined}>{sub}</T> : null}
        </View>
        {right}
      </View>
    </View>
  );
}

/** A round liquid-glass button for a header or a pager. */
export function IconBtn({ name, onPress, label, color = C.ink, disabled }: { name: string; onPress: () => void; label: string; color?: string; disabled?: boolean }) {
  return (
    <Glass interactive={!disabled} style={[st.iconBtn, disabled && { opacity: 0.45 }]}>
      <Pressable hitSlop={8} onPress={() => { tap(); onPress(); }} style={st.iconFill} accessibilityRole="button" accessibilityLabel={label} disabled={disabled} accessibilityState={{ disabled }}>
        <Icon name={name} color={disabled ? C.ink3 : color} strong />
      </Pressable>
    </Glass>
  );
}

export const Sec = ({ children, right }: { children: ReactNode; right?: ReactNode }) => (
  <View style={st.sec}><T k="sec">{children}</T>{right}</View>
);

export const Panel = ({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) => <View style={[st.panel, style]}>{children}</View>;

/** A round icon disc; a shared row adds the turning ring around it. */
export function Disc({ icon, color = C.ink, bg = C.surface2, children }: { icon?: string | null; color?: string; bg?: string; children?: ReactNode }) {
  return (
    <View style={st.discSlot}>
      <View style={[st.disc, { backgroundColor: bg }]}>{icon !== undefined ? <Icon name={icon} size={21} color={color} /> : null}</View>
      {children}
    </View>
  );
}

export function Row({ lead, title, meta, end, onPress, disabled, selected, expanded, stackEnd, accessibilityLabel }: {
  lead?: ReactNode; title: ReactNode; meta?: ReactNode; end?: ReactNode; onPress?: () => void; disabled?: boolean; selected?: boolean; expanded?: boolean; stackEnd?: boolean; accessibilityLabel?: string;
}) {
  const body = (
    <>
      {lead}
      <View style={{ flex: 1, minWidth: 0 }}>
        {typeof title === 'string' ? <T k="strong" numberOfLines={stackEnd ? undefined : 1}>{title}</T> : title}
        {meta ? (typeof meta === 'string' ? <T k="meta" numberOfLines={stackEnd ? undefined : 1}>{meta}</T> : meta) : null}
        {stackEnd ? end : null}
      </View>
      {stackEnd ? null : end}
    </>
  );
  if (!onPress) return <View style={[st.row, selected && st.rowSel]}>{body}</View>;
  return <PressRow disabled={disabled} selected={selected} onPress={onPress} accessibilityLabel={accessibilityLabel} expanded={expanded}>{body}</PressRow>;
}

/** A list row lights up at once under the finger and fades back on release, like a system list. */
function PressRow({ children, onPress, disabled, selected, expanded, accessibilityLabel }: { children: ReactNode; onPress: () => void; disabled?: boolean; selected?: boolean; expanded?: boolean; accessibilityLabel?: string }) {
  const [down, setDown] = useState(false);
  return (
    <Pressable disabled={disabled} onPress={() => { tap(); onPress(); }} onPressIn={() => setDown(true)} onPressOut={() => setDown(false)} pressRetentionOffset={16}
      accessibilityRole="button" accessibilityLabel={accessibilityLabel} accessibilityState={{ expanded, disabled }}>
      <Animated.View style={[st.row, { backgroundColor: down || selected ? C.surface2 : 'rgba(33,33,38,0)', transitionProperty: 'backgroundColor', transitionDuration: down ? '0ms' : '260ms', transitionTimingFunction: 'ease-out' }, disabled && { opacity: 0.5 }]}>
        {children}
      </Animated.View>
    </Pressable>
  );
}

export const Divider = () => <View style={st.divider} />;

/** Rows split by hairlines inside one panel. `animate` lets rows that come and go fade and the rest slide into place. */
export function List({ children, animate }: { children: ReactNode[]; animate?: boolean }) {
  const items = children.filter(Boolean);
  const keyOf = (c: ReactNode, i: number): string | number => (isValidElement(c) && c.key != null ? c.key : i);
  if (!animate) return <Panel>{items.map((c, i) => <View key={keyOf(c, i)}>{i > 0 ? <Divider /> : null}{c}</View>)}</Panel>;
  return (
    <LayoutAnimationConfig skipEntering skipExiting>
      <Animated.View layout={MOVE} style={st.panel}>
        {items.map((c, i) => <Animated.View key={keyOf(c, i)} layout={MOVE} entering={ROW_IN} exiting={ROW_OUT}>{i > 0 ? <Divider /> : null}{c}</Animated.View>)}
      </Animated.View>
    </LayoutAnimationConfig>
  );
}

/** A link row to another screen. */
export function NavRow({ href, icon, name, sub, end }: { href: string; icon: string; name: string; sub?: string; end?: ReactNode }) {
  const router = useRouter();
  return <Row lead={<Disc icon={icon} />} title={name} meta={sub} end={<View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>{end}<Icon name="chev" size={16} color={C.ink3} strong /></View>} onPress={() => router.push(href as never)} />;
}

/** A segmented control whose white thumb slides to the picked option. */
export function Seg<K extends string>({ value, options, onChange }: { value: K; options: [K, string][]; onChange: (k: K) => void }) {
  const [boxes, setBoxes] = useState<Partial<Record<K, { x: number; w: number }>>>({});
  const x = useSharedValue(0);
  const w = useSharedValue(0);
  const box = boxes[value];
  useEffect(() => {
    if (!box) return;
    // the first placement jumps; later picks slide
    const first = w.get() === 0;
    x.set(first ? box.x : withSpring(box.x, SLIDE));
    w.set(first ? box.w : withSpring(box.w, SLIDE));
  }, [box, x, w]);
  const thumb = useAnimatedStyle(() => ({ width: w.get(), opacity: w.get() ? 1 : 0, transform: [{ translateX: x.get() }] }));
  return (
    <View style={st.seg} accessibilityRole="tablist">
      <Animated.View style={[st.segThumb, thumb]} />
      {options.map(([k, label]) => (
        <Pressable key={k} onPress={() => { if (k !== value) { tap(); onChange(k); } }} style={st.segBtn} accessibilityRole="tab" accessibilityState={{ selected: value === k }}
          onLayout={(e) => { const { x: bx, width } = e.nativeEvent.layout; setBoxes((b) => ({ ...b, [k]: { x: bx, w: width } })); }}>
          <Animated.Text style={[st.segText, { color: value === k ? C.bg : C.ink2, transitionProperty: 'color', transitionDuration: '180ms', transitionTimingFunction: 'ease-out' }]}>{label}</Animated.Text>
        </Pressable>
      ))}
    </View>
  );
}

export function Btn({ label, onPress, kind = 'primary', disabled, icon, busy }: { label: string; onPress: () => void; kind?: 'primary' | 'ghost' | 'link' | 'danger'; disabled?: boolean; icon?: string; busy?: boolean }) {
  const fg = kind === 'primary' ? C.bg : kind === 'danger' ? C.over : C.ink;
  return (
    <Press disabled={disabled || busy} onPress={() => { if (kind === 'link') tap(); else knock(); onPress(); }} style={[st.btn, st[kind], (disabled || busy) && { opacity: 0.45 }]} scale={kind === 'link' ? 0.94 : 0.96}
      accessibilityRole="button" accessibilityState={{ disabled: disabled || busy, busy }}>
      {busy ? <ActivityIndicator color={fg} /> : <>{icon ? <Icon name={icon} size={18} color={fg} /> : null}<Text style={[st.btnText, { color: fg }]}>{label}</Text></>}
    </Press>
  );
}

export const Empty = ({ title, sub }: { title: string; sub?: string }) => (
  <View style={st.empty}><T k="strong" style={{ textAlign: 'center' }}>{title}</T><T k="note" style={{ textAlign: 'center' }}>{sub ?? 'New transactions arrive from your bank.'}</T></View>
);

/** A label and an input, the one field style. */
export function Field({ label, hint, error, ...input }: TextInputProps & { label: string; hint?: string; error?: string | null }) {
  return (
    <View style={{ gap: 6 }}>
      <T k="meta">{label}</T>
      <TextInput placeholderTextColor={C.ink3} {...input} style={[st.input, input.multiline && { minHeight: 90, textAlignVertical: 'top' }, input.style]} />
      {error ? <T k="note" style={{ color: C.over }}>{error}</T> : hint ? <T k="note">{hint}</T> : null}
    </View>
  );
}

/** The one sheet: a page sheet that slides up, with Close and a title. */
export function Sheet({ open, onClose, title, right, children }: { open: boolean; onClose: () => void; title: string; right?: ReactNode; children: ReactNode }) {
  return (
    <Modal visible={open} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        <View style={st.sheetBar}>
          <IconBtn name="close" label="Close" onPress={onClose} />
          <T k="strong" style={{ flex: 1, textAlign: 'center' }} numberOfLines={1}>{title}</T>
          <View style={{ minWidth: 44, alignItems: 'flex-end' }}>{right}</View>
        </View>
        <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">{children}</ScrollView>
      </View>
    </Modal>
  );
}

/** Spent against a budget: white within it, amber when ahead of the days; over it, grey to the line and the over part in coral. */
export function Meter({ spent, amount, share, height = 8, color }: { spent: number; amount: number; share: number; height?: number; color?: string }) {
  if (!amount) return null;
  const s = budgetState(spent, amount, share);
  const pct = (x: number): `${number}%` => `${Math.round(1000 * Math.min(1, Math.max(0, x))) / 10}%`;
  return (
    <View style={[st.meter, { height, borderRadius: height }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {s === 'over' ? (
        <>
          <Fill width={pct(amount / spent)} style={{ backgroundColor: color ?? C.ink3, borderRadius: height }} />
          <Fill width={pct(1 - amount / spent)} style={{ left: pct(amount / spent), backgroundColor: C.over, borderRadius: height }} />
        </>
      ) : (
        <Fill width={pct(spent / amount)} style={{ backgroundColor: color ?? (s === 'ahead' ? C.ahead : C.bar), borderRadius: height }} />
      )}
    </View>
  );
}

/** A meter fill that grows to its share when it appears or changes. */
function Fill({ width, style }: { width: `${number}%`; style: StyleProp<ViewStyle> }) {
  const p = useSharedValue(0);
  const target = parseFloat(width);
  useEffect(() => { p.set(withTiming(target, GROW)); }, [p, target]);
  const grow = useAnimatedStyle(() => ({ width: `${p.get()}%` }));
  return <Animated.View style={[st.meterFill, style, grow]} />;
}

/** The words for a budget's state: colour never speaks alone. */
export function StatePill({ left, st: s }: { left: number; st: BudgetState }) {
  const v = kr(Math.abs(left), true);
  const [text, color] = s === 'over' ? [`${v} over`, C.over] : s === 'ahead' ? [`${v} left, ahead`, C.ahead] : s === 'none' ? ['No budget', C.ink3] : left === 0 ? ['Used up', C.ink3] : [`${v} left`, C.ink];
  return <Text style={[st.pill, { color }]}>{text}</Text>;
}

/* toasts: one quiet line at the bottom, with Undo when it helps */
type Toast = { id: number; msg: string; undo?: () => void };
type ShowToast = (msg: string, undo?: () => void, tone?: 'ok' | 'error') => void;
const ToastCtx = createContext<ShowToast>(() => undefined);
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }: { children: ReactNode }) {
  const [t, setT] = useState<Toast | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const insets = useSafeAreaInsets();
  const show = useCallback<ShowToast>((msg, undo, tone = 'ok') => {
    outcome(tone === 'ok');
    setT((prev) => ({ id: (prev?.id ?? 0) + 1, msg, undo }));
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setT(null), 4200);
  }, []);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {t ? (
        <Animated.View key={t.id} entering={TOAST_IN} exiting={TOAST_OUT} style={[st.toast, { bottom: insets.bottom + 96 }]} accessibilityLiveRegion="polite">
          <Text style={st.toastText}>{t.msg}</Text>
          {t.undo ? <Pressable hitSlop={12} onPress={() => { tap(); t.undo?.(); setT(null); }}><Text style={[st.toastText, { fontFamily: F.strong, textDecorationLine: 'underline' }]}>Undo</Text></Pressable> : null}
        </Animated.View>
      ) : null}
    </ToastCtx.Provider>
  );
}

export const st = StyleSheet.create({
  header: { paddingHorizontal: 16, paddingBottom: 12 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 },
  iconBtn: { width: 44, height: 44, borderRadius: 22, overflow: 'hidden' },
  iconFill: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  sec: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 18, paddingHorizontal: 4 },
  panel: { backgroundColor: C.surface, borderRadius: R.panel, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 11, minHeight: 60 },
  rowSel: { backgroundColor: C.surface2 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: C.line, marginLeft: 66 },
  discSlot: { width: 40, height: 40 },
  disc: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  seg: { flexDirection: 'row', alignSelf: 'flex-start', backgroundColor: C.surface, borderRadius: R.pill, padding: 3 },
  segBtn: { minHeight: 40, paddingHorizontal: 16, borderRadius: R.pill, justifyContent: 'center' },
  segThumb: { position: 'absolute', top: 3, bottom: 3, left: 0, borderRadius: R.pill, backgroundColor: C.ink },
  segText: { fontFamily: F.strong, fontSize: 14, color: C.ink2 },
  btn: { minHeight: 48, paddingHorizontal: 20, borderRadius: R.pill, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  primary: { backgroundColor: C.ink },
  ghost: { backgroundColor: C.surface2 },
  link: { backgroundColor: 'transparent', paddingHorizontal: 8, minHeight: 44 },
  danger: { backgroundColor: C.surface2 },
  btnText: { fontFamily: F.strong, fontSize: 16 },
  empty: { padding: 24, gap: 6, alignItems: 'center' },
  input: { fontFamily: F.body, fontSize: 17, color: C.ink, backgroundColor: C.surface, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12, minHeight: 48 },
  sheetBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingTop: 10, paddingBottom: 6 },
  meter: { backgroundColor: C.track, overflow: 'visible', position: 'relative', marginTop: 6 },
  meterFill: { position: 'absolute', top: 0, bottom: 0, left: 0 },
  pill: { fontFamily: F.strong, fontSize: 14, fontVariant: ['tabular-nums'] },
  toast: { position: 'absolute', left: 16, right: 16, backgroundColor: C.ink, borderRadius: 18, paddingHorizontal: 16, paddingVertical: 12, flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  toastText: { fontFamily: F.body, fontSize: 15, color: C.bg, flexShrink: 1 },
});
