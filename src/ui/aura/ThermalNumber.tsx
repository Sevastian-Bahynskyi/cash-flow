import { useEffect, useState } from 'react';
import { PixelRatio, View } from 'react-native';
import { BlurMask, Canvas, Fill, Group, ImageShader, Shader, Text, drawAsImage, useClock, useFont, type SkImage } from '@shopify/react-native-skia';
import { Easing, cancelAnimation, useDerivedValue, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { heatEffect, thermalEffect } from './shader';

// Metro resolves a font file to an asset id
const FONT = require('@expo-google-fonts/barlow-condensed/800ExtraBold_Italic/BarlowCondensed_800ExtraBold_Italic.ttf') as number;

/** A number drawn in thermal-camera colours that burns in from the right, for rare moments. */
export function ThermalNumber({ text, width, height }: { text: string; width: number; height: number }) {
  const scale = PixelRatio.get();
  const font = useFont(FONT, height * 0.86 * scale);
  const [image, setImage] = useState<SkImage | null>(null);
  const clock = useClock();
  const reduce = useReducedMotion();

  useEffect(() => {
    if (!font) return;
    const W = width * scale, H = height * scale;
    const tw = font.measureText(text).width;
    const x = (W - tw) / 2, y = H * 0.8;
    // red = sharp letters, green = a soft halo; the shader mixes both into heat
    drawAsImage(
      <Group>
        <Fill color="black" />
        <Text x={x} y={y} text={text} font={font} color="rgb(0,255,0)"><BlurMask blur={30 * scale} style="normal" /></Text>
        <Group blendMode="plus">
          <Text x={x} y={y} text={text} font={font} color="rgb(255,0,0)"><BlurMask blur={6 * scale} style="normal" /></Text>
        </Group>
      </Group>,
      { width: W, height: H },
    ).then(setImage).catch(() => undefined);
  }, [font, text, width, height, scale]);

  const uniforms = useDerivedValue(() => ({
    t: reduce ? 0 : clock.value / 1000,
    // the clock starts when the card mounts, so the number burns in once
    k: reduce ? 1 : Math.min(1, clock.value / 1800),
    res: [width, height],
  }));

  return (
    <Canvas style={{ width, height }}>
      <Fill color="white" />
      {image ? (
        <Fill>
          <Shader source={thermalEffect} uniforms={uniforms}>
            <ImageShader image={image} fit="fill" rect={{ x: 0, y: 0, width, height }} />
          </Shader>
        </Fill>
      ) : null}
    </Canvas>
  );
}

const BURN = { duration: 2200, easing: Easing.linear } as const;
// the line box around the digits and where their baseline sits, as a share of the font size
const LINE = 1.0;
const BASE = 0.84;
const rgb = (hex: string): number[] => [0, 2, 4].map((i) => parseInt(hex.slice(1 + i, 3 + i), 16) / 255);

/** The big number: it burns in with flowing heat each time it lands on screen, then cools into its ink. */
export function HeatNumber({ text, size, maxWidth, ink, active }: { text: string; size: number; maxWidth: number; ink: string; active: boolean }) {
  const font = useFont(FONT, size);
  const reduce = useReducedMotion();
  const p = useSharedValue(reduce ? 1 : 0);
  const pad = size * 0.1;
  const w = (font ? font.measureText(text).width : 0) + pad * 2;
  const h = size * LINE;
  // shrinks to fit like adjustsFontSizeToFit, never below half
  const fit = Math.min(1, Math.max(0.5, maxWidth / w));

  useEffect(() => {
    if (!font) return;
    cancelAnimation(p);
    if (reduce) { p.value = 1; return; }
    p.value = 0;
    if (active) p.value = withTiming(1, BURN);
  }, [active, text, font, reduce, p]);

  const color = rgb(ink);
  const uniforms = useDerivedValue(() => ({ p: p.value, res: [w, h], ink: color }));

  if (!font) return <View style={{ height: h }} />;
  return (
    <Canvas style={{ width: w * fit, height: h * fit }}>
      <Group transform={[{ scale: fit }]}>
        <Text x={pad} y={size * BASE} text={text} font={font}>
          <Shader source={heatEffect} uniforms={uniforms} />
        </Text>
      </Group>
    </Canvas>
  );
}
