// What the editor's clips look like from outside: lanes for the timeline, and layers for the
// renderer. Pure functions of the tracks.
import { pieceAt, toProgram, type Piece } from '@/domain/project/edit';
import { hitFrame, isPinned, packRows, toLane, type Lane, type Track } from '@/domain/project/track';
import type { ClipFrame } from '@/domain/tracking/types';
import type { LayerSpec } from './ports';

export interface Timeline {
  lanes: Lane[];
  rows: number; // timeline rows the effects and impacts are stacked on
  cutRows: number; // timeline rows the cutouts are stacked on, with the footage
  hasEffects: boolean; // some clip has something to draw: an explosion, or an object found
}

// The clips as the timeline shows them, in program time (the film as edited: see edit.ts). A clip
// that runs over a deleted film closes up round it; one wholly inside a deleted film isn't shown.
// Effects and impacts stack on their rows, cutouts (placed where they're placed) on theirs.
export function timelineOf(tracks: Track[], clip: ClipFrame[], pieces: readonly Piece[]): Timeline {
  const P = (t: number) => toProgram(pieces, t);
  // an impact shows if it goes off in a kept film; anything else if some of it is kept
  const kept = (l: Lane) =>
    l.kind === 'impact' ? pieceAt(pieces, l.range.s) >= 0 : P(l.range.e) - P(l.range.s) > 1e-6;
  const shown = tracks
    .map(t => toLane(t, clip, 0))
    .filter(kept)
    .map(l => ({
      ...l,
      range: { s: P(l.range.s), e: P(l.range.e) },
      spans: l.spans.map(sp => ({ ...sp, s: P(sp.s), e: P(sp.e) })).filter(sp => sp.e - sp.s > 1e-6),
      keys: l.keys.filter(k => pieceAt(pieces, k) >= 0).map(P),
      cutout: l.cutout && {
        ...l.cutout,
        from: P(l.cutout.from),
        moves: l.cutout.moves.filter(k => pieceAt(pieces, k) >= 0).map(P),
      },
    }));
  const isCut = (l: Lane) => l.kind === 'cutout';
  const fx = shown.filter(l => !isCut(l)),
    cuts = shown.filter(isCut);
  const fxRows = packRows(fx.map(l => l.range)),
    cutRows = packRows(cuts.map(l => l.range));
  fx.forEach((l, k) => (l.row = fxRows[k]));
  cuts.forEach((l, k) => (l.row = cutRows[k]));
  const count = (rows: number[]) => (rows.length ? Math.max(...rows) + 1 : 0);
  return {
    lanes: shown,
    rows: count(fxRows),
    cutRows: count(cutRows),
    hasEffects: tracks.some(t => isPinned(t) || t.frames.some(f => f.shapes.length)),
  };
}

export function layersOf(tracks: Track[], clip: ClipFrame[]): LayerSpec[] {
  return tracks.map(t => ({
    id: t.id,
    kind: t.kind,
    pinned: isPinned(t),
    frames: t.frames,
    settings: t.fx,
    color: t.color,
    range: t.range,
    aim: t.aim,
    tap: t.keys[0] ?? null,
    impacts:
      t.kind === 'impact' && t.impact
        ? [{ id: t.id, i: hitFrame(t, clip), style: t.impact, tap: t.keys[0] }]
        : [],
    cutout: t.cutout,
    path: t.path,
  }));
}
