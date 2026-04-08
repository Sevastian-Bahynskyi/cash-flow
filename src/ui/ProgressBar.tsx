import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { colors, radius } from './tokens';
import { clamp } from '@/lib/format';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useMotionScope } from './MotionScope';

export function ProgressBar({
  value,
  color = colors.accent,
}: {
  value: number;
  color?: string;
}) {
  const motionRun = useMotionScope();
  const [trackWidth, setTrackWidth] = useState(0);
  const normalized = clamp(value, 0, 1);
  const progress = useSharedValue(0);
  const sheen = useSharedValue(-48);

  useEffect(() => {
    cancelAnimation(progress);
    cancelAnimation(sheen);

    progress.value = 0;
    sheen.value = -48;

    if (normalized <= 0) return;

    progress.value = withSpring(normalized, {
      damping: 16,
      stiffness: 120,
      mass: 0.8,
    });
    if (trackWidth > 0) {
      sheen.value = withDelay(
        140,
        withTiming(trackWidth + 64, {
          duration: 780,
          easing: Easing.out(Easing.cubic),
        }),
      );
    }
  }, [motionRun, normalized, progress, sheen, trackWidth]);

  const fillStyle = useAnimatedStyle(() => ({
    width: `${progress.value * 100}%`,
  }));

  const sheenStyle = useAnimatedStyle(() => ({
    opacity: progress.value > 0 ? 0.75 : 0,
    transform: [{ translateX: sheen.value }],
  }));

  return (
    <View
      style={styles.track}
      onLayout={(event) => {
        const nextWidth = event.nativeEvent.layout.width;
        setTrackWidth((current) => (Math.abs(current - nextWidth) < 1 ? current : nextWidth));
      }}
    >
      <Animated.View style={[styles.fill, fillStyle, { backgroundColor: color }]} />
      <Animated.View style={[styles.sheen, sheenStyle]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: radius.pill,
  },
  sheen: {
    position: 'absolute',
    top: -3,
    bottom: -3,
    width: 42,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
});
