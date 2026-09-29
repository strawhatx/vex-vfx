// The particle engine: a particle system described as data, so embers, snow, sparks, magic dust
// and the rest are presets rather than code. An emitter pass says:
//   - where particles are born: on the object (its outline, its top, inside it, its middle) or on
//     the frame (its top, bottom, sides, anywhere); how many a second, and how many at once at the
//     start
//   - how they move: speed and direction (with a spread, and how far they go out from the outline
//     instead), gravity (below 0 they rise), drag, a noise sway and a pull to the middle; following
//     the object as it moves, or left where they were born
//   - how they look: how long they live, their size and how it changes, their shape, their colors
//     from the palette over their life, how they fade in and out, twinkle, and whether they're added
//     on (glowing) or drawn over
// Sizes and speeds are in the effect's size unit (from the object's size, or the frame's), so a
// preset suits any object. The built-in effects' particles (fire's embers and smoke, aura's wisps
// and glints, sparks) are emitters too (see FIRE_PARTICLES, AURA_PARTICLES, SPARK_PARTICLES).
import { PALETTES } from './palettes';
import { choice, num, type ParamSpec, type Params } from './params';

export type ParticleFrom =
  'outline' | 'top' | 'inside' | 'center' | 'frameTop' | 'frameBottom' | 'frameSides' | 'frame';
export type ParticleShape = 'dot' | 'spark' | 'tongue' | 'smoke' | 'star' | 'confetti';

const FROM: { id: ParticleFrom; label: string }[] = [
  { id: 'outline', label: 'The outline' },
  { id: 'top', label: 'The top' },
  { id: 'inside', label: 'Inside it' },
  { id: 'center', label: 'Its middle' },
  { id: 'frameTop', label: 'Frame: top' },
  { id: 'frameBottom', label: 'Frame: bottom' },
  { id: 'frameSides', label: 'Frame: sides' },
  { id: 'frame', label: 'Frame: anywhere' },
];

const SHAPES: { id: ParticleShape; label: string }[] = [
  { id: 'dot', label: 'Glow' },
  { id: 'spark', label: 'Streak' },
  { id: 'tongue', label: 'Flame' },
  { id: 'smoke', label: 'Smoke' },
  { id: 'star', label: 'Twinkle' },
  { id: 'confetti', label: 'Confetti' },
];

// the palette's colors, hottest to coolest, and white
const SHADES = [
  { id: 'hot', label: 'Hottest' },
  { id: 'bright', label: 'Bright' },
  { id: 'mid', label: 'Middle' },
  { id: 'deep', label: 'Deepest' },
  { id: 'white', label: 'White' },
];

const yesNo = (key: string, label: string, def: 'yes' | 'no') =>
  choice(
    key,
    label,
    [
      { id: 'yes', label: 'Yes' },
      { id: 'no', label: 'No' },
    ],
    def,
  );

export const EMITTER_PARAMS: readonly ParamSpec[] = [
  num('amount', 'Strength', 0, 2, 1),
  choice(
    'palette',
    'Colors',
    PALETTES.map(p => ({ id: p.name.toLowerCase(), label: p.name })),
    'ember',
  ),
  choice('from', 'Born on', FROM, 'outline'),
  num('rate', 'Per second', 0, 400, 30),
  num('burst', 'At the start', 0, 300, 0),
  num('life', 'Lives (s)', 0.1, 4, 1),
  num('lifeRandom', 'Life varies', 0, 1, 0.5),
  num('speed', 'Speed', 0, 80, 12),
  num('speedRandom', 'Speed varies', 0, 1, 0.6),
  num('direction', 'Direction (°)', -180, 180, 0), // 0: up, 90: right
  num('spread', 'Spread (°)', 0, 180, 30),
  num('outward', 'Out from the outline', 0, 1, 0),
  num('gravity', 'Gravity', -40, 40, 0), // below 0: they rise
  num('drag', 'Drag', 0, 4, 0.3),
  num('sway', 'Sway', 0, 40, 0),
  num('pull', 'Pull to the middle', 0, 1, 0),
  yesNo('follow', 'Follow the object', 'no'),
  choice('shape', 'Shape', SHAPES, 'dot'),
  num('size', 'Size', 0.02, 6, 0.3),
  num('sizeRandom', 'Size varies', 0, 1, 0.5),
  num('grow', 'Grows', -1, 3, 0), // -1: shrinks to nothing, 1: doubles over its life
  choice('colorStart', 'Color at birth', SHADES, 'hot'),
  choice('colorEnd', 'Color at the end', SHADES, 'mid'),
  num('opacity', 'Opacity', 0, 1, 0.8),
  num('fadeIn', 'Fades in', 0, 0.9, 0.1), // of its life
  num('twinkle', 'Twinkle', 0, 1, 0),
  choice(
    'blend',
    'Drawn',
    [
      { id: 'add', label: 'Glowing (added)' },
      { id: 'over', label: 'Over (like smoke)' },
    ],
    'add',
  ),
];

