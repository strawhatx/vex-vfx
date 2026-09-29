// The object engine: effects on a tracked person or object, drawn from its outline and silhouette.
// Its passes, drawn in order (so the first is at the back):
//   - fire, lightning, aura, sparks: particles off the object, in a palette's colors
//   - outline: a line traced round it, in one of the outline styles
//   - glitch: its own pixels broken up
//   - edge: a glowing stroke round its silhouette
//   - clones: copies of it beside it, tinted and glowing; with a delay, a trail of where it was
//   - tint: a color grade on just it, or on everything but it (the color engine's grades)
//   - dissolve: it burns away over the clip, with a glowing edge
// Effects clips made the old way (an effect, a palette, a size) are drawn as one pass too (see
// passesOfFx), so there's one way effects on objects are drawn.
import { GRADE_PARAMS } from './color';
import { motionAt } from './curves';
import { GLITCH_STYLES } from './glitches';
import { OUTLINE_STYLES } from './outlines';
import { PALETTES, type Effect, type FxSettings } from './palettes';
import { choice, color, num, type ParamSpec, type Params } from './params';
import type { BodyPass } from './passes';

export type BodyKind =
  'fire' | 'lightning' | 'aura' | 'sparks' | 'outline' | 'glitch' | 'edge' | 'clones' | 'tint' | 'dissolve';

// the particle effects, each run by a simulation of its own
export const PARTICLE_KINDS: readonly BodyKind[] = ['fire', 'lightning', 'aura', 'sparks'];

const PALETTE_OPTIONS = PALETTES.map(p => ({ id: p.name.toLowerCase(), label: p.name }));
const palette = (def: string) => choice('palette', 'Colors', PALETTE_OPTIONS, def);
const amount = (def = 1, max = 1) => num('amount', 'Strength', 0, max, def);
const size = () => num('size', 'Size', 0.3, 3, 1);

export const BODY_KINDS: Record<BodyKind, { label: string; params: readonly ParamSpec[] }> = {
  fire: { label: 'Fire', params: [amount(1, 2), size(), palette('ember')] },
  lightning: { label: 'Lightning', params: [amount(1, 2), size(), palette('blue')] },
  aura: { label: 'Aura', params: [amount(1, 2), size(), palette('void')] },
  sparks: { label: 'Sparks', params: [amount(1, 2), size(), palette('ember')] },
  outline: {
    label: 'Outline',
    params: [amount(1, 2), size(), palette('prism'), choice('style', 'Style', OUTLINE_STYLES, 'neon')],
  },
  glitch: { label: 'Glitch', params: [amount(1, 2), choice('style', 'Style', GLITCH_STYLES, 'chaos')] },
  edge: {
    label: 'Edge glow',
    params: [
      amount(),
      color('color', 'Line color', '#ffffff'),
      color('glowColor', 'Glow color', '#62d8ff'),
      num('width', 'Width', 0, 1, 0.3),
      num('glow', 'Glow', 0, 1, 0.6),
      num('gap', 'Gap', 0, 1, 0),
    ],
  },
  clones: {
    label: 'Clones',
    params: [
      amount(0.7),
      num('count', 'Copies', 1, 6, 2),
      num('spread', 'Spread', 0, 1, 0.5),
      num('delay', 'Delay (s)', 0, 0.5, 0),
      color('color', 'Tint', '#ffc640'),
      num('tint', 'Tint amount', 0, 1, 0.5),
      num('glow', 'Glow', 0, 1, 0.5),
    ],
  },
  tint: {
    label: 'Tint',
    params: [
      amount(),
      choice(
        'where',
        'On',
        [
          { id: 'subject', label: 'The object' },
          { id: 'background', label: 'Everything else' },
        ],
        'subject',
      ),
      num('feather', 'Soft edge', 0, 1, 0.3),
      ...GRADE_PARAMS,
    ],
  },
  dissolve: {
    label: 'Dissolve',
    params: [
      amount(),
      num('start', 'Starts (of the clip)', 0, 0.9, 0.2),
      color('color', 'Edge color', '#ff7a2f'),
      num('grain', 'Grain', 0, 1, 0.4),
    ],
  },
};

export const isBodyKind = (k: string): k is BodyKind => Object.hasOwn(BODY_KINDS, k);

const paletteIndex = (v: unknown) =>
  Math.max(
    0,
    PALETTES.findIndex(p => p.name.toLowerCase() === v),
  );

// the settings the old painters take, for a pass of theirs (fire, lightning, aura, sparks,
// outline, glitch): its kind, colors, size and strength, over the clip's own settings
export function fxOf(kind: BodyKind, p: Params, base: FxSettings): FxSettings {
  return {
    ...base,
    effect: kind as Effect,
    pal: p.palette !== undefined ? paletteIndex(p.palette) : base.pal,
    size: (p.size as number | undefined) ?? base.size,
    intensity: p.amount as number,
    outline: kind === 'outline' ? (p.style as FxSettings['outline']) : base.outline,
    glitch: kind === 'glitch' ? (p.style as FxSettings['glitch']) : base.glitch,
  };
}

// the pass an old-style effect clip draws; null for the effects still drawn their own way (water,
// lasers, text, and a glitch over the whole frame)
export function passOfFx(fx: FxSettings, pinned: boolean): { kind: BodyKind; params: Params } | null {
  const pal = PALETTES[fx.pal]?.name.toLowerCase() ?? 'ember';
  const base = { amount: fx.intensity, size: fx.size, palette: pal };
  switch (fx.effect) {
    case 'fire':
    case 'lightning':
    case 'aura':
    case 'sparks':
      return { kind: fx.effect, params: base };
    case 'outline':
      return { kind: 'outline', params: { ...base, style: fx.outline } };
    case 'glitch':
      return pinned ? null : { kind: 'glitch', params: { amount: fx.intensity, style: fx.glitch } };
    default:
      return null;
  }
}

// the sound a body effect makes: its first particle effect's, else an outline's hum
export function soundOf(kinds: readonly string[]): Effect {
  const k = kinds.find(k => (PARTICLE_KINDS as readonly string[]).includes(k) || k === 'glitch');
  return (k as Effect | undefined) ?? 'outline';
}

// the passes at t seconds into a clip len long: each one's strength moved as its motion says
// (seed: which flicker)
export function bodyAt(passes: readonly BodyPass[], t: number, len: number, seed: number): BodyPass[] {
  return passes.map(p =>
    p.motion.kind === 'steady'
      ? p
      : {
          ...p,
          params: { ...p.params, amount: (p.params.amount as number) * motionAt(p.motion, t, len, seed) },
        },
  );
}
