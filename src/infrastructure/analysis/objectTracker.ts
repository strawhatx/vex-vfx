// Click-an-object tracking, run once per frame by the analysis worker. An AI segmenter
// outlines the object at a point; pyramidal Lucas-Kanade + Median Flow follows its motion
// so each new frame is segmented at the right place. Works on analysis-resolution frames.
import { encodeRle, type Rle, type Selection, type Shape } from '@/domain/tracking/types';

type Img = { w: number; h: number; d: Float32Array };
type Pyr = Img[];
// outlines the object at (x, y) in the current frame; 1 = object
export type SegmentAt = (x: number, y: number) => Uint8Array;

const LEVELS = 4, WIN = 5, WS = 2 * WIN + 1, NW = WS * WS;
// a new outline is only accepted if it overlaps the previous one (moved with the motion)
// this much and hasn't changed size too abruptly
const MIN_OVERLAP = 0.3, MAX_GROWTH = 2.5;

function samp(img: Img, x: number, y: number) {
  const w = img.w, h = img.h;
  if (x < 0) x = 0; else if (x > w - 1.001) x = w - 1.001;
  if (y < 0) y = 0; else if (y > h - 1.001) y = h - 1.001;
  const x0 = x | 0, y0 = y | 0, fx = x - x0, fy = y - y0, i = y0 * w + x0, d = img.d;
  return (d[i] * (1 - fx) + d[i + 1] * fx) * (1 - fy) + (d[i + w] * (1 - fx) + d[i + w + 1] * fx) * fy;
}
const median = (arr: ArrayLike<number>) => {
  const a = Array.from(arr).sort((x, y) => x - y), m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};
const dot = (a: Float32Array, b: Float32Array) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };

type Bounds = { bx0: number; by0: number; bx1: number; by1: number };

export class ObjectTracker {
  private prevPyr: Pyr; private nextPyr: Pyr;
  private mask: Uint8Array; private prevMask: Uint8Array; private queue: Int32Array;
  private tI = new Float32Array(NW); private tX = new Float32Array(NW); private tY = new Float32Array(NW);
  private box = { cx: 0, cy: 0, w: 0, h: 0 };
  private trk = { vx: 0, vy: 0, lostFrames: 0, frames: 0, anchorVec: null as Float32Array | null };
  // seg: the current outline; seeds: where to segment next frame, relative to the box
  private seg = { on: false, area: 0, dx: 0, dy: 0, bx0: 0, by0: 0, bx1: 0, by1: 0, miss: 0 };
  private seeds: { u: number; v: number }[] = [];
  private rle: Rle | null = null;
  private pin: { x: number; y: number; s: number; vx: number; vy: number } | null = null;
  private lost = false;

  constructor(private W: number, private H: number, private segmentAt: SegmentAt) {
    this.prevPyr = this.makePyr(); this.nextPyr = this.makePyr();
    const n = W * H;
    this.mask = new Uint8Array(n); this.prevMask = new Uint8Array(n); this.queue = new Int32Array(n);
  }

  // first frame: outline the clicked object (falls back to a box if nothing is found). pin: also
  // follow the clicked spot itself (see pinStep)
  start(rgba: Uint8ClampedArray, sel: Selection, pin = false): Shape {
    this.load(rgba, this.prevPyr);
    this.pin = pin ? { x: sel.x, y: sel.y, s: 1, vx: 0, vy: 0 } : null;
    const b = this.outlineAt(sel.x, sel.y);
    if (b && this.area(b) >= 30) {
      this.commit(b);
      const bw = (b.bx1 - b.bx0 + 1) * 1.04, bh = (b.by1 - b.by0 + 1) * 1.04;
      this.lock((b.bx0 + b.bx1) / 2, (b.by0 + b.by1) / 2, bw, bh);
      this.seeds = [this.interiorSeed(b), { u: (sel.x - this.box.cx) / bw, v: (sel.y - this.box.cy) / bh }];
    } else {
      this.seg.on = false;
      this.lock(sel.x, sel.y, this.W * 0.16, this.W * 0.16);
    }
    return this.shape();
  }

  step(rgba: Uint8ClampedArray): Shape {
    this.load(rgba, this.nextPyr);
    const pcx = this.box.cx, pcy = this.box.cy;
    this.trackStep();
    this.pinStep();
    this.segmentStep(pcx, pcy);
    const t = this.prevPyr; this.prevPyr = this.nextPyr; this.nextPyr = t;
    return this.shape();
  }

