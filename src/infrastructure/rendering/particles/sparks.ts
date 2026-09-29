// Lightning's sparks: streaks thrown off the object that fall (the Sparks effect itself is an
// emitter: see sim.ts).
import type { Painter } from './painter';

export function drawSparks(p: Painter) {
  const { ctx, parts, pal, u } = p;
  ctx.globalCompositeOperation = 'lighter';
  for (const q of parts) {
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
