// Checking a cutout's outlines before it's cut out: which of its frames look wrong, so those can be
// looked at first. A frame is doubtful when it has no outline (the object wasn't found, or isn't
// tracked yet), when the tracker says it lost the object there (the outline is a guess), or when
// the outline's size jumps from the frame before (a piece of the object added or dropped).
import type { Rle, Shape } from '@/domain/tracking/types';

export type Flag = 'ok' | 'missing' | 'lost' | 'jump';

// an outline this many times bigger or smaller than the one before has jumped
export const JUMP = 1.4;

// the flag of each frame in [s, e)
export function reviewFlags(shapes: readonly (Shape | null)[], s: number, e: number): Flag[] {
  const flags: Flag[] = [];
  let before = 0; // the last outline's size
  for (let i = s; i < e; i++) {
    const sh = shapes[i];
    if (!sh) {
      flags.push('missing');
      continue;
    }
    const a = sh.mask ? rleArea(sh.mask) : sh.w * sh.h;
    const jumped = before > 0 && a > 0 && Math.max(a, before) / Math.min(a, before) > JUMP;
    flags.push(sh.lost ? 'lost' : jumped ? 'jump' : 'ok');
    before = a;
  }
  return flags;
}

// the next doubtful frame after `from` (dir 1) or before it (dir -1); -1 if there's none
export function nextFlagged(flags: readonly Flag[], from: number, dir: 1 | -1) {
  for (let k = from + dir; k >= 0 && k < flags.length; k += dir) if (flags[k] !== 'ok') return k;
  return -1;
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
