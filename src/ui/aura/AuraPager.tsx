import type { ReactNode } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import * as Haptics from 'expo-haptics';
import Animated, { useAnimatedScrollHandler, useAnimatedStyle, useDerivedValue, useSharedValue, interpolate, Extrapolation } from 'react-native-reanimated';
import { Aura } from './Aura';
import { MOODS, type Mood } from './moods';
import { auraFonts, bigAmount } from './type';

export type AuraPage = {
  key: string;
  mood: Mood;
  label: string;
  /** Shown left of the label, e.g. the shared mark. */
  labelMark?: ReactNode;
  amountMinor: number;
  /** "+" for money in. */
  sign?: '+';
  line: string;
  subline?: string;
  bars?: { label: string; share: number }[];
};

type Props = {
  pages: readonly AuraPage[];
  height: number;
  /** Drawn over the aura at the top, e.g. the screen header. */
  header?: ReactNode;
  unit?: string;
};

/** A full-width pager of money screens over one aura that morphs with the swipe. */
export function AuraPager({ pages, height, header, unit = 'kr.' }: Props) {
  const { width } = useWindowDimensions();
  const x = useSharedValue(0);
  const position = useDerivedValue(() => (width > 0 ? x.value / width : 0));
  const onScroll = useAnimatedScrollHandler((event) => {
    x.value = event.contentOffset.x;
  });

  return (
    <View style={{ height }}>
      <Aura moods={pages.map((page) => page.mood)} position={position} style={StyleSheet.absoluteFill} />
      <Animated.ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        onMomentumScrollEnd={() => {
          Haptics.selectionAsync().catch(() => undefined);
        }}
      >
        {pages.map((page, index) => (
          <AuraPageView key={page.key} page={page} width={width} height={height} unit={unit} index={index} position={position} />
        ))}
      </Animated.ScrollView>
      {pages.length > 1 ? <Dots count={pages.length} position={position} ink={MOODS[pages[0]!.mood].ink} /> : null}
      {header ? <View style={styles.header} pointerEvents="box-none">{header}</View> : null}
    </View>
  );
}

function AuraPageView({ page, width, height, unit, index, position }: {
  page: AuraPage; width: number; height: number; unit: string; index: number; position: ReturnType<typeof useDerivedValue<number>>;
}) {
  const ink = MOODS[page.mood].ink;
  const glow = ink === '#FFFFFF' ? 'rgba(255,255,255,0.45)' : 'transparent';
  const amount = `${page.sign ?? ''}${bigAmount(page.amountMinor)}`;
  // the number softens and drifts as it leaves, like the prototype
  const leave = useAnimatedStyle(() => {
    const d = Math.abs(position.value - index);
    return {
      opacity: interpolate(d, [0, 0.6], [1, 0], Extrapolation.CLAMP),
      transform: [{ translateX: interpolate(position.value - index, [-1, 0, 1], [-width * 0.18, 0, width * 0.18], Extrapolation.CLAMP) }],
    };
  });

  return (
    <View style={[styles.page, { width, height }]} accessible accessibilityLabel={`${page.label}. ${amount} ${unit}. ${page.line}. ${page.subline ?? ''}`}>
      <Animated.View style={[styles.mid, leave]}>
        <View style={styles.labelRow}>
          {page.labelMark}
          <Text style={[styles.label, { color: ink }]}>{page.label}</Text>
        </View>
        <View style={styles.numberRow}>
          <Text
            style={[styles.big, { color: ink, textShadowColor: glow, fontSize: Math.min(width * 0.34, 150) }]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.5}
          >
            {amount}
          </Text>
          <Text style={[styles.unit, { color: ink }]}>{unit}</Text>
        </View>
        <Text style={[styles.line, { color: ink }]}>{page.line}</Text>
        {page.subline ? <Text style={[styles.subline, { color: ink }]}>{page.subline}</Text> : null}
      </Animated.View>
      {page.bars ? (
        <Animated.View style={[styles.bars, leave]}>
          {page.bars.map((bar) => (
            <View key={bar.label} style={styles.barBlock}>
              <View style={styles.barText}>
                <Text style={[styles.barLabel, { color: ink }]}>{bar.label}</Text>
                <Text style={[styles.barLabel, { color: ink }]}>{Math.round(bar.share * 100)}%</Text>
              </View>
              <View style={[styles.track, { backgroundColor: ink === '#FFFFFF' ? 'rgba(255,255,255,0.22)' : 'rgba(20,20,20,0.18)' }]}>
                <View style={[styles.fill, { backgroundColor: ink, width: `${Math.min(100, Math.max(0, bar.share * 100))}%` }]} />
              </View>
            </View>
          ))}
        </Animated.View>
      ) : null}
    </View>
  );
}

function Dots({ count, position, ink }: { count: number; position: ReturnType<typeof useDerivedValue<number>>; ink: string }) {
  return (
    <View style={styles.dots} pointerEvents="none">
      {Array.from({ length: count }, (_, i) => <Dot key={i} i={i} position={position} ink={ink} />)}
    </View>
  );
}

function Dot({ i, position, ink }: { i: number; position: ReturnType<typeof useDerivedValue<number>>; ink: string }) {
  const style = useAnimatedStyle(() => {
    const near = Math.max(0, 1 - Math.abs(position.value - i));
    return { width: 7 + near * 13, opacity: 0.35 + near * 0.65 };
  });
  return <Animated.View style={[styles.dot, { backgroundColor: ink }, style]} />;
}

const styles = StyleSheet.create({
  header: { position: 'absolute', top: 0, left: 0, right: 0 },
  page: { justifyContent: 'center', paddingHorizontal: 28, paddingTop: 96, paddingBottom: 48 },
  mid: { alignItems: 'center', marginTop: -24 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  label: { fontFamily: auraFonts.label, fontSize: 17, opacity: 0.88 },
  numberRow: { flexDirection: 'row', alignItems: 'flex-end', maxWidth: '100%' },
  big: { fontFamily: auraFonts.number, letterSpacing: -2, includeFontPadding: false, textShadowRadius: 28, textShadowOffset: { width: 0, height: 0 }, flexShrink: 1 },
  unit: { fontFamily: auraFonts.numberUnit, fontSize: 20, marginLeft: 4, marginBottom: 14 },
  line: { fontFamily: auraFonts.line, fontSize: 21, marginTop: 14, textAlign: 'center' },
  subline: { fontFamily: auraFonts.label, fontSize: 14, opacity: 0.82, marginTop: 4, textAlign: 'center' },
  bars: { position: 'absolute', left: 48, right: 48, bottom: 44, gap: 12 },
  barBlock: { gap: 6 },
  barText: { flexDirection: 'row', justifyContent: 'space-between' },
  barLabel: { fontFamily: auraFonts.bodyStrong, fontSize: 13, opacity: 0.92 },
  track: { height: 8, borderRadius: 8, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 8 },
  dots: { position: 'absolute', bottom: 18, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 7 },
  dot: { height: 7, borderRadius: 7 },
});
