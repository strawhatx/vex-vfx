// Tracing once per video (docs/timeline-rules.md, rules 4 and 10): an object already traced in a
// video (by another effect on it, another use of the same file in the film, or a use of it taken
// out of the film) is reused by a new effect tapped on it, rather than tracked all over again.
import type { FrameSpan, Key } from './keyframes';
import { MIN_RANGE_S, type Track } from './track';
import type { ClipFrame, Selection, Shape } from '../tracking/types';

// whether (x, y) is on the shape: inside its outline when it has one, else inside its box
export function onShape(sh: Shape, x: number, y: number) {
  if (Math.abs(x - sh.cx) >= sh.w / 2 || Math.abs(y - sh.cy) >= sh.h / 2) return false;
  const m = sh.mask;
  if (!m) return true;
  const row = Math.floor(y) - m.y0,
    col = Math.floor(x) - m.x0;
  if (row < 0 || row >= m.h || col < 0 || col >= m.w) return false;
  // (rows are run counts then (start, length) pairs: skip to this one)
  let k = 0;
  for (let r = 0; r < row; r++) k += 1 + 2 * m.runs[k];
  const n = m.runs[k];
  for (let j = 0; j < n; j++) {
    const s = m.runs[k + 1 + 2 * j],
      len = m.runs[k + 2 + 2 * j];
    if (col >= s && col < s + len) return true;
  }
  return false;
}

// an object traced before: its shapes (one per clip frame), its keyframes, and the frames around
// the tap it was found in without a break
export interface Traced {
  shapes: (Shape | null)[];
  keys: Key[];
  span: FrameSpan;
}

// the object traced by an effect in one of `tracks` (all of the same video, n frames long) that the
// tap at `p` in frame i is on, following the same body part (null: the object itself); null if
// there's none. (A cutout's outline isn't one: it's the whole person, where an effect follows just
// what was tapped.)
export function tracedAt(
  tracks: readonly Pick<Track, 'kind' | 'spot' | 'part' | 'shapes' | 'keys'>[],
  n: number,
  i: number,
  p: Selection,
  part: Track['part'],
): Traced | null {
  for (const t of tracks) {
    if (t.kind !== 'effect' || t.spot || t.part !== part || t.shapes.length !== n) continue;
    const sh = t.shapes[i];
    if (!sh || sh.lost || !onShape(sh, p.x, p.y)) continue;
    let s = i,
      e = i + 1;
    while (s > 0 && t.shapes[s - 1]) s--;
    while (e < n && t.shapes[e]) e++;
    return { shapes: t.shapes, keys: t.keys, span: { s, e } };
  }
  return null;
}

// new effect `t`, tapped at frame i (key), made from an object traced before: its shapes and
// keyframes, and lasting no longer than the object was traced for. False (t unchanged) if that's
// too short to be worth it, so it's tracked afresh.
export function reuseTraced(t: Track, found: Traced, key: Key, clip: ClipFrame[]) {
  const last = clip[found.span.e - 1];
  if (!last) return false;
  const e = Math.min(t.range.e, last.t + last.dur);
  if (e - t.range.s < MIN_RANGE_S) return false;
  t.range = { s: t.range.s, e };
  t.shapes = found.shapes.map(sh => sh && (sh.id === t.id ? sh : { ...sh, id: t.id }));
  const keys = found.keys.some(k => k.i === key.i) ? found.keys : [...found.keys, key];
  t.keys = keys.slice().sort((a, b) => a.i - b.i);
  return true;
}
