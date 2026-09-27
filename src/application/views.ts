// What the editor's clips look like from outside: lanes for the timeline, and layers for the
// renderer. Pure functions of the tracks.
import { placedRange } from '@/domain/project/cutout';
import { hitFrame, isPinned, packRows, toLane, type Lane, type Track } from '@/domain/project/track';
import type { ClipFrame } from '@/domain/tracking/types';
import type { LayerSpec } from './ports';

export interface Timeline {
  lanes: Lane[];
  rows: number; // timeline rows the effects and impacts are stacked on
  cutRows: number; // timeline rows the cutouts are stacked on, with the footage
  hasEffects: boolean; // some clip has something to draw: an explosion, or an object found
}

// effects and impacts stack on their rows, cutouts (placed where they're placed) on theirs
export function timelineOf(tracks: Track[], clip: ClipFrame[]): Timeline {
  const isCut = (t: Track) => t.kind === 'cutout';
  const fx = tracks.filter(t => !isCut(t)),
    cuts = tracks.filter(isCut);
  const fxRows = packRows(fx.map(t => t.range)),
    cutRows = packRows(cuts.map(t => placedRange(t.range, t.cutout!)));
  const rowOf = new Map<Track, number>([
    ...fx.map((t, k) => [t, fxRows[k]] as const),
    ...cuts.map((t, k) => [t, cutRows[k]] as const),
  ]);
  const count = (rows: number[]) => (rows.length ? Math.max(...rows) + 1 : 0);
  return {
    lanes: tracks.map(t => toLane(t, clip, rowOf.get(t)!)),
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
