// Turns track data for one frame into what the effects draw from: the selected shapes'
// combined mask, sampled outline points with normals, and a smoothed target box.
import type { Target } from '@/effects/sim';
import { paintRle, type TrackFrame } from '@/tracking/types';

export type Selection = ReadonlySet<number> | null; // null = every tracked shape

const MAX_POINTS = 600, CACHE = 160;
// smoothing weights over neighbouring frames; the whole clip is analysed, so it can look ahead
const SMOOTH = [1, 2, 3, 2, 1];

interface Outline { contour: Float32Array; n: number; hasShape: boolean; lost: boolean }
type Box = { cx: number; cy: number; w: number; h: number };

export class FrameGeometry {
  readonly mask: Uint8Array;
  readonly maskCanvas: OffscreenCanvas;
  private mctx: OffscreenCanvasRenderingContext2D;
  private mImg: ImageData; private m32: Uint32Array;
  private cache = new Map<number, Outline>();

  // W x H: analysis size; q: output pixels per analysis pixel
  constructor(readonly W: number, readonly H: number, readonly q: number) {
    this.mask = new Uint8Array(W * H);
    this.maskCanvas = new OffscreenCanvas(W, H);
    this.mctx = this.maskCanvas.getContext('2d') as OffscreenCanvasRenderingContext2D;
    this.mImg = this.mctx.createImageData(W, H); this.m32 = new Uint32Array(this.mImg.data.buffer);
  }

  clear() { this.cache.clear(); }
  forget(fromIndex: number) { for (const k of this.cache.keys()) if (k >= fromIndex) this.cache.delete(k); }

  outline(frames: TrackFrame[], i: number, sel: Selection): Outline {
    const hit = this.cache.get(i);
    if (hit) return hit;
    const b = this.paintMask(frames[i], sel), out: Outline = { contour: new Float32Array(MAX_POINTS * 4), n: 0, hasShape: false, lost: false };
    out.lost = frames[i].shapes.some(s => s.lost && pick(sel, s.id));
    if (b) { out.n = this.buildContour(b, out.contour); out.hasShape = out.n > 8; }
    if (this.cache.size >= CACHE) this.cache.delete(this.cache.keys().next().value!);
    this.cache.set(i, out);
    return out;
  }

  // puts frame i's selected silhouettes on maskCanvas for glow and tint drawing
  prepareCanvas(frame: TrackFrame, sel: Selection) {
    const b = this.paintMask(frame, sel), { W, mask, m32 } = this;
    m32.fill(0);
    if (b) for (let y = b.by0; y <= b.by1; y++) for (let x = b.bx0; x <= b.bx1; x++) if (mask[y * W + x]) m32[y * W + x] = 0xffffffff;
    this.mctx.putImageData(this.mImg, 0, 0);
  }

  // target in output pixels, smoothed over neighbouring frames; velocity in pixels/second
  target(frames: TrackFrame[], i: number, sel: Selection, dt: number): Target {
    const here = box(frames[i], sel);
    if (!here) return { x: 0, y: 0, rx: 0, ry: 0, vx: 0, vy: 0, active: false };
    const cur = smoothed(frames, i, sel)!, prev = i > 0 ? smoothed(frames, i - 1, sel) : null, q = this.q;
    return {
      x: cur.cx * q, y: cur.cy * q, rx: cur.w * q / 2, ry: cur.h * q / 2,
      vx: prev ? (cur.cx - prev.cx) * q / dt : 0, vy: prev ? (cur.cy - prev.cy) * q / dt : 0, active: true,
    };
  }

  private paintMask(frame: TrackFrame, sel: Selection) {
    const { W, H, mask } = this;
    mask.fill(0);
    let bx0 = W, by0 = H, bx1 = -1, by1 = -1;
    for (const s of frame.shapes) {
      if (!s.mask || !pick(sel, s.id)) continue;
      const b = paintRle(s.mask, mask, W, H);
      bx0 = Math.min(bx0, b.bx0); by0 = Math.min(by0, b.by0); bx1 = Math.max(bx1, b.bx1); by1 = Math.max(by1, b.by1);
    }
    return bx1 < 0 ? null : { bx0, by0, bx1, by1 };
  }

  // samples boundary pixels of the mask and estimates each one's outward normal
  private buildContour(b: { bx0: number; by0: number; bx1: number; by1: number }, out: Float32Array) {
    const { W, H, mask, q } = this, idx: number[] = [];
    for (let y = b.by0; y <= b.by1; y++) for (let x = b.bx0; x <= b.bx1; x++) {
      const i = y * W + x;
      if (!mask[i]) continue;
      if (x === 0 || y === 0 || x === W - 1 || y === H - 1 || !mask[i - 1] || !mask[i + 1] || !mask[i - W] || !mask[i + W]) idx.push(i);
    }
    const stride = Math.max(1, idx.length / MAX_POINTS);
    let n = 0;
    for (let f = 0; f < idx.length && n < MAX_POINTS; f += stride) {
      const i = idx[f | 0], x = i % W, y = (i / W) | 0;
      let nx = 0, ny = 0;
      for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H || mask[yy * W + xx]) { nx -= dx; ny -= dy; }
      }
      const l = Math.hypot(nx, ny) || 1;
      out[n * 4] = x * q; out[n * 4 + 1] = y * q; out[n * 4 + 2] = nx / l; out[n * 4 + 3] = ny / l; n++;
    }
    return n;
  }
}

const pick = (sel: Selection, id: number) => !sel || sel.has(id);

// union of the selected shapes' tracking boxes
function box(frame: TrackFrame, sel: Selection): Box | null {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const s of frame.shapes) {
    if (!pick(sel, s.id)) continue;
    x0 = Math.min(x0, s.cx - s.w / 2); x1 = Math.max(x1, s.cx + s.w / 2); y0 = Math.min(y0, s.cy - s.h / 2); y1 = Math.max(y1, s.cy + s.h / 2);
  }
  return x1 < x0 ? null : { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, w: x1 - x0, h: y1 - y0 };
}
function smoothed(frames: TrackFrame[], i: number, sel: Selection): Box | null {
  let cx = 0, cy = 0, w = 0, h = 0, total = 0;
  for (let k = 0; k < SMOOTH.length; k++) {
    const j = i + k - (SMOOTH.length >> 1);
    if (j < 0 || j >= frames.length) continue;
    const b = box(frames[j], sel);
    if (!b) continue;
    const wt = SMOOTH[k]; cx += b.cx * wt; cy += b.cy * wt; w += b.w * wt; h += b.h * wt; total += wt;
  }
  return total ? { cx: cx / total, cy: cy / total, w: w / total, h: h / total } : null;
}
