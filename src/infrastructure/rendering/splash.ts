// Drawing a splash impact: ripples spreading on the surface, a crown of water rising round the spot
// and falling back, droplets thrown out in arcs that fall under gravity, and a puff of mist. A
// function of its age and seed only, like the other impacts.
import type { SplashLook } from '@/domain/effects/impacts';
import type { Hit } from './impacts';
import { rngFor } from './rng';
import { rgba, type Ctx2D } from './sprites';

const FLAT = 0.28; // the surface, seen from the side

// h.size: the crown's radius; h.colors: hottest (palest) to coolest
export function drawSplash(ctx: Ctx2D, h: Hit, sp: SplashLook) {
  const { age, x, y, size, colors } = h;
  const T = h.look.duration;
  if (age >= T) return;
  const q = age / T;
  const pale = colors[0],
    light = colors[1];
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
  ctx.lineCap = 'round';

  // ripples, one after another
  for (let k = 0; k < 3; k++) {
    const a = (age - k * 0.12) / (T * 0.9);
    if (a < 0 || a >= 1) continue;
    const R = size * (0.6 + 3.2 * a);
    ctx.strokeStyle = rgba(pale, 0.45 * (1 - a));
    ctx.lineWidth = Math.max(1, size * 0.06 * (1 - a));
    ctx.beginPath();
    ctx.ellipse(x, y, R, R * FLAT, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  // mist, rising and spreading
  const mr = size * (1 + 2 * q);
  const my = y - size * 0.6 - size * q;
  const mist = ctx.createRadialGradient(x, my, 0, x, my, mr);
  mist.addColorStop(0, rgba(pale, 0.3 * (1 - q)));
  mist.addColorStop(1, rgba(pale, 0));
  ctx.fillStyle = mist;
  ctx.beginPath();
  ctx.arc(x, my, mr, 0, Math.PI * 2);
  ctx.fill();

  // the crown: sheets of water rising round the spot, leaning out, with a drop on each tip. The
  // back of it first, dimmer, so the front covers it.
  const rise = Math.sin(Math.PI * Math.min(1, age / (T * 0.55)));
  const r = rngFor(h.seed, 51);
  const crown = Array.from({ length: 28 }, (_, i) => ({
    a: (i / 28) * Math.PI * 2 + (r() - 0.5) * 0.15,
    h: 0.6 + 0.4 * r(),
  })).sort((m, n) => Math.sin(m.a) - Math.sin(n.a));
  if (rise > 0.01) {
    for (const c of crown) {
      const back = Math.sin(c.a) < 0;
      const r0 = size * (0.5 + 0.25 * q);
      const bx = x + Math.cos(c.a) * r0;
      const by = y + Math.sin(c.a) * r0 * FLAT;
      const tx = bx + Math.cos(c.a) * size * 0.45 * q;
      const ty = by - size * sp.height * c.h * rise * 0.5;
      // water is mostly see-through: a pale sheet, tinted a little, with a bright edge
      const alpha = (1 - q) * (back ? 0.3 : 0.55);
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.quadraticCurveTo(bx, (by + ty) / 2, tx, ty);
      ctx.strokeStyle = rgba(light, alpha * 0.5);
      ctx.lineWidth = Math.max(1, size * 0.16 * (1 - q * 0.6));
      ctx.stroke();
      ctx.strokeStyle = rgba(pale, alpha);
      ctx.lineWidth = Math.max(1, size * 0.05);
      ctx.stroke();
      ctx.fillStyle = rgba(pale, alpha);
      ctx.beginPath();
      ctx.arc(tx, ty, Math.max(1, size * 0.07), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // droplets thrown out in arcs, stretched along the way they're moving, until they fall back in
  const d = rngFor(h.seed, 52);
  const g = size * sp.height * 9;
  for (let k = 0; k < sp.drops; k++) {
    const a = d() * Math.PI * 2;
    const out = size * (1.5 + 2.5 * d());
    const up = size * sp.height * (2.2 + 1.8 * d());
    const delay = d() * 0.08;
    const rad = Math.max(1, size * (0.03 + 0.05 * d()));
    const tone = d();
    const s = age - delay;
    if (s <= 0) continue;
    const px = x + Math.cos(a) * (size * 0.5 + out * s);
    const vy = -up + g * s;
    const py = y + Math.sin(a) * size * 0.14 - up * s + 0.5 * g * s * s;
    if (py > y + size * 0.3 && vy > 0) continue;
    const vx = Math.cos(a) * out;
    ctx.strokeStyle = rgba(tone < 0.75 ? pale : light, 0.8 * (1 - q * q));
    ctx.lineWidth = rad * 2;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px - vx * 0.025, py - vy * 0.025);
    ctx.stroke();
  }
  ctx.restore();
}
