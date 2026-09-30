// Which frames of a clip's outlines look wrong, so those can be looked at (and fixed) first: on the
// roto screen, and as weak stretches on the timeline. A frame is doubtful when it has no outline
// (the object wasn't found, or isn't tracked yet), when the tracker says it lost the object there
// (the outline is a guess), or when the outline jumps from the frame before: in size (a piece of
// the object added or dropped), or in shape (lined up by their middles, so moving doesn't count;
// it caught something else, or lost a part).
import { paintRle, type Rle, type Shape } from '@/domain/tracking/types';

export type Flag = 'ok' | 'missing' | 'lost' | 'jump';

// an outline this many times bigger or smaller than the one before has jumped; so has one that
// overlaps the one before (lined up) less than this share of the two together
export const JUMP = 1.4,
  MIN_SAME = 0.6;

// the flag of each frame in [s, e)
export function reviewFlags(shapes: readonly (Shape | null)[], s: number, e: number): Flag[] {
  const flags: Flag[] = [];
  let before: { sh: Shape; a: number } | null = null; // the last outline, and its size
  for (let i = s; i < e; i++) {
    const sh = shapes[i];
    if (!sh) {
      flags.push('missing');
      continue;
    }
    const a = sh.mask ? rleArea(sh.mask) : sh.w * sh.h;
    const jumped =
      !!before &&
      a > 0 &&
      before.a > 0 &&
      (Math.max(a, before.a) / Math.min(a, before.a) > JUMP ||
        (!!sh.mask && !!before.sh.mask && sameShare(before.sh, sh) < MIN_SAME));
    flags.push(sh.lost ? 'lost' : jumped ? 'jump' : 'ok');
    before = { sh, a };
  }
  return flags;
}

// the next doubtful frame after `from` (dir 1) or before it (dir -1); -1 if there's none
export function nextFlagged(flags: readonly Flag[], from: number, dir: 1 | -1) {
  for (let k = from + dir; k >= 0 && k < flags.length; k += dir) if (flags[k] !== 'ok') return k;
  return -1;
}

// how much two outlines overlap, lined up by their middles: the pixels in both over those in
// either (1: the same shape)
export function sameShare(a: Shape, b: Shape) {
  const ma = a.mask!,
    mb = b.mask!;
  // b moved onto a's middle, both painted in a box round them
  const dx = Math.round(a.cx - b.cx),
    dy = Math.round(a.cy - b.cy);
  const x0 = Math.min(ma.x0, mb.x0 + dx),
    y0 = Math.min(ma.y0, mb.y0 + dy),
    w = Math.max(ma.x0 + ma.w, mb.x0 + dx + mb.w) - x0,
    h = Math.max(ma.y0 + ma.h, mb.y0 + dy + mb.h) - y0;
  const pa = new Uint8Array(w * h),
    pb = new Uint8Array(w * h);
  paintRle(ma, pa, w, h, -x0, -y0);
  paintRle(mb, pb, w, h, dx - x0, dy - y0);
  let both = 0,
    either = 0;
  for (let k = 0; k < pa.length; k++) {
    if (pa[k] && pb[k]) both++;
    if (pa[k] || pb[k]) either++;
  }
  return either ? both / either : 1;
}

// how many pixels an outline covers
export function rleArea(rle: Rle) {
  let a = 0;
  for (let k = 0; k < rle.runs.length;) {
    const n = rle.runs[k++];
    for (let r = 0; r < n; r++, k += 2) a += rle.runs[k + 1];
  }
  return a;
}
