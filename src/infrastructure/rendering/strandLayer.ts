// Paths: a strand (see domain/effects/strands) drawn in its look. Where it is at each frame comes
// from simulating it over the clip's range from its anchor, worked out once and kept on the layer
// until something it depends on changes:
//   - the anchor: the tapped spot on its object (carried along with the object's box), or for a
//     drawn path its first point, carried along with the camera
//   - its far end, if held: the tapped spot on another clip's object, or a spot in the scene
// Then it's smoothed into a ribbon, and drawn: glowing (neon, energy), as lightning, solid, or by
// the particle effects (fire, sparks, aura) coming off it.
import { PALETTES, type FxSettings } from '@/domain/effects/palettes';
import {
  particleLook,
  simulate,
  widthAt,
  type StrandFrame,
  type StrandInput,
} from '@/domain/effects/strands';
import type { GpuFire } from './fire';
import type { Layer } from './layer';
import type { MaskPainter } from './masks';
import type { FxFrame } from './particles/types';
import { rngFor } from './rng';
import type { Ctx2D } from './sprites';
import { sceneSpotAt, tapAt, type View } from './view';

type Pt = { x: number; y: number };
// a point along the smoothed strand: where, how far along (0 anchor .. 1 tip), which way is
// sideways, and how wide it is there
type Sample = { x: number; y: number; u: number; nx: number; ny: number; w: number };

// the strand's width at the anchor, in frame heights, at Size 1
const WIDTH = 0.018;
const MAX_CONTOUR = 600;

export class StrandPainter {
  private mask: OffscreenCanvas;
  private mctx: OffscreenCanvasRenderingContext2D;

  constructor(
    private CW: number,
    private CH: number,
  ) {
    this.mask = new OffscreenCanvas(Math.max(1, CW >> 1), Math.max(1, CH >> 1));
    this.mctx = this.mask.getContext('2d') as OffscreenCanvasRenderingContext2D;
  }

  // key: changes whenever anything the strand depends on might have (track data, the camera)
  draw(
    v: View,
    l: Layer,
    idx: number,
    layers: ReadonlyMap<number, Layer>,
    key: string,
    fx: { masks: MaskPainter; fire: GpuFire },
  ) {
    const all = strandFrames(v, l, layers, key);
    const at = (i: number) => all.frames[i - all.from] ?? null;
    const f = at(idx);
    const s = l.spec.settings,
      st = s.strand;
    const base = v.CH * WIDTH * s.size;
    const samples = f && smooth(f.pts, st.form, base);

    const particles = particleLook(st.look);
    if (particles) {
      // the particle effects come off the strand as if it were an object's outline
      const eff: FxSettings = { ...s, effect: particles };
      const frameAt = (i: number) => fxFrame(v, i, at(i), st.form, v.CH * WIDTH);
      l.advanceTo(idx, v.shot, frameAt, eff);
      if (!samples) return;
      this.paintMask(samples);
      const ctx = v.ctx;
      l.sim.draw(ctx, frameAt(idx), eff, {
        maskGlow: (c, col, blur, alpha) => fx.masks.glow(this.mask, c, col, blur, alpha),
        fire: (c, fr, u, intensity) => fx.fire.draw(c, this.mask, fr, u, intensity, s.pal),
      });
      // the strand itself shows through: a fuse for sparks, a soft line for aura
      if (st.look !== 'fire') glow(ctx, samples, s, st.look === 'sparks' ? 0.5 : 0.35, 0.6);
      return;
    }
    if (!samples) return;
    const ctx = v.ctx;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const t = v.clip[idx].t;
    if (st.look === 'neon') glow(ctx, samples, s, 1, 1);
    else if (st.look === 'energy') energy(ctx, samples, s, t);
    else if (st.look === 'lightning')
      lightning(ctx, samples, s, rngFor(l.spec.id * 97 + 11, Math.round(t * 1000)));
    else solid(ctx, samples, s);
    // a whip cracks: a flash at its tip when it goes fast enough
    if (st.form === 'whip' && f!.tip > 3) crack(ctx, samples[samples.length - 1], base, f!.tip, s);
    ctx.restore();
  }

