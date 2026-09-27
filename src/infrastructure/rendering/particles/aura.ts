// Aura: a glowing halo hugging the object, with wisps rising off its outline and glints drifting up.
import { drawTongue, flameSprite, ringSprite, sprite } from '../sprites';
import type { Emitter } from './emitter';
import type { Painter } from './painter';
import { noise } from './types';

export function emitAura(e: Emitter) {
  const { r, tgt, u, I, A } = e;
  // wisps ride the outline (stored relative to the target, so the aura sticks to the body)
  e.emit(75 * I * A, () => {
    const p = e.rimPoint(2.3, 0.92, 1.12);
    return {
      k: 'w',
      ox: p.x - tgt.x,
      oy: p.y - tgt.y,
      out: p.out,
      rise: u * (8 + r() * 9),
      life: 0,
      max: 0.35 + r() * 0.4,
      len: u * (3 + r() * 3),
      wid: u * (0.9 + r() * 0.9),
      seed: r() * 100,
    };
  });
  e.emit(18 * I * A, () => {
    const p = e.rimPoint(2.6, 0.95, 1.2);
    return {
      k: 'g',
      ox: p.x - tgt.x,
      oy: p.y - tgt.y,
      rise: u * (14 + r() * 14),
      life: 0,
      max: 0.5 + r() * 0.6,
      s: u * (0.09 + r() * 0.1),
      seed: r() * 100,
    };
  });
}

export function drawAura(p: Painter) {
  const { ctx, f, tgt, parts, pal, u, I, time, layers } = p;
  ctx.globalCompositeOperation = 'lighter';
  const pulse = 1 + 0.05 * Math.sin(time * 5) + 0.03 * noise(time * 3, 7);
  const rx = tgt.rx * 1.32 * pulse;
  const ry = tgt.ry * 1.32 * pulse;

  // soft wide halo, then a crisp rim; the middle stays clear so the subject isn't washed out
  if (tgt.active && f.hasShape) {
    layers.maskGlow(ctx, pal[2], u * 5 * pulse, 0.95 * I);
    layers.maskGlow(ctx, pal[1], u * 1.6 * pulse, 1.0 * I);
    ctx.globalCompositeOperation = 'lighter';
  } else if (tgt.active) {
    ctx.globalAlpha = Math.min(1, 0.35 * I);
    ctx.drawImage(ringSprite(pal[2]), tgt.x - rx * 1.25, tgt.y - ry * 1.25, rx * 2.5, ry * 2.5);
    ctx.globalAlpha = Math.min(1, 0.7 * I);
    ctx.drawImage(ringSprite(pal[1]), tgt.x - rx, tgt.y - ry, rx * 2, ry * 2);
  }

  // wisps
  for (const q of parts) {
    if (q.k !== 'w') continue;
    const g = q.life / q.max;
    const sway = noise(time * 3, q.seed) * 0.35;
    const w = q.wid * (1 - g * 0.4);
    const h = q.len * (0.7 + g * 0.9);
    const col = g < 0.3 ? pal[0] : g < 0.65 ? pal[1] : pal[2];
    ctx.globalAlpha = Math.sin(g * Math.PI) * 0.75;
    drawTongue(ctx, flameSprite(col), tgt.x + q.ox, tgt.y + q.oy, sway + q.out * 0.25, -1, w, h);
  }

  // glints, twinkling
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  for (const q of parts) {
    if (q.k !== 'g') continue;
    const g = q.life / q.max;
    const sz = q.s;
    const x = tgt.x + q.ox;
    const y = tgt.y + q.oy;
    ctx.globalAlpha = Math.sin(g * Math.PI) * (0.6 + 0.4 * Math.sin(time * 20 + q.seed));
    ctx.drawImage(sprite(pal[1]), x - sz * 3, y - sz * 3, sz * 6, sz * 6);
  }
}
