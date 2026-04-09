import { useMemo } from 'react';
import { PanResponder, StyleSheet, Text, View } from 'react-native';
import { Canvas, Circle, Path } from '@shopify/react-native-skia';
import type { DashboardCategoryBreakdown } from './useDashboard';
import { colors, typography } from '@/ui/tokens';
import { formatMinor } from '@/lib/format';

const TWO_PI = Math.PI * 2;

const polarToCartesian = (cx: number, cy: number, r: number, angle: number) => ({
  x: cx + r * Math.cos(angle - Math.PI / 2),
  y: cy + r * Math.sin(angle - Math.PI / 2),
});

const describeArc = (cx: number, cy: number, r: number, startAngle: number, endAngle: number): string => {
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const largeArcFlag = endAngle - startAngle > Math.PI ? 1 : 0;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArcFlag} 0 ${end.x} ${end.y}`;
};

type Props = {
  categories: readonly DashboardCategoryBreakdown[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  size: number;
  onInteractionChange?: (active: boolean) => void;
};

export function ExpenseRingChart({
  categories,
  selectedIndex,
  onSelect,
  size,
  onInteractionChange,
}: Props) {
  const stroke = size < 180 ? 14 : 16;
  const selectedStroke = stroke + 2;
  const touchPadding = size < 180 ? 24 : 28;
  const touchSize = size + touchPadding * 2;
  const radiusValue = size / 2 - selectedStroke;
  const center = touchSize / 2;
  const gapAngle = Math.max(0.24, (selectedStroke / Math.max(radiusValue, 1)) * 1.6);
  const totalSpentMinor = categories.reduce((sum, item) => sum + item.amountMinor, 0);

  const arcs = useMemo(() => {
    let cumulative = 0;
    return categories.map((category, index) => {
      const totalAngle = category.share * TWO_PI;
      const gap = Math.min(gapAngle, totalAngle * 0.55);
      const startAngle = cumulative + gap / 2;
      const endAngle = cumulative + totalAngle - gap / 2;
      const totalStartAngle = cumulative;
      cumulative += totalAngle;

      return {
        categoryId: category.categoryId,
        color: category.color,
        index,
        totalStartAngle,
        totalEndAngle: cumulative,
        path: describeArc(center, center, radiusValue, startAngle, endAngle),
      };
    });
  }, [categories, center, gapAngle, radiusValue]);

  const pickSlice = (touchX: number, touchY: number): void => {
    if (categories.length === 0) return;

    const x = touchX - center;
    const y = touchY - center;
    const distance = Math.sqrt(x * x + y * y);
    if (distance > radiusValue + selectedStroke + touchPadding) return;

    let angle = Math.atan2(y, x) + Math.PI / 2;
    if (angle < 0) angle += TWO_PI;

    const matched = arcs.find((arc) => angle >= arc.totalStartAngle && angle <= arc.totalEndAngle);
    if (matched) onSelect(matched.index);
  };

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => categories.length > 0,
        onStartShouldSetPanResponderCapture: () => categories.length > 0,
        onMoveShouldSetPanResponder: () => categories.length > 0,
        onMoveShouldSetPanResponderCapture: () => categories.length > 0,
        onPanResponderGrant: (event) => {
          onInteractionChange?.(true);
          pickSlice(event.nativeEvent.locationX, event.nativeEvent.locationY);
        },
        onPanResponderMove: (event) => {
          pickSlice(event.nativeEvent.locationX, event.nativeEvent.locationY);
        },
        onPanResponderRelease: () => {
          onInteractionChange?.(false);
        },
        onPanResponderTerminate: () => {
          onInteractionChange?.(false);
        },
      }),
    [arcs, categories.length, onInteractionChange],
  );

  return (
    <View style={[styles.touchArea, { width: touchSize, height: touchSize }]} {...responder.panHandlers}>
      <Canvas style={{ width: touchSize, height: touchSize }}>
        <Circle
          cx={center}
          cy={center}
          r={radiusValue}
          color="rgba(255,255,255,0.16)"
          style="stroke"
          strokeWidth={stroke}
        />
        {arcs.map((arc) => (
          <Path
            key={arc.categoryId}
            path={arc.path}
            color={arc.color}
            style="stroke"
            strokeWidth={arc.index === selectedIndex ? selectedStroke : stroke}
            strokeCap="round"
          />
        ))}
      </Canvas>
      <View pointerEvents="none" style={styles.centerOverlay}>
        <Text style={styles.centerRange}>This cycle</Text>
        <Text style={styles.centerAmount}>{formatMinor(totalSpentMinor)}</Text>
        <Text style={styles.centerLabel}>Spent</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  touchArea: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerOverlay: {
    position: 'absolute',
    alignItems: 'center',
    gap: 2,
  },
  centerRange: { ...typography.label, color: colors.textMuted },
  centerAmount: { ...typography.body, color: colors.text, fontWeight: '700' },
  centerLabel: { ...typography.label, color: colors.textMuted, textTransform: 'uppercase' },
});
