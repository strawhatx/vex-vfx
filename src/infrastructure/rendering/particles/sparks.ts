// Sparks: streaks thrown off the object's edge that fall with gravity. Lightning throws some too.
import type { Emitter } from './emitter';
import type { Painter } from './painter';

export function emitSparks(e: Emitter) {
  const { r, tgt, u, I, A } = e;
  e.emit(80 * I * A, () => {
    const p = e.edgePoint(0.8);
    const sp = u * (22 + r() * 45);
    return {
      k: 's',
      x: p.x,
      y: p.y,
      vx: Math.cos(p.a) * sp - tgt.vx * 0.15,
      vy: Math.sin(p.a) * sp - u * 12 - tgt.vy * 0.15,
      life: 0,
      max: 0.35 + r() * 0.5,
    };
  });
}

export function drawSparks(p: Painter) {
  const { ctx, parts, pal, u } = p;
  ctx.globalCompositeOperation = 'lighter';
  for (const q of parts) {
    if (q.k !== 's') continue;
    const g = q.life / q.max;
    ctx.globalAlpha = 1 - g;
    ctx.strokeStyle = g < 0.4 ? pal[0] : pal[1];
    ctx.lineWidth = Math.max(1, u * 0.28);
    ctx.beginPath();
    ctx.moveTo(q.x, q.y);
    ctx.lineTo(q.x - q.vx * 0.035, q.y - q.vy * 0.035);
    ctx.stroke();
  }
}
