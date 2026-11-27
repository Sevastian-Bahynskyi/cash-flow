import { Skia } from '@shopify/react-native-skia';

// The aura: one shader for every mood, so colours and shape morph into each other.
// Domain-warped noise drifts the glow; a band around a circle draws the horizon (huge circle below) or the ring.
export const auraEffect = Skia.RuntimeEffect.Make(`
uniform float2 res;
uniform float t;
uniform float shape;
uniform float3 c0;
uniform float3 c1;
uniform float3 c2;
uniform float3 c3;
uniform float3 c4;

float h(float2 p) { return fract(sin(dot(p, float2(127.1, 311.7))) * 43758.5453); }
float n(float2 p) {
  float2 i = floor(p); float2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h(i), h(i + float2(1, 0)), f.x), mix(h(i + float2(0, 1)), h(i + float2(1, 1)), f.x), f.y);
}
float fb(float2 p) {
  float v = 0.0; float a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * n(p); p = p * 2.03 + 1.7; a *= 0.5; }
  return v;
}

half4 main(float2 xy) {
  float2 fc = float2(xy.x, res.y - xy.y);
  float2 uv = fc / res;
  float2 p = (fc - 0.5 * res) / res.x;
  float2 q = float2(fb(p * 1.6 + float2(0.0, t * 0.06)), fb(p * 1.6 + float2(5.2, -t * 0.05)));
  float2 w = p + 0.42 * (q - 0.5);
  float2 cen = mix(float2(0.0, -1.55), float2(0.0, 0.12), shape);
  float rad = mix(1.55, 0.33 + 0.03 * sin(t * 0.5), shape);
  float d = length((w - cen) * float2(1.0, mix(1.0, 0.9, shape)));
  // square by multiplying: pow() of a negative base is undefined on the GPU and cut hard edges inside the ring
  float zb = (d - rad) / mix(0.07, 0.16, shape);
  float zh = (d - rad) / mix(0.38, 0.42, shape);
  float band = exp(-zb * zb);
  float halo = exp(-zh * zh);
  float inside = 1.0 - smoothstep(rad - mix(0.5, 0.17, shape), rad + 0.02, d);
  float3 col = c0;
  col = mix(col, c1, halo * 0.9);
  col = mix(col, c3, inside);
  col = mix(col, c2, band);
  float b = (1.0 - smoothstep(-1.2, -0.35, w.y + 0.12 * sin(w.x * 4.0 + t * 0.35))) * (1.0 - smoothstep(-0.2, 0.9, w.x + 0.3 * sin(t * 0.2)));
  col = mix(col, c4, b * 0.9);
  col += (h(fc * 0.73 + fract(t * 7.0) * 91.0) - 0.5) * 0.075;
  col *= 1.0 - 0.35 * pow(length(uv - 0.5), 2.2);
  return half4(half3(col), 1.0);
}
`)!;

const NOISE = `float h(float2 p) { return fract(sin(dot(p, float2(127.1, 311.7))) * 43758.5453); }
float n(float2 p) {
  float2 i = floor(p); float2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h(i), h(i + float2(1, 0)), f.x), mix(h(i + float2(0, 1)), h(i + float2(1, 1)), f.x), f.y);
}`;
const RAMP = `float3 ramp(float v) {
  float3 c = float3(1.0);
  c = mix(c, float3(1.0, 0.87, 0.25), smoothstep(0.05, 0.2, v));
  c = mix(c, float3(1.0, 0.36, 0.16), smoothstep(0.18, 0.33, v));
  c = mix(c, float3(0.93, 0.14, 0.55), smoothstep(0.3, 0.45, v));
  c = mix(c, float3(0.12, 0.47, 1.0), smoothstep(0.45, 0.62, v));
  c = mix(c, float3(0.05, 0.09, 0.38), smoothstep(0.62, 0.8, v));
  c = mix(c, float3(0.02, 0.03, 0.16), smoothstep(0.85, 1.0, v));
  return c;
}`;

// Thermal number: a blurred and a sharp copy of the text (red and green channels) mapped to a heat ramp that burns in.
export const thermalEffect = Skia.RuntimeEffect.Make(`
uniform shader image;
uniform float t;
uniform float k;
uniform float2 res;

${NOISE}
${RAMP}
half4 main(float2 xy) {
  float2 uv = xy / res;
  half4 s = image.eval(xy);
  float nn = n(uv * float2(6.0, 3.0) + float2(t * 0.4, -t * 0.3));
  float v = mix(float(s.g), float(s.r), 0.55) * (0.82 + 0.36 * nn);
  float rev = clamp(k * 1.7 - (1.0 - uv.x) * 0.5 - nn * 0.4, 0.0, 1.0);
  return half4(half3(ramp(v * rev)), 1.0);
}
`)!;

// Heat fill for the big number: hot bands sweep in from the right and flow across the letters, then cool into the ink.
export const heatEffect = Skia.RuntimeEffect.Make(`
uniform float p;
uniform float2 res;
uniform float3 ink;

${NOISE}
${RAMP}
half4 main(float2 xy) {
  float2 uv = xy / res;
  float t = p * 2.4;
  float nn = n(uv * float2(5.0, 2.5) + float2(t * 0.9, -t * 0.6));
  float rev = clamp(clamp(p / 0.55, 0.0, 1.0) * 1.8 - (1.0 - uv.x) * 0.6 - nn * 0.35, 0.0, 1.0);
  float v = 0.47 + 0.3 * sin(6.2 * (uv.x * 0.9 - uv.y * 0.5 + nn * 0.7) - t * 3.0);
  float cool = smoothstep(0.55, 1.0, p);
  float3 col = mix(ramp(v), ramp(0.2), (1.0 - smoothstep(0.0, 0.6, rev)) * (1.0 - cool));
  col = mix(col, ink, cool);
  float a = smoothstep(0.0, 0.35, rev);
  return half4(half3(col) * a, a);
}
`)!;
