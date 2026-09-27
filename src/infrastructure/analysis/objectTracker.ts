// Tap-an-object tracking, run once per frame by the analysis worker, on analysis-size frames.
//   1. Motion: Median Flow (pyramidal Lucas-Kanade on corners in the box, keeping the points that
//      track well both ways) moves and scales a box with the object. If it loses it, the box is
//      searched for by how the object looked when tapped.
//   2. Outline: the AI segmenter outlines the object where the box went. A new outline is only
//      believed if it overlaps the last one (moved with the motion) and is about the same size;
//      it then nudges the box. Otherwise the last outline moves along with the box.
// Picked with a box drawn round it (a focus), the object is found inside that box, from whichever
// of a few points in it gives the outline that best fills it; from then on it's only outlined
// within a box as much bigger than it, so the outline can't spill onto what's around it.
import { encodeRle, type Rle, type Selection, type Shape } from '@/domain/tracking/types';
import { boxVec, cornersIn, dot, patchNcc } from './features';
import { LucasKanade, loadPyr, makePyr, median, type Img, type Pyr } from './flow';
import { deepestPoint, maskArea, overlapShare, pieceAt, type Bounds } from './maskOps';

// outlines the object at (x, y) in the current frame, looking only within region if given; 1 = object
export type SegmentAt = (x: number, y: number, region?: Region) => Uint8Array;
type Region = { x0: number; y0: number; x1: number; y1: number };

// where in a focus box to try outlining from (fractions of it), best first
const FOCUS_SEEDS = [
  [0.5, 0.5],
  [0.5, 0.35],
  [0.5, 0.65],
  [0.35, 0.5],
  [0.65, 0.5],
  [0.5, 0.2],
  [0.5, 0.8],
];
// the region outlined in is at least this much bigger than the object
const MIN_FOCUS = 1.15;

// a new outline is only accepted if it overlaps the previous one (moved with the motion) this
// much and hasn't changed size too abruptly
const MIN_OVERLAP = 0.3;
const MAX_GROWTH = 2.5;
// how long the last outline is kept, moved along, while new ones aren't believable
const MAX_MISSES = 12;

export class ObjectTracker {
  // this frame and the next, as image pyramids
  private prevPyr: Pyr;
  private nextPyr: Pyr;
  private flow = new LucasKanade();

  // motion: the box, how fast it's moving, and how the object looked when tapped
  private box = { cx: 0, cy: 0, w: 0, h: 0 };
  private trk = { vx: 0, vy: 0, lostFrames: 0, frames: 0, anchorVec: null as Float32Array | null };
  private lost = false;

  // outline: the current one (and the last, to compare with), its bounds, and how far it's been
  // moved along since it was last seen
  private mask: Uint8Array;
  private prevMask: Uint8Array;
  private queue: Int32Array; // scratch
  private seg = { on: false, area: 0, dx: 0, dy: 0, bx0: 0, by0: 0, bx1: 0, by1: 0, miss: 0 };
  private rle: Rle | null = null;
  // where to segment next frame, relative to the box: deep inside the object, and where it was tapped
  private seeds: { u: number; v: number }[] = [];
  // with a focus: how much bigger than the box the region outlined in is
  private reach: { w: number; h: number } | null = null;

  constructor(
    private W: number,
    private H: number,
    private segmentAt: SegmentAt,
    private focus: { w: number; h: number } | null = null,
  ) {
    this.prevPyr = makePyr(W, H);
    this.nextPyr = makePyr(W, H);
    const n = W * H;
    this.mask = new Uint8Array(n);
    this.prevMask = new Uint8Array(n);
    this.queue = new Int32Array(n);
  }