  // the strand, filled white, on the half-size mask the fire and glow draw from
  private paintMask(samples: Sample[]) {
    const g = this.mctx,
      k = this.mask.width / this.CW;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, this.mask.width, this.mask.height);
    g.setTransform(k, 0, 0, k, 0, 0);
    g.fillStyle = '#fff';
    ribbon(g, samples, 1);
    g.fill();
  }
}

// ---------- the strand's motion ----------

// the strand at each frame of the clip's range, simulated once and kept until `key` changes
function strandFrames(v: View, l: Layer, layers: ReadonlyMap<number, Layer>, key: string) {
  if (l.strand?.key === key) return l.strand;
  const { range, frames, tap, path } = l.spec;
  const clip = v.clip;
  let from = 0;
  while (from < clip.length && clip[from].t < range.s - 1e-6) from++;
  let to = from;
  while (to < clip.length && clip[to].t < range.e - 1e-6) to++;

  const drawn = path?.drawn ?? null;
  const p0 = drawn?.pts[0];
  const anchorAt = (i: number): Pt | null => {
    if (drawn && p0) return sceneSpotAt(v, { i: drawn.i, x: p0.x, y: p0.y }, i);
    const sh = frames[i]?.shapes[0];
    if (!sh) return null;
    return (tap && tapAt(v, frames, tap, i)) ?? { x: sh.cx * v.q, y: sh.cy * v.q };
  };
  const end = path?.end ?? null;
  const endAt = (i: number): Pt | null => {
    if (!end) return null;
    if (end.clip === null) return sceneSpotAt(v, end, i);
    const other = layers.get(end.clip)?.spec.frames;
    return other?.[i]?.shapes[0] ? tapAt(v, other, end, i) : null;
  };

  const inputs: StrandInput[] = [];
  for (let i = from; i < to; i++) {
    const prev = clip[i - 1];
    inputs.push({
      at: anchorAt(i),
      end: endAt(i),
      t: clip[i].t,
      dt: prev && i > from ? clip[i].t - prev.t : clip[i].dur || 1 / 30,
      u: to - from > 1 ? (i - from) / (to - from - 1) : 1,
      restart: i === from || v.shot[i] !== v.shot[i - 1],
    });
  }
  const shape = drawn && p0 && drawn.pts.map(p => ({ x: (p.x - p0.x) * v.q, y: (p.y - p0.y) * v.q }));
  l.strand = { key, from, frames: simulate(inputs, l.spec.settings.strand, shape ?? null, v.CH) };
  return l.strand;
}

// ---------- the ribbon ----------

// the strand's points smoothed into a curve (Catmull-Rom, a few samples a link), each with its width
function smooth(pts: readonly Pt[], form: FxSettings['strand']['form'], base: number): Sample[] {
  const out: Sample[] = [];
  const n = pts.length;
  if (n < 2) return out;
  const P = (k: number) => pts[Math.max(0, Math.min(n - 1, k))];
  const STEPS = 3;
  for (let k = 0; k < n - 1; k++) {
    const a = P(k - 1),
      b = P(k),
      c = P(k + 1),
      d = P(k + 2);
    for (let j = 0; j < STEPS || (k === n - 2 && j === STEPS); j++) {
      const s = j / STEPS,
        s2 = s * s,
        s3 = s2 * s;
      const x =
        0.5 *
        (2 * b.x +
          (-a.x + c.x) * s +
          (2 * a.x - 5 * b.x + 4 * c.x - d.x) * s2 +
          (-a.x + 3 * b.x - 3 * c.x + d.x) * s3);
      const y =
        0.5 *
        (2 * b.y +
          (-a.y + c.y) * s +
          (2 * a.y - 5 * b.y + 4 * c.y - d.y) * s2 +
          (-a.y + 3 * b.y - 3 * c.y + d.y) * s3);
      out.push({ x, y, u: 0, nx: 0, ny: 0, w: 0 });
    }
  }
  const m = out.length;
  for (let k = 0; k < m; k++) {
    const p = out[Math.max(0, k - 1)],
      q = out[Math.min(m - 1, k + 1)];
    const dx = q.x - p.x,
      dy = q.y - p.y,
      len = Math.hypot(dx, dy) || 1;
    const o = out[k];
    o.nx = -dy / len;
    o.ny = dx / len;
    o.u = k / Math.max(1, m - 1);
    o.w = base * widthAt(form, o.u);
  }
  return out;
}

