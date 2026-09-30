// Aura's own drawing, under its wisps and glints (see sim.ts): a glowing halo hugging the object,
// breathing a little. The middle stays clear so the subject isn't washed out.
import { ringSprite } from '../sprites';
import type { Painter } from './painter';
import { noise } from './types';

export function drawAuraGlow(p: Painter) {
  const { ctx, f, tgt, pal, u, I, time, layers } = p;
  ctx.globalCompositeOperation = 'lighter';
  const pulse = 1 + 0.05 * Math.sin(time * 5) + 0.03 * noise(time * 3, 7);
  const rx = tgt.rx * 1.32 * pulse;
  const ry = tgt.ry * 1.32 * pulse;
  if (tgt.active && f.hasShape) {
    layers.maskGlow(ctx, pal[2], u * 5 * pulse, 0.95 * I);
    layers.maskGlow(ctx, pal[1], u * 1.6 * pulse, 1.0 * I);
  } else if (tgt.active) {
    ctx.globalAlpha = Math.min(1, 0.35 * I);
    ctx.drawImage(ringSprite(pal[2]), tgt.x - rx * 1.25, tgt.y - ry * 1.25, rx * 2.5, ry * 2.5);
    ctx.globalAlpha = Math.min(1, 0.7 * I);
    ctx.drawImage(ringSprite(pal[1]), tgt.x - rx, tgt.y - ry, rx * 2, ry * 2);
  }
  ctx.globalCompositeOperation = 'lighter';
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}
