// A plan is the video's script: a hook, the scenes in order (which screenshot, how it moves, where it
// zooms, its caption, how it cuts to the next) and an outro. The AI director or the rules write it;
// validate.ts checks it before anything plays.
import type { MoveId } from './moves';

export type Aspect = '9:16' | '16:9';
export const ASPECTS: readonly Aspect[] = ['9:16', '16:9'];
export const DEFAULT_ASPECT: Aspect = '9:16';

// where to push in, as fractions of the screenshot (0..1), and how far (1 = whole screen)
export interface Zoom {
  x: number;
  y: number;
  scale: number;
}

export interface Caption {
  text: string;
  move: MoveId;
}

export interface Scene {
  // index into the screenshots, in the order the user dropped them
  shot: number;
  duration: number;
  move: MoveId;
  zoom: Zoom;
  caption: Caption | null;
  // how this scene hands over to the next (the last one's leads into the outro)
  transition: MoveId;
  extra: MoveId | null;
}

export interface Plan {
  v: 1;
  aspect: Aspect;
  hook: { text: string; move: MoveId; duration: number };
  scenes: Scene[];
  outro: { title: string; url: string; cta: string };
}

export const LIMITS = {
  scene: [1, 6],
  scenes: [3, 8],
  total: [8, 45],
  hook: [1, 3],
  zoomScale: [1, 3],
  caption: 60,
  hookText: 48,
  cta: 24,
} as const;

// the outro card is always the engine's own, and always this long
export const OUTRO_SECONDS = 2.6;
// a transition overlaps the cut by this much on each side
export const TRANSITION_SECONDS = 0.4;

export const planDuration = (p: Plan) =>
  p.hook.duration + p.scenes.reduce((s, x) => s + x.duration, 0) + OUTRO_SECONDS;
