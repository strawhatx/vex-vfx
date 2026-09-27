// Fire: flame tongues from the top and sides of the object (or the GPU fire, where there is one),
// with rising embers and a little smoke.
import { drawTongue, flameSprite, ringSprite, sprite } from '../sprites';
import type { Emitter } from './emitter';
import { targetGlow, type Painter } from './painter';
import { noise } from './types';

// a flame's color as it ages (g: 0..1 of its life)
const fireCol = (pal: readonly string[], g: number) =>
  g < 0.12 ? pal[0] : g < 0.35 ? pal[1] : g < 0.65 ? pal[2] : pal[3];

export function emitFire(e: Emitter) {
  const { r, tgt, f, u, I, A } = e;
  // flame tongues: mostly from the top and sides, some from inside
  e.emit(200 * I * A, () => {
    let x: number;
    let y: number;
    let inner = false;
    if (r() < 0.87 || f.hasShape) {
      const p = e.rimPoint(2.7, 0.85, 1.07);
      x = p.x;
      y = p.y;
    } else {
      const p = e.edgePoint(0.2);
      x = p.x;
      y = p.y;
      inner = true;
    }
    return {
      k: 'f',
      x,
      y,
      inner,
      vx: (r() - 0.5) * u * 4 - tgt.vx * 0.08,
      vy: -(u * 8 + r() * u * 10) - tgt.vy * 0.08,
      life: 0,
      max: 0.4 + r() * 0.45,
      s: u * (inner ? 1.4 : 2.2) * (1 + r()),
      seed: r() * 100,
    };
  });
  // embers
  e.emit(22 * I * A, () => {
    const p = e.edgePoint(0.3);
    return {
      k: 'e',
      x: p.x,
      y: p.y - tgt.ry * 0.3,
      vx: (r() - 0.5) * u * 6,
      vy: -(u * 14 + r() * u * 16),
      life: 0,
      max: 0.9 + r() * 0.9,
      s: u * (0.1 + r() * 0.1),
      seed: r() * 100,
    };
  });
  // smoke, above the top
  e.emit(14 * I * Math.min(2, A), () => ({
    k: 'm',
    x: tgt.x + (r() - 0.5) * tgt.rx * 1.1,
    y: tgt.y - tgt.ry * 0.9 - u * 4,
    vx: (r() - 0.5) * u * 4,
    vy: -(u * 5 + r() * u * 5),
    life: 0,
    max: 1.2 + r() * 0.9,
    s: u * (2.5 + r() * 2),
    seed: r() * 100,
  }));
}

export function drawFire(p: Painter) {
  const { ctx, f, tgt, parts, pal, u, I, time, layers } = p;

  // smoke first, normal blending, very soft
  ctx.globalCompositeOperation = 'source-over';
  for (const q of parts) {
    if (q.k !== 'm') continue;
    const g = q.life / q.max;
    const sz = q.s * (0.7 + g * 1.4);
    ctx.globalAlpha = Math.min(1, g * 5) * (1 - g) * 0.07 * Math.min(1.5, I);
    ctx.drawImage(sprite('#2a2528'), q.x - sz, q.y - sz, sz * 2, sz * 2);
  }

  // the glow around the object
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

  // GPU flames when available; otherwise particle tongues: outer body, then a hotter inner pass
  const shaded = tgt.active && !!layers.fire?.(ctx, f, u, I);
  ctx.globalCompositeOperation = 'lighter';
  if (!shaded) {
    for (const q of parts) {
      if (q.k !== 'f') continue;
      const g = q.life / q.max;
      const grow = g < 0.25 ? 0.55 + g * 1.8 : 1 - (g - 0.25) * 0.9;
      const w = q.s * grow;
      const h = w * (2.2 + Math.min(1.5, Math.hypot(q.vx, q.vy) / (u * 25)));
      ctx.globalAlpha = Math.pow(1 - g, 1.3) * (q.inner ? 0.25 : 0.62);
      drawTongue(ctx, flameSprite(fireCol(pal, g)), q.x, q.y, q.vx, q.vy, w, h);
    }
    for (const q of parts) {
      if (q.k !== 'f' || q.life / q.max >= 0.35) continue;
      const g = q.life / q.max;
      const w = q.s * 0.45;
      ctx.globalAlpha = (1 - g / 0.35) * 0.5;
      drawTongue(ctx, flameSprite(pal[0]), q.x, q.y, q.vx, q.vy, w, w * 2.4);
    }
  }

  // embers, twinkling
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  for (const q of parts) {
    if (q.k !== 'e') continue;
    const g = q.life / q.max;
    const sz = q.s * (1 - g * 0.5);
    ctx.globalAlpha = (1 - g) * (0.55 + 0.45 * Math.sin(time * 25 + q.seed));
    ctx.drawImage(sprite(g < 0.4 ? pal[1] : pal[2]), q.x - sz * 3, q.y - sz * 3, sz * 6, sz * 6);
  }
}