  // the first frame: outline the tapped object (a box around the tap if nothing is found)
  start(rgba: Uint8ClampedArray, sel: Selection): Shape {
    loadPyr(rgba, this.prevPyr, this.W, this.H);
    const b = this.focus ? this.outlineInFocus(sel, this.focus) : this.outlineAt(sel.x, sel.y);
    if (b && maskArea(this.mask, this.W, b) >= 30) {
      this.commit(b);
      const bw = (b.bx1 - b.bx0 + 1) * 1.04;
      const bh = (b.by1 - b.by0 + 1) * 1.04;
      if (this.focus)
        this.reach = {
          w: Math.max(MIN_FOCUS, this.focus.w / bw),
          h: Math.max(MIN_FOCUS, this.focus.h / bh),
        };
      this.lock((b.bx0 + b.bx1) / 2, (b.by0 + b.by1) / 2, bw, bh);
      this.seeds = [this.interiorSeed(b), { u: (sel.x - this.box.cx) / bw, v: (sel.y - this.box.cy) / bh }];
    } else {
      this.seg.on = false;
      this.lock(sel.x, sel.y, this.W * 0.16, this.W * 0.16);
    }
    return this.shape();
  }

  // each next frame, in order
  step(rgba: Uint8ClampedArray): Shape {
    loadPyr(rgba, this.nextPyr, this.W, this.H);
    const pcx = this.box.cx;
    const pcy = this.box.cy;
    this.trackStep();
    this.segmentStep(pcx, pcy);
    [this.prevPyr, this.nextPyr] = [this.nextPyr, this.prevPyr];
    return this.shape();
  }

  // the outline, or the last one moved along with the box while segmenting misses
  private shape(): Shape {
    const b = this.box;
    const s = this.seg;
    let mask: Rle | undefined;
    if (this.rle && s.on && s.miss < MAX_MISSES) {
      const dx = Math.round(s.dx);
      const dy = Math.round(s.dy);
      mask = dx || dy ? { ...this.rle, x0: this.rle.x0 + dx, y0: this.rle.y0 + dy } : this.rle;
    }
    return { id: 1, cx: b.cx, cy: b.cy, w: b.w, h: b.h, mask, lost: this.lost || undefined };
  }

  // starts following a box, remembering how it looks
  private lock(cx: number, cy: number, w: number, h: number) {
    Object.assign(this.box, { cx, cy, w, h });
    this.clampBox();
    Object.assign(this.trk, { vx: 0, vy: 0, lostFrames: 0, frames: 0 });
    this.trk.anchorVec = boxVec(this.prevPyr[0], this.box.cx, this.box.cy, this.box.w, this.box.h);
    this.lost = false;
  }

  private clampBox() {
    const { W, H, box } = this;
    box.w = Math.max(12, Math.min(W, box.w));
    box.h = Math.max(12, Math.min(H, box.h));
    box.cx = Math.max(0, Math.min(W, box.cx));
    box.cy = Math.max(0, Math.min(H, box.cy));
  }

  // ---------- motion ----------

  private trackStep() {
    const { box, trk } = this;
    const img = this.nextPyr[0];
    const ok = this.medianFlow();
    trk.frames++;
    if (ok) {
      trk.lostFrames = 0;
      // drift guard: every 10 frames, compare with how the object looked when tapped
      if (trk.frames % 10 === 0 && trk.anchorVec) {
        const here = dot(boxVec(img, box.cx, box.cy, box.w, box.h), trk.anchorVec);
        if (here < 0.35) {
          const r = this.search(img, 0.6);
          if (r && r.score > 0.65 && r.score > here + 0.25) {
            box.cx = r.x;
            box.cy = r.y;
            trk.vx = trk.vy = 0;
          }
        }
      }
    } else {
      // lost it: slow down, and look for it nearby
      trk.lostFrames++;
      trk.vx *= 0.5;
      trk.vy *= 0.5;
      const r = this.search(img, 1.0);
      if (r && r.score > 0.55) {
        box.cx = r.x;
        box.cy = r.y;
        trk.lostFrames = 0;
        trk.vx = trk.vy = 0;
      }
    }
    this.lost = trk.lostFrames > 2;
  }