export const PARTICLE_KINDS = { emitter: { label: 'Emitter', params: EMITTER_PARAMS } } as const;
export type ParticleKind = keyof typeof PARTICLE_KINDS;
export const isParticleKind = (k: string): k is ParticleKind => k === 'emitter';

const DEFAULTS: Params = Object.fromEntries(EMITTER_PARAMS.map(s => [s.key, s.def]));

// an emitter with these settings over the defaults
export const emitter = (p: Params): Params => ({ ...DEFAULTS, ...p });

// the particles an emitter's settings describe, as numbers ready for a simulation
export interface EmitterSpec {
  amount: number;
  pal: number; // palette index
  from: ParticleFrom;
  rate: number;
  burst: number;
  life: number;
  lifeRandom: number;
  speed: number;
  speedRandom: number;
  direction: number; // radians, 0: up
  spread: number; // radians either side
  outward: number;
  gravity: number;
  drag: number;
  sway: number;
  pull: number;
  follow: boolean;
  shape: ParticleShape;
  size: number;
  sizeRandom: number;
  grow: number;
  colorStart: number; // palette index 0..3, or 4: white
  colorEnd: number;
  opacity: number;
  fadeIn: number;
  twinkle: number;
  add: boolean;
}

const shade = (v: unknown) =>
  Math.max(
    0,
    SHADES.findIndex(s => s.id === v),
  );

export function specOf(p: Params): EmitterSpec {
  const q = { ...DEFAULTS, ...p };
  const n = (k: string) => q[k] as number;
  return {
    amount: n('amount'),
    pal: Math.max(
      0,
      PALETTES.findIndex(x => x.name.toLowerCase() === q.palette),
    ),
    from: q.from as ParticleFrom,
    rate: n('rate'),
    burst: n('burst'),
    life: n('life'),
    lifeRandom: n('lifeRandom'),
    speed: n('speed'),
    speedRandom: n('speedRandom'),
    direction: (n('direction') * Math.PI) / 180,
    spread: (n('spread') * Math.PI) / 180,
    outward: n('outward'),
    gravity: n('gravity'),
    drag: n('drag'),
    sway: n('sway'),
    pull: n('pull'),
    follow: q.follow === 'yes',
    shape: q.shape as ParticleShape,
    size: n('size'),
    sizeRandom: n('sizeRandom'),
    grow: n('grow'),
    colorStart: shade(q.colorStart),
    colorEnd: shade(q.colorEnd),
    opacity: n('opacity'),
    fadeIn: n('fadeIn'),
    twinkle: n('twinkle'),
    add: q.blend !== 'over',
  };
}

// how bright a particle is at g (0..1) of its life: fading in, then out
export function particleAlpha(s: Pick<EmitterSpec, 'opacity' | 'fadeIn'>, g: number) {
  const fin = s.fadeIn > 0 ? Math.min(1, g / s.fadeIn) : 1;
  const fout = g <= s.fadeIn ? 1 : 1 - (g - s.fadeIn) / Math.max(1e-6, 1 - s.fadeIn);
  return Math.max(0, s.opacity * fin * Math.min(1, fout));
}

