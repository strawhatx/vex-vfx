// The camera's movement through the clip: how far it pans and how much it zooms from frame to
// frame, chained into a path from the first frame. It follows a grid of points spread over the
// whole frame with Lucas-Kanade (each checked by tracking it back again) and fits a shift and zoom
// to them, refitting to the points that agree so an object moving through the shot is left out.
// Lasers aimed at a spot, and impacts, use the path to stay put in the scene; the object tracker
// uses each frame's move to tell the object's own movement from the camera's.
import { chainCam, NO_MOVE, type Cam } from '@/domain/effects/laser';
import { LucasKanade, loadPyr, makePyr, median, WIN, type Pyr } from './flow';

const GRID = 10;

// a box in the frame (center and size)
export type Box = { cx: number; cy: number; w: number; h: number };

// How the whole frame moved from one frame to the next, x' = s·x + t, fitted to a grid of points
// over it (see above). Keeps a guess of the next move from this one, so give it frames in order.
export class FrameMove {
  private flow = new LucasKanade();
  private vx = 0;
  private vy = 0;

  constructor(
    private W: number,
    private H: number,
  ) {}

  // the move from P to N (null if too little of the frame could be followed to tell); skip: an
  // area to leave out (an object being followed, so its own movement doesn't count)
  fit(P: Pyr, N: Pyr, skip?: Box): Cam | null {
    const { W, H } = this;
    const olds: { x: number; y: number }[] = [],
      news: [number, number][] = [];
    for (let gy = 0; gy < GRID; gy++)
      for (let gx = 0; gx < GRID; gx++) {
        const x = WIN + 3 + ((gx + 0.5) / GRID) * (W - 2 * WIN - 6),
          y = WIN + 3 + ((gy + 0.5) / GRID) * (H - 2 * WIN - 6);
        if (skip && Math.abs(x - skip.cx) < skip.w / 2 && Math.abs(y - skip.cy) < skip.h / 2) continue;
        const f = this.flow.track(P, N, x, y, this.vx, this.vy);
        const b = f && this.flow.track(N, P, f[0], f[1], -this.vx, -this.vy);
        if (!f || !b || Math.hypot(b[0] - x, b[1] - y) > 1) continue;
        olds.push({ x, y });
        news.push(f);
      }
    if (olds.length < 8) return null;
    // start from the typical shift, then keep refitting to the points that agree with the fit
    let s = 1,
      tx = median(news.map((f, k) => f[0] - olds[k].x)),
      ty = median(news.map((f, k) => f[1] - olds[k].y));
    let use = olds.map((_, k) => k);
    for (let round = 0; round < 4; round++) {
      const res = olds.map((o, k) => Math.hypot(news[k][0] - (s * o.x + tx), news[k][1] - (s * o.y + ty)));
      const cut = Math.max(0.75, 2 * median(use.map(k => res[k])));
      const keep = olds.map((_, k) => k).filter(k => res[k] <= cut);
      if (keep.length < 6) break;
      use = keep;
      let mx = 0,
        my = 0,
        mx2 = 0,
        my2 = 0;
      for (const k of use) {
        mx += olds[k].x;
        my += olds[k].y;
        mx2 += news[k][0];
        my2 += news[k][1];
      }
      mx /= use.length;
      my /= use.length;
      mx2 /= use.length;
      my2 /= use.length;
      let num = 0,
        den = 0;
      for (const k of use) {
        const ax = olds[k].x - mx,
          ay = olds[k].y - my;
        num += ax * (news[k][0] - mx2) + ay * (news[k][1] - my2);
        den += ax * ax + ay * ay;
      }
      s = den > 0 ? Math.max(0.95, Math.min(1.05, num / den)) : 1;
      tx = mx2 - s * mx;
      ty = my2 - s * my;
    }
    // guess the next frame's move from this one, to start the search in the right place
    this.vx = 0.6 * tx + 0.4 * this.vx;
    this.vy = 0.6 * ty + 0.4 * this.vy;
    return { s, tx, ty };
  }
}

// the points (of olds, which moved to news) whose movement isn't just the camera's (within tol px):
// on an object moving in the scene, not the background behind it
export function ownMotion(
  olds: readonly { x: number; y: number }[],
  news: readonly [number, number][],
  cam: Cam,
  tol: number,
) {
  return olds.flatMap((o, k) =>
    Math.hypot(news[k][0] - (cam.s * o.x + cam.tx), news[k][1] - (cam.s * o.y + cam.ty)) > tol ? [k] : [],
  );
}

export class CameraTracker {
  private prev: Pyr;
  private next: Pyr;
  private move: FrameMove;
  private path: Cam = NO_MOVE;

  constructor(
    private W: number,
    private H: number,
  ) {
    this.prev = makePyr(W, H);
    this.next = makePyr(W, H);
    this.move = new FrameMove(W, H);
  }

  // the first frame: the path starts here
  first(rgba: Uint8ClampedArray): Cam {
    loadPyr(rgba, this.prev, this.W, this.H);
    this.path = NO_MOVE;
    this.move = new FrameMove(this.W, this.H);
    return this.path;
  }

  // each next frame, in order: the path so far (with too little to go on, it held still)
  step(rgba: Uint8ClampedArray): Cam {
    loadPyr(rgba, this.next, this.W, this.H);
    this.path = chainCam(this.path, this.move.fit(this.prev, this.next) ?? NO_MOVE);
    const t = this.prev;
    this.prev = this.next;
    this.next = t;
    return this.path;
  }
}
