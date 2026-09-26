// Drawing impacts. Everything here is a function of the hit's age and its seed, with no state
// carried between frames, so any frame of an impact renders the same whether playing, scrubbing
// or exporting.
import type { ImpactLook } from '@/domain/effects/impacts';
import { rngFor } from './rng';
import { rgba, type Ctx2D } from './sprites';

// one impact at one moment, in output pixels
export interface Hit {
  age: number;           // seconds since the hit
  x: number; y: number;  // where it hit
  size: number;          // the object's size
  dir: number | null;    // direction the object was moving (radians), if it was moving
  look: ImpactLook;
  colors: readonly string[]; // hottest to coolest
  seed: number;
}

const FLASH_S = 0.12;
const hot = (h: Hit) => (h.look.palette ? h.colors[0] : '#ffffff');
const mid = (h: Hit) => (h.look.palette ? h.colors[1] : '#ffe9b0');

// flash, shockwave rings and sparks at the hit point
export function drawHit(ctx: Ctx2D, h: Hit) {
  const { age, x, y, size, look } = h;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'lighter';

  // flash: a bright bloom that swells and is gone in a few frames
  if (look.flash > 0 && age < FLASH_S * 2) {
    const a = Math.max(0, 1 - age / (FLASH_S * 2)), r = size * look.flash * (0.7 + age * 5);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rgba(hot(h), a)); g.addColorStop(0.35, rgba(mid(h), a * 0.7)); g.addColorStop(1, rgba(mid(h), 0));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }

  // shockwave rings, one after another, growing and thinning out
  for (let k = 0; k < look.rings; k++) {
    const a = age - k * 0.06, life = look.duration * 0.8;
    if (a < 0 || a > life) continue;
    const q = a / life, r = size * (0.5 + q * (3 + k)), alpha = (1 - q) ** 2;
    ctx.strokeStyle = rgba(k === 0 ? hot(h) : mid(h), alpha * 0.9);
    ctx.lineWidth = Math.max(1, size * 0.14 * (1 - q));
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
  }

  // sparks thrown out the way the object was going (all round if it wasn't moving)
  const r = rngFor(h.seed, 7), base = h.dir ?? -Math.PI / 2, spread = h.dir === null ? Math.PI : look.spread;
  ctx.lineCap = 'round';
  for (let n = 0; n < look.sparks; n++) {
    const ang = base + (r() * 2 - 1) * spread, sp = look.speed * size * (0.35 + r() * 0.9), life = look.duration * (0.45 + r() * 0.55);
    const w = 0.6 + r(), col = r() < 0.4 ? hot(h) : mid(h);
    if (age > life) continue;
    const vx = Math.cos(ang) * sp, vy = Math.sin(ang) * sp, g = look.gravity * size;
    const px = x + vx * age, py = y + vy * age + 0.5 * g * age * age;
    const tail = 0.035, tx = px - vx * tail, ty = py - (vy + g * age) * tail;
    const fade = 1 - age / life;
    ctx.strokeStyle = rgba(col, fade);
    ctx.lineWidth = Math.max(0.8, size * 0.045 * w * fade);
    ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(px, py); ctx.stroke();
  }
  ctx.restore();
}

// the camera jolt from all hits at this moment: shake offset, zoom and where it zooms into
export function cameraFor(hits: readonly Hit[], W: number) {
  let dx = 0, dy = 0, zoom = 0, cx = 0, cy = 0;
  for (const h of hits) {
    const { age, look } = h, p = Math.min(1, age / look.duration);
    const amp = look.shake * W * (1 - p) ** 2;
    dx += amp * (Math.sin(age * 83 + h.seed) * 0.7 + Math.sin(age * 131 + h.seed * 2.3) * 0.3);
    dy += amp * (Math.cos(age * 97 + h.seed * 1.7) * 0.7 + Math.sin(age * 149 + h.seed) * 0.3);
    // punch in over 60 ms, ease back out over 300 ms
    const env = age < 0.06 ? age / 0.06 : Math.max(0, 1 - (age - 0.06) / 0.3) ** 2;
    const z = look.zoom * env;
    if (z > zoom) { zoom = z; cx = h.x; cy = h.y; }
  }
  return { dx, dy, k: 1 + zoom, cx, cy };
}

// the whole-frame flash some styles add, strongest of the hits at this moment
export function screenFlash(hits: readonly Hit[]) {
  let a = 0;
  for (const h of hits) if (h.look.screenFlash > 0 && h.age < FLASH_S) a = Math.max(a, h.look.screenFlash * (1 - h.age / FLASH_S));
  return a;
}
