// Fire's own drawing, round its particles (embers, smoke and, without the GPU, flame tongues: see
// sim.ts): the glow round the object, and the GPU flames rising off it.
import { ringSprite } from '../sprites';
import { targetGlow, type Painter } from './painter';
import { noise } from './types';

// the glow, then the GPU flames; false if there are none (no WebGL2, or no object), so the particle
// tongues are drawn instead
export function drawFireGlow(p: Painter) {
  const { ctx, f, tgt, pal, u, I, time, layers } = p;
  ctx.globalCompositeOperation = 'lighter';
  const flick = 0.85 + 0.15 * noise(time * 4, 1);
  if (tgt.active && f.hasShape) {
    layers.maskGlow(ctx, pal[2], u * 2.6, 0.75 * I * flick);
    ctx.globalCompositeOperation = 'lighter';
  } else if (tgt.active) {
    targetGlow(p, pal[2], tgt.rx * 1.5, tgt.ry * 1.65, 0.14 * I * flick);
    ctx.globalAlpha = Math.min(1, 0.4 * I * flick);
    ctx.drawImage(ringSprite(pal[2]), tgt.x - tgt.rx * 1.3, tgt.y - tgt.ry * 1.3, tgt.rx * 2.6, tgt.ry * 2.6);
  }
  const shaded = tgt.active && !!layers.fire?.(ctx, f, u, I);
  ctx.globalCompositeOperation = 'lighter';
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  return shaded;
}
