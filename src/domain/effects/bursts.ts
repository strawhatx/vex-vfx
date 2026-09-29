// The burst engine: impacts (a moment, going off at a spot) as passes, so new ones are presets.
//   - hit: the burst itself: a flash at the spot, the whole frame flashing, rings, sparks, a camera
//     jolt, how long it lasts, how big it is, whether it's in the palette's colors or white-hot, and
//     which hit sound it makes
//   - explosion: a fireball's smoke and debris (and a mushroom cloud)
//   - wave: rings of particles racing out, bending the picture
//   - nova: hundreds of particles curling out in a ring
//   - splash: water thrown up, and ripples
//   - word: a comic word popping up on a spiky burst
// An impact is the first pass of each kind; the hit one is always there (its defaults, if left out).
import { IMPACTS, type ImpactFamily, type ImpactLook, type ImpactStyle } from './impacts';
import { choice, num, text, type ParamSpec, type Params } from './params';

export type BurstKind = 'hit' | 'explosion' | 'wave' | 'nova' | 'splash' | 'word';

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

const FAMILIES: { id: ImpactFamily; label: string }[] = [
  { id: 'hit', label: 'Hit' },
  { id: 'explosion', label: 'Explosion' },
  { id: 'shockwave', label: 'Shockwave' },
  { id: 'word', label: 'Word' },
  { id: 'water', label: 'Water' },
];

const SOUNDS = (Object.keys(IMPACTS) as ImpactStyle[]).map(id => ({ id, label: IMPACTS[id].label }));

export const BURST_KINDS: Record<BurstKind, { label: string; params: readonly ParamSpec[] }> = {
  hit: {
    label: 'Hit',
    params: [
      choice('family', 'Kind', FAMILIES, 'hit'),
      choice('sound', 'Sound', SOUNDS, 'punch'),
      num('duration', 'Lasts (s)', 0.2, 4, 0.5),
      num('size', 'Size', 0.02, 0.3, 0.06),
      num('flash', 'Flash', 0, 3, 1),
      num('screenFlash', 'Screen flash', 0, 1, 0),
      num('rings', 'Rings', 0, 4, 1),
      num('sparks', 'Sparks', 0, 120, 20),
      num('speed', 'Spark speed', 0, 12, 4),
      num('gravity', 'Spark fall', 0, 12, 2),
      num('shake', 'Shake', 0, 0.08, 0.015),
      num('zoom', 'Zoom punch', 0, 0.2, 0.05),
      choice(
        'colors',
        'Colors',
        [
          { id: 'palette', label: 'The palette' },
          { id: 'white', label: 'White-hot' },
        ],
        'palette',
      ),
    ],
  },
  explosion: {
    label: 'Explosion',
    params: [
      num('smoke', 'Smoke', 0, 1, 0.6),
      num('debris', 'Debris', 0, 60, 20),
      yesNo('mushroom', 'Mushroom cloud', 'no'),
    ],
  },
  wave: {
    label: 'Shockwave',
    params: [
      num('rings', 'Rings', 1, 5, 1),
      num('gap', 'Between rings (s)', 0, 0.5, 0),
      num('reach', 'Reach', 0.5, 8, 5),
      num('particles', 'Particles', 10, 200, 80),
      num('flatten', 'Flatness', 0.1, 1, 1),
      yesNo('dust', 'Dust', 'no'),
      num('distort', 'Bend', 0, 1, 0.7),
    ],
  },
  nova: {
    label: 'Nova',
    params: [
      num('particles', 'Particles', 50, 800, 400),
      num('reach', 'Reach', 1, 8, 4),
      num('curl', 'Curl', 0, 1, 0.8),
      num('distort', 'Bend', 0, 1, 0.8),
    ],
  },
  splash: {
    label: 'Splash',
    params: [num('drops', 'Drops', 0, 200, 60), num('height', 'Height', 0.5, 6, 3)],
  },
  word: {
    label: 'Word',
    params: [
      text('text', 'Word', 12, 'POW!'),
      num('tilt', 'Tilt', -0.6, 0.6, 0),
      num('spikes', 'Spikes', 6, 24, 12),
    ],
  },
};

