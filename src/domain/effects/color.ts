// The frame engine's color grade: a grade (a filter's look) as settings, what it does to a color, and the same
// baked into a lookup table (a LUT) the GPU applies to every pixel in one step. Every filter is one
// of these with different settings; how strongly it's applied is mixed in when drawing.
import { color, hexOf, num, rgbOf, type ParamSpec, type Params } from './params';

export const GRADE_PARAMS: readonly ParamSpec[] = [
  num('exposure', 'Exposure', -2, 2, 0), // stops
  num('contrast', 'Contrast', -1, 1, 0),
  num('highlights', 'Highlights', -1, 1, 0),
  num('shadows', 'Shadows', -1, 1, 0),
  num('temperature', 'Warmth', -1, 1, 0),
  num('tint', 'Tint', -1, 1, 0), // green to magenta
  num('saturation', 'Saturation', -1, 1, 0), // -1: black and white
  num('vibrance', 'Vibrance', -1, 1, 0), // like saturation, but the dullest colors most
  num('hue', 'Hue', -180, 180, 0), // degrees, every color turned round the color wheel
  num('fade', 'Fade', 0, 1, 0), // blacks lifted to grey, like old film
  color('shadowTone', 'Shadow color', '#808080'),
  num('shadowAmount', 'Shadow color amount', 0, 1, 0),
  color('highlightTone', 'Highlight color', '#808080'),
  num('highlightAmount', 'Highlight color amount', 0, 1, 0),
];

export interface Grade {
  exposure: number;
  contrast: number;
  highlights: number;
  shadows: number;
  temperature: number;
  tint: number;
  saturation: number;
  vibrance: number;
  hue: number;
  fade: number;
  shadowTone: string;
  shadowAmount: number;
  highlightTone: string;
  highlightAmount: number;
}

export const gradeOf = (p: Params): Grade => p as unknown as Grade;

type RGB = [number, number, number];

const luma = (c: RGB) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

// s-curve round mid grey: k > 1 more contrast, k < 1 less
const curve = (v: number, k: number) => (v < 0.5 ? 0.5 * (2 * v) ** k : 1 - 0.5 * (2 - 2 * v) ** k);

// every color turned `deg` round the grey axis (a rotation about (1,1,1)/√3, so greys stay grey)
function turnHue(c: RGB, deg: number): RGB {
  if (!deg) return c;
  const a = (deg * Math.PI) / 180,
    cos = Math.cos(a),
    sin = Math.sin(a) / Math.sqrt(3);
  const [r, g, b] = c,
    mean = (r + g + b) / 3;
  const cross: RGB = [b - g, r - b, g - r];
  return c.map((v, j) => v * cos + cross[j] * sin + mean * (1 - cos)) as RGB;
}

// a color graded: channels 0..1 in, 0..1 out
export function gradeColor(g: Grade, input: readonly number[]): RGB {
  let c: RGB = [input[0], input[1], input[2]];
  // exposure, in (roughly) linear light
  if (g.exposure) {
    const k = 2 ** g.exposure;
    c = c.map(v => clamp01((v ** 2.2 * k) ** (1 / 2.2))) as RGB;
  }
  // white balance
  if (g.temperature || g.tint) {
    c = [
      c[0] * (1 + 0.12 * g.temperature) * (1 + 0.04 * g.tint),
      c[1] * (1 - 0.1 * g.tint),
      c[2] * (1 - 0.12 * g.temperature) * (1 + 0.04 * g.tint),
    ];
  }
  // shadows and highlights: lifts or pulls down the dark or bright parts
  if (g.shadows || g.highlights) {
    const L = clamp01(luma(c)),
      d = 0.25 * g.shadows * (1 - L) ** 2 + 0.25 * g.highlights * L ** 2;
    c = c.map(v => v + d) as RGB;
  }
  if (g.contrast) {
    const k = 2 ** (g.contrast * 1.3);
    c = c.map(v => curve(clamp01(v), k)) as RGB;
  }
  c = turnHue(c, g.hue);
  // saturation, and vibrance (most on the dullest colors)
  if (g.saturation || g.vibrance) {
    const L = luma(c),
      sat = Math.max(...c) - Math.min(...c),
      k = 1 + g.saturation + g.vibrance * (1 - clamp01(sat * 1.5));
    c = c.map(v => L + (v - L) * Math.max(0, k)) as RGB;
  }
  // split toning: the dark parts one color, the bright parts another
  if (g.shadowAmount || g.highlightAmount) {
    const L = clamp01(luma(c));
    const tone = (hex: string, amount: number, w: number) => {
      const t = rgbOf(hex),
        tl = luma(t);
      c = c.map((v, j) => v + (t[j] - tl) * amount * w * 0.6) as RGB;
    };
    if (g.shadowAmount) tone(g.shadowTone, g.shadowAmount, (1 - L) ** 1.5);
    if (g.highlightAmount) tone(g.highlightTone, g.highlightAmount, L ** 1.5);
  }
  // fade: blacks lifted, whites a little dulled
  if (g.fade) c = c.map(v => v * (1 - 0.28 * g.fade) + 0.16 * g.fade) as RGB;
  return c.map(clamp01) as RGB;
}

// the LUT: size³ colors, RGBA bytes, red changing fastest, then green, then blue (the layout of a
// WebGL 3D texture size wide, size high and size deep)
export function buildLut(g: Grade, size = 33): Uint8Array {
  const out = new Uint8Array(size * size * size * 4),
    n = size - 1;
  let o = 0;
  for (let b = 0; b < size; b++)
    for (let gg = 0; gg < size; gg++)
      for (let r = 0; r < size; r++) {
        const c = gradeColor(g, [r / n, gg / n, b / n]);
        out[o++] = Math.round(c[0] * 255);
        out[o++] = Math.round(c[1] * 255);
        out[o++] = Math.round(c[2] * 255);
        out[o++] = 255;
      }
  return out;
}

// a few everyday colors (skin, sky, leaves, shadow, sunlight) as the grade turns them, for a
// filter's button when there's no frame to show it on
const SWATCH = ['#e0ac8a', '#6fa8dc', '#6aa84f', '#2b2b33', '#ffe599'];
export const gradeSwatch = (g: Grade) => SWATCH.map(h => hexOf(gradeColor(g, rgbOf(h))));
