// How an effect's strength moves over the time it's on: easing, fading in and out at a clip's ends,
// and a motion (steady, pulsing, bursts…) that scales it. Also smooth noise for shakes and flicker.
// All pure: the same time always gives the same value, so any frame renders the same in any order.

export type Ease = 'linear' | 'in' | 'out' | 'inOut' | 'back' | 'bounce' | 'elastic';

export const EASES: readonly { id: Ease; label: string }[] = [
  { id: 'linear', label: 'Even' },
  { id: 'in', label: 'Speed up' },
  { id: 'out', label: 'Slow down' },
  { id: 'inOut', label: 'Smooth' },
  { id: 'back', label: 'Overshoot' },
  { id: 'bounce', label: 'Bounce' },
  { id: 'elastic', label: 'Spring' },
];

const clamp01 = (u: number) => Math.max(0, Math.min(1, u));

// u (0..1) eased; back and elastic overshoot past 1 before settling
export function ease(kind: Ease, u: number): number {
  u = clamp01(u);
  switch (kind) {
    case 'linear':
      return u;
    case 'in':
      return u * u * u;
    case 'out':
      return 1 - (1 - u) ** 3;
    case 'inOut':
      return u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2;
    case 'back': {
      const c = 1.70158;
      return 1 + (c + 1) * (u - 1) ** 3 + c * (u - 1) ** 2;
    }
    case 'bounce': {
      const n = 7.5625,
        d = 2.75;
      if (u < 1 / d) return n * u * u;
      if (u < 2 / d) return n * (u -= 1.5 / d) * u + 0.75;
      if (u < 2.5 / d) return n * (u -= 2.25 / d) * u + 0.9375;
      return n * (u -= 2.625 / d) * u + 0.984375;
    }
    case 'elastic':
      return u === 0 || u === 1 ? u : 2 ** (-10 * u) * Math.sin(((u * 10 - 0.75) * 2 * Math.PI) / 3) + 1;
  }
}

// how far on a clip len seconds long is at t seconds into it: rising over fadeIn, falling over
// fadeOut (each at most half of it), 0 outside it
export function envelope(t: number, len: number, fadeIn: number, fadeOut: number) {
  if (t < 0 || t > len) return 0;
  const a = Math.min(fadeIn, len / 2),
    b = Math.min(fadeOut, len / 2);
  let v = 1;
  if (a > 0 && t < a) v = ease('inOut', t / a);
  if (b > 0 && t > len - b) v = Math.min(v, ease('inOut', (len - t) / b));
  return v;
}

// How an effect's strength moves while it's on (0..1, scaling it):
//   - steady: all the way on
//   - pulse: swells and fades `rate` times a second
//   - burst: hits hard `rate` times a second and dies away (a beat)
//   - flicker: jumps about at random, `rate` changes a second
//   - rise / fall: grows from nothing to full over the clip, or dies away over it
//   - once: one hit at the start, dying away over `decay` seconds
export type MotionKind = 'steady' | 'pulse' | 'burst' | 'flicker' | 'rise' | 'fall' | 'once';

export interface Motion {
  kind: MotionKind;
  rate: number; // per second (pulse, burst, flicker)
  decay: number; // seconds (burst, once)
}

export const STEADY: Motion = { kind: 'steady', rate: 1, decay: 0.3 };

export const MOTIONS: { id: MotionKind; label: string }[] = [
  { id: 'steady', label: 'Steady' },
  { id: 'pulse', label: 'Pulse' },
  { id: 'burst', label: 'Beat' },
  { id: 'flicker', label: 'Flicker' },
  { id: 'rise', label: 'Build up' },
  { id: 'fall', label: 'Fade away' },
  { id: 'once', label: 'Hit' },
];

// the motion's value t seconds into a clip len long (seed: which flicker)
export function motionAt(m: Motion, t: number, len: number, seed = 0): number {
  const rate = Math.max(0.01, m.rate),
    decay = Math.max(0.01, m.decay);
  switch (m.kind) {
    case 'steady':
      return 1;
    case 'pulse':
      return 0.5 - 0.5 * Math.cos(2 * Math.PI * rate * t);
    case 'burst': {
      const since = t - Math.floor(t * rate) / rate;
      return Math.exp(-since / decay);
    }
    case 'flicker':
      return 0.5 + 0.5 * noise(seed, t * rate);
    case 'rise':
      return ease('in', len > 0 ? t / len : 1);
    case 'fall':
      return 1 - ease('out', len > 0 ? t / len : 1);
    case 'once':
      return t < 0 ? 0 : Math.exp(-t / decay);
  }
}

// a whole number's hash, 0..1
function hash(n: number) {
  let h = Math.imul(n | 0, 0x27d4eb2d) ^ 0x165667b1;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// smooth noise, -1..1, along x (one wiggle per unit); each seed a different one
export function noise(seed: number, x: number) {
  const i = Math.floor(x),
    f = x - i,
    u = f * f * (3 - 2 * f),
    s = Math.imul(seed | 0, 1013);
  const a = hash(s + i) * 2 - 1,
    b = hash(s + i + 1) * 2 - 1;
  return a + (b - a) * u;
}