export const isBurstKind = (k: string): k is BurstKind => Object.hasOwn(BURST_KINDS, k);

export interface BurstPass {
  engine: 'burst';
  kind: BurstKind;
  params: Params;
}

const defaults = (kind: BurstKind): Params =>
  Object.fromEntries(BURST_KINDS[kind].params.map(s => [s.key, s.def]));

// the impact a stack of burst passes makes (named `label`)
export function lookOf(passes: readonly Pick<BurstPass, 'kind' | 'params'>[], label: string): ImpactLook {
  const of = (kind: BurstKind) => passes.find(p => p.kind === kind)?.params;
  const h = of('hit') ?? defaults('hit');
  const n = (p: Params, k: string) => p[k] as number;
  const look: ImpactLook = {
    label,
    family: h.family as ImpactFamily,
    duration: n(h, 'duration'),
    size: n(h, 'size'),
    flash: n(h, 'flash'),
    screenFlash: n(h, 'screenFlash'),
    rings: Math.round(n(h, 'rings')),
    sparks: Math.round(n(h, 'sparks')),
    speed: n(h, 'speed'),
    gravity: n(h, 'gravity'),
    shake: n(h, 'shake'),
    zoom: n(h, 'zoom'),
    palette: h.colors === 'palette',
  };
  const e = of('explosion'),
    w = of('wave'),
    v = of('nova'),
    s = of('splash'),
    d = of('word');
  if (e)
    look.explosion = {
      smoke: n(e, 'smoke'),
      debris: Math.round(n(e, 'debris')),
      mushroom: e.mushroom === 'yes',
    };
  if (w)
    look.wave = {
      rings: Math.round(n(w, 'rings')),
      gap: n(w, 'gap'),
      reach: n(w, 'reach'),
      particles: Math.round(n(w, 'particles')),
      flatten: n(w, 'flatten'),
      dust: w.dust === 'yes',
      distort: n(w, 'distort'),
    };
  if (v)
    look.nova = {
      particles: Math.round(n(v, 'particles')),
      reach: n(v, 'reach'),
      curl: n(v, 'curl'),
      distort: n(v, 'distort'),
    };
  if (s) look.splash = { drops: Math.round(n(s, 'drops')), height: n(s, 'height') };
  if (d) look.word = { text: d.text as string, tilt: n(d, 'tilt'), spikes: Math.round(n(d, 'spikes')) };
  return look;
}

// the sound an impact made of these passes makes
export const soundOfBurst = (passes: readonly Pick<BurstPass, 'kind' | 'params'>[]): ImpactStyle =>
  (passes.find(p => p.kind === 'hit')?.params.sound as ImpactStyle | undefined) ?? 'punch';

// one of the impact styles as burst passes (what its preset holds)
export function burstPassesOf(style: ImpactStyle): Pick<BurstPass, 'kind' | 'params'>[] {
  const l = IMPACTS[style];
  const out: Pick<BurstPass, 'kind' | 'params'>[] = [
    {
      kind: 'hit',
      params: {
        family: l.family,
        sound: style,
        duration: l.duration,
        size: l.size,
        flash: l.flash,
        screenFlash: l.screenFlash,
        rings: l.rings,
        sparks: l.sparks,
        speed: l.speed,
        gravity: l.gravity,
        shake: l.shake,
        zoom: l.zoom,
        colors: l.palette ? 'palette' : 'white',
      },
    },
  ];
  if (l.explosion)
    out.push({
      kind: 'explosion',
      params: { ...l.explosion, mushroom: l.explosion.mushroom ? 'yes' : 'no' },
    });
  if (l.wave) out.push({ kind: 'wave', params: { ...l.wave, dust: l.wave.dust ? 'yes' : 'no' } });
  if (l.nova) out.push({ kind: 'nova', params: { ...l.nova } });
  if (l.splash) out.push({ kind: 'splash', params: { ...l.splash } });
  if (l.word) out.push({ kind: 'word', params: { ...l.word } });
  return out;
}
