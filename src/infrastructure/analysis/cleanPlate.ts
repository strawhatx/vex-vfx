// Rebuilding the background behind an object that's been cut out (a clean plate), one frame at a
// time, on analysis-size frames. Cheapest and most reliable first:
//   1. the frames around: where the object has moved off (or the camera has moved past), what was
//      behind it shows. Each hole pixel is looked up in the nearest frames first, lined up with the
//      camera's path, taking the first where that spot wasn't covered by the object.
//   2. whatever never shows is filled in smoothly from the edges of what's left (push-pull: the
//      known pixels averaged down a pyramid, and the gaps filled back up from the coarser levels).
// The result is a patch covering the hole, feathered at its edge into the frame around it.
import { applyCam, unapplyCam, type Cam } from '@/domain/effects/laser';
import { paintRle, type Rle } from '@/domain/tracking/types';

// how far the hole reaches past the object's outline (its edge, and any soft halo), and how wide
// the patch's feathered edge is: analysis pixels
export const HOLE_GROW = 3;
export const FEATHER = 3;

export interface PlateFrame {
  rgba: Uint8ClampedArray; // W x H
  hole: Uint8Array | null; // W x H, 1 = the object (grown); null: not known where it is
  cam: Cam;
}

export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
} // inclusive

// the object's outline, grown by HOLE_GROW, as a W x H mask; and its bounds
export function holeOf(rle: Rle, W: number, H: number): { hole: Uint8Array; box: Box } | null {
  const m = new Uint8Array(W * H);
  const b = paintRle(rle, m, W, H);
  if (b.bx1 < 0) return null;
  const hole = grow(m, W, H, HOLE_GROW);
  return {
    hole,
    box: {
      x0: Math.max(0, b.bx0 - HOLE_GROW),
      y0: Math.max(0, b.by0 - HOLE_GROW),
      x1: Math.min(W - 1, b.bx1 + HOLE_GROW),
      y1: Math.min(H - 1, b.by1 + HOLE_GROW),
    },
  };
}

// the mask grown by r pixels (a square, as two passes)
export function grow(m: Uint8Array, W: number, H: number, r: number) {
  const a = new Uint8Array(W * H),
    out = new Uint8Array(W * H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (!m[y * W + x]) continue;
      for (let k = Math.max(0, x - r); k <= Math.min(W - 1, x + r); k++) a[y * W + k] = 1;
    }
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (!a[y * W + x]) continue;
      for (let k = Math.max(0, y - r); k <= Math.min(H - 1, y + r); k++) out[k * W + x] = 1;
    }
  return out;
}

// the background behind frame `f`'s hole, as an RGBA patch over `box` grown by FEATHER, whose
// alpha is solid over the hole and fades out past it. others: the frames to borrow from, nearest
// first.
export function cleanPlate(f: PlateFrame, box: Box, others: readonly PlateFrame[], W: number, H: number) {
  const hole = f.hole!;
  const x0 = Math.max(0, box.x0 - FEATHER),
    y0 = Math.max(0, box.y0 - FEATHER),
    x1 = Math.min(W - 1, box.x1 + FEATHER),
    y1 = Math.min(H - 1, box.y1 + FEATHER);
  const w = x1 - x0 + 1,
    h = y1 - y0 + 1;
  const out = new Uint8ClampedArray(w * h * 4);
  const known = new Uint8Array(w * h);

  // the frame as it is, and each hole pixel from the nearest frame where that spot shows
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const p = x + y * w,
        gx = x0 + x,
        gy = y0 + y,
        g = gy * W + gx;
      if (!hole[g]) {
        copy(f.rgba, g, out, p);
        known[p] = 1;
        continue;
      }
      const scene = unapplyCam(f.cam, { x: gx, y: gy });
      for (const o of others) {
        if (!o.hole) continue;
        const q = applyCam(o.cam, scene),
          qx = Math.round(q.x),
          qy = Math.round(q.y);
        if (qx < 0 || qy < 0 || qx >= W || qy >= H) continue;
        const k = qy * W + qx;
        if (o.hole[k]) continue;
        copy(o.rgba, k, out, p);
        known[p] = 1;
        break;
      }
    }

  pushPull(out, known, w, h);

  // solid over the hole, fading out over FEATHER pixels past it
  const alpha = featherAlpha(hole, W, x0, y0, w, h);
  for (let p = 0; p < w * h; p++) out[p * 4 + 3] = alpha[p];
  return { rgba: out, x: x0, y: y0, w, h };
}

function copy(src: Uint8ClampedArray, g: number, dst: Uint8ClampedArray, p: number) {
  dst[p * 4] = src[g * 4];
  dst[p * 4 + 1] = src[g * 4 + 1];
  dst[p * 4 + 2] = src[g * 4 + 2];
  dst[p * 4 + 3] = 255;
}

