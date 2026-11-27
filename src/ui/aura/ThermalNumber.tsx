import { useEffect, useState } from 'react';
import { PixelRatio } from 'react-native';
import { BlurMask, Canvas, Fill, Group, ImageShader, Shader, Text, drawAsImage, useClock, useFont, type SkImage } from '@shopify/react-native-skia';
import { useDerivedValue, useReducedMotion } from 'react-native-reanimated';
import { thermalEffect } from './shader';

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