// the ribbon's outline as a path on g, `mul` times as wide
function ribbon(g: Ctx2D, S: readonly Sample[], mul: number) {
  g.beginPath();
  for (let k = 0; k < S.length; k++) {
    const s = S[k],
      h = (s.w * mul) / 2;
    if (k) g.lineTo(s.x + s.nx * h, s.y + s.ny * h);
    else g.moveTo(s.x + s.nx * h, s.y + s.ny * h);
  }
  for (let k = S.length - 1; k >= 0; k--) {
    const s = S[k],
      h = (s.w * mul) / 2;
    g.lineTo(s.x - s.nx * h, s.y - s.ny * h);
  }
  g.closePath();
  // round ends
  for (const s of [S[0], S[S.length - 1]]) {
    g.moveTo(s.x + (s.w * mul) / 2, s.y);
    g.arc(s.x, s.y, (s.w * mul) / 2, 0, Math.PI * 2);
  }
}

// ---------- looks ----------

// glowing: a wide soft halo, a colored body and a hot core, added onto the picture
function glow(ctx: Ctx2D, S: readonly Sample[], s: FxSettings, widthMul: number, alpha: number) {
  const c = PALETTES[s.pal].c,
    I = Math.min(1.5, s.intensity) * alpha;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'lighter';
  const layers: [string, number, number, number][] = [
    [c[3], 3.6, 0.3, 4],
    [c[2], 1.8, 0.45, 1.2],
    [c[1], 1, 0.9, 0],
    [c[0], 0.4, 1, 0],
  ];
  const w = S[0]?.w ?? 1;
  for (const [col, mul, a, blur] of layers) {
    ctx.globalAlpha = Math.min(1, a * I);
    ctx.fillStyle = col;
    ctx.shadowColor = col;
    ctx.shadowBlur = blur * w;
    ribbon(ctx, S, mul * widthMul);
    ctx.fill();
  }
  ctx.restore();
}

// neon that surges: the width swells in waves running along it, with bright pulses riding out
function energy(ctx: Ctx2D, S: readonly Sample[], s: FxSettings, t: number) {
  const surging = S.map(p => ({ ...p, w: p.w * (1 + 0.35 * Math.sin(p.u * 18 - t * 9)) }));
  glow(ctx, surging, s, 1, 1);
  const c = PALETTES[s.pal].c;
  ctx.globalCompositeOperation = 'lighter';
  for (let m = 0; m < 3; m++) {
    const u = (t * 0.9 + m / 3) % 1;
    const p = S[Math.min(S.length - 1, Math.round(u * (S.length - 1)))];
    const r = Math.max(2, p.w * 2.4);
    const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
    g.addColorStop(0, c[0]);
    g.addColorStop(0.35, c[1]);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = Math.min(1, 0.8 * s.intensity);
    ctx.fillStyle = g;
    ctx.fillRect(p.x - r, p.y - r, r * 2, r * 2);
  }
}

