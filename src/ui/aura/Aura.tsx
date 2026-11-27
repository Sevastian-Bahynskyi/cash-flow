import { useMemo } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { Canvas, Fill, Shader, useClock } from '@shopify/react-native-skia';
import { useDerivedValue, useReducedMotion, useSharedValue, type SharedValue } from 'react-native-reanimated';
import { auraEffect } from './shader';
import { moodVector, type Mood } from './moods';

// fast enough that the aura is always visibly drifting, slow enough to stay calm
const SPEED = 3;

type Props = {
  /** One mood per page. */
  moods: readonly Mood[];
  /** Fractional page index: 1.5 is halfway between the second and third mood. Omit for a single mood. */
  position?: SharedValue<number>;
  style?: StyleProp<ViewStyle>;
};

/** The living aura behind a money screen. Colours and shape follow `position`, so a swipe morphs one mood into the next. */
export function Aura({ moods, position, style }: Props) {
  const size = useSharedValue({ width: 0, height: 0 });
  const clock = useClock();
  const reduce = useReducedMotion();
  const key = moods.join(',');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const table = useMemo(() => moods.map(moodVector), [key]);

  const uniforms = useDerivedValue(() => {
    const at = position ? position.value : 0;
    const last = table.length - 1;
    const i0 = Math.max(0, Math.min(last, Math.floor(at)));
    const i1 = Math.min(last, i0 + 1);
    const f = Math.max(0, Math.min(1, at - i0));
    const e = f * f * (3 - 2 * f);
    const a = table[i0] ?? table[0]!;
    const b = table[i1] ?? a;
    const v = (i: number): number => {
      const x = a[i] ?? 0;
      return x + ((b[i] ?? x) - x) * e;
    };
    const rgb = (i: number): number[] => [v(i), v(i + 1), v(i + 2)];
    return {
      res: [size.value.width, size.value.height],
      t: reduce ? 3 : (clock.value / 1000) * SPEED,
      shape: v(15),
      c0: rgb(0),
      c1: rgb(3),
      c2: rgb(6),
      c3: rgb(9),
      c4: rgb(12),
    };
  });

  // Size comes from layout, not Canvas onSize: Skia 2.2.12 reads the native view in onSize before it exists and crashes.
  return (
    <View style={style} onLayout={(e) => { size.value = { width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height }; }} pointerEvents="none">
      <Canvas style={{ flex: 1 }}>
        <Fill>
          <Shader source={auraEffect} uniforms={uniforms} />
        </Fill>
      </Canvas>
    </View>
  );
}
