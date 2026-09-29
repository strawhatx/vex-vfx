// How text comes in and goes out, letter by letter: each letter's pose (how visible, where it's
// moved to, how big and turned, how blurred) at a moment of its animation. Letters start one after
// another, `stagger` seconds apart; each takes `dur` to arrive. Going out is coming in backwards.
// Sizes are in ems (the text's own size), so the same animation fits any text.
import { ease } from './curves';

export type LetterAnim = 'none' | 'fade' | 'pop' | 'rise' | 'drop' | 'type' | 'blur' | 'spin' | 'wide';

export const LETTER_ANIMS: readonly { id: LetterAnim; label: string }[] = [
  { id: 'none', label: 'None' },
  { id: 'fade', label: 'Fade' },
  { id: 'pop', label: 'Pop' },
  { id: 'rise', label: 'Rise' },
  { id: 'drop', label: 'Drop' },
  { id: 'type', label: 'Typewriter' },
  { id: 'blur', label: 'Blur' },
  { id: 'spin', label: 'Spin' },
  { id: 'wide', label: 'Spread' },
];

export interface Pose {
  alpha: number;
  dx: number; // ems
  dy: number; // ems, down
  scale: number;
  rot: number; // radians
  blur: number; // ems
}

export const REST: Pose = { alpha: 1, dx: 0, dy: 0, scale: 1, rot: 0, blur: 0 };

const clamp01 = (u: number) => Math.max(0, Math.min(1, u));

// letter i of n, t seconds after its text started coming in
export function letterIn(
  anim: LetterAnim,
  i: number,
  n: number,
  t: number,
  dur: number,
  stagger: number,
): Pose {
  const local = t - i * stagger;
  const u = dur > 0 ? clamp01(local / dur) : local >= 0 ? 1 : 0;
  switch (anim) {
    case 'none':
      return REST;
    case 'fade':
      return { ...REST, alpha: u };
    case 'pop':
      return { ...REST, alpha: clamp01(u * 3), scale: ease('back', u) };
    case 'rise':
      return { ...REST, alpha: u, dy: (1 - ease('out', u)) * 0.6 };
    case 'drop':
      return { ...REST, alpha: clamp01(u * 4), dy: -(1 - ease('bounce', u)) * 1.2 };
    case 'type':
      return { ...REST, alpha: local >= 0 ? 1 : 0 };
    case 'blur':
      return { ...REST, alpha: u, blur: (1 - u) * 0.3, scale: 1 + (1 - u) * 0.2 };
    case 'spin':
      return { ...REST, alpha: u, rot: (1 - ease('out', u)) * Math.PI, scale: ease('out', u) };
    case 'wide':
      return { ...REST, alpha: u, dx: (i - (n - 1) / 2) * (1 - ease('out', u)) * 0.8 };
  }
}

// letter i of n, `left` seconds before its text is gone: coming in backwards, the last letter
// leaving first
export const letterOut = (
  anim: LetterAnim,
  i: number,
  n: number,
  left: number,
  dur: number,
  stagger: number,
) => letterIn(anim, n - 1 - i, n, left, dur, stagger);

// two poses together
export const combine = (a: Pose, b: Pose): Pose => ({
  alpha: a.alpha * b.alpha,
  dx: a.dx + b.dx,
  dy: a.dy + b.dy,
  scale: a.scale * b.scale,
  rot: a.rot + b.rot,
  blur: a.blur + b.blur,
});

// how long n letters take to all arrive
export const arriving = (anim: LetterAnim, n: number, dur: number, stagger: number) =>
  anim === 'none' ? 0 : (anim === 'type' ? 0 : dur) + stagger * Math.max(0, n - 1);
