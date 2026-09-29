// Pieces added to or taken out of a cutout's outline, on top of what tracking found. A piece is
// picked on one frame, and then carried through all the frames it's cut from:
//   - tapped: the piece under the tap (a bag, an arm, a patch of wall), followed by tracking of its
//     own, like the object itself
//   - drawn: a loop drawn round it, moved along with the object (by how far the outline's middle
//     has moved since that frame)
// Each frame's outline is what tracking found, with the pieces added and taken out in the order
// they were picked, so a later piece wins where they overlap.
import { fillPolygon, type Pt } from '@/domain/tracking/bodyParts';
import { encodeRle, paintRle, type Rle, type Shape } from '@/domain/tracking/types';

export type PartOp = 'add' | 'remove';

export interface Part {
  id: number;
  op: PartOp;
  i: number; // the frame it was picked on
  at: Pt | null; // tapped here (work pixels): followed by tracking, into shapes
  loop: readonly Pt[] | null; // or drawn round (work pixels, on frame i)
  shapes: (Shape | null)[]; // a tapped piece's outline in each frame, as tracked
}

// the outline at frame i: found(k) (what tracking found in frame k) with the parts
export function withParts(
  found: (k: number) => Shape | null,
  parts: readonly Part[],
  i: number,
): Shape | null {
  const base = found(i);
  if (!parts.length) return base;

  // what each part covers on this frame
  const pieces = parts.flatMap(p => {
    const piece = partAt(p, found, i);
    return piece ? [{ op: p.op, ...piece }] : [];
  });
  if (!pieces.length) return base;

  // a box holding it all (only what's added can grow it)
  let x0 = Infinity,
    y0 = Infinity,
    x1 = -Infinity,
    y1 = -Infinity;
  const take = (b: Box) => {
    x0 = Math.min(x0, b.x0);
    y0 = Math.min(y0, b.y0);
    x1 = Math.max(x1, b.x1);
    y1 = Math.max(y1, b.y1);
  };
  if (base) take(boxOfShape(base));
  for (const p of pieces) if (p.op === 'add') take(p.box);
  if (x1 < x0) return base;
  x0 = Math.max(0, Math.floor(x0));
  y0 = Math.max(0, Math.floor(y0));
  x1 = Math.ceil(x1);
  y1 = Math.ceil(y1);
  const bw = x1 - x0 + 1,
    bh = y1 - y0 + 1;

  // painted in a buffer the size of the box
  const mask = new Uint8Array(bw * bh);
  if (base) paintShape(base, mask, bw, bh, x0, y0);
  const piece = new Uint8Array(bw * bh);
  for (const p of pieces) {
    piece.fill(0);
    if (p.rle) paintRle(p.rle, piece, bw, bh, -x0, -y0);
    else
      fillPolygon(
        p.loop!.map(q => ({ x: q.x - x0, y: q.y - y0 })),
        bw,
        bh,
        piece,
      );
    const v = p.op === 'add' ? 1 : 0;
    for (let k = 0; k < piece.length; k++) if (piece[k]) mask[k] = v;
  }

  // its bounds, back in the frame's pixels
  let ox0 = bw,
    oy0 = bh,
    ox1 = -1,
    oy1 = -1;
  for (let y = 0; y < bh; y++)
    for (let x = 0; x < bw; x++) {
      if (!mask[y * bw + x]) continue;
      if (x < ox0) ox0 = x;
      if (x > ox1) ox1 = x;
      if (y < oy0) oy0 = y;
      if (y > oy1) oy1 = y;
    }
  if (ox1 < 0) return null;
  const rle = encodeRle(mask, bw, ox0, oy0, ox1, oy1);
  return {
    id: base?.id ?? 1,
    cx: x0 + (ox0 + ox1) / 2,
    cy: y0 + (oy0 + oy1) / 2,
    w: ox1 - ox0 + 1,
    h: oy1 - oy0 + 1,
    mask: { ...rle, x0: rle.x0 + x0, y0: rle.y0 + y0 },
    lost: base?.lost,
  };
}

// where a drawn part is at frame i: its loop, moved as far as the object's outline has moved since
// the frame it was drawn on (not moved where either outline is missing)
export function loopAt(loop: readonly Pt[], from: Shape | null, here: Shape | null): Pt[] {
  const dx = from && here ? here.cx - from.cx : 0,
    dy = from && here ? here.cy - from.cy : 0;
  return loop.map(p => ({ x: p.x + dx, y: p.y + dy }));
}

type Box = { x0: number; y0: number; x1: number; y1: number };

// what part p covers at frame i: its tracked outline, or its loop there
function partAt(p: Part, found: (k: number) => Shape | null, i: number) {
  if (p.loop) {
    const loop = loopAt(p.loop, found(p.i), found(i));
    const xs = loop.map(q => q.x),
      ys = loop.map(q => q.y);
    const box = { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
    return { rle: null as Rle | null, loop, box };
  }
  const sh = p.shapes[i];
  return sh?.mask ? { rle: sh.mask, loop: null, box: boxOfShape(sh) } : null;
}

function boxOfShape(s: Shape): Box {
  if (s.mask)
    return { x0: s.mask.x0, y0: s.mask.y0, x1: s.mask.x0 + s.mask.w - 1, y1: s.mask.y0 + s.mask.h - 1 };
  return { x0: s.cx - s.w / 2, y0: s.cy - s.h / 2, x1: s.cx + s.w / 2, y1: s.cy + s.h / 2 };
}

// an outline painted into a bw x bh buffer whose corner is (x0, y0) in the frame (just its box
// when it has no silhouette)
function paintShape(s: Shape, mask: Uint8Array, bw: number, bh: number, x0: number, y0: number) {
  if (s.mask) {
    paintRle(s.mask, mask, bw, bh, -x0, -y0);
    return;
  }
  const b = boxOfShape(s);
  for (let y = Math.max(0, Math.round(b.y0 - y0)); y < Math.min(bh, Math.round(b.y1 - y0)); y++)
    for (let x = Math.max(0, Math.round(b.x0 - x0)); x < Math.min(bw, Math.round(b.x1 - x0)); x++)
      mask[y * bw + x] = 1;
}
