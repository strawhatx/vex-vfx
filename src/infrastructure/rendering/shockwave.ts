// Drawing a shockwave: rings racing out from the spot, each made of particles (glowing energy
// streaks, or dust kicked up off the ground) with a thin bright edge, bending the picture as they
// pass like a lens. Squashed flat, a ring runs along the ground. A function of the impact's age
// and seed only, so any frame renders the same whether playing, scrubbing or exporting.
import type { WaveLook } from '@/domain/effects/impacts';
import type { Hit } from './impacts';
import { rngFor } from './rng';
import { rgba, type Ctx2D } from './sprites';

const DUST = ['#8a7a6a', '#6b5f55', '#a39382'];

// how far out a ring is (0..1 of its reach): fast at first, slowing as it spreads
export const spread = (q: number) => 1 - (1 - q) ** 2.2;

// each ring still going: how far along its life it is, and its radius
function ringsAt(h: Hit, w: WaveLook) {
  const life = h.look.duration * 0.75 - w.gap * (w.rings - 1);
  const out: { k: number; q: number; radius: number }[] = [];
  for (let k = 0; k < w.rings; k++) {
    const q = (h.age - k * w.gap) / Math.max(0.05, life);
    if (q < 0 || q >= 1) continue;
    out.push({ k, q, radius: h.size * (0.4 + w.reach * spread(q)) });
  }
  return out;
}

// bends the picture in a band around each ring: that band redrawn slightly magnified about the
// spot. frame: the output as drawn so far; scratch: a canvas the same size.
export function distortWave(
  ctx: Ctx2D,
  h: Hit,
  w: WaveLook,
  frame: CanvasImageSource,
  scratch: OffscreenCanvas,
) {
  if (w.distort <= 0) return;
  const rings = ringsAt(h, w);
  if (!rings.length) return;
  const g = scratch.getContext('2d') as OffscreenCanvasRenderingContext2D;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalCompositeOperation = 'copy';
  g.drawImage(frame, 0, 0);
  g.globalCompositeOperation = 'source-over';
  for (const { q, radius } of rings) {
    const band = h.size * (0.35 + 0.5 * q);
    const k = 1 + 0.07 * w.distort * (1 - q);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.beginPath();
    ctx.ellipse(h.x, h.y, radius + band, (radius + band) * w.flatten, 0, 0, Math.PI * 2);
    ctx.ellipse(
      h.x,
      h.y,
      Math.max(1, radius - band),
      Math.max(1, radius - band) * w.flatten,
      0,
      0,
      Math.PI * 2,
    );
    ctx.clip('evenodd');
    ctx.setTransform(k, 0, 0, k, h.x * (1 - k), h.y * (1 - k));
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(scratch, 0, 0);
    ctx.restore();
  }
}

// the rings' particles and their bright edges
export function drawWave(ctx: Ctx2D, h: Hit, w: WaveLook) {
  const { x, y, size, colors } = h;
  const hot = h.look.palette ? colors[0] : '#ffffff';
  const mid = h.look.palette ? colors[1] : '#ffe9b0';
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  for (const { k, q, radius } of ringsAt(h, w)) {
    ctx.shadowBlur = 0;
    const r = rngFor(h.seed, 31 + k);
    const fade = (1 - q) ** 1.3;

    // the edge: a thin bright line for energy, a soft dusty swell for the ground
    ctx.globalCompositeOperation = w.dust ? 'source-over' : 'lighter';
    ctx.strokeStyle = rgba(w.dust ? DUST[2] : hot, (w.dust ? 0.35 : 0.8) * fade);
    ctx.lineWidth = Math.max(1, size * (w.dust ? 0.25 : 0.08) * (1 - q));
    ctx.beginPath();
    ctx.ellipse(x, y, radius, radius * w.flatten, 0, 0, Math.PI * 2);
    ctx.stroke();

    // energy glows: the streaks get a soft halo
    if (!w.dust) {
      ctx.shadowColor = rgba(mid, 0.9 * fade);
      ctx.shadowBlur = size * 0.4;
    }

    // the particles, spread round the ring, some lagging behind or running ahead
    for (let n = 0; n < w.particles; n++) {
      const a = ((n + r()) / w.particles) * Math.PI * 2;
      const at = radius * (0.82 + 0.26 * r());
      const px = x + Math.cos(a) * at;
      const py = y + Math.sin(a) * at * w.flatten;
      const grain = 0.6 + 0.8 * r();
      const tone = r();
      const lift = r();
      if (w.dust) {
        // a puff of dust, billowing and rising a little as it goes
        const rad = size * (0.3 + 0.6 * q) * grain;
        const col = DUST[Math.floor(tone * 3)];
        const alpha = 0.6 * fade;
        const gy = py - size * 0.8 * q * lift;
        const g = ctx.createRadialGradient(px, gy, 0, px, gy, rad);
        g.addColorStop(0, rgba(col, alpha));
        g.addColorStop(1, rgba(col, 0));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(px, gy, rad, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // a glowing streak pointing outwards, longer while the ring is fast
        const len = size * (0.25 + 0.6 * (1 - q)) * grain;
        const dx = Math.cos(a);
        const dy = Math.sin(a) * w.flatten;
        ctx.strokeStyle = rgba(tone < 0.4 ? hot : mid, fade);
        ctx.lineWidth = Math.max(1, size * 0.09 * grain * (1 - q * 0.6));
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(px - dx * len, py - dy * len);
        ctx.lineTo(px, py);
        ctx.stroke();
      }
    }
  }
  ctx.restore();
}