  // the outline, or the last one moved along with the box while segmenting misses
  private shape(): Shape {
    const b = this.box, s = this.seg;
    let mask: Rle | undefined;
    if (this.rle && s.on && s.miss < 12) {
      const dx = Math.round(s.dx), dy = Math.round(s.dy);
      mask = dx || dy ? { ...this.rle, x0: this.rle.x0 + dx, y0: this.rle.y0 + dy } : this.rle;
    }
    const pin = this.pin && { x: this.pin.x, y: this.pin.y, s: this.pin.s };
    return { id: 1, cx: b.cx, cy: b.cy, w: b.w, h: b.h, mask, lost: this.lost || undefined, ...(pin && { pin }) };
  }

  // ---------- the pinned point ----------
  // Keeps the pinned spot where it is in the scene while the camera moves: follows a grid of points
  // spread over the whole frame with Lucas-Kanade (each checked by tracking it back again), and fits
  // the camera's shift and zoom to them (the typical move of all the points, so an object passing
  // in front of the spot can't drag it along). The pin moves by that, and grows as the camera
  // closes in or shrinks as it pulls away.
  private pinStep() {
    const p = this.pin;
    if (!p) return;
    const { W, H } = this, P = this.prevPyr, N = this.nextPyr, G = 10;
    const olds: { x: number; y: number }[] = [], news: [number, number][] = [];
    for (let gy = 0; gy < G; gy++) for (let gx = 0; gx < G; gx++) {
      const x = WIN + 3 + (gx + 0.5) / G * (W - 2 * WIN - 6), y = WIN + 3 + (gy + 0.5) / G * (H - 2 * WIN - 6);
      const f = this.lk(P, N, x, y, p.vx, p.vy);
      const b = f && this.lk(N, P, f[0], f[1], -p.vx, -p.vy);
      if (!f || !b || Math.hypot(b[0] - x, b[1] - y) > 1) continue;
      olds.push({ x, y }); news.push(f);
    }
    if (olds.length < 8) return; // not enough to go on: leave it where it is
    // fit x' = s·x + t (shift and zoom): start from the typical shift, then keep refitting to the
    // points that agree with the fit, so something moving through the shot is left out
    let sc = 1, tx = median(news.map((f, k) => f[0] - olds[k].x)), ty = median(news.map((f, k) => f[1] - olds[k].y));
    let use = olds.map((_, k) => k);
    for (let round = 0; round < 4; round++) {
      const res = olds.map((o, k) => Math.hypot(news[k][0] - (sc * o.x + tx), news[k][1] - (sc * o.y + ty)));
      const cut = Math.max(0.75, 2 * median(use.map(k => res[k])));
      const keep = olds.map((_, k) => k).filter(k => res[k] <= cut);
      if (keep.length < 6) break;
      use = keep;
      let mx = 0, my = 0, mx2 = 0, my2 = 0;
      for (const k of use) { mx += olds[k].x; my += olds[k].y; mx2 += news[k][0]; my2 += news[k][1]; }
      mx /= use.length; my /= use.length; mx2 /= use.length; my2 /= use.length;
      let num = 0, den = 0;
      for (const k of use) {
        const ax = olds[k].x - mx, ay = olds[k].y - my;
        num += ax * (news[k][0] - mx2) + ay * (news[k][1] - my2); den += ax * ax + ay * ay;
      }
      sc = den > 0 ? Math.max(0.95, Math.min(1.05, num / den)) : 1;
      tx = mx2 - sc * mx; ty = my2 - sc * my;
    }
    const nx = sc * p.x + tx, ny = sc * p.y + ty;
    p.vx = 0.6 * (nx - p.x) + 0.4 * p.vx; p.vy = 0.6 * (ny - p.y) + 0.4 * p.vy;
    p.x = nx; p.y = ny; p.s = Math.max(0.2, Math.min(5, p.s * sc));
  }

  private lock(cx: number, cy: number, w: number, h: number) {
    Object.assign(this.box, { cx, cy, w, h }); this.clampBox();
    Object.assign(this.trk, { vx: 0, vy: 0, lostFrames: 0, frames: 0 });
    this.trk.anchorVec = this.boxVec(this.prevPyr[0], this.box.cx, this.box.cy, this.box.w, this.box.h);
    this.lost = false;
  }

