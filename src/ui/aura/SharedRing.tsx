import { useEffect } from 'react';
import Animated, { Easing, cancelAnimation, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import { MOODS } from './moods';

const [a, b, c, , e] = MOODS.shared.colors;

/**
 * The shared mark: the Shared aura's colours turning slowly in a ring around a row's icon.
 * Drawn with SVG and turned on the UI thread: a Skia canvas per list row crashed Skia when rows unmounted mid-frame.
 */
export function SharedRing({ size, stroke = 2.5 }: { size: number; stroke?: number }) {
  const reduce = useReducedMotion();
  const turn = useSharedValue(0);
  useEffect(() => {
    if (reduce) return;
    turn.set(withRepeat(withTiming(360, { duration: 5000, easing: Easing.linear }), -1, false));
    return () => cancelAnimation(turn);
  }, [reduce, turn]);
  const spin = useAnimatedStyle(() => ({ transform: [{ rotate: `${turn.get()}deg` }] }));
  const r = size / 2 - stroke / 2;
  return (
    <Animated.View style={[{ position: 'absolute', width: size, height: size }, spin]} pointerEvents="none">
      <Svg width={size} height={size}>
        <Defs>
          <LinearGradient id="sharedRing" x1="0" y1="0" x2="1" y2="1">
            {/* bright on one side, fading on the other, so the turn reads as a sweep */}
            <Stop offset="0" stopColor={a} />
            <Stop offset="0.35" stopColor={b} />
            <Stop offset="0.7" stopColor={c} stopOpacity={0.55} />
            <Stop offset="1" stopColor={e} stopOpacity={0.2} />
          </LinearGradient>
        </Defs>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke="url(#sharedRing)" strokeWidth={stroke} fill="none" />
      </Svg>
    </Animated.View>
  );
}
