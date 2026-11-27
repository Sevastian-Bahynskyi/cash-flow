import { Canvas, Circle, Group, SweepGradient, useClock, vec } from '@shopify/react-native-skia';
import { useDerivedValue, useReducedMotion } from 'react-native-reanimated';
import { MOODS } from './moods';

const RING = [...MOODS.shared.colors, MOODS.shared.colors[0]];

/** The shared mark: the Shared aura's colours turning slowly in a ring around a row's icon. */
export function SharedRing({ size, stroke = 2.5 }: { size: number; stroke?: number }) {
  const clock = useClock();
  const reduce = useReducedMotion();
  const c = size / 2;
  const transform = useDerivedValue(() => [{ rotate: reduce ? 0 : (clock.value / 1000) * 0.9 }]);
  return (
    <Canvas style={{ position: 'absolute', width: size, height: size }} pointerEvents="none">
      <Group origin={vec(c, c)} transform={transform}>
        <Circle cx={c} cy={c} r={c - stroke / 2} style="stroke" strokeWidth={stroke}>
          <SweepGradient c={vec(c, c)} colors={RING} />
        </Circle>
      </Group>
    </Canvas>
  );
}
