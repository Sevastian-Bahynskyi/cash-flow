import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View, type StyleProp, type TextInputProps, type TextStyle, type ViewStyle } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { C, F, R } from './theme';
import { iconFor } from './iconMap';
import { kr } from '@/core/fmt';
import { budgetState, type BudgetState } from '@/core/domain/budget-state';

export const tap = (): void => { Haptics.selectionAsync().catch(() => undefined); };

// Actions draw as plain strokes: Phosphor's duotone Plus, X, check and arrows carry a tinted square behind them.
const ACTIONS = new Set(['add', 'close', 'back', 'chev', 'down', 'check', 'done', 'search', 'filter', 'edit', 'trash', 'more', 'swap', 'split', 'undo', 'retry', 'signout', 'export', 'import', 'in', 'out', 'moved', 'sync']);

/** A Phosphor icon by meaning or stored category name: duotone for things, bold strokes for actions. */
export function Icon({ name, size = 22, color = C.ink, weight }: { name: string | null | undefined; size?: number; color?: string; weight?: 'duotone' | 'fill' | 'regular' | 'bold' }) {
  const I = iconFor(name);
  return <I size={size} color={color} weight={weight ?? (ACTIONS.has(name ?? '') ? 'bold' : 'duotone')} />;
}

export function T({ children, style, k = 'body', numberOfLines }: { children: ReactNode; style?: StyleProp<TextStyle>; k?: keyof typeof TS; numberOfLines?: number }) {
  return <Text style={[TS[k], style]} numberOfLines={numberOfLines}>{children}</Text>;
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
        refreshControl={onRefresh ? <RefreshControl tintColor={C.ink} refreshing={busy} onRefresh={() => { setBusy(true); onRefresh().then(() => setBusy(false), () => setBusy(false)); }} /> : undefined}
      >
        {header}
        <View style={pad ? { paddingHorizontal: 16, gap: 12 } : undefined}>{children}</View>
      </ScrollView>
    </View>
  );
}

/** A screen title with Back when it is not a tab. */
export function Header({ title, sub, back, right, overAura }: { title: string; sub?: string; back?: boolean; right?: ReactNode; overAura?: boolean }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  return (
    <View style={[st.header, { paddingTop: insets.top + 8 }]}>
      <View style={st.headerRow}>
        {back ? (
          <Pressable hitSlop={12} onPress={() => { tap(); if (router.canGoBack()) router.back(); else router.replace('/'); }} style={st.iconBtn} accessibilityRole="button" accessibilityLabel="Back">
            <Icon name="back" weight="bold" color={overAura ? '#FFFFFF' : C.ink} />
          </Pressable>
        ) : null}
        <View style={{ flex: 1 }}>
          <T k="title" style={overAura ? { color: '#FFFFFF' } : undefined} numberOfLines={1}>{title}</T>
          {sub ? <T k="meta" style={overAura ? { color: 'rgba(255,255,255,0.8)' } : undefined}>{sub}</T> : null}
        </View>
        {right}
      </View>
    </View>
  );
}

