// The frame engine's screen effects: on the whole picture (blur, shake, flash, glitchy color
// splits, light leaks…). Each kind is one small shader on the GPU; its settings are listed here as
// data, and what moves over time (a shake's wobble, a leak's drift) is worked out here, so every
// frame of an effect is the same whenever it's drawn. `amount` is how strong each is: motions and
// sliders scale it.
import { noise } from './curves';
import { choice, color, num, type ParamSpec, type Params } from './params';

export type ScreenKind =
  | 'blur'
  | 'zoomBlur'
  | 'shake'
  | 'zoom'
  | 'flash'
  | 'vignette'
  | 'rgbSplit'
  | 'glow'
  | 'pixelate'
  | 'mirror'
  | 'grain'
  | 'scanlines'
  | 'leak'
  | 'invert'
  | 'wave'
  | 'split'
  | 'warp';

const amount = (def = 1) => num('amount', 'Strength', 0, 1, def);
const at = (key: 'x' | 'y', label: string) => num(key, label, 0, 1, 0.5);

export const SCREEN_KINDS: Record<ScreenKind, { label: string; params: readonly ParamSpec[] }> = {
  blur: { label: 'Blur', params: [amount(0.5)] },
  zoomBlur: { label: 'Zoom blur', params: [amount(0.5), at('x', 'Centre across'), at('y', 'Centre down')] },
  shake: {
    label: 'Shake',
    params: [amount(0.5), num('speed', 'Speed', 1, 30, 12), num('turn', 'Turn', 0, 1, 0.3)],
  },
  zoom: {
    label: 'Zoom',
    params: [
      num('amount', 'Zoom', -0.5, 1, 0.2), // below 0: pulls back
      at('x', 'Centre across'),
      at('y', 'Centre down'),
    ],
  },
  flash: { label: 'Flash', params: [amount(0.6), color('color', 'Color', '#ffffff')] },
  vignette: {
    label: 'Vignette',
    params: [amount(0.6), num('size', 'Size', 0, 1, 0.5), color('color', 'Color', '#000000')],
  },
  rgbSplit: { label: 'Color split', params: [amount(0.4), num('angle', 'Angle', 0, 360, 0)] },
  glow: {
    label: 'Glow',
    params: [amount(0.6), num('threshold', 'Brightest only', 0, 1, 0.6), num('size', 'Size', 0, 1, 0.5)],
  },
  pixelate: { label: 'Pixelate', params: [amount(0.3)] },
  mirror: {
    label: 'Mirror',
    params: [
      amount(1),
      choice(
        'mode',
        'Mirror',
        [
          { id: 'left', label: 'Left half' },
          { id: 'right', label: 'Right half' },
          { id: 'top', label: 'Top half' },
          { id: 'bottom', label: 'Bottom half' },
          { id: 'quad', label: 'Four ways' },
        ],
        'left',
      ),
    ],
  },
  grain: { label: 'Grain', params: [amount(0.4), num('size', 'Size', 0, 1, 0.3)] },
  scanlines: { label: 'Scanlines', params: [amount(0.4), num('density', 'Lines', 0, 1, 0.5)] },
  leak: {
    label: 'Light leak',
    params: [
      amount(0.6),
      color('color', 'Color', '#ff7a2f'),
      at('x', 'Across'),
      at('y', 'Down'),
      num('size', 'Size', 0, 1, 0.6),
      num('drift', 'Drift', 0, 1, 0.3),
    ],
  },
  invert: { label: 'Invert', params: [amount(1)] },
  wave: {
    label: 'Wave',
    params: [amount(0.3), num('freq', 'Waves', 0, 1, 0.4), num('speed', 'Speed', 0, 1, 0.4)],
  },
  split: {
    label: 'Split screen',
    params: [
      amount(1),
      choice(
        'count',
        'Screens',
        [
          { id: '2', label: '2' },
          { id: '3', label: '3' },
          { id: '4', label: '4' },
          { id: '9', label: '9' },
        ],
        '4',
      ),
    ],
  },
  warp: { label: 'Bulge', params: [num('amount', 'Bulge', -1, 1, 0.4), at('x', 'Across'), at('y', 'Down')] },
};

export const isScreenKind = (k: string): k is ScreenKind => k in SCREEN_KINDS;

// what the shader needs at t seconds into the effect: its settings, `amount` scaled by `strength`,
// plus what moves (seed: which wobble; each clip its own)
export function screenValues(kind: ScreenKind, p: Params, strength: number, t: number, seed: number): Params {
  const v: Params = { ...p, amount: (p.amount as number) * strength, time: t };
  const a = v.amount as number;
  switch (kind) {
    case 'shake': {
      const x = t * (p.speed as number);
      v.dx = noise(seed, x) * a * 0.05; // fractions of the frame
      v.dy = noise(seed + 1, x) * a * 0.05;
      v.rot = noise(seed + 2, x) * a * (p.turn as number) * 0.08; // radians
      break;
    }
    case 'leak': {
      const d = (p.drift as number) * 0.25;
      v.x = (p.x as number) + noise(seed, t * 0.3) * d;
      v.y = (p.y as number) + noise(seed + 1, t * 0.3) * d;
      break;
    }
    case 'grain':
      v.frame = Math.floor(t * 24); // new grain 24 times a second
      break;
  }
  return v;
}
