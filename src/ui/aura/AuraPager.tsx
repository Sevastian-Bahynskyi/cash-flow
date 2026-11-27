import { useRef, useState, type ReactNode } from 'react';
import { type FlatList, type NativeScrollEvent, type NativeSyntheticEvent, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import * as Haptics from 'expo-haptics';
import Animated, { useAnimatedScrollHandler, useAnimatedStyle, useDerivedValue, useSharedValue, useReducedMotion, interpolate, Extrapolation } from 'react-native-reanimated';
import { Aura } from './Aura';
import { MOODS, type Mood } from './moods';
import { auraFonts, bigAmount } from './type';

export type AuraPage = {
  key: string;
  navigationLabel?: string;
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
  navigation?: { currentIndex: number; onChange: (page: AuraPage) => void };
};

/** A full-width pager of money screens over one aura that morphs with the swipe. */
export function AuraPager({ pages, height, header, unit = 'kr.', navigation }: Props): React.JSX.Element {
  const { width: screenWidth } = useWindowDimensions();
  const [width, setWidth] = useState(screenWidth);
  const initial = navigation?.currentIndex ?? 0;
  const [index, setIndex] = useState(initial);
  const [firstDot, setFirstDot] = useState(Math.max(initial - 1, 0));
  const list = useRef<FlatList<AuraPage>>(null);
  const active = useRef(initial);
  const reduce = useReducedMotion();
  const x = useSharedValue(initial);
  const position = useDerivedValue(() => x.value);
  const onScroll = useAnimatedScrollHandler((event) => {
    if (width) x.value = event.contentOffset.x / width;
  });

  const select = (next: number): void => {
    const page = pages[next];
    if (!page || next === active.current) return;
    active.current = next;
    setIndex(next);
    setFirstDot((first) => Math.min(first, Math.max(0, next - 1)));
    navigation?.onChange(page);
    Haptics.selectionAsync().catch(() => undefined);
  };
  const settle = (event: NativeSyntheticEvent<NativeScrollEvent>): void => {
    select(Math.round(event.nativeEvent.contentOffset.x / width));
  };

  const dotStart = Math.max(firstDot, Math.min(index - 3, pages.length - 7));
  const dotEnd = Math.min(pages.length, dotStart + 7);
  return (
    <View style={{ height }} onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
      <Aura moods={pages.map((page) => page.mood)} position={position} style={StyleSheet.absoluteFill} />
      {pages.length === 1 && pages[0] ? (
        <AuraPageView page={pages[0]} width={width} height={height} unit={unit} index={0} position={position} compact={!header} />
      ) : (
        <Animated.FlatList
          ref={list}
          data={pages}
          renderItem={({ item, index: i }) => (
            <View accessibilityElementsHidden={i !== index} importantForAccessibility={i === index ? 'auto' : 'no-hide-descendants'}>
              <AuraPageView page={item} width={width} height={height} unit={unit} index={i} position={position} />
            </View>
          )}
          keyExtractor={(page) => page.key}
          getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
          initialScrollIndex={initial}
          initialNumToRender={3}
          windowSize={5}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onScroll={onScroll}
          scrollEventThrottle={16}
          onMomentumScrollEnd={settle}
        />
      )}
      {pages.length > 1 ? (
        <View style={styles.dots}>
          {pages.slice(dotStart, dotEnd).map((page, i) => {
            const target = dotStart + i;
            return (
              <Pressable key={page.key} style={styles.dotButton} accessibilityRole="button"
                accessibilityLabel={page.navigationLabel ?? page.label} accessibilityState={{ selected: target === index }}
                onPress={() => {
                  if (target === active.current) return;
                  list.current?.scrollToOffset({ offset: target * width, animated: !reduce });
                  if (reduce) x.value = target;
                  select(target);
                }}>
                <Dot i={target} position={position} ink={MOODS[pages[index]?.mood ?? 'calm'].ink} />
              </Pressable>
            );
          })}
        </View>
      ) : null}
      {header ? <View style={styles.header} pointerEvents="box-none">{header}</View> : null}
    </View>
  );
}

function AuraPageView({ page, width, height, unit, index, position, compact = false }: {
  compact?: boolean;
  page: AuraPage; width: number; height: number; unit: string; index: number; position: ReturnType<typeof useDerivedValue<number>>;
}) {
  const ink = MOODS[page.mood].ink;
  const amount = `${page.sign ?? ''}${bigAmount(page.amountMinor)}`;
  const size = Math.min(width * (compact ? 0.26 : 0.32), 140);
  // the number softens and drifts as it leaves, like the prototype
  const leave = useAnimatedStyle(() => {
    const d = Math.abs(position.value - index);
    return {
      opacity: interpolate(d, [0, 0.6], [1, 0], Extrapolation.CLAMP),
      transform: [{ translateX: interpolate(position.value - index, [-1, 0, 1], [-width * 0.18, 0, width * 0.18], Extrapolation.CLAMP) }],
    };
  });

  return (
    <View style={[styles.page, compact && styles.compact, { width, height }]} accessible accessibilityLabel={`${page.label}. ${amount} ${unit}. ${page.line}. ${page.subline ?? ''}`}>
      <Animated.View style={[styles.mid, compact && { marginTop: 0 }, leave]}>
        <View style={styles.labelRow}>
          {page.labelMark}
          <Text style={[styles.label, { color: ink }]}>{page.label}</Text>
        </View>
        <View style={styles.numberRow}>
          <Text
            // iOS draws a text shadow as a box and clips slanted glyphs to the text frame: no shadow, and room for the slant
            style={[styles.big, { color: ink, fontSize: size, paddingHorizontal: size * 0.08 }]}
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
  compact: { paddingTop: 20, paddingBottom: 20 },
  mid: { alignItems: 'center', marginTop: -24 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  label: { fontFamily: auraFonts.label, fontSize: 17, opacity: 0.88 },
  numberRow: { flexDirection: 'row', alignItems: 'flex-end', maxWidth: '100%' },
  big: { fontFamily: auraFonts.number, letterSpacing: -2, includeFontPadding: false, flexShrink: 1 },
  unit: { fontFamily: auraFonts.numberUnit, fontSize: 20, marginLeft: -4, marginBottom: 14 },
  line: { fontFamily: auraFonts.line, fontSize: 21, marginTop: 14, textAlign: 'center' },
  subline: { fontFamily: auraFonts.label, fontSize: 14, opacity: 0.82, marginTop: 4, textAlign: 'center' },
  bars: { position: 'absolute', left: 48, right: 48, bottom: 44, gap: 12 },
  barBlock: { gap: 6 },
  barText: { flexDirection: 'row', justifyContent: 'space-between' },
  barLabel: { fontFamily: auraFonts.bodyStrong, fontSize: 13, opacity: 0.92 },
  track: { height: 8, borderRadius: 8, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 8 },
  dots: { position: 'absolute', bottom: 4, alignSelf: 'center', flexDirection: 'row', justifyContent: 'center' },
  dotButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  dot: { height: 7, borderRadius: 7 },
});