export function IconBtn({ name, onPress, label, color = C.ink, disabled }: { name: string; onPress: () => void; label: string; color?: string; disabled?: boolean }) {
  return (
    <Pressable hitSlop={10} onPress={() => { tap(); onPress(); }} style={st.iconBtn} accessibilityRole="button" accessibilityLabel={label} disabled={disabled} accessibilityState={{ disabled }}>
      <Icon name={name} color={disabled ? C.ink3 : color} />
    </Pressable>
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

export function Row({ lead, title, meta, end, onPress, disabled, selected, expanded, accessibilityLabel }: {
  lead?: ReactNode; title: ReactNode; meta?: ReactNode; end?: ReactNode; onPress?: () => void; disabled?: boolean; selected?: boolean; expanded?: boolean; accessibilityLabel?: string;
}) {
  const body = (
    <>
      {lead}
      <View style={{ flex: 1, minWidth: 0 }}>
        {typeof title === 'string' ? <T k="strong" numberOfLines={1}>{title}</T> : title}
        {meta ? (typeof meta === 'string' ? <T k="meta" numberOfLines={1}>{meta}</T> : meta) : null}
      </View>
      {end}
    </>
  );
  if (!onPress) return <View style={[st.row, selected && st.rowSel]}>{body}</View>;
  return (
    <Pressable disabled={disabled} onPress={() => { tap(); onPress(); }} style={({ pressed }) => [st.row, selected && st.rowSel, pressed && { backgroundColor: C.surface2 }, disabled && { opacity: 0.5 }]} accessibilityRole="button" accessibilityLabel={accessibilityLabel} accessibilityState={{ expanded }}>
      {body}
    </Pressable>
  );
}

export const Divider = () => <View style={st.divider} />;

/** Rows split by hairlines inside one panel. */
export function List({ children }: { children: ReactNode[] }) {
  const items = children.filter(Boolean);
  return <Panel>{items.map((c, i) => <View key={i}>{i > 0 ? <Divider /> : null}{c}</View>)}</Panel>;
}

/** A link row to another screen. */
export function NavRow({ href, icon, name, sub, end }: { href: string; icon: string; name: string; sub?: string; end?: ReactNode }) {
  const router = useRouter();
  return <Row lead={<Disc icon={icon} />} title={name} meta={sub} end={<View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>{end}<Icon name="chev" size={16} color={C.ink3} weight="bold" /></View>} onPress={() => router.push(href as never)} />;
}

export function Seg<K extends string>({ value, options, onChange }: { value: K; options: [K, string][]; onChange: (k: K) => void }) {
  return (
    <View style={st.seg} accessibilityRole="tablist">
      {options.map(([k, label]) => (
        <Pressable key={k} onPress={() => { tap(); onChange(k); }} style={[st.segBtn, value === k && st.segOn]} accessibilityRole="tab" accessibilityState={{ selected: value === k }}>
          <Text style={[st.segText, value === k && { color: C.bg }]}>{label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export function Btn({ label, onPress, kind = 'primary', disabled, icon, busy }: { label: string; onPress: () => void; kind?: 'primary' | 'ghost' | 'link' | 'danger'; disabled?: boolean; icon?: string; busy?: boolean }) {
  const fg = kind === 'primary' ? C.bg : kind === 'danger' ? C.over : C.ink;
  return (
    <Pressable disabled={disabled || busy} onPress={() => { tap(); onPress(); }} style={({ pressed }) => [st.btn, st[kind], pressed && { opacity: 0.8 }, (disabled || busy) && { opacity: 0.45 }]} accessibilityRole="button">
      {busy ? <ActivityIndicator color={fg} /> : <>{icon ? <Icon name={icon} size={18} color={fg} /> : null}<Text style={[st.btnText, { color: fg }]}>{label}</Text></>}
    </Pressable>
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
          <Pressable hitSlop={12} onPress={onClose} style={st.iconBtn} accessibilityRole="button" accessibilityLabel="Close"><Icon name="close" weight="bold" /></Pressable>
          <T k="strong" style={{ flex: 1, textAlign: 'center' }} numberOfLines={1}>{title}</T>
          <View style={{ minWidth: 44, alignItems: 'flex-end' }}>{right}</View>
        </View>
        <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">{children}</ScrollView>
      </View>
    </Modal>
  );
}

/** Spent against a budget: white within it with a tick at today; over it, grey to the line and the over part in coral. */
export function Meter({ spent, amount, share, height = 8, color }: { spent: number; amount: number; share: number; height?: number; color?: string }) {
  if (!amount) return null;
  const s = budgetState(spent, amount, share);
  const pct = (x: number): `${number}%` => `${Math.round(1000 * Math.min(1, Math.max(0, x))) / 10}%`;
  return (
    <View style={[st.meter, { height, borderRadius: height }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {s === 'over' ? (
        <>
          <View style={[st.meterFill, { width: pct(amount / spent), backgroundColor: color ?? C.ink3, borderRadius: height }]} />
          <View style={[st.meterFill, { left: pct(amount / spent), width: pct(1 - amount / spent), backgroundColor: C.over, borderRadius: height }]} />
        </>
      ) : (
        <>
          <View style={[st.meterFill, { width: pct(spent / amount), backgroundColor: color ?? (s === 'ahead' ? C.ahead : C.bar), borderRadius: height }]} />
          <View style={[st.today, { left: pct(share), height: height + 6, top: -3 }]} />
        </>
      )}
    </View>
  );
}

/** The words for a budget's state: colour never speaks alone. */
export function StatePill({ left, st: s }: { left: number; st: BudgetState }) {
  const v = kr(Math.abs(left), true);
  const [text, color] = s === 'over' ? [`${v} over`, C.over] : s === 'ahead' ? [`${v} left, ahead`, C.ahead] : s === 'none' ? ['No budget', C.ink3] : left === 0 ? ['Used up', C.ink3] : [`${v} left`, C.ink];
  return <Text style={[st.pill, { color }]}>{text}</Text>;
}

/* toasts: one quiet line at the bottom, with Undo when it helps */
type Toast = { msg: string; undo?: () => void };
const ToastCtx = createContext<(msg: string, undo?: () => void) => void>(() => undefined);
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }: { children: ReactNode }) {
  const [t, setT] = useState<Toast | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const insets = useSafeAreaInsets();
  const show = useCallback((msg: string, undo?: () => void) => {
    setT({ msg, undo });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setT(null), 4200);
  }, []);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {t ? (
        <View style={[st.toast, { bottom: insets.bottom + 96 }]} accessibilityLiveRegion="polite">
          <Text style={st.toastText}>{t.msg}</Text>
          {t.undo ? <Pressable onPress={() => { t.undo?.(); setT(null); }}><Text style={[st.toastText, { fontFamily: F.strong, textDecorationLine: 'underline' }]}>Undo</Text></Pressable> : null}
        </View>
      ) : null}
    </ToastCtx.Provider>
  );
}

export const st = StyleSheet.create({
  header: { paddingHorizontal: 16, paddingBottom: 12 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22 },
  sec: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 18, paddingHorizontal: 4 },
  panel: { backgroundColor: C.surface, borderRadius: R.panel, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 11, minHeight: 60 },
  rowSel: { backgroundColor: C.surface2 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: C.line, marginLeft: 66 },
  discSlot: { width: 40, height: 40 },
  disc: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  seg: { flexDirection: 'row', alignSelf: 'flex-start', backgroundColor: C.surface, borderRadius: R.pill, padding: 3 },
  segBtn: { minHeight: 40, paddingHorizontal: 16, borderRadius: R.pill, justifyContent: 'center' },
  segOn: { backgroundColor: C.ink },
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
  today: { position: 'absolute', width: 2, marginLeft: -1, backgroundColor: C.ink3, borderRadius: 1 },
  pill: { fontFamily: F.strong, fontSize: 14, fontVariant: ['tabular-nums'] },
  toast: { position: 'absolute', left: 16, right: 16, backgroundColor: C.ink, borderRadius: 18, paddingHorizontal: 16, paddingVertical: 12, flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  toastText: { fontFamily: F.body, fontSize: 15, color: C.bg, flexShrink: 1 },
});