// fills the pixels not known from the known ones around them, smoothly (push-pull)
export function pushPull(rgba: Uint8ClampedArray, known: Uint8Array, w: number, h: number) {
  if (known.every(Boolean)) return;
  if (!known.some(Boolean)) return; // nothing to go on
  // level 0: premultiplied color and weight
  type Level = { w: number; h: number; c: Float32Array; a: Float32Array };
  const base: Level = { w, h, c: new Float32Array(w * h * 3), a: new Float32Array(w * h) };
  for (let p = 0; p < w * h; p++) {
    if (!known[p]) continue;
    base.a[p] = 1;
    for (let k = 0; k < 3; k++) base.c[p * 3 + k] = rgba[p * 4 + k];
  }
  // push: average down, each coarser pixel from the 2x2 below it
  const levels = [base];
  while (levels[levels.length - 1].w > 1 || levels[levels.length - 1].h > 1) {
    const f = levels[levels.length - 1];
    const cw = Math.max(1, Math.ceil(f.w / 2)),
      ch = Math.max(1, Math.ceil(f.h / 2));
    const c: Level = { w: cw, h: ch, c: new Float32Array(cw * ch * 3), a: new Float32Array(cw * ch) };
    for (let y = 0; y < f.h; y++)
      for (let x = 0; x < f.w; x++) {
        const p = y * f.w + x,
          q = (y >> 1) * cw + (x >> 1);
        c.a[q] += f.a[p];
        for (let k = 0; k < 3; k++) c.c[q * 3 + k] += f.c[p * 3 + k];
      }
    // keep weights at most 1, so a partly known coarse pixel still counts for what it has
    for (let q = 0; q < cw * ch; q++) {
      const a = c.a[q];
      if (a > 1) {
        c.a[q] = 1;
        for (let k = 0; k < 3; k++) c.c[q * 3 + k] /= a;
      }
    }
    levels.push(c);
  }
  // pull: from the coarsest up, fill each level's missing weight from the level above
  for (let n = levels.length - 2; n >= 0; n--) {
    const f = levels[n],
      c = levels[n + 1];
    for (let y = 0; y < f.h; y++)
      for (let x = 0; x < f.w; x++) {
        const p = y * f.w + x;
        const miss = 1 - f.a[p];
        if (miss <= 0) continue;
        const [cc, ca] = sample(c, (x + 0.5) / 2 - 0.5, (y + 0.5) / 2 - 0.5);
        if (ca <= 0) continue;
        for (let k = 0; k < 3; k++) f.c[p * 3 + k] += (miss * cc[k]) / ca;
        f.a[p] = 1;
      }
  }
  for (let p = 0; p < w * h; p++) {
    if (known[p] || base.a[p] <= 0) continue;
    for (let k = 0; k < 3; k++) rgba[p * 4 + k] = base.c[p * 3 + k] / base.a[p];
    rgba[p * 4 + 3] = 255;
  }
}

// bilinear sample of a level's premultiplied color and weight
function sample(l: { w: number; h: number; c: Float32Array; a: Float32Array }, x: number, y: number) {
  const cx = Math.max(0, Math.min(l.w - 1, x)),
    cy = Math.max(0, Math.min(l.h - 1, y));
  const xa = Math.floor(cx),
    ya = Math.floor(cy),
    xb = Math.min(l.w - 1, xa + 1),
    yb = Math.min(l.h - 1, ya + 1),
    u = cx - xa,
    v = cy - ya;
  const c = [0, 0, 0];
  let a = 0;
  for (const [px, py, wt] of [
    [xa, ya, (1 - u) * (1 - v)],
    [xb, ya, u * (1 - v)],
    [xa, yb, (1 - u) * v],
    [xb, yb, u * v],
  ]) {
    const p = py * l.w + px;
    a += l.a[p] * wt;
    for (let k = 0; k < 3; k++) c[k] += l.c[p * 3 + k] * wt;
  }
  return [c, a] as const;
}

// 255 over the hole, falling off linearly to 0 FEATHER pixels past it (distance to the hole along
// the nearest pixels, within FEATHER)
function featherAlpha(hole: Uint8Array, W: number, x0: number, y0: number, w: number, h: number) {
  const out = new Uint8Array(w * h);
  const H = hole.length / W;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const gx = x0 + x,
        gy = y0 + y;
      if (hole[gy * W + gx]) {
        out[y * w + x] = 255;
        continue;
      }
      let d = Infinity;
      for (let dy = -FEATHER; dy <= FEATHER; dy++)
        for (let dx = -FEATHER; dx <= FEATHER; dx++) {
          const xx = gx + dx,
            yy = gy + dy;
          if (xx < 0 || yy < 0 || xx >= W || yy >= H || !hole[yy * W + xx]) continue;
          d = Math.min(d, Math.hypot(dx, dy));
        }
      out[y * w + x] = d > FEATHER ? 0 : Math.round(255 * (1 - d / (FEATHER + 1)));
    }
  return out;
}
