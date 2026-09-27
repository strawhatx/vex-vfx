// What the editor's clips look like from outside: lanes for the timeline, and layers for the
// renderer. Pure functions of the tracks.
import { hitFrame, packRows, toLane, type Lane, type Track } from '@/domain/project/track';
import type { ClipFrame } from '@/domain/tracking/types';
import type { LayerSpec } from './ports';

export interface Timeline {
  lanes: Lane[];
  rows: number; // timeline rows the clips are stacked on
  hasEffects: boolean; // some clip has something to follow
}

export function timelineOf(tracks: Track[], clip: ClipFrame[]): Timeline {
  const rows = packRows(tracks.map(t => t.range));
  return {
    lanes: tracks.map((t, k) => toLane(t, clip, rows[k])),
    rows: rows.length ? Math.max(...rows) + 1 : 0,
    hasEffects: tracks.some(t => t.frames.some(f => f.shapes.length)),
  };
}

export function layersOf(tracks: Track[], clip: ClipFrame[]): LayerSpec[] {
  return tracks.map(t => ({
    id: t.id,
    kind: t.kind,
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
  }));
}
