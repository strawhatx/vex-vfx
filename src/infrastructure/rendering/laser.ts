// Drawing a laser beam along its path on screen: layers from a wide soft haze to a white-hot core,
// flickering a little, each as wide as the beam is at that point (so one coming at the camera
// swells), with a flare where it leaves its source and a brighter one where it hits a target. A
// function of the frame's time only, so every frame draws the same whether playing, scrubbing or
// exporting.
import type { BeamPoint } from '@/domain/effects/laser';
import type { Pt } from '@/domain/tracking/bodyParts';
import { mulberry32 } from './rng';
import { rgba, type Ctx2D } from './sprites';

// how wide each layer is (times the beam's width), its color (index into the palette, or white),
// how opaque, and how much it's blurred
const LAYERS = [
  { w: 4.5, col: 2, alpha: 0.22, blur: 3 }, // haze
  { w: 2.4, col: 2, alpha: 0.55, blur: 1.5 }, // glow
  { w: 1.5, col: 1, alpha: 0.85, blur: 0 }, // beam
  { w: 0.75, col: -1, alpha: 1, blur: 0 }, // white-hot core
];
// a beam coming at the camera stops swelling at this many times its width
const MAX_SWELL = 3.5;

// path: from the source; width: the beam's width at its source, in output pixels; colors: hottest
// to coolest; hits: whether it ends on a target
export function drawBeam(
  ctx: Ctx2D,
  path: BeamPoint[],
  width: number,
  colors: readonly string[],
  intensity: number,
  t: number,
  seed: number,
  hits: boolean,
) {
  const flick = 0.85 + 0.1 * Math.sin(t * 61 + seed) + 0.05 * Math.sin(t * 173 + seed * 2.7);
  const I = Math.min(1.6, intensity);
  const pts = path.map(p => ({ ...p, w: Math.min(MAX_SWELL, p.w) }));
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'lighter';
  for (const layer of LAYERS) {
    const col = layer.col < 0 ? '#ffffff' : colors[layer.col];
    ctx.shadowColor = layer.blur ? rgba(col, Math.min(1, layer.alpha * I)) : 'transparent';
    ctx.shadowBlur = width * layer.blur * 2;
    // the outer layers thin out where the beam swells towards the camera, so it doesn't turn into a
    // flat disc over everything
    const swell = layer.blur ? Math.sqrt(Math.max(...pts.map(p => p.w))) : 1;
    ctx.fillStyle = rgba(col, Math.min(1, (layer.alpha * I * flick) / swell));
    fillStrip(ctx, pts, Math.max(0.8, width * layer.w * flick));
  }
  ctx.shadowBlur = 0;
  ctx.shadowColor = 'transparent';
  flare(ctx, pts[0], width * 2.5 * flick, colors, 0.8 * I);
  const end = pts[pts.length - 1];
  if (hits) flare(ctx, end, width * 4.5 * end.w * (0.9 + 0.2 * Math.sin(t * 37 + seed)), colors, I);
  ctx.restore();
}

// the beam as one filled shape: `width` wide (times each point's w) along the path, with round ends
function fillStrip(ctx: Ctx2D, pts: BeamPoint[], width: number) {
  const left: Pt[] = [];
  const right: Pt[] = [];
  for (let k = 0; k < pts.length; k++) {
    // the path's direction here, from its neighbours
    const a = pts[Math.max(0, k - 1)];
    const b = pts[Math.min(pts.length - 1, k + 1)];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < 1e-6) continue;
    const nx = -(b.y - a.y) / len;
    const ny = (b.x - a.x) / len;
    const r = (width * pts[k].w) / 2;
    left.push({ x: pts[k].x + nx * r, y: pts[k].y + ny * r });
    right.push({ x: pts[k].x - nx * r, y: pts[k].y - ny * r });
  }
  ctx.beginPath();
  if (left.length > 1) {
    // wound the same way round as the end circles, so where they overlap they add up rather than cancel
    const outline = [...left, ...right.reverse()];
    let area = 0;
    for (let k = 0; k < outline.length; k++) {
      const p = outline[k];
      const n = outline[(k + 1) % outline.length];
      area += p.x * n.y - n.x * p.y;
    }
    if (area < 0) outline.reverse();
    ctx.moveTo(outline[0].x, outline[0].y);
    for (const p of outline) ctx.lineTo(p.x, p.y);
    ctx.closePath();
  }
  // round ends (all there is of a beam coming straight at the camera)
  for (const p of [pts[0], pts[pts.length - 1]]) {
    ctx.moveTo(p.x + (width * p.w) / 2, p.y);
    ctx.arc(p.x, p.y, (width * p.w) / 2, 0, Math.PI * 2);
  }
  ctx.fill('nonzero');
}

function flare(ctx: Ctx2D, p: Pt, r: number, colors: readonly string[], alpha: number) {
  const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, Math.max(1, r));
  g.addColorStop(0, rgba('#ffffff', Math.min(1, alpha)));
  g.addColorStop(0.25, rgba(colors[1], 0.8 * alpha));
  g.addColorStop(0.6, rgba(colors[2], 0.3 * alpha));
  g.addColorStop(1, rgba(colors[3], 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(p.x, p.y, Math.max(1, r), 0, Math.PI * 2);
  ctx.fill();
}

// an eye blazing, as in the comics: a white-hot glare with jagged red spikes bursting out of it,
// flickering. r: its size (output pixels); seed: keeps each eye's spikes its own.
export function drawEyeBurst(
  ctx: Ctx2D,
  p: Pt,
  r: number,
  colors: readonly string[],
  intensity: number,
  t: number,
  seed: number,
) {
  const I = Math.min(1.6, intensity);
  const rand = mulberry32(seed);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'lighter';

  // the glow around it
  flare(ctx, p, r * 2.2, colors, 0.9 * I);

  // spikes: a ring of thin shards of different lengths, each flickering on its own
  const SPIKES = 16;
  const turn = rand() * Math.PI * 2;
  for (let k = 0; k < SPIKES; k++) {
    const a = turn + (k / SPIKES) * Math.PI * 2 + (rand() - 0.5) * 0.35;
    const long = rand() < 0.3;
    const flick = 0.6 + 0.4 * Math.abs(Math.sin(t * (9 + rand() * 14) + rand() * 6));
    const len = r * (long ? 2.4 + rand() * 1.6 : 1.1 + rand() * 0.9) * flick;
    const half = r * (long ? 0.13 : 0.09) * (0.7 + rand() * 0.6);
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const g = ctx.createLinearGradient(p.x, p.y, p.x + ca * len, p.y + sa * len);
    g.addColorStop(0, rgba('#ffffff', Math.min(1, 0.95 * I)));
    g.addColorStop(0.25, rgba(colors[1], Math.min(1, 0.9 * I)));
    g.addColorStop(0.7, rgba(colors[2], 0.6 * I));
    g.addColorStop(1, rgba(colors[3], 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(p.x - sa * half, p.y + ca * half);
    ctx.lineTo(p.x + ca * len, p.y + sa * len);
    ctx.lineTo(p.x + sa * half, p.y - ca * half);
    ctx.closePath();
    ctx.fill();
  }

  // the white-hot middle
  const core = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 0.7);
  core.addColorStop(0, rgba('#ffffff', 1));
  core.addColorStop(0.5, rgba('#ffffff', Math.min(1, 0.8 * I)));
  core.addColorStop(1, rgba(colors[1], 0));
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.arc(p.x, p.y, r * 0.7, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