  // moves and scales the box by how its corners moved; false if they didn't track well
  private medianFlow() {
    const { W, H, box, trk } = this;
    const P = this.prevPyr;
    const N = this.nextPyr;

    // follow each corner forwards, then back again: good points come back where they started
    const dxs: number[] = [];
    const dys: number[] = [];
    const fbs: number[] = []; // forward-backward error
    const nccs: number[] = []; // how alike the patches are
    const olds: { x: number; y: number }[] = [];
    const news: [number, number][] = [];
    for (const p of cornersIn(P[0], W, H, box)) {
      const f = this.flow.track(P, N, p.x, p.y, trk.vx, trk.vy);
      if (!f) continue;
      if (f[0] < 1 || f[1] < 1 || f[0] > W - 2 || f[1] > H - 2) continue;
      const b = this.flow.track(N, P, f[0], f[1], -trk.vx, -trk.vy);
      if (!b) continue;
      fbs.push(Math.hypot(b[0] - p.x, b[1] - p.y));
      nccs.push(patchNcc(P[0], p.x, p.y, N[0], f[0], f[1]));
      dxs.push(f[0] - p.x);
      dys.push(f[1] - p.y);
      olds.push(p);
      news.push(f);
    }
    if (fbs.length < 6) return false;
    const mFB = median(fbs);
    const mN = median(nccs);
    if (mFB > 5) return false;

    // keep the better half: small error and alike patches (or just small error)
    let keep: number[] = [];
    for (let i = 0; i < fbs.length; i++) if (fbs[i] <= mFB && nccs[i] >= mN) keep.push(i);
    if (keep.length < 4) {
      keep = [];
      for (let i = 0; i < fbs.length; i++) if (fbs[i] <= mFB) keep.push(i);
    }
    if (keep.length < 4) return false;

    // the move: the median shift, and the median change in distance between pairs of points
    const dx = median(keep.map(i => dxs[i]));
    const dy = median(keep.map(i => dys[i]));
    const ratios: number[] = [];
    for (let a = 0; a < keep.length; a++) {
      for (let b = a + 1; b < keep.length; b++) {
        const i = keep[a];
        const j = keep[b];
        const d0 = Math.hypot(olds[i].x - olds[j].x, olds[i].y - olds[j].y);
        if (d0 < 6) continue;
        ratios.push(Math.hypot(news[i][0] - news[j][0], news[i][1] - news[j][1]) / d0);
        if (ratios.length > 800) break;
      }
    }
    const sc = Math.max(0.93, Math.min(1.07, ratios.length > 5 ? median(ratios) : 1));

    box.cx += dx;
    box.cy += dy;
    box.w *= sc;
    box.h *= sc;
    this.clampBox();
    trk.vx = 0.6 * dx + 0.4 * trk.vx;
    trk.vy = 0.6 * dy + 0.4 * trk.vy;
    return true;
  }

  // the place within radiusMul box-sizes that looks most like the object did when tapped
  private search(img: Img, radiusMul: number) {
    const { W, H, box, trk } = this;
    if (!trk.anchorVec) return null;
    const R = Math.max(box.w, box.h) * radiusMul;
    const step = Math.max(2, R / 14);
    let best = -1;
    let bx = box.cx;
    let by = box.cy;
    for (let y = box.cy - R; y <= box.cy + R; y += step) {
      for (let x = box.cx - R; x <= box.cx + R; x += step) {
        if (x < box.w * 0.3 || y < box.h * 0.3 || x > W - box.w * 0.3 || y > H - box.h * 0.3) continue;
        const s = dot(boxVec(img, x, y, box.w, box.h), trk.anchorVec);
        if (s > best) {
          best = s;
          bx = x;
          by = y;
        }
      }
    }
    return { score: best, x: bx, y: by };
  }

  // ---------- outline ----------

  // re-outlines the object where the motion says it went
  private segmentStep(prevCx: number, prevCy: number) {
    const { box, seg } = this;
    if (!seg.on) return;
    const mdx = Math.round(box.cx - prevCx);
    const mdy = Math.round(box.cy - prevCy);
    for (const s of this.seeds) {
      const b = this.outlineAt(box.cx + s.u * box.w, box.cy + s.v * box.h);
      if (!b) continue;
      const area = maskArea(this.mask, this.W, b);
      if (area < 20 || area > seg.area * MAX_GROWTH || area < seg.area / MAX_GROWTH) continue;
      const moved = overlapShare(
        this.mask,
        this.prevMask,
        this.W,
        this.H,
        b,
        mdx + Math.round(seg.dx),
        mdy + Math.round(seg.dy),
      );
      if (moved < MIN_OVERLAP) continue;
      this.commit(b);
      // let the outline steer and size the box, then re-centre the seeds
      const mw = (b.bx1 - b.bx0 + 1) * 1.04;
      const mh = (b.by1 - b.by0 + 1) * 1.04;
      box.cx += ((b.bx0 + b.bx1) / 2 - box.cx) * 0.35;
      box.cy += ((b.by0 + b.by1) / 2 - box.cy) * 0.35;
      box.w += (mw - box.w) * 0.3;
      box.h += (mh - box.h) * 0.3;
      this.clampBox();
      this.seeds[0] = this.interiorSeed(b);
      return;
    }
    // nothing believable: keep the last outline, moved along with the box
    seg.miss++;
    seg.dx += box.cx - prevCx;
    seg.dy += box.cy - prevCy;
  }