  // ---------- frames ----------
  private makePyr(): Pyr {
    const p: Pyr = []; let w = this.W, h = this.H;
    for (let l = 0; l < LEVELS; l++) { p.push({ w, h, d: new Float32Array(w * h) }); w = Math.max(8, w >> 1); h = Math.max(8, h >> 1); }
    return p;
  }
  private load(d: Uint8ClampedArray, pyr: Pyr) {
    const { W, H } = this, g = pyr[0].d;
    for (let i = 0, j = 0; i < W * H; i++, j += 4) g[i] = 0.299 * d[j] + 0.587 * d[j + 1] + 0.114 * d[j + 2];
    for (let l = 1; l < LEVELS; l++) {
      const s = pyr[l - 1], t = pyr[l];
      for (let y = 0; y < t.h; y++) for (let x = 0; x < t.w; x++) {
        const sx = Math.min(s.w - 2, x * 2), sy = Math.min(s.h - 2, y * 2), i = sy * s.w + sx;
        t.d[y * t.w + x] = (s.d[i] + s.d[i + 1] + s.d[i + s.w] + s.d[i + s.w + 1]) * 0.25;
      }
    }
  }

  // ---------- pyramidal Lucas-Kanade ----------
  private lk(P: Pyr, N: Pyr, x: number, y: number, gx0: number, gy0: number): [number, number] | null {
    const { tI, tX, tY } = this, top = 1 << (LEVELS - 1);
    let gx = gx0 / top, gy = gy0 / top;
    for (let L = LEVELS - 1; L >= 0; L--) {
      const s = 1 << L, I = P[L], J = N[L], px = x / s, py = y / s;
      let sxx = 0, sxy = 0, syy = 0, n = 0;
      for (let dy = -WIN; dy <= WIN; dy++) for (let dx = -WIN; dx <= WIN; dx++) {
        const ix = (samp(I, px + dx + 1, py + dy) - samp(I, px + dx - 1, py + dy)) * 0.5;
        const iy = (samp(I, px + dx, py + dy + 1) - samp(I, px + dx, py + dy - 1)) * 0.5;
        tI[n] = samp(I, px + dx, py + dy); tX[n] = ix; tY[n] = iy;
        sxx += ix * ix; sxy += ix * iy; syy += iy * iy; n++;
      }
      const det = sxx * syy - sxy * sxy;
      const minEig = (sxx + syy - Math.sqrt((sxx - syy) * (sxx - syy) + 4 * sxy * sxy)) / 2 / NW;
      if (minEig < 0.15 || det <= 0) {
        if (L === 0) return null;
        gx *= 2; gy *= 2; continue;
      }
      let vx = 0, vy = 0;
      for (let it = 0; it < 12; it++) {
        let bx = 0, by = 0, m = 0;
        for (let dy = -WIN; dy <= WIN; dy++) for (let dx = -WIN; dx <= WIN; dx++) {
          const diff = tI[m] - samp(J, px + dx + gx + vx, py + dy + gy + vy);
          bx += diff * tX[m]; by += diff * tY[m]; m++;
        }
        const ex = (syy * bx - sxy * by) / det, ey = (sxx * by - sxy * bx) / det;
        vx += ex; vy += ey;
        if (ex * ex + ey * ey < 0.0009) break;
      }
      if (L > 0) { gx = 2 * (gx + vx); gy = 2 * (gy + vy); } else { gx += vx; gy += vy; }
    }
    return [x + gx, y + gy];
  }
  private nccPatch(A: Img, ax: number, ay: number, B: Img, bx: number, by: number) {
    let sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0, n = 0;
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
      const a = samp(A, ax + dx, ay + dy), b = samp(B, bx + dx, by + dy);
      sa += a; sb += b; saa += a * a; sbb += b * b; sab += a * b; n++;
    }
    const cov = sab - sa * sb / n, va = saa - sa * sa / n, vb = sbb - sb * sb / n;
    return va > 1e-6 && vb > 1e-6 ? cov / Math.sqrt(va * vb) : 0;
  }

  // ---------- Median Flow ----------
  private pickPoints() {
    const { W, H, box } = this, I = this.prevPyr[0], G = 15, cand: { x: number; y: number; e: number }[] = [];
    for (let gy = 0; gy < G; gy++) for (let gx = 0; gx < G; gx++) {
      const x = box.cx - box.w * 0.42 + (gx + 0.5) / G * box.w * 0.84;
      const y = box.cy - box.h * 0.42 + (gy + 0.5) / G * box.h * 0.84;
      if (x < WIN + 2 || y < WIN + 2 || x > W - WIN - 3 || y > H - WIN - 3) continue;
      let sxx = 0, sxy = 0, syy = 0;
      const xi = Math.round(x), yi = Math.round(y);
      for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
        const i = (yi + dy) * W + xi + dx;
        const ix = (I.d[i + 1] - I.d[i - 1]) * 0.5, iy = (I.d[i + W] - I.d[i - W]) * 0.5;
        sxx += ix * ix; sxy += ix * iy; syy += iy * iy;
      }
      const e = (sxx + syy - Math.sqrt((sxx - syy) * (sxx - syy) + 4 * sxy * sxy)) / 2 / 49;
      if (e > 0.3) cand.push({ x, y, e });
    }
    cand.sort((a, b) => b.e - a.e);
    return cand.slice(0, 90);
  }
  private boxVec(img: Img, cx: number, cy: number, w: number, h: number, n = 20) {
    const v = new Float32Array(n * n); let s = 0, ss = 0;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const val = samp(img, cx - w / 2 + (i + 0.5) / n * w, cy - h / 2 + (j + 0.5) / n * h);
      v[j * n + i] = val; s += val;
    }
    const m = s / (n * n);
    for (let i = 0; i < v.length; i++) { v[i] -= m; ss += v[i] * v[i]; }
    const nrm = Math.sqrt(ss) || 1;
    for (let i = 0; i < v.length; i++) v[i] /= nrm;
    return v;
  }
  private search(img: Img, radiusMul: number) {
    const { W, H, box, trk } = this;
    if (!trk.anchorVec) return null;
    const R = Math.max(box.w, box.h) * radiusMul, step = Math.max(2, R / 14);
    let best = -1, bx = box.cx, by = box.cy;
    for (let y = box.cy - R; y <= box.cy + R; y += step) for (let x = box.cx - R; x <= box.cx + R; x += step) {
      if (x < box.w * 0.3 || y < box.h * 0.3 || x > W - box.w * 0.3 || y > H - box.h * 0.3) continue;
      const s = dot(this.boxVec(img, x, y, box.w, box.h), trk.anchorVec);
      if (s > best) { best = s; bx = x; by = y; }
    }
    return { score: best, x: bx, y: by };
  }
  private clampBox() {
    const { W, H, box } = this;
    box.w = Math.max(12, Math.min(W, box.w)); box.h = Math.max(12, Math.min(H, box.h));
    box.cx = Math.max(0, Math.min(W, box.cx)); box.cy = Math.max(0, Math.min(H, box.cy));
  }
  private medianFlow() {
    const { W, H, box, trk } = this, P = this.prevPyr, N = this.nextPyr, pts = this.pickPoints();
    const dxs: number[] = [], dys: number[] = [], fbs: number[] = [], nccs: number[] = [];
    const olds: { x: number; y: number }[] = [], news: [number, number][] = [];
    for (const p of pts) {
      const f = this.lk(P, N, p.x, p.y, trk.vx, trk.vy); if (!f) continue;
      if (f[0] < 1 || f[1] < 1 || f[0] > W - 2 || f[1] > H - 2) continue;
      const b = this.lk(N, P, f[0], f[1], -trk.vx, -trk.vy); if (!b) continue;
      fbs.push(Math.hypot(b[0] - p.x, b[1] - p.y));
      nccs.push(this.nccPatch(P[0], p.x, p.y, N[0], f[0], f[1]));
      dxs.push(f[0] - p.x); dys.push(f[1] - p.y); olds.push(p); news.push(f);
    }
    if (fbs.length < 6) return false;
    const mFB = median(fbs), mN = median(nccs);
    if (mFB > 5) return false;
    let keep: number[] = [];
    for (let i = 0; i < fbs.length; i++) if (fbs[i] <= mFB && nccs[i] >= mN) keep.push(i);
    if (keep.length < 4) { keep = []; for (let i = 0; i < fbs.length; i++) if (fbs[i] <= mFB) keep.push(i); }
    if (keep.length < 4) return false;
    const dx = median(keep.map(i => dxs[i])), dy = median(keep.map(i => dys[i]));
    const ratios: number[] = [];
    for (let a = 0; a < keep.length; a++) for (let b = a + 1; b < keep.length; b++) {
      const i = keep[a], j = keep[b];
      const d0 = Math.hypot(olds[i].x - olds[j].x, olds[i].y - olds[j].y);
      if (d0 < 6) continue;
      ratios.push(Math.hypot(news[i][0] - news[j][0], news[i][1] - news[j][1]) / d0);
      if (ratios.length > 800) break;
    }
    let sc = ratios.length > 5 ? median(ratios) : 1;
    sc = Math.max(0.93, Math.min(1.07, sc));
    box.cx += dx; box.cy += dy; box.w *= sc; box.h *= sc; this.clampBox();
    trk.vx = 0.6 * dx + 0.4 * trk.vx; trk.vy = 0.6 * dy + 0.4 * trk.vy;
    return true;
  }
  private trackStep() {
    const { box, trk } = this, img = this.nextPyr[0];
    const ok = this.medianFlow();
    trk.frames++;
    if (ok) {
      trk.lostFrames = 0;
      // drift guard: every 10 frames, compare with how the object looked when selected
      if (trk.frames % 10 === 0 && trk.anchorVec) {
        const here = dot(this.boxVec(img, box.cx, box.cy, box.w, box.h), trk.anchorVec);
        if (here < 0.35) {
          const r = this.search(img, 0.6);
          if (r && r.score > 0.65 && r.score > here + 0.25) { box.cx = r.x; box.cy = r.y; trk.vx = trk.vy = 0; }
        }
      }
    } else {
      trk.lostFrames++; trk.vx *= 0.5; trk.vy *= 0.5;
      const r = this.search(img, 1.0);
      if (r && r.score > 0.55) { box.cx = r.x; box.cy = r.y; trk.lostFrames = 0; trk.vx = trk.vy = 0; }
    }
    this.lost = trk.lostFrames > 2;
  }

  // ---------- segmentation ----------
  // segments at (x, y) and keeps the connected piece under that point, holes filled
  private outlineAt(x: number, y: number): Bounds | null {
    const { W, H, mask, queue } = this;
    const xi = Math.round(x), yi = Math.round(y);
    if (xi < 0 || yi < 0 || xi >= W || yi >= H) return null;
    const m = this.segmentAt(xi, yi);
    // start from the object pixel nearest the point
    let si = -1;
    for (let r = 0; r <= 6 && si < 0; r++) for (let dy = -r; dy <= r && si < 0; dy++) for (let dx = -r; dx <= r; dx++) {
      const xx = xi + dx, yy = yi + dy;
      if (xx >= 0 && yy >= 0 && xx < W && yy < H && m[yy * W + xx]) { si = yy * W + xx; break; }
    }
    if (si < 0) return null;
    mask.fill(0);
    let qh = 0, qt = 0, bx0 = si % W, bx1 = bx0, by0 = (si / W) | 0, by1 = by0;
    mask[si] = 1; queue[qt++] = si;
    while (qh < qt) {
      const i = queue[qh++], px = i % W, py = (i / W) | 0;
      for (let d = 0; d < 4; d++) {
        const nx = d === 0 ? px + 1 : d === 1 ? px - 1 : px, ny = d === 2 ? py + 1 : d === 3 ? py - 1 : py;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const j = ny * W + nx;
        if (mask[j] || !m[j]) continue;
        mask[j] = 1; queue[qt++] = j;
        if (nx < bx0) bx0 = nx;
        if (nx > bx1) bx1 = nx;
        if (ny < by0) by0 = ny;
        if (ny > by1) by1 = ny;
      }
    }
    const b = { bx0, by0, bx1, by1 };
    this.fillHoles(b);
    return b;
  }

  // fills holes inside the outline
  private fillHoles(b: Bounds) {
    const { W, H, mask, queue } = this;
    const x0 = Math.max(0, b.bx0 - 1), x1 = Math.min(W - 1, b.bx1 + 1), y0 = Math.max(0, b.by0 - 1), y1 = Math.min(H - 1, b.by1 + 1);
    let qh = 0, qt = 0;
    const push = (x: number, y: number) => { const j = y * W + x; if (!mask[j]) { mask[j] = 2; queue[qt++] = j; } };
    for (let x = x0; x <= x1; x++) { push(x, y0); push(x, y1); }
    for (let y = y0; y <= y1; y++) { push(x0, y); push(x1, y); }
    while (qh < qt) {
      const i = queue[qh++], x = i % W, y = (i / W) | 0;
      if (x > x0) push(x - 1, y);
      if (x < x1) push(x + 1, y);
      if (y > y0) push(x, y - 1);
      if (y < y1) push(x, y + 1);
    }
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const j = y * W + x; mask[j] = mask[j] === 2 ? 0 : 1; }
  }

  private area(b: Bounds) {
    let a = 0;
    for (let y = b.by0; y <= b.by1; y++) for (let x = b.bx0; x <= b.bx1; x++) a += this.mask[y * this.W + x];
    return a;
  }

  // share of the new outline that the previous outline, moved by (dx, dy), also covers
  private overlap(b: Bounds, dx: number, dy: number) {
    const { W, H, mask, prevMask } = this;
    let both = 0, n = 0;
    for (let y = b.by0; y <= b.by1; y++) for (let x = b.bx0; x <= b.bx1; x++) {
      if (!mask[y * W + x]) continue;
      n++;
      const px = x - dx, py = y - dy;
      if (px >= 0 && py >= 0 && px < W && py < H && prevMask[py * W + px]) both++;
    }
    return n ? both / n : 0;
  }

  private commit(b: Bounds) {
    const s = this.seg;
    this.rle = encodeRle(this.mask, this.W, b.bx0, b.by0, b.bx1, b.by1);
    this.prevMask.set(this.mask);
    Object.assign(s, b, { on: true, miss: 0, dx: 0, dy: 0, area: this.area(b) });
  }

  // the point deepest inside the outline (farthest from its edge), relative to the box;
  // segmenting there is least likely to land on the background as the object moves
  private interiorSeed(b: Bounds) {
    const { W, mask, box } = this, bw = b.bx1 - b.bx0 + 1, bh = b.by1 - b.by0 + 1, d = new Float32Array(bw * bh);
    for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
      const i = y * bw + x;
      if (!mask[(b.by0 + y) * W + b.bx0 + x]) { d[i] = 0; continue; }
      d[i] = Math.min(x ? d[i - 1] + 1 : 1, y ? d[i - bw] + 1 : 1);
    }
    let best = 0, bi = 0;
    for (let y = bh - 1; y >= 0; y--) for (let x = bw - 1; x >= 0; x--) {
      const i = y * bw + x;
      if (!d[i]) continue;
      d[i] = Math.min(d[i], x < bw - 1 ? d[i + 1] + 1 : 1, y < bh - 1 ? d[i + bw] + 1 : 1);
      if (d[i] > best) { best = d[i]; bi = i; }
    }
    const x = b.bx0 + bi % bw, y = b.by0 + ((bi / bw) | 0);
    return { u: (x - box.cx) / box.w, v: (y - box.cy) / box.h };
  }

  // re-outline the object where the motion tracker says it went
  private segmentStep(prevCx: number, prevCy: number) {
    const { box, seg } = this;
    if (!seg.on) return;
    const mdx = Math.round(box.cx - prevCx), mdy = Math.round(box.cy - prevCy);
    for (const s of this.seeds) {
      const b = this.outlineAt(box.cx + s.u * box.w, box.cy + s.v * box.h);
      if (!b) continue;
      const area = this.area(b);
      if (area < 20 || area > seg.area * MAX_GROWTH || area < seg.area / MAX_GROWTH) continue;
      if (this.overlap(b, mdx + Math.round(seg.dx), mdy + Math.round(seg.dy)) < MIN_OVERLAP) continue;
      this.commit(b);
      // let the outline steer and size the tracking box, then re-centre the seeds
      const mcx = (b.bx0 + b.bx1) / 2, mcy = (b.by0 + b.by1) / 2;
      const mw = (b.bx1 - b.bx0 + 1) * 1.04, mh = (b.by1 - b.by0 + 1) * 1.04;
      box.cx += (mcx - box.cx) * 0.35; box.cy += (mcy - box.cy) * 0.35;
      box.w += (mw - box.w) * 0.3; box.h += (mh - box.h) * 0.3; this.clampBox();
      this.seeds[0] = this.interiorSeed(b);
      return;
    }
    // nothing believable: keep the last outline, moved along with the box
    seg.miss++; seg.dx += box.cx - prevCx; seg.dy += box.cy - prevCy;
  }
}
