import { useEffect, useRef, type ReactNode } from 'react';
import {
  Animated,
  Easing,
  StyleProp,
  StyleSheet,
  View,
  type ViewStyle,
} from 'react-native';
import { colors, radius as radiusTokens, spacing } from './tokens';

type Size = number | `${number}%`;

const usePulse = (): Animated.Value => {
  const opacity = useRef(new Animated.Value(0.42)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.78,
          duration: 820,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.42,
          duration: 820,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );

    animation.start();

    return () => {
      animation.stop();
    };
  }, [opacity]);

  return opacity;
};

export function SkeletonBlock({
  width = '100%',
  height = 16,
  radius = radiusTokens.md,
  style,
}: {
  width?: Size;
  height?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const opacity = usePulse();

  return (
    <Animated.View
      style={[
        styles.block,
        {
          width,
          height,
          borderRadius: radius,
          opacity,
        },
        style,
      ]}
    />
  );
}

export function SkeletonCard({
  children,
  padding = spacing.lg,
  style,
}: {
  children: ReactNode;
  padding?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[styles.card, { padding }, style]}>{children}</View>;
}

export function SkeletonText({
  lines = 3,
  lineHeight = 14,
  gap = spacing.sm,
  lastLineWidth = '72%',
  style,
}: {
  lines?: number;
  lineHeight?: number;
  gap?: number;
  lastLineWidth?: Size;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.textGroup, { gap }, style]}>
      {Array.from({ length: lines }).map((_, index) => (
        <SkeletonBlock
          key={index}
          height={lineHeight}
          width={index === lines - 1 ? lastLineWidth : '100%'}
          radius={radiusTokens.sm}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    backgroundColor: colors.surfaceAlt,
    overflow: 'hidden',
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radiusTokens.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  textGroup: {
    width: '100%',
  },
});