// how big a particle is at g of its life, of its size at birth
export const particleGrowth = (s: Pick<EmitterSpec, 'grow'>, g: number) => Math.max(0, 1 + s.grow * g);

// ---------- the built-in effects' particles ----------
// (each palette-colored: the effect's own palette is set on them when drawn)

// fire: embers flying up off it, and a little smoke above (the flames themselves are the GPU fire,
// or FIRE_TONGUES where there's none)
export const FIRE_PARTICLES: readonly Params[] = [
  emitter({
    from: 'inside',
    rate: 22,
    life: 1.35,
    lifeRandom: 0.65,
    speed: 22,
    speedRandom: 0.7,
    spread: 20,
    gravity: -2,
    drag: 0.1,
    sway: 40,
    shape: 'dot',
    size: 0.45,
    sizeRandom: 0.5,
    grow: -0.5,
    colorStart: 'bright',
    colorEnd: 'mid',
    opacity: 1,
    fadeIn: 0,
    twinkle: 0.45,
  }),
  emitter({
    from: 'top',
    rate: 14,
    life: 1.65,
    lifeRandom: 0.55,
    speed: 7.5,
    speedRandom: 0.65,
    spread: 25,
    drag: 0,
    sway: 6,
    shape: 'smoke',
    size: 3.5,
    sizeRandom: 0.55,
    grow: 1.4,
    colorStart: 'deep',
    colorEnd: 'deep',
    opacity: 0.1,
    fadeIn: 0.2,
    blend: 'over',
  }),
];

// fire's flames drawn as particles, where the GPU fire isn't available
export const FIRE_TONGUES: Params = emitter({
  from: 'top',
  rate: 200,
  life: 0.62,
  lifeRandom: 0.7,
  speed: 13,
  speedRandom: 0.75,
  spread: 15,
  gravity: -14,
  drag: 1.5,
  sway: 30,
  pull: 0.5,
  shape: 'tongue',
  size: 3.3,
  sizeRandom: 0.6,
  grow: -0.4,
  colorStart: 'hot',
  colorEnd: 'deep',
  opacity: 0.62,
  fadeIn: 0.25,
});

// aura: wisps rising off the outline and glints drifting up, both staying with the body
export const AURA_PARTICLES: readonly Params[] = [
  emitter({
    from: 'top',
    rate: 75,
    life: 0.55,
    lifeRandom: 0.7,
    speed: 12.5,
    speedRandom: 0.7,
    spread: 10,
    outward: 0.25,
    sway: 6,
    follow: 'yes',
    shape: 'tongue',
    size: 1.35,
    sizeRandom: 0.65,
    grow: 0.5,
    colorStart: 'hot',
    colorEnd: 'mid',
    opacity: 0.75,
    fadeIn: 0.5,
  }),
  emitter({
    from: 'top',
    rate: 18,
    life: 0.8,
    lifeRandom: 0.7,
    speed: 21,
    speedRandom: 0.65,
    spread: 10,
    sway: 5,
    follow: 'yes',
    shape: 'dot',
    size: 0.42,
    sizeRandom: 0.5,
    colorStart: 'bright',
    colorEnd: 'bright',
    opacity: 1,
    fadeIn: 0.5,
    twinkle: 0.4,
  }),
];

// sparks: streaks thrown off the edge, falling
export const SPARK_PARTICLES: Params = emitter({
  from: 'outline',
  rate: 80,
  life: 0.6,
  lifeRandom: 0.8,
  speed: 45,
  speedRandom: 0.7,
  spread: 180,
  outward: 1,
  gravity: 60,
  drag: 0.9,
  shape: 'spark',
  size: 0.28,
  sizeRandom: 0,
  colorStart: 'hot',
  colorEnd: 'bright',
  opacity: 1,
  fadeIn: 0,
});
