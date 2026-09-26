// Particle effects, stepped once per video frame. Repeatable: all randomness comes from a
// per-frame seeded generator and time is the frame's timestamp, so replaying, scrubbing and
// exporting produce the same pictures. No particle lives longer than MAX_LIFE, so the state
// at any frame can be rebuilt by simulating from MAX_LIFE seconds earlier.
import { PALETTES, type FxSettings } from './palettes';
import { rngFor, type Rng } from './rng';
import { bloom, drawTongue, flameSprite, ringSprite, sprite, type Ctx2D } from './sprites';

export const MAX_LIFE = 2.2; // seconds

export interface Target { x: number; y: number; rx: number; ry: number; vx: number; vy: number; active: boolean }

// Everything the effects need to know about one frame, in output-canvas pixels.
export interface FxFrame {
  index: number; t: number; dt: number;
  tgt: Target;
  // outline points: x, y, normal x, normal y
  contour: Float32Array; n: number;
  hasShape: boolean;
}

// draws a soft glow hugging the current outline (provided by the compositor)
export type MaskGlow = (ctx: Ctx2D, col: string, blur: number, alpha: number) => void;
// drawing the compositor does for the effects; fire returns false when the GPU layer isn't available
export interface Layers {
  maskGlow: MaskGlow;
  fire?: (ctx: Ctx2D, f: FxFrame, u: number, intensity: number) => boolean;
}

type Particle =
  | { k: 'f'; x: number; y: number; vx: number; vy: number; life: number; max: number; s: number; seed: number; inner: boolean }
  | { k: 'e' | 'm'; x: number; y: number; vx: number; vy: number; life: number; max: number; s: number; seed: number }
  | { k: 'w'; ox: number; oy: number; out: number; rise: number; life: number; max: number; len: number; wid: number; seed: number }
  | { k: 'g'; ox: number; oy: number; rise: number; life: number; max: number; s: number; seed: number }
  | { k: 's'; x: number; y: number; vx: number; vy: number; life: number; max: number };

const MAX_PARTS = 2600;
// smooth pseudo-noise, -1..1
const noise = (t: number, s: number) => Math.sin(t * 2.3 + s) * 0.5 + Math.sin(t * 5.7 + s * 1.7) * 0.3 + Math.sin(t * 11.1 + s * 2.9) * 0.2;
const fireCol = (pal: readonly string[], f: number) => f < 0.12 ? pal[0] : f < 0.35 ? pal[1] : f < 0.65 ? pal[2] : pal[3];

type Bolt = { pts: number[]; w: number; born: number; life: number };

// midpoint displacement: split each segment, push the midpoint sideways, halve the push, repeat.
// Now and then a fork leaves from a midpoint and is built the same way, thinner.
function boltPts(r: Rng, x1: number, y1: number, x2: number, y2: number, disp: number, depth: number,
  out: number[], forks: Bolt[] | null, w: number, born: number, life: number) {
  if (depth === 0) { out.push(x2, y2); return; }
  const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1, off = (r() - 0.5) * disp;
  const mx = (x1 + x2) / 2 - dy / len * off, my = (y1 + y2) / 2 + dx / len * off;
  if (forks && depth >= 3 && r() < 0.22) {
    const a = Math.atan2(y2 - my, x2 - mx) + (r() < 0.5 ? -1 : 1) * (0.4 + r() * 0.6);
    const l = Math.hypot(x2 - mx, y2 - my) * (0.6 + r() * 0.5), pts = [mx, my];
    boltPts(r, mx, my, mx + Math.cos(a) * l, my + Math.sin(a) * l, l * 0.4, depth - 1, pts, forks.length < 24 ? forks : null, w * 0.55, born, life);
    forks.push({ pts, w: w * 0.55, born, life });
  }
  // shrinking the push a little slower than the segments keeps the fine zigzag sharp
  boltPts(r, x1, y1, mx, my, disp * 0.58, depth - 1, out, forks, w, born, life);
  boltPts(r, mx, my, x2, y2, disp * 0.58, depth - 1, out, forks, w, born, life);
}
function makeBolt(r: Rng, x1: number, y1: number, x2: number, y2: number, born: number, life: number, out: Bolt[]) {
  const pts = [x1, y1];
  boltPts(r, x1, y1, x2, y2, Math.hypot(x2 - x1, y2 - y1) * 0.3, 7, pts, out, 1, born, life);
  out.push({ pts, w: 1, born, life });
}

