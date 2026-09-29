// What a clip's outline is in each frame, from what tracking found there:
//   1. cleaned up: specks dropped, small holes filled (see clean.ts)
//   2. a cutout's pieces added and taken out (see parts.ts); after cleaning, so a hole cut on
//      purpose isn't filled back in
//   3. its edge settings (see edge.ts): steadied with the frames either side, smoothed, grown.
//      Every clip that follows something starts steadied and a little smoothed, so its edge
//      doesn't flicker; a cutout's can be changed.
// Cleaning and the edge are kept for each outline, so drawing the frames again when little has
// changed (a clip's end dragged) is quick.
import { cleanShape } from './clean';
import { PLAIN_EDGE, reshapes, withEdge, type EdgeSettings } from './edge';
import { withParts, type Part } from './parts';
import type { Shape } from '@/domain/tracking/types';

export const DEFAULT_EDGE: EdgeSettings = { feather: 0, smooth: 1, grow: 0, steady: 1 };

type Source = {
  shapes: readonly (Shape | null)[];
  parts: readonly Part[];
  edge: EdgeSettings | null; // null: none (a clip pinned to a spot follows nothing)
};

const cleaned = new WeakMap<Shape, Shape>();
// an outline with the edge, with what it was made from: kept while that's the same
const edged = new WeakMap<Shape, { near: (Shape | null)[]; edge: EdgeSettings; out: Shape | null }>();

// the outlines at frames [from, to), where inSpan(k) says which frames the clip covers
export function outlinesOf(src: Source, from: number, to: number, inSpan: (k: number) => boolean) {
  const found = (k: number) => {
    const sh = inSpan(k) ? (src.shapes[k] ?? null) : null;
    if (!sh) return null;
    let c = cleaned.get(sh);
    if (!c) cleaned.set(sh, (c = cleanShape(sh)));
    return c;
  };
  const seen = new Map<number, Shape | null>();
  const outline = (k: number) => {
    if (!seen.has(k)) seen.set(k, src.parts.length ? withParts(found, src.parts, k) : found(k));
    return seen.get(k)!;
  };
  const edge = src.edge ?? PLAIN_EDGE;
  const out: (Shape | null)[] = [];
  const r = Math.round(edge.steady);
  for (let i = from; i < to; i++) {
    const here = inSpan(i) ? outline(i) : null;
    if (!here || !reshapes(edge)) {
      out.push(here);
      continue;
    }
    // (kept only without parts: with them, each outline is made afresh)
    const near: (Shape | null)[] = [];
    for (let k = i - r; k <= i + r; k++) near.push(k === i ? here : inSpan(k) ? outline(k) : null);
    const hit = src.parts.length ? undefined : edged.get(here);
    if (hit && hit.edge === edge && hit.near.every((s, n) => s === near[n])) {
      out.push(hit.out);
      continue;
    }
    const made = withEdge(k => near[k - i + r] ?? null, i, edge);
    if (!src.parts.length) edged.set(here, { near, edge, out: made });
    out.push(made);
  }
  return out;
}
