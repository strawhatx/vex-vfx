// The motion engine: how a clip (a video's scene, or an overlay) moves as a whole. Its passes:
//   - in: the pose it comes in from (scale, place, turn, opacity, blur), eased to rest over
//     `duration` seconds
//   - out: the pose it goes out to, over its last `duration` seconds
//   - combo: movement over the whole clip (sway, pulse, shake, float, a slow zoom, spin)
// "Zoom in", "Slide from the left" and so on are presets of these (see presets.ts), so the Preset
// Lab can make new ones. A clip keeps one of each kind (its "animation"), with its own duration.
import { EASES, ease, noise, type Ease } from './curves';
import { choice, num, type ParamSpec, type Params } from './params';

export type AnimKind = 'in' | 'out' | 'combo';
export const ANIM_KINDS: readonly AnimKind[] = ['in', 'out', 'combo'];

const pose = (dur: number, easing: Ease): ParamSpec[] => [
  num('duration', 'Duration (s)', 0.1, 5, dur),
  choice('ease', 'Easing', EASES, easing),
  num('scale', 'Scale', 0, 3, 1),
  num('x', 'Across', -1.5, 1.5, 0), // of the frame's width
  num('y', 'Down', -1.5, 1.5, 0), // of its height
  num('turn', 'Turn (°)', -720, 720, 0),
  num('opacity', 'Opacity', 0, 1, 1),
  num('blur', 'Blur', 0, 1, 0),
];

export const ANIMATION_KINDS: Record<AnimKind, { label: string; params: readonly ParamSpec[] }> = {
  in: { label: 'In', params: pose(0.5, 'out') },
  out: { label: 'Out', params: pose(0.5, 'in') },
  combo: {
    label: 'Combo',
    params: [
      num('rate', 'Speed (per s)', 0.1, 4, 1),
      num('sway', 'Sway', 0, 1, 0),
      num('pulse', 'Pulse', 0, 1, 0),
      num('shake', 'Shake', 0, 1, 0),
      num('float', 'Float', 0, 1, 0),
      num('zoom', 'Zoom over the clip', -1, 1, 0),
      num('spin', 'Turns over the clip', -2, 2, 0),
    ],
  },
};

export const isAnimKind = (k: string): k is AnimKind => (ANIM_KINDS as readonly string[]).includes(k);

// one kind of a clip's animation: the preset it's from (for the menus) and its settings
export interface AnimSlot {
  preset: string;
  params: Params;
}

export type ClipAnim = Record<AnimKind, AnimSlot | null>;
export const NO_ANIM: ClipAnim = { in: null, out: null, combo: null };

export const hasAnim = (a: ClipAnim) => !!(a.in || a.out || a.combo);

// where a clip is drawn, relative to where it would be: moved (fractions of the frame), scaled
// and turned (radians) about its middle, faded, and blurred (fraction of the frame's width)
export interface ClipPose {
  x: number;
  y: number;
  scale: number;
  rot: number;
  alpha: number;
  blur: number;
}

export const REST_POSE: ClipPose = { x: 0, y: 0, scale: 1, rot: 0, alpha: 1, blur: 0 };

const poseOf = (p: Params): ClipPose => ({
  x: p.x as number,
  y: p.y as number,
  scale: p.scale as number,
  rot: ((p.turn as number) * Math.PI) / 180,
  alpha: p.opacity as number,
  blur: (p.blur as number) * 0.04,
});

// from pose a (k = 0) to pose b (k = 1)
const mix = (a: ClipPose, b: ClipPose, k: number): ClipPose => ({
  x: a.x + (b.x - a.x) * k,
  y: a.y + (b.y - a.y) * k,
  scale: a.scale + (b.scale - a.scale) * k,
  rot: a.rot + (b.rot - a.rot) * k,
  alpha: a.alpha + (b.alpha - a.alpha) * k,
  blur: a.blur + (b.blur - a.blur) * k,
});

// two poses together
export const combinePoses = (a: ClipPose, b: ClipPose): ClipPose => ({
  x: a.x + b.x,
  y: a.y + b.y,
  scale: a.scale * b.scale,
  rot: a.rot + b.rot,
  alpha: a.alpha * b.alpha,
  blur: a.blur + b.blur,
});

// the pose t seconds into a clip len long. Coming in and going out share the clip when it's too
// short for both.
export function poseAt(a: ClipAnim, t: number, len: number): ClipPose {
  let p = REST_POSE;
  let din = a.in ? (a.in.params.duration as number) : 0,
    dout = a.out ? (a.out.params.duration as number) : 0;
  if (din + dout > len && din + dout > 0) {
    const k = len / (din + dout);
    din *= k;
    dout *= k;
  }
  if (a.in && t < din) {
    const u = ease(a.in.params.ease as Ease, t / din);
    p = combinePoses(p, mix(poseOf(a.in.params), REST_POSE, u));
  }
  if (a.out && len - t < dout) {
    // (eased forward in time, like coming in: speeding up is leaving faster and faster)
    const u = ease(a.out.params.ease as Ease, 1 - (len - t) / dout);
    p = combinePoses(p, mix(REST_POSE, poseOf(a.out.params), u));
  }
  if (a.combo) p = combinePoses(p, comboAt(a.combo.params, t, len));
  return p;
}

function comboAt(c: Params, t: number, len: number): ClipPose {
  const rate = c.rate as number,
    wave = Math.sin(2 * Math.PI * rate * t),
    along = len > 0 ? Math.min(1, t / len) : 0;
  return {
    x: noise(11, t * rate * 8) * (c.shake as number) * 0.03,
    y: noise(12, t * rate * 8) * (c.shake as number) * 0.03 + wave * (c.float as number) * 0.03,
    scale:
      (1 + (c.pulse as number) * 0.08 * (0.5 - 0.5 * Math.cos(2 * Math.PI * rate * t))) *
      (1 + (c.zoom as number) * 0.3 * along),
    rot: wave * (c.sway as number) * 0.12 + 2 * Math.PI * (c.spin as number) * along,
    alpha: 1,
    blur: 0,
  };
}