export class EffectSim {
  private parts: Particle[] = [];
  private bolts: Bolt[] = [];
  private flash = 0;
  private layer: readonly [OffscreenCanvas, OffscreenCanvasRenderingContext2D] | null = null;

  constructor(private seed = 1) {}

  reset() { this.parts = []; this.bolts = []; this.flash = 0; }

  step(f: FxFrame, s: FxSettings) {
    const r = rngFor(this.seed, frameKey(f)), { tgt, dt } = f, time = f.t, parts = this.parts;
    const u = unit(tgt, s), I = s.intensity, fx = s.effect, A = areaMul(tgt);
    // stochastic rounding keeps the average rate without carrying fractions between frames
    const emit = (rate: number, make: () => Particle) => {
      for (let n = Math.floor(rate * dt + r()); n > 0; n--) if (parts.length < MAX_PARTS) parts.push(make());
    };
    const cPoint = (upBias: boolean) => {
      let i = 0;
      for (let t = 0; t < 6; t++) { i = ((r() * f.n) | 0) * 4; if (!upBias || f.contour[i + 3] < 0.35) break; }
      const c = f.contour;
      return { x: c[i], y: c[i + 1], nx: c[i + 2], ny: c[i + 3], a: Math.atan2(c[i + 3], c[i + 2]) };
    };
    const rimPoint = (spread: number, r0: number, r1: number) => {
      if (f.hasShape) { const p = cPoint(true); return { x: p.x, y: p.y, out: p.nx, a: p.a }; }
      const a = -Math.PI / 2 + (r() + r() - 1) * spread, rr = r0 + r() * (r1 - r0);
      return { x: tgt.x + Math.cos(a) * tgt.rx * rr, y: tgt.y + Math.sin(a) * tgt.ry * rr, out: Math.cos(a), a };
    };
    const edgePoint = (inner: number) => {
      if (f.hasShape) {
        const p = cPoint(false);
        if (inner >= 0.7) return { a: p.a, x: p.x, y: p.y };
        const rr = inner + (1 - inner) * r();
        return { a: p.a, x: tgt.x + (p.x - tgt.x) * rr, y: tgt.y + (p.y - tgt.y) * rr };
      }
      const a = r() * 6.2832, rr = inner + (1 - inner) * Math.sqrt(r());
      return { a, x: tgt.x + Math.cos(a) * tgt.rx * rr, y: tgt.y + Math.sin(a) * tgt.ry * rr };
    };

    if (tgt.active) {
      if (fx === 'fire') {
        // flame tongues: mostly from the top and sides, some from inside
        emit(200 * I * A, () => {
          let x: number, y: number, inner = false;
          if (r() < 0.87 || f.hasShape) { const p = rimPoint(2.7, 0.85, 1.07); x = p.x; y = p.y; }
          else { const p = edgePoint(0.2); x = p.x; y = p.y; inner = true; }
          return { k: 'f', x, y, inner, vx: (r() - 0.5) * u * 4 - tgt.vx * 0.08,
            vy: -(u * 8 + r() * u * 10) - tgt.vy * 0.08, life: 0, max: 0.4 + r() * 0.45,
            s: u * (inner ? 1.4 : 2.2) * (1 + r()), seed: r() * 100 };
        });
        emit(22 * I * A, () => {
          const p = edgePoint(0.3);
          return { k: 'e', x: p.x, y: p.y - tgt.ry * 0.3, vx: (r() - 0.5) * u * 6, vy: -(u * 14 + r() * u * 16),
            life: 0, max: 0.9 + r() * 0.9, s: u * (0.1 + r() * 0.1), seed: r() * 100 };
        });
        emit(14 * I * Math.min(2, A), () => ({ k: 'm',
          x: tgt.x + (r() - 0.5) * tgt.rx * 1.1, y: tgt.y - tgt.ry * 0.9 - u * 4,
          vx: (r() - 0.5) * u * 4, vy: -(u * 5 + r() * u * 5), life: 0, max: 1.2 + r() * 0.9,
          s: u * (2.5 + r() * 2), seed: r() * 100 }));
      } else if (fx === 'aura') {
        // wisps ride the outline (stored relative to the target, so the aura sticks to the body)
        emit(75 * I * A, () => {
          const p = rimPoint(2.3, 0.92, 1.12);
          return { k: 'w', ox: p.x - tgt.x, oy: p.y - tgt.y, out: p.out, rise: u * (8 + r() * 9), life: 0, max: 0.35 + r() * 0.4,
            len: u * (3 + r() * 3), wid: u * (0.9 + r() * 0.9), seed: r() * 100 };
        });
        emit(18 * I * A, () => {
          const p = rimPoint(2.6, 0.95, 1.2);
          return { k: 'g', ox: p.x - tgt.x, oy: p.y - tgt.y, rise: u * (14 + r() * 14), life: 0, max: 0.5 + r() * 0.6,
            s: u * (0.09 + r() * 0.1), seed: r() * 100 };
        });
      } else if (fx === 'sparks') {
        emit(80 * I * A, () => {
          const p = edgePoint(0.8), sp = u * (22 + r() * 45);
          return { k: 's', x: p.x, y: p.y, vx: Math.cos(p.a) * sp - tgt.vx * 0.15, vy: Math.sin(p.a) * sp - u * 12 - tgt.vy * 0.15, life: 0, max: 0.35 + r() * 0.5 };
        });
      } else if (fx === 'lightning') {
        // each bolt lives a few frames; strikes are decided per frame, so they don't depend on history
        this.bolts = this.bolts.filter(b => time - b.born < b.life);
        if (r() < Math.min(0.9, 0.45 * I)) {
          this.flash = 1;
          const n = 1 + Math.round(r() * 2 * I * Math.min(2, A)), life = 0.05 + r() * 0.1;
          for (let i = 0; i < n; i++) {
            const p = edgePoint(0.85);
            // some arcs crawl across the object to another nearby point of its outline
            if (f.hasShape && r() < 0.4) {
              let hit = false;
              for (let k = 0; k < 6 && !hit; k++) {
                const j = ((r() * f.n) | 0) * 4, qx = f.contour[j], qy = f.contour[j + 1], d = Math.hypot(qx - p.x, qy - p.y);
                if (d > u * 3 && d < u * 12) { makeBolt(r, p.x, p.y, qx, qy, time, life, this.bolts); hit = true; }
              }
              if (hit) continue;
            }
            const ang = p.a + (r() - 0.5) * 0.9, len = u * (6 + r() * 10);
            makeBolt(r, p.x, p.y, p.x + Math.cos(ang) * len, p.y + Math.sin(ang) * len, time, life, this.bolts);
          }
        } else this.flash *= 0.4;
        emit(25 * I, () => { const p = edgePoint(0.9), sp = u * (18 + r() * 30);
          return { k: 's', x: p.x, y: p.y, vx: Math.cos(p.a) * sp, vy: Math.sin(p.a) * sp, life: 0, max: 0.2 + r() * 0.3 }; });
      }
    }
    if (!tgt.active || fx !== 'lightning') this.bolts = [];

    // dead particles are removed in place keeping birth order: the drawing order must not depend
    // on particles from before the rebuild window, or the rounding of blended pixels would
    let alive = 0;
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i]; p.life += dt;
      if (p.life >= p.max) continue;
      parts[alive++] = p;
      switch (p.k) {
        case 'f': // buoyant, swaying, drawn toward the centerline so tongues meet in a peak
          p.vx += (noise(time * 2 + p.life * 3, p.seed) * u * 30 + (tgt.x - p.x) * 0.5) * dt;
          p.vx *= 0.97; p.vy -= u * 14 * dt;
          p.x += p.vx * dt; p.y += p.vy * dt; break;
        case 'e':
          p.vx += noise(time * 3, p.seed) * u * 40 * dt; p.vx *= 0.98; p.vy -= u * 2 * dt;
          p.x += p.vx * dt; p.y += p.vy * dt; break;
        case 'm':
          p.vx += noise(time, p.seed) * u * 6 * dt; p.x += p.vx * dt; p.y += p.vy * dt; break;
        case 'w':
          p.oy -= p.rise * dt; p.ox += (p.out * u * 3 + noise(time * 3, p.seed) * u * 6) * dt; break;
        case 'g':
          p.oy -= p.rise * dt; p.ox += noise(time * 2, p.seed) * u * 5 * dt; break;
        case 's':
          p.vy += u * 60 * dt; p.vx *= 0.985; p.x += p.vx * dt; p.y += p.vy * dt; break;
      }
    }
    parts.length = alive;
  }

  draw(ctx: Ctx2D, f: FxFrame, s: FxSettings, layers: Layers) {
    const { maskGlow } = layers;
    const { tgt } = f, parts = this.parts;
    if (!tgt.active && !parts.length) return;
    const r = rngFor(this.seed ^ 0x5bd1e995, frameKey(f)), time = f.t;
    const pal = PALETTES[s.pal].c, u = unit(tgt, s), I = s.intensity, fx = s.effect;
    const glow = (col: string, rx: number, ry: number, alpha: number) => {
      ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
      ctx.drawImage(sprite(col), tgt.x - rx, tgt.y - ry, rx * 2, ry * 2);
    };
    ctx.save();

    if (fx === 'fire') {
      // smoke first, normal blending, very soft
      ctx.globalCompositeOperation = 'source-over';
      for (const p of parts) if (p.k === 'm') {
        const g = p.life / p.max, sz = p.s * (0.7 + g * 1.4);
        ctx.globalAlpha = Math.min(1, g * 5) * (1 - g) * 0.07 * Math.min(1.5, I);
        ctx.drawImage(sprite('#2a2528'), p.x - sz, p.y - sz, sz * 2, sz * 2);
      }
      ctx.globalCompositeOperation = 'lighter';
      const flick = 0.85 + 0.15 * noise(time * 4, 1);
      if (tgt.active && f.hasShape) {
        maskGlow(ctx, pal[2], u * 2.6, 0.75 * I * flick);
        ctx.globalCompositeOperation = 'lighter';
      } else if (tgt.active) {
        glow(pal[2], tgt.rx * 1.5, tgt.ry * 1.65, 0.14 * I * flick);
        ctx.globalAlpha = Math.min(1, 0.4 * I * flick);
        ctx.drawImage(ringSprite(pal[2]), tgt.x - tgt.rx * 1.3, tgt.y - tgt.ry * 1.3, tgt.rx * 2.6, tgt.ry * 2.6);
      }
      // GPU flames when available; otherwise particle tongues: outer body, then a hotter inner pass
      const shaded = tgt.active && !!layers.fire?.(ctx, f, u, I);
      ctx.globalCompositeOperation = 'lighter';
      if (!shaded) for (const p of parts) if (p.k === 'f') {
        const g = p.life / p.max, grow = g < 0.25 ? 0.55 + g * 1.8 : 1 - (g - 0.25) * 0.9;
        const w = p.s * grow, h = w * (2.2 + Math.min(1.5, Math.hypot(p.vx, p.vy) / (u * 25)));
        ctx.globalAlpha = Math.pow(1 - g, 1.3) * (p.inner ? 0.25 : 0.62);
        drawTongue(ctx, flameSprite(fireCol(pal, g)), p.x, p.y, p.vx, p.vy, w, h);
      }
      if (!shaded) for (const p of parts) if (p.k === 'f' && p.life / p.max < 0.35) {
        const g = p.life / p.max, w = p.s * 0.45;
        ctx.globalAlpha = (1 - g / 0.35) * 0.5;
        drawTongue(ctx, flameSprite(pal[0]), p.x, p.y, p.vx, p.vy, w, w * 2.4);
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      for (const p of parts) if (p.k === 'e') {
        const g = p.life / p.max, sz = p.s * (1 - g * 0.5);
        ctx.globalAlpha = (1 - g) * (0.55 + 0.45 * Math.sin(time * 25 + p.seed));
        ctx.drawImage(sprite(g < 0.4 ? pal[1] : pal[2]), p.x - sz * 3, p.y - sz * 3, sz * 6, sz * 6);
      }
    } else if (fx === 'aura') {
      ctx.globalCompositeOperation = 'lighter';
      const pulse = 1 + 0.05 * Math.sin(time * 5) + 0.03 * noise(time * 3, 7);
      const rx = tgt.rx * 1.32 * pulse, ry = tgt.ry * 1.32 * pulse;
      // soft wide halo, then a crisp rim; the middle stays clear so the subject isn't washed out
      if (tgt.active && f.hasShape) {
        maskGlow(ctx, pal[2], u * 5 * pulse, 0.95 * I);
        maskGlow(ctx, pal[1], u * 1.6 * pulse, 1.0 * I);
        ctx.globalCompositeOperation = 'lighter';
      } else if (tgt.active) {
        ctx.globalAlpha = Math.min(1, 0.35 * I); ctx.drawImage(ringSprite(pal[2]), tgt.x - rx * 1.25, tgt.y - ry * 1.25, rx * 2.5, ry * 2.5);
        ctx.globalAlpha = Math.min(1, 0.7 * I); ctx.drawImage(ringSprite(pal[1]), tgt.x - rx, tgt.y - ry, rx * 2, ry * 2);
      }
      for (const p of parts) if (p.k === 'w') {
        const g = p.life / p.max, x = tgt.x + p.ox, y = tgt.y + p.oy;
        const sway = noise(time * 3, p.seed) * 0.35;
        const w = p.wid * (1 - g * 0.4), h = p.len * (0.7 + g * 0.9);
        ctx.globalAlpha = Math.sin(g * Math.PI) * 0.75;
        drawTongue(ctx, flameSprite(g < 0.3 ? pal[0] : g < 0.65 ? pal[1] : pal[2]), x, y, sway + p.out * 0.25, -1, w, h);
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      for (const p of parts) if (p.k === 'g') {
        const g = p.life / p.max, sz = p.s, x = tgt.x + p.ox, y = tgt.y + p.oy;
        ctx.globalAlpha = Math.sin(g * Math.PI) * (0.6 + 0.4 * Math.sin(time * 20 + p.seed));
        ctx.drawImage(sprite(pal[1]), x - sz * 3, y - sz * 3, sz * 6, sz * 6);
      }
    } else if (fx === 'lightning') {
      ctx.globalCompositeOperation = 'lighter';
      const fl = this.flash, W = ctx.canvas.width, H = ctx.canvas.height;
      if (tgt.active && f.hasShape) { maskGlow(ctx, pal[2], u * 3, (0.3 + fl * 0.6 + r() * 0.1) * I); ctx.globalCompositeOperation = 'lighter'; }
      else if (tgt.active) glow(pal[2], tgt.rx * 1.6, tgt.ry * 1.6, (0.15 + fl * 0.3) * I);
      // the whole scene lights up for a moment with each strike
      if (fl > 0.3) { ctx.globalAlpha = Math.min(0.2, 0.07 * fl * I); ctx.fillStyle = pal[2]; ctx.fillRect(0, 0, W, H); }
      if (this.bolts.length) {
        // colored channel on a layer, bloomed for the glow, then white-hot cores on top
        if (!this.layer || this.layer[0].width !== W || this.layer[0].height !== H) {
          const c = new OffscreenCanvas(W, H); this.layer = [c, c.getContext('2d') as OffscreenCanvasRenderingContext2D];
        }
        const [lc, g] = this.layer;
        g.clearRect(0, 0, W, H); g.lineJoin = 'round'; g.lineCap = 'round'; g.strokeStyle = pal[1];
        const path = (c: Ctx2D, pts: number[]) => { c.beginPath(); c.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]); };
        const fade = (b: Bolt) => Math.max(0, 1 - (time - b.born) / b.life * 0.7) * (0.75 + r() * 0.25);
        for (const b of this.bolts) { g.globalAlpha = fade(b); g.lineWidth = Math.max(1.5, u * 0.22 * b.w); path(g, b.pts); g.stroke(); }
        ctx.globalAlpha = 0.9; ctx.drawImage(lc, 0, 0);
        bloom(ctx, lc, Math.min(1, 0.8 * I), [2, 6, 18]);
        bloom(ctx, lc, Math.min(1, 0.6 * I), [40]);
        ctx.lineJoin = 'miter'; ctx.lineCap = 'round'; ctx.strokeStyle = pal[0];
        for (const b of this.bolts) { ctx.globalAlpha = fade(b); ctx.lineWidth = Math.max(0.8, u * 0.06 * b.w); path(ctx, b.pts); ctx.stroke(); }
      }
    }
    if (fx === 'sparks' || fx === 'lightning') {
      ctx.globalCompositeOperation = 'lighter';
      for (const p of parts) if (p.k === 's') {
        const g = p.life / p.max;
        ctx.globalAlpha = 1 - g; ctx.strokeStyle = g < 0.4 ? pal[0] : pal[1]; ctx.lineWidth = Math.max(1, u * 0.28);
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.035, p.y - p.vy * 0.035); ctx.stroke();
      }
    }
    ctx.restore();
  }
}

const unit = (tgt: Target, s: FxSettings) => Math.max(3, Math.sqrt(tgt.rx * tgt.ry) / 6) * s.size;
const areaMul = (tgt: Target) => Math.max(0.6, Math.min(3.5, Math.sqrt(tgt.rx * tgt.ry) / 45));
// randomness is keyed on the frame's timestamp, which doesn't change between analyses
const frameKey = (f: FxFrame) => Math.round(f.t * 1000);
