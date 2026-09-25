// Click-to-trace object tracking, run once per frame by the analysis worker:
// pyramidal Lucas-Kanade + Median Flow for motion, colour region growing for the outline.
// Works on analysis-resolution RGBA frames.
import { encodeRle, type Rle, type Shape } from './types';

type Img = { w: number; h: number; d: Float32Array };
type Pyr = Img[];
export type Selection = { x: number; y: number } | { cx: number; cy: number; w: number; h: number };

const LEVELS = 4, WIN = 5, WS = 2 * WIN + 1, NW = WS * WS;

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

export class ObjectTracker {
  private prevPyr: Pyr; private nextPyr: Pyr;
  private cY: Float32Array; private cB: Float32Array; private cR: Float32Array;
  private mask: Uint8Array; private queue: Int32Array;
  private tI = new Float32Array(NW); private tX = new Float32Array(NW); private tY = new Float32Array(NW);
  private box = { cx: 0, cy: 0, w: 0, h: 0 };
  private trk = { vx: 0, vy: 0, lostFrames: 0, frames: 0, anchorVec: null as Float32Array | null };
  private seg = { on: false, ref: [0, 0, 0], useTol: 28, offX: 0, offY: 0, area: 0, dx: 0, dy: 0, bx0: 0, by0: 0, bx1: 0, by1: 0, miss: 0 };
  private rle: Rle | null = null;
  private lost = false;

  constructor(private W: number, private H: number) {
    this.prevPyr = this.makePyr(); this.nextPyr = this.makePyr();
    const n = W * H;
    this.cY = new Float32Array(n); this.cB = new Float32Array(n); this.cR = new Float32Array(n);
    this.mask = new Uint8Array(n); this.queue = new Int32Array(n);
  }

  // first frame: trace from a click (falls back to a box), or lock a dragged box
  start(rgba: Uint8ClampedArray, sel: Selection, tol: number): Shape {
    this.load(rgba, this.prevPyr);
    if ('x' in sel) {
      if (this.traceClick(sel.x, sel.y, tol)) {
        const s = this.seg, bx = (s.bx0 + s.bx1) / 2, by = (s.by0 + s.by1) / 2;
        const bw = (s.bx1 - s.bx0 + 1) * 1.04, bh = (s.by1 - s.by0 + 1) * 1.04;
        s.offX = (sel.x - bx) / bw; s.offY = (sel.y - by) / bh;
        this.lock(bx, by, bw, bh);
      } else {
        this.seg.on = false;
        this.lock(sel.x, sel.y, this.W * 0.16, this.W * 0.16);
      }
    } else {
      this.seg.on = false;
      this.lock(sel.cx, sel.cy, sel.w, sel.h);
    }
    return this.shape();
  }

  step(rgba: Uint8ClampedArray): Shape {
    this.load(rgba, this.nextPyr);
    const pcx = this.box.cx, pcy = this.box.cy;
    this.trackStep(); this.traceStep(pcx, pcy);
    const t = this.prevPyr; this.prevPyr = this.nextPyr; this.nextPyr = t;
    return this.shape();
  }

