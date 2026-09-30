// The film as edited: the clip split into scenes (see scenes.ts), with the ones the user deleted
// left out. What's kept plays back to back: that's program time, what the timeline, the playhead
// and the export show. Everything in the project (tracking, effects, cutouts) stays in the clip's
// own time, source time, so deleting a film never touches it: it's only mapped between the two.
// A film can play faster or slower than it was filmed (its speed): 2 plays its stretch of the clip in
// half the time. It can also move as it plays (its animation: see effects/animation.ts), and have its
// background hidden, leaving just what's cut out of it (docs/timeline-rules.md: remove background).
import { NO_ANIM, hasAnim, type ClipAnim } from '../effects/animation';
import { scenesOf } from './scenes';

// a kept scene: its source range, where it starts in program time, and how fast it plays (pitch:
// its sound's pitch changes with it, rather than staying as it was); noBackground: its background
// layer is hidden
export interface Piece {
  s: number;
  e: number;
  at: number;
  speed: number;
  pitch: boolean;
  anim: ClipAnim;
  noBackground: boolean;
}

// a scene's speed, by where it starts (source time); scenes without one play at 1
export type SceneSpeed = { s: number; speed: number; pitch: boolean };
// a scene's animation, by where it starts; scenes without one don't move
export type SceneAnim = { s: number; anim: ClipAnim };

export const MIN_SPEED = 0.1,
  MAX_SPEED = 10;

const EPS = 1e-6;

// how long a piece plays for, in program time
export const playLength = (p: Pick<Piece, 's' | 'e' | 'speed'>) => (p.e - p.s) / p.speed;

// the kept scenes, back to back. gone: the source start of each deleted scene; hidden: of each
// scene with its background hidden
export function piecesOf(
  cuts: readonly number[],
  gone: readonly number[],
  duration: number,
  speeds: readonly SceneSpeed[] = [],
  anims: readonly SceneAnim[] = [],
  hidden: readonly number[] = [],
): Piece[] {
  let at = 0;
  const out: Piece[] = [];
  for (const sc of scenesOf(cuts, duration)) {
    if (gone.some(g => Math.abs(g - sc.s) < EPS)) continue;
    const sp = speeds.find(x => Math.abs(x.s - sc.s) < EPS);
    const anim = anims.find(x => Math.abs(x.s - sc.s) < EPS)?.anim ?? NO_ANIM;
    const noBackground = hidden.some(h => Math.abs(h - sc.s) < EPS);
    const p = { ...sc, at, speed: sp?.speed ?? 1, pitch: sp?.pitch ?? false, anim, noBackground };
    out.push(p);
    at += playLength(p);
  }
  return out;
}

// sets the speed of the scene starting at source time s (1 with the pitch kept: none)
export function withSpeed(speeds: readonly SceneSpeed[], s: number, speed: number, pitch: boolean) {
  const v = Math.max(MIN_SPEED, Math.min(MAX_SPEED, speed));
  const rest = speeds.filter(x => Math.abs(x.s - s) >= EPS);
  return Math.abs(v - 1) < 1e-3 && !pitch ? rest : [...rest, { s, speed: v, pitch }];
}

// sets the animation of the scene starting at source time s (none: nothing kept)
export function withAnim(anims: readonly SceneAnim[], s: number, anim: ClipAnim) {
  const rest = anims.filter(x => Math.abs(x.s - s) >= EPS);
  return hasAnim(anim) ? [...rest, { s, anim }] : rest;
}

// the background of the scene starting at source time s hidden (on) or shown
export function withHidden(hidden: readonly number[], s: number, on: boolean) {
  const rest = hidden.filter(h => Math.abs(h - s) >= EPS);
  return on ? [...rest, s] : rest;
}

// how long the film plays, as edited
export function lengthOf(pieces: readonly Piece[]) {
  const last = pieces[pieces.length - 1];
  return last ? last.at + playLength(last) : 0;
}

// the program time source time t plays at; within a deleted stretch, where the next kept scene
// starts (the end, after the last)
export function toProgram(pieces: readonly Piece[], t: number) {
  for (const p of pieces) {
    if (t < p.s) return p.at;
    if (t < p.e) return p.at + (t - p.s) / p.speed;
  }
  return lengthOf(pieces);
}

// the source time playing at program time p. end: p ends a stretch (a clip's end), so at a join
// it's the end of the scene before rather than the start of the next
export function toSource(pieces: readonly Piece[], p: number, end = false) {
  for (const q of pieces) {
    const stop = q.at + playLength(q);
    if (end ? p <= stop + EPS : p < stop) return Math.min(q.e, q.s + Math.max(0, p - q.at) * q.speed);
  }
  return pieces[pieces.length - 1]?.e ?? 0;
}

// the kept scene playing at source time t, or -1 where it was deleted
export const pieceAt = (pieces: readonly Piece[], t: number) =>
  pieces.findIndex(p => t >= p.s - EPS && t < p.e - EPS);

// where playback at source time t should go instead: null if it's in a kept scene, else the start
// of the next kept one, or 'end' when there's none
export function jumpFrom(pieces: readonly Piece[], t: number): number | 'end' | null {
  if (pieceAt(pieces, t) >= 0) return null;
  const next = pieces.find(p => p.s > t - EPS);
  return next ? next.s : 'end';
}
