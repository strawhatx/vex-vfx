// Lightning: jagged bolts striking off the object (some crawling across it), a flash that lights up
// the scene with each strike, and sparks. Unlike the other effects it keeps a little state between
// frames: the bolts still showing, and how bright the last flash still is.
import type { Rng } from '../rng';
import { bloom, type Ctx2D } from '../sprites';
import type { Emitter } from './emitter';
import { targetGlow, type Painter } from './painter';

type Bolt = { pts: number[]; w: number; born: number; life: number };

export class Lightning {
  private bolts: Bolt[] = [];
  private flash = 0;
  private layer: readonly [OffscreenCanvas, OffscreenCanvasRenderingContext2D] | null = null;

  reset() {
    this.bolts = [];
    this.flash = 0;
  }

  // no object, or another effect: no bolts
  clearBolts() {
    this.bolts = [];
  }

  // each bolt lives a few frames; strikes are decided per frame, so they don't depend on history
  emit(e: Emitter) {
    const { r, f, u, I, A, time } = e;
    this.bolts = this.bolts.filter(b => time - b.born < b.life);
    if (r() < Math.min(0.9, 0.45 * I)) {
      this.flash = 1;
      const n = 1 + Math.round(r() * 2 * I * Math.min(2, A));
      const life = 0.05 + r() * 0.1;
      for (let i = 0; i < n; i++) {
        const p = e.edgePoint(0.85);
        // some arcs crawl across the object to another nearby point of its outline
        if (f.hasShape && r() < 0.4) {
          let hit = false;
          for (let k = 0; k < 6 && !hit; k++) {
            const j = ((r() * f.n) | 0) * 4;
            const qx = f.contour[j];
            const qy = f.contour[j + 1];
            const d = Math.hypot(qx - p.x, qy - p.y);
            if (d > u * 3 && d < u * 12) {
              makeBolt(r, p.x, p.y, qx, qy, time, life, this.bolts);
              hit = true;
            }
          }
          if (hit) continue;
        }
        // the rest strike outwards
        const ang = p.a + (r() - 0.5) * 0.9;
        const len = u * (6 + r() * 10);
        makeBolt(r, p.x, p.y, p.x + Math.cos(ang) * len, p.y + Math.sin(ang) * len, time, life, this.bolts);
      }
    } else {
      this.flash *= 0.4;
    }
    // sparks
    e.emit(25 * I, () => {
      const p = e.edgePoint(0.9);
      const sp = u * (18 + r() * 30);
      return {
        k: 's',
        x: p.x,
        y: p.y,
        vx: Math.cos(p.a) * sp,
        vy: Math.sin(p.a) * sp,
        life: 0,
        max: 0.2 + r() * 0.3,
      };
    });
  }

  draw(p: Painter) {
    const { ctx, f, tgt, pal, u, I, time, r, layers } = p;
    ctx.globalCompositeOperation = 'lighter';
    const fl = this.flash;
    const W = ctx.canvas.width;
    const H = ctx.canvas.height;

    // the glow around the object, brighter with each strike
    if (tgt.active && f.hasShape) {
      layers.maskGlow(ctx, pal[2], u * 3, (0.3 + fl * 0.6 + r() * 0.1) * I);
      ctx.globalCompositeOperation = 'lighter';
    } else if (tgt.active) {
      targetGlow(p, pal[2], tgt.rx * 1.6, tgt.ry * 1.6, (0.15 + fl * 0.3) * I);
    }

    // the whole scene lights up for a moment with each strike
    if (fl > 0.3) {
      ctx.globalAlpha = Math.min(0.2, 0.07 * fl * I);
      ctx.fillStyle = pal[2];
      ctx.fillRect(0, 0, W, H);
    }
    if (!this.bolts.length) return;

    // colored channel on a layer, bloomed for the glow, then white-hot cores on top
    if (!this.layer || this.layer[0].width !== W || this.layer[0].height !== H) {
      const c = new OffscreenCanvas(W, H);
      this.layer = [c, c.getContext('2d') as OffscreenCanvasRenderingContext2D];
    }
    const [lc, g] = this.layer;
    g.clearRect(0, 0, W, H);
    g.lineJoin = 'round';
    g.lineCap = 'round';
    g.strokeStyle = pal[1];
    const fade = (b: Bolt) => Math.max(0, 1 - ((time - b.born) / b.life) * 0.7) * (0.75 + r() * 0.25);
    for (const b of this.bolts) {
      g.globalAlpha = fade(b);
      g.lineWidth = Math.max(1.5, u * 0.22 * b.w);
      tracePath(g, b.pts);
      g.stroke();
    }
    ctx.globalAlpha = 0.9;
    ctx.drawImage(lc, 0, 0);
    bloom(ctx, lc, Math.min(1, 0.8 * I), [2, 6, 18]);
    bloom(ctx, lc, Math.min(1, 0.6 * I), [40]);

    ctx.lineJoin = 'miter';
    ctx.lineCap = 'round';
    ctx.strokeStyle = pal[0];
    for (const b of this.bolts) {
      ctx.globalAlpha = fade(b);
      ctx.lineWidth = Math.max(0.8, u * 0.06 * b.w);
      tracePath(ctx, b.pts);
      ctx.stroke();
    }
  }
}

function tracePath(c: Ctx2D, pts: number[]) {
  c.beginPath();
  c.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]);
}

// a bolt from (x1, y1) to (x2, y2), with any forks, added to `out`
function makeBolt(
  r: Rng,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  born: number,
  life: number,
  out: Bolt[],
) {
  const pts = [x1, y1];
  const disp = Math.hypot(x2 - x1, y2 - y1) * 0.3;
  boltPoints(r, x1, y1, x2, y2, disp, 7, pts, { forks: out, w: 1, born, life });
  out.push({ pts, w: 1, born, life });
}

// midpoint displacement: split each segment, push the midpoint sideways, halve the push, repeat.
// Now and then a fork leaves from a midpoint and is built the same way, thinner.
function boltPoints(
  r: Rng,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  disp: number,
  depth: number,
  out: number[],
  bolt: { forks: Bolt[] | null; w: number; born: number; life: number },
) {
  if (depth === 0) {
    out.push(x2, y2);
    return;
  }
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const off = (r() - 0.5) * disp;
  const mx = (x1 + x2) / 2 - (dy / len) * off;
  const my = (y1 + y2) / 2 + (dx / len) * off;
  const { forks, w, born, life } = bolt;
  if (forks && depth >= 3 && r() < 0.22) {
    const a = Math.atan2(y2 - my, x2 - mx) + (r() < 0.5 ? -1 : 1) * (0.4 + r() * 0.6);
    const l = Math.hypot(x2 - mx, y2 - my) * (0.6 + r() * 0.5);
    const pts = [mx, my];
    const fork = { forks: forks.length < 24 ? forks : null, w: w * 0.55, born, life };
    boltPoints(r, mx, my, mx + Math.cos(a) * l, my + Math.sin(a) * l, l * 0.4, depth - 1, pts, fork);
    forks.push({ pts, w: w * 0.55, born, life });
  }
  // shrinking the push a little slower than the segments keeps the fine zigzag sharp
  boltPoints(r, x1, y1, mx, my, disp * 0.58, depth - 1, out, bolt);
  boltPoints(r, mx, my, x2, y2, disp * 0.58, depth - 1, out, bolt);
}
