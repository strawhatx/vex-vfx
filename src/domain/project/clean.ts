// Cleaning up an outline as tracking finds it: specks (small pieces apart from the object, where
// the segmenter caught a bit of something else) are dropped, and small holes in it (where it missed
// a bit of the object) are filled in. Bigger pieces and holes are left: an arm apart from the body,
// or the gap between an arm and the body, are real.
import { encodeRle, paintRle, type Shape } from '@/domain/tracking/types';

// a piece is a speck below both of these: a share of the biggest piece, and a size (px)
const SPECK_SHARE = 0.03,
  SPECK_PX = 40;
// a hole is small below both of these: a share of the outline, and a size (px)
const HOLE_SHARE = 0.02,
  HOLE_PX = 60;

// the outline cleaned up; the same outline if there was nothing to clean
export function cleanShape(s: Shape): Shape {
  const m = s.mask;
  if (!m || !m.w || !m.h) return s;
  // a buffer a pixel bigger all round, so the outside is connected round it
  const bw = m.w + 2,
    bh = m.h + 2,
    mask = new Uint8Array(bw * bh);
  paintRle(m, mask, bw, bh, 1 - m.x0, 1 - m.y0);

  // the pieces of the outline, and the pieces of what's outside it
  const label = new Int32Array(bw * bh),
    sizes: number[] = [0],
    queue = new Int32Array(bw * bh);
  for (let s0 = 0; s0 < mask.length; s0++) {
    if (label[s0]) continue;
    const v = mask[s0],
      id = sizes.length;
    let qh = 0,
      qt = 0;
    label[s0] = id;
    queue[qt++] = s0;
    while (qh < qt) {
      const i = queue[qh++],
        x = i % bw,
        y = (i / bw) | 0;
      const visit = (j: number) => {
        if (label[j] || mask[j] !== v) return;
        label[j] = id;
        queue[qt++] = j;
      };
      if (x > 0) visit(i - 1);
      if (x < bw - 1) visit(i + 1);
      if (y > 0) visit(i - bw);
      if (y < bh - 1) visit(i + bw);
    }
    sizes.push(v ? qt : -qt); // (outside pieces counted negative)
  }
  const area = sizes.reduce((a, n) => a + Math.max(0, n), 0),
    biggest = Math.max(0, ...sizes);
  const outside = label[0]; // (the corner is always outside)
  const drop = (id: number) => sizes[id] > 0 && sizes[id] < SPECK_SHARE * biggest && sizes[id] < SPECK_PX;
  const fill = (id: number) =>
    sizes[id] < 0 && id !== outside && -sizes[id] < HOLE_SHARE * area && -sizes[id] < HOLE_PX;
  let changed = false;
  for (let i = 0; i < mask.length; i++) {
    const id = label[i];
    if (mask[i] && drop(id)) {
      mask[i] = 0;
      changed = true;
    } else if (!mask[i] && fill(id)) {
      mask[i] = 1;
      changed = true;
    }
  }
  if (!changed) return s;

  let x0 = bw,
    y0 = bh,
    x1 = -1,
    y1 = -1;
  for (let y = 0; y < bh; y++)
    for (let x = 0; x < bw; x++)
      if (mask[y * bw + x]) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  if (x1 < 0) return s;
  const rle = encodeRle(mask, bw, x0, y0, x1, y1),
    ox = m.x0 - 1,
    oy = m.y0 - 1;
  return {
    ...s,
    cx: ox + (x0 + x1) / 2,
    cy: oy + (y0 + y1) / 2,
    w: x1 - x0 + 1,
    h: y1 - y0 + 1,
    mask: { ...rle, x0: rle.x0 + ox, y0: rle.y0 + oy },
  };
}
