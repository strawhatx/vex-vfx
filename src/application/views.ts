// What the editor's clips look like from outside: lanes for the timeline, and layers for the
// renderer. Pure functions of the tracks.
import { pieceAt, toProgram, type Piece } from '@/domain/project/edit';
import {
  assignLayerRows,
  hitFrame,
  impactLook,
  isPinned,
  layerOf,
  objectPasses,
  toLane,
  type Lane,
  type Track,
} from '@/domain/project/track';
import type { ClipFrame } from '@/domain/tracking/types';
import { placeOf } from '@/domain/project/drawOrder';
import type { LayerSpec } from './ports';

export interface Timeline {
  lanes: Lane[];
  rows: number; // timeline rows the effects and impacts are stacked on
  cutRows: number; // timeline rows the cutouts are stacked on, with the footage
  hasEffects: boolean; // some clip has something to draw: an explosion, or an object found
}

// The video's effects and impacts as the timeline shows them, in program time (the video as edited:
// see edit.ts). A clip that runs over a deleted film closes up round it; one wholly inside a deleted
// film isn't shown. Each goes on the row the user put it on in its layer (see layerOf), where it
// fits (see assignRows).
// Cutouts aren't listed: what's cut is a layer of the film's (see project.ts).
export function timelineOf(tracks: Track[], clip: ClipFrame[], pieces: readonly Piece[]): Timeline {
  const P = (t: number) => toProgram(pieces, t);
  // an impact shows if it goes off in a kept film; anything else if some of it is kept
  const kept = (l: Lane) =>
    l.kind === 'impact' ? pieceAt(pieces, l.range.s) >= 0 : P(l.range.e) - P(l.range.s) > 1e-6;
  const shown = tracks
    .filter(t => t.kind !== 'cutout')
    .map(t => toLane(t, clip, 0))
    .filter(kept)
    .map(l => ({
      ...l,
      range: { s: P(l.range.s), e: P(l.range.e) },
      spans: l.spans.map(sp => ({ ...sp, s: P(sp.s), e: P(sp.e) })).filter(sp => sp.e - sp.s > 1e-6),
      keys: l.keys.filter(k => pieceAt(pieces, k) >= 0).map(P),
    }));
  const wanted = (l: Lane) => tracks.find(t => t.id === l.id)?.row ?? null;
  const { rows, counts } = assignLayerRows(
    shown.map(l => ({ range: l.range, layer: layerOf(l), row: wanted(l) })),
  );
  shown.forEach((l, k) => (l.row = rows[k]));
  return {
    lanes: shown,
    rows: counts.effects,
    cutRows: 0,
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
    passes: objectPasses(t),
    color: t.color,
    range: t.range,
    aim: t.aim,
    tap: t.keys[0] ?? null,
    impacts:
      t.kind === 'impact' && t.impact
        ? [{ id: t.id, i: hitFrame(t, clip), style: t.impact, look: impactLook(t)!, tap: t.keys[0] }]
        : [],
    cutout: t.cutout,
    place: placeOf(t),
  }));
}
