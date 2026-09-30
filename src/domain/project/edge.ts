// A cutout's edge settings, and what they do to its outline in each frame:
//   - steady: the outline is averaged with the frames either side of it (lined up by where the
//     object's middle is), so it doesn't flicker from frame to frame
//   - smooth: the outline is blurred and cut again at halfway, which rounds off its jagged, blocky
//     steps and drops specks and notches smaller than that
//   - grow: the edge moves out (or, below 0, in) by that many pixels
//   - feather: how soft the edge is when it's cut out (output pixels). It doesn't change the
//     outline, only how the cut fades out at it (see the cutout job).
// Sizes are in work pixels (the outline's own), but feather's.
import { encodeRle, paintRle, type Shape } from '@/domain/tracking/types';

export interface EdgeSettings {
  feather: number;
  smooth: number;
  grow: number;
  steady: number;
}

export const PLAIN_EDGE: EdgeSettings = { feather: 0, smooth: 0, grow: 0, steady: 0 };

// how far each goes
export const EDGE_LIMITS: Record<keyof EdgeSettings, { min: number; max: number; step: number }> = {
  feather: { min: 0, max: 20, step: 1 },
  smooth: { min: 0, max: 6, step: 0.5 },
  grow: { min: -6, max: 6, step: 1 },
  steady: { min: 0, max: 3, step: 1 },
};

export function clampEdge(e: EdgeSettings): EdgeSettings {
  const c = (k: keyof EdgeSettings) => Math.max(EDGE_LIMITS[k].min, Math.min(EDGE_LIMITS[k].max, e[k] || 0));
  return { feather: c('feather'), smooth: c('smooth'), grow: c('grow'), steady: c('steady') };
}

// whether the settings change the outline itself (feather only softens the cut)
export const reshapes = (e: EdgeSettings) => e.smooth > 0 || e.grow !== 0 || e.steady > 0;

// the outline at frame i with the edge settings; outlineAt(k): the outline at frame k, before them
export function withEdge(outlineAt: (k: number) => Shape | null, i: number, e: EdgeSettings): Shape | null {
  const here = outlineAt(i);
  if (!here?.mask || !reshapes(e)) return here;
  const r = Math.round(e.steady),
    blur = Math.round(e.smooth),
    grow = Math.round(e.grow);

  // steady: the frames either side, lined up with this one (moved by dx, dy), weighing less the
  // further they are
  const near: { m: NonNullable<Shape['mask']>; dx: number; dy: number; w: number }[] = [];
  for (let k = i - r; k <= i + r; k++) {
    const s = k === i ? here : outlineAt(k);
    if (s?.mask)
      near.push({
        m: s.mask,
        dx: Math.round(here.cx - s.cx),
        dy: Math.round(here.cy - s.cy),
        w: 1 - Math.abs(k - i) / (r + 1),
      });
  }

  // a buffer round them all, with room to grow and blur into
  const room = blur + Math.max(0, grow) + 2;
  const x0 = Math.max(0, Math.min(...near.map(n => n.m.x0 + n.dx)) - room),
    y0 = Math.max(0, Math.min(...near.map(n => n.m.y0 + n.dy)) - room),
    bw = Math.max(...near.map(n => n.m.x0 + n.dx + n.m.w)) + room - x0,
    bh = Math.max(...near.map(n => n.m.y0 + n.dy + n.m.h)) + room - y0;

  const field = new Float32Array(bw * bh),
    one = new Uint8Array(bw * bh);
  let total = 0;
  for (const { m, dx, dy, w } of near) {
    one.fill(0);
    paintRle(m, one, bw, bh, dx - x0, dy - y0);
    for (let p = 0; p < one.length; p++) if (one[p]) field[p] += w;
    total += w;
  }
  for (let p = 0; p < field.length; p++) field[p] /= total;

  // smooth: blurred twice (about a Gaussian), then cut at halfway
  if (blur > 0) for (let n = 0; n < 2; n++) boxBlur(field, bw, bh, blur);
  const mask = new Uint8Array(bw * bh);
  for (let p = 0; p < mask.length; p++) mask[p] = field[p] >= 0.5 ? 1 : 0;

  // grow (or shrink): a pixel at a time, alternating square and cross steps for a roundish edge
  for (let n = 0; n < Math.abs(grow); n++) step(mask, bw, bh, grow > 0, n % 2 === 0);

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
    ...here,
    cx: x0 + (ox0 + ox1) / 2,
    cy: y0 + (oy0 + oy1) / 2,
    w: ox1 - ox0 + 1,
    h: oy1 - oy0 + 1,
    mask: { ...rle, x0: rle.x0 + x0, y0: rle.y0 + y0 },
  };
}

// a box blur of radius r, along rows then columns (edges held)
function boxBlur(f: Float32Array, w: number, h: number, r: number) {
  const line = new Float32Array(Math.max(w, h)),
    n = 2 * r + 1;
  const pass = (count: number, len: number, at: (a: number, b: number) => number) => {
    for (let a = 0; a < count; a++) {
      for (let b = 0; b < len; b++) line[b] = f[at(a, b)];
      let sum = 0;
      for (let b = -r; b <= r; b++) sum += line[Math.max(0, Math.min(len - 1, b))];
      for (let b = 0; b < len; b++) {
        f[at(a, b)] = sum / n;
        sum += line[Math.min(len - 1, b + r + 1)] - line[Math.max(0, b - r)];
      }
    }
  };
  pass(h, w, (y, x) => y * w + x);
  pass(w, h, (x, y) => y * w + x);
}

// grows (or shrinks) the mask by a pixel: with its 8 neighbours (square) or 4 (cross)
function step(mask: Uint8Array, w: number, h: number, grow: boolean, square: boolean) {
  const was = mask.slice(),
    want = grow ? 1 : 0;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      if (was[p] === want) continue;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          if ((!dx && !dy) || (!square && dx && dy)) continue;
          const nx = x + dx,
            ny = y + dy;
          // (past the buffer counts as outside)
          const v = nx < 0 || ny < 0 || nx >= w || ny >= h ? 0 : was[ny * w + nx];
          if (v === want) {
            mask[p] = want;
            dy = 2;
            break;
          }
        }
    }
}
