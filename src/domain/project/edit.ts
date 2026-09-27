// The film as edited: the clip split into scenes (see scenes.ts), with the ones the user deleted
// left out. What's kept plays back to back: that's program time, what the timeline, the playhead
// and the export show. Everything in the project (tracking, effects, cutouts) stays in the clip's
// own time, source time, so deleting a film never touches it: it's only mapped between the two.
import { scenesOf } from './scenes';

// a kept scene: its source range, and where it starts in program time
export interface Piece {
  s: number;
  e: number;
  at: number;
}

const EPS = 1e-6;

// the kept scenes, back to back. gone: the source start of each deleted scene
export function piecesOf(cuts: readonly number[], gone: readonly number[], duration: number): Piece[] {
  let at = 0;
  const out: Piece[] = [];
  for (const sc of scenesOf(cuts, duration)) {
    if (gone.some(g => Math.abs(g - sc.s) < EPS)) continue;
    out.push({ ...sc, at });
    at += sc.e - sc.s;
  }
  return out;
}

// how long the film plays, as edited
export function lengthOf(pieces: readonly Piece[]) {
  const last = pieces[pieces.length - 1];
  return last ? last.at + last.e - last.s : 0;
}

// the program time source time t plays at; within a deleted stretch, where the next kept scene
// starts (the end, after the last)
export function toProgram(pieces: readonly Piece[], t: number) {
  for (const p of pieces) {
    if (t < p.s) return p.at;
    if (t < p.e) return p.at + t - p.s;
  }
  return lengthOf(pieces);
}

// the source time playing at program time p. end: p ends a stretch (a clip's end), so at a join
// it's the end of the scene before rather than the start of the next
export function toSource(pieces: readonly Piece[], p: number, end = false) {
  for (const q of pieces) {
    const stop = q.at + q.e - q.s;
    if (end ? p <= stop + EPS : p < stop) return q.s + Math.max(0, p - q.at);
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
