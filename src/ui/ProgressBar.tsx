import { StyleSheet, View } from 'react-native';
import type { DimensionValue } from 'react-native';
import { colors, radius } from './tokens';
import { clamp } from '@/lib/format';

export function ProgressBar({
  value,
  color = colors.accent,
}: {
  value: number;
  color?: string;
}) {
  const width = `${clamp(value, 0, 1) * 100}%` as DimensionValue;

  return (
    <View style={styles.track}>
      <View style={[styles.fill, { width, backgroundColor: color }]} />
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
});
