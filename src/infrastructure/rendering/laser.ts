// Drawing a laser beam: layers from a wide faint haze to a white-hot core, flickering a little,
// with a flare where it leaves its source and a brighter one where it hits a target. A function of
// the frame's time only, so every frame draws the same whether playing, scrubbing or exporting.
import type { Pt } from '@/domain/tracking/bodyParts';
import { rgba, type Ctx2D } from './sprites';

// colors: hottest to coolest; width: the core's width in output pixels; hits: whether it ends on a target
export function drawBeam(
  ctx: Ctx2D,
  a: Pt,
  b: Pt,
  width: number,
  colors: readonly string[],
  intensity: number,
  t: number,
  seed: number,
  hits: boolean,
) {
  const flick = 0.85 + 0.1 * Math.sin(t * 61 + seed) + 0.05 * Math.sin(t * 173 + seed * 2.7),
    I = Math.min(1.6, intensity);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  // haze, glow, beam, core; the wider layers blurred into a bloom
  for (const [w, col, al, blur] of [
    [8, colors[2], 0.22, 4],
    [3.5, colors[2], 0.55, 2],
    [1.8, colors[1], 0.85, 0],
    [0.7, '#ffffff', 1, 0],
  ] as const) {
    ctx.shadowColor = blur ? rgba(col, Math.min(1, al * I)) : 'transparent';
    ctx.shadowBlur = width * blur * 2;
    ctx.strokeStyle = rgba(col, Math.min(1, al * I * flick));
    ctx.lineWidth = Math.max(0.8, width * w * flick);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  ctx.shadowBlur = 0;
  ctx.shadowColor = 'transparent';
  flare(ctx, a, width * 4 * flick, colors, 0.8 * I);
  if (hits) flare(ctx, b, width * 7 * (0.9 + 0.2 * Math.sin(t * 37 + seed)), colors, I);
  ctx.restore();
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
