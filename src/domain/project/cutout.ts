// Cutouts: objects rotoscoped out of the footage into layers of their own (see overlay.ts for the
// layer). Here: what the footage keeps where an object was cut from, and how a layer is placed —
// moved, scaled, turned and faded, with keyframes.
//
// Where it was cut from, the footage can keep the object, have it removed with the background
// rebuilt behind it (a clean plate), or be left see-through there.

export type Background = 'keep' | 'clean' | 'clear';

export const BACKGROUNDS: { id: Background; label: string; about: string }[] = [
  { id: 'keep', label: 'Keep original', about: 'The object stays in the footage too' },
  { id: 'clean', label: 'Remove object', about: 'Rebuild the background behind it' },
  { id: 'clear', label: 'Leave a hole', about: 'See-through where it was' },
];

// how a layer is placed, relative to where the object was in its footage: moved (x, y: fractions of
// the frame's width and height), scaled and turned (degrees, clockwise) about the object's middle,
// and faded (0..1)
export interface Transform {
  x: number;
  y: number;
  scale: number;
  rot: number;
  opacity: number;
}

export const IDENTITY: Transform = { x: 0, y: 0, scale: 1, rot: 0, opacity: 1 };
export const MIN_SCALE = 0.1,
  MAX_SCALE = 4;

// a transform at t seconds from the layer's start
export type TransformKey = Transform & { t: number };

// a layer's placement: its transform with no keyframes, and its keyframes (in time order; with
// any, they set the transform instead of base)
export interface Placement {
  base: Transform;
  keys: TransformKey[];
}

export const STILL: Placement = { base: IDENTITY, keys: [] };

// a key closer than this (seconds) to a time is on it
export const KEY_EPS = 1 / 60;

const clampT = (p: Partial<Transform>): Partial<Transform> => ({
  ...p,
  ...(p.scale !== undefined && { scale: Math.max(MIN_SCALE, Math.min(MAX_SCALE, p.scale)) }),
  ...(p.opacity !== undefined && { opacity: Math.max(0, Math.min(1, p.opacity)) }),
});

const pick = ({ x, y, scale, rot, opacity }: Transform): Transform => ({ x, y, scale, rot, opacity });

// eases in and out of each key
const ease = (u: number) => u * u * (3 - 2 * u);

// the transform t seconds into the layer: held before the first key and after the last, eased
// between them
export function transformAt(c: Placement, t: number): Transform {
  const k = c.keys;
  if (!k.length) return c.base;
  if (t <= k[0].t) return pick(k[0]);
  const last = k[k.length - 1];
  if (t >= last.t) return pick(last);
  let n = 1;
  while (k[n].t < t) n++;
  const a = k[n - 1],
    b = k[n],
    u = ease((t - a.t) / (b.t - a.t));
  const mix = (p: number, q: number) => p + (q - p) * u;
  return {
    x: mix(a.x, b.x),
    y: mix(a.y, b.y),
    scale: mix(a.scale, b.scale),
    rot: mix(a.rot, b.rot),
    opacity: mix(a.opacity, b.opacity),
  };
}

export const keyAt = (c: Placement, t: number) => c.keys.find(k => Math.abs(k.t - t) < KEY_EPS) ?? null;

// changes the transform t seconds into the layer. With no keyframes that's the whole layer's;
// with some, it sets (or adds) the keyframe at t, so each change is a step in the animation.
export function setTransformAt<P extends Placement>(c: P, t: number, p: Partial<Transform>): P {
  const q = clampT(p);
  if (!c.keys.length) return { ...c, base: { ...c.base, ...q } };
  const key = { ...transformAt(c, t), ...q, t: keyAt(c, t)?.t ?? t };
  return { ...c, keys: insert(c.keys, key) };
}

// adds a keyframe at t holding the transform there, or removes the one on t. Removing the last one
// keeps its transform for the whole layer.
export function toggleKey<P extends Placement>(c: P, t: number): P {
  const on = keyAt(c, t);
  if (!on) return { ...c, keys: insert(c.keys, { ...transformAt(c, t), t: Math.max(0, t) }) };
  const keys = c.keys.filter(k => k !== on);
  return { ...c, keys, base: keys.length ? c.base : pick(on) };
}

// back to where it was cut from: no move, no keyframes
export const resetTransform = <P extends Placement>(c: P): P => ({ ...c, base: IDENTITY, keys: [] });

// every keyframe moved by dt seconds (the layer's start moved the other way, so they stay put)
export const shiftKeys = <P extends Placement>(c: P, dt: number): P => ({
  ...c,
  keys: c.keys.map(k => ({ ...k, t: k.t + dt })),
});

function insert(keys: readonly TransformKey[], key: TransformKey) {
  return [...keys.filter(k => Math.abs(k.t - key.t) >= KEY_EPS), key].sort((a, b) => a.t - b.t);
}