  // segments at (x, y) into this.mask (within region, or with a focus the region around the box);
  // the connected piece there, holes filled
  private outlineAt(x: number, y: number, region = this.region()): Bounds | null {
    const { W, H } = this;
    const xi = Math.round(x);
    const yi = Math.round(y);
    if (xi < 0 || yi < 0 || xi >= W || yi >= H) return null;
    return pieceAt(this.segmentAt(xi, yi, region), W, H, xi, yi, this.mask, this.queue);
  }

  // the region outlined in: the box, as much bigger as the focus was than the object (none without
  // a focus)
  private region(): Region | undefined {
    const { box, reach } = this;
    if (!reach) return undefined;
    const hw = (box.w * reach.w) / 2,
      hh = (box.h * reach.h) / 2;
    return { x0: box.cx - hw, y0: box.cy - hh, x1: box.cx + hw, y1: box.cy + hh };
  }

  // the object in a focus box of size f around sel: outlined from a few points in it, keeping the
  // outline that best fills the box (the box was drawn round the object, so the right one does).
  // Leaves it in this.mask.
  private outlineInFocus(sel: Selection, f: { w: number; h: number }): Bounds | null {
    const { W, H } = this;
    const region = { x0: sel.x - f.w / 2, y0: sel.y - f.h / 2, x1: sel.x + f.w / 2, y1: sel.y + f.h / 2 };
    const rx0 = Math.max(0, region.x0),
      ry0 = Math.max(0, region.y0),
      rx1 = Math.min(W, region.x1),
      ry1 = Math.min(H, region.y1);
    const rArea = Math.max(1, (rx1 - rx0) * (ry1 - ry0));
    let best: { b: Bounds; score: number; mask: Uint8Array } | null = null;
    for (const [u, v] of FOCUS_SEEDS) {
      const b = this.outlineAt(region.x0 + u * f.w, region.y0 + v * f.h, region);
      if (!b) continue;
      const area = maskArea(this.mask, W, b);
      if (area < 30) continue;
      // how well its bounds match the box: their overlap over their union
      const ix = Math.max(0, Math.min(b.bx1 + 1, rx1) - Math.max(b.bx0, rx0)),
        iy = Math.max(0, Math.min(b.by1 + 1, ry1) - Math.max(b.by0, ry0));
      const inter = ix * iy,
        bArea = (b.bx1 - b.bx0 + 1) * (b.by1 - b.by0 + 1);
      const score = inter / (rArea + bArea - inter);
      if (!best || score > best.score + 0.02) best = { b, score, mask: this.mask.slice() };
      if (score > 0.8) break;
    }
    if (best) this.mask.set(best.mask);
    return best?.b ?? null;
  }

  // takes this.mask as the object's outline
  private commit(b: Bounds) {
    this.rle = encodeRle(this.mask, this.W, b.bx0, b.by0, b.bx1, b.by1);
    this.prevMask.set(this.mask);
    Object.assign(this.seg, b, { on: true, miss: 0, dx: 0, dy: 0, area: maskArea(this.mask, this.W, b) });
  }

  // the point deepest inside the outline, relative to the box: segmenting there is least likely to
  // land on the background as the object moves
  private interiorSeed(b: Bounds) {
    const { x, y } = deepestPoint(this.mask, this.W, b);
    return { u: (x - this.box.cx) / this.box.w, v: (y - this.box.cy) / this.box.h };
  }
}