  // traced outline, or the last one shifted along with the box while the trace misses
  private shape(): Shape {
    const b = this.box, s = this.seg;
    let mask: Rle | undefined;
    if (this.rle && s.on && s.miss < 12) {
      const dx = Math.round(s.dx), dy = Math.round(s.dy);
      mask = dx || dy ? { ...this.rle, x0: this.rle.x0 + dx, y0: this.rle.y0 + dy } : this.rle;
    }
    return { id: 1, cx: b.cx, cy: b.cy, w: b.w, h: b.h, mask, lost: this.lost || undefined };
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
    const { W, H, cY, cB, cR } = this, g = pyr[0].d;
    for (let i = 0, j = 0; i < W * H; i++, j += 4) {
      const r = d[j], gg = d[j + 1], b = d[j + 2], yv = 0.299 * r + 0.587 * gg + 0.114 * b;
      g[i] = yv; cY[i] = yv; cB[i] = 128 - 0.168736 * r - 0.331264 * gg + 0.5 * b; cR[i] = 128 + 0.5 * r - 0.418688 * gg - 0.081312 * b;
    }
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

  // ---------- colour region growing ----------
  private colorDist(i: number) {
    const { cY, cB, cR } = this, ref = this.seg.ref;
    const dy = (cY[i] - ref[0]) * 0.45, db = cB[i] - ref[1], dr = cR[i] - ref[2];
    return Math.sqrt(dy * dy + db * db + dr * dr);
  }
  private sampleRef(x: number, y: number) {
    const { W, H, cY, cB, cR } = this;
    let a = 0, b = 0, c = 0, n = 0;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const xx = Math.min(W - 1, Math.max(0, x + dx)), yy = Math.min(H - 1, Math.max(0, y + dy)), i = yy * W + xx;
      a += cY[i]; b += cB[i]; c += cR[i]; n++;
    }
    this.seg.ref = [a / n, b / n, c / n];
  }
  private findSeed(x: number, y: number, tol: number) {
    const { W, H } = this;
    x = Math.round(x); y = Math.round(y);
    for (let r = 0; r <= 5; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      if (this.colorDist(yy * W + xx) <= tol * 0.85) return yy * W + xx;
    }
    return -1;
  }
  // grows the region from the seed; stops at color changes and strong edges; returns area
  private flood(si: number, tol: number, rx0: number, ry0: number, rx1: number, ry1: number) {
    const { W, mask, queue, cY } = this;
    mask.fill(0);
    let qh = 0, qt = 0, area = 1;
    let bx0 = si % W, bx1 = bx0, by0 = (si / W) | 0, by1 = by0;
    mask[si] = 1; queue[qt++] = si;
    while (qh < qt) {
      const i = queue[qh++], x = i % W, y = (i / W) | 0, gi = cY[i];
      for (let d = 0; d < 4; d++) {
        const nx = d === 0 ? x + 1 : d === 1 ? x - 1 : x, ny = d === 2 ? y + 1 : d === 3 ? y - 1 : y;
        if (nx < rx0 || ny < ry0 || nx > rx1 || ny > ry1) continue;
        const j = ny * W + nx;
        if (mask[j]) continue;
        if (Math.abs(cY[j] - gi) > 38 || this.colorDist(j) > tol) continue;
        mask[j] = 1; queue[qt++] = j; area++;
        if (nx < bx0) bx0 = nx;
        if (nx > bx1) bx1 = nx;
        if (ny < by0) by0 = ny;
        if (ny > by1) by1 = ny;
      }
    }
    Object.assign(this.seg, { bx0, bx1, by0, by1 });
    return area;
  }
  // fills holes inside the traced shape (eyes, gaps between fingers that close up)
  private fillHoles() {
    const { W, H, mask, queue, seg } = this;
    const x0 = Math.max(0, seg.bx0 - 1), x1 = Math.min(W - 1, seg.bx1 + 1), y0 = Math.max(0, seg.by0 - 1), y1 = Math.min(H - 1, seg.by1 + 1);
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
    let area = 0;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const j = y * W + x; mask[j] = mask[j] === 2 ? 0 : 1; area += mask[j];
    }
    return area;
  }
  private commitMask() {
    const s = this.seg;
    this.rle = encodeRle(this.mask, this.W, s.bx0, s.by0, s.bx1, s.by1);
    s.dx = s.dy = 0;
  }
  // first trace from a click; tightens automatically if the result is silly
  private traceClick(x: number, y: number, tol0: number) {
    const { W, H, seg } = this;
    this.sampleRef(Math.round(x), Math.round(y));
    let tol = tol0;
    for (let attempt = 0; attempt < 6; attempt++) {
      const si = this.findSeed(x, y, tol);
      if (si < 0) return false;
      let area = this.flood(si, tol, 0, 0, W - 1, H - 1);
      const tooBig = area > W * H * 0.42 || (seg.bx1 - seg.bx0) > W * 0.95 || (seg.by1 - seg.by0) > H * 0.97;
      if (tooBig) { tol *= 0.72; continue; }
      if (area < 30) return false;
      area = this.fillHoles(); this.commitMask();
      Object.assign(seg, { area, on: true, miss: 0, useTol: tol });
      return true;
    }
    return false;
  }
  // re-trace on each new frame, seeded from where the tracker says the object is
  private traceStep(prevCx: number, prevCy: number) {
    const { W, H, box, seg, mask, cY, cB, cR } = this;
    if (!seg.on) return;
    const si = this.findSeed(box.cx + seg.offX * box.w, box.cy + seg.offY * box.h, seg.useTol);
    const miss = () => { seg.miss++; seg.dx += box.cx - prevCx; seg.dy += box.cy - prevCy; };
    if (si < 0) return miss();
    const rx0 = Math.max(0, Math.round(box.cx - box.w * 0.95)), rx1 = Math.min(W - 1, Math.round(box.cx + box.w * 0.95));
    const ry0 = Math.max(0, Math.round(box.cy - box.h * 0.95)), ry1 = Math.min(H - 1, Math.round(box.cy + box.h * 0.95));
    let area = this.flood(si, seg.useTol, rx0, ry0, rx1, ry1);
    if (area < 20 || area > seg.area * 2.3 || area < seg.area * 0.35) return miss();
    area = this.fillHoles(); this.commitMask();
    seg.area = 0.7 * seg.area + 0.3 * area; seg.miss = 0;
    // let the traced shape steer and size the tracking box
    const mcx = (seg.bx0 + seg.bx1) / 2, mcy = (seg.by0 + seg.by1) / 2;
    const mw = (seg.bx1 - seg.bx0 + 1) * 1.04, mh = (seg.by1 - seg.by0 + 1) * 1.04;
    box.cx += (mcx - box.cx) * 0.35; box.cy += (mcy - box.cy) * 0.35;
    box.w += (mw - box.w) * 0.3; box.h += (mh - box.h) * 0.3; this.clampBox();
    // slowly follow lighting changes
    let a = 0, b = 0, c = 0, n = 0;
    for (let y = seg.by0; y <= seg.by1; y += 2) for (let x = seg.bx0; x <= seg.bx1; x += 2) {
      const i = y * W + x; if (mask[i]) { a += cY[i]; b += cB[i]; c += cR[i]; n++; }
    }
    if (n > 10) { const r = seg.ref; r[0] += (a / n - r[0]) * 0.03; r[1] += (b / n - r[1]) * 0.03; r[2] += (c / n - r[2]) * 0.03; }
  }
}