// crackling bolts along it, new every frame, with branches forking off
function lightning(ctx: Ctx2D, S: readonly Sample[], s: FxSettings, r: () => number) {
  const c = PALETTES[s.pal].c,
    I = Math.min(1.5, s.intensity);
  glow(ctx, S, s, 2.2, 0.35);
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  const bolt = (pts: Pt[], width: number, alpha: number) => {
    ctx.globalAlpha = Math.min(1, alpha * I);
    ctx.shadowColor = c[1];
    ctx.shadowBlur = width * 4;
    ctx.strokeStyle = c[0];
    ctx.lineWidth = width;
    ctx.beginPath();
    pts.forEach((p, k) => (k ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.stroke();
  };
  for (let k = 0; k < 2; k++) {
    const pts = S.filter((_, j) => j % 2 === 0 || j === S.length - 1).map(p => {
      const off = (r() - 0.5) * p.w * 2.4 * (0.4 + p.u);
      return { x: p.x + p.nx * off, y: p.y + p.ny * off };
    });
    bolt(pts, Math.max(1.5, S[0].w * (k ? 0.3 : 0.5)), k ? 0.7 : 1);
    // branches
    for (let b = 0; b < 3; b++) {
      const at = pts[Math.floor(r() * pts.length)];
      const side = r() < 0.5 ? -1 : 1,
        from = S[Math.min(S.length - 1, Math.floor(r() * S.length))];
      const branch = [at];
      let x = at.x,
        y = at.y;
      for (let j = 0; j < 4; j++) {
        x += (from.nx * side + (r() - 0.5)) * from.w * 1.2;
        y += (from.ny * side + (r() - 0.5)) * from.w * 1.2;
        branch.push({ x, y });
      }
      bolt(branch, Math.max(0.8, S[0].w * 0.12), 0.5);
    }
  }
}

// a plain strand, like a rope or a string: its color with a lighter streak along it
function solid(ctx: Ctx2D, S: readonly Sample[], s: FxSettings) {
  const c = PALETTES[s.pal].c;
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.fillStyle = c[2];
  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = (S[0]?.w ?? 2) * 0.8;
  ribbon(ctx, S, 1);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 0.7;
  ctx.fillStyle = c[1];
  ribbon(
    ctx,
    S.map(p => ({ ...p, x: p.x - p.nx * p.w * 0.18, y: p.y - p.ny * p.w * 0.18 })),
    0.3,
  );
  ctx.fill();
}

// the flash of a whip's crack, brighter the faster the tip
function crack(ctx: Ctx2D, tip: Sample, base: number, speed: number, s: FxSettings) {
  const c = PALETTES[s.pal].c;
  const k = Math.min(1, (speed - 3) / 5);
  const r = base * (2 + speed * 0.8);
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = k * Math.min(1, s.intensity);
  const g = ctx.createRadialGradient(tip.x, tip.y, 0, tip.x, tip.y, r);
  g.addColorStop(0, c[0]);
  g.addColorStop(0.3, c[1]);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(tip.x - r, tip.y - r, r * 2, r * 2);
}

// ---------- the particle effects ----------

// what the particle effects see of the strand at frame i: its edges as an outline, and a target
// the size of its thickness around its middle (so flames and sparks are sized to the strand, not
// to how long it is)
function fxFrame(
  v: View,
  i: number,
  f: StrandFrame,
  form: FxSettings['strand']['form'],
  base: number,
): FxFrame {
  const clip = v.clip,
    t = clip[i].t,
    prev = clip[i - 1];
  const dt = Math.max(
    0.001,
    Math.min(0.1, prev && v.shot[i - 1] === v.shot[i] ? t - prev.t : clip[i].dur || 1 / 30),
  );
  const contour = new Float32Array(MAX_CONTOUR * 4);
  if (!f) {
    return {
      index: i,
      t,
      dt,
      contour,
      n: 0,
      hasShape: false,
      tgt: { x: 0, y: 0, rx: 0, ry: 0, vx: 0, vy: 0, active: false },
    };
  }
  const S = smooth(f.pts, form, base);
  let n = 0;
  for (const s of S)
    for (const side of [1, -1]) {
      if (n >= MAX_CONTOUR) break;
      const h = (s.w / 2) * side;
      contour.set([s.x + s.nx * h, s.y + s.ny * h, s.nx * side, s.ny * side], n * 4);
      n++;
    }
  const mid = S[S.length >> 1];
  const r = Math.max(4, base * 5);
  return {
    index: i,
    t,
    dt,
    contour,
    n,
    hasShape: n > 8,
    tgt: { x: mid.x, y: mid.y, rx: r, ry: r, vx: 0, vy: 0, active: true },
  };
}
