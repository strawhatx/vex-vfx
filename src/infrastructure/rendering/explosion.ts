// Drawing an explosion (on top of an impact's flash, shockwave and sparks): smoke billowing up and
// lingering, a rolling fireball that swells and burns out, and debris thrown out and falling.
// Like impacts, a function of its age and seed only, so any frame renders the same whether
// playing, scrubbing or exporting.
import type { ExplosionLook } from '@/domain/effects/impacts';
import type { Hit } from './impacts';
import { rngFor } from './rng';
import { rgba, type Ctx2D } from './sprites';

// how far along a stage is (0..1), and eased so it moves fast then settles
const ease = (q: number) => 1 - (1 - Math.min(1, Math.max(0, q))) ** 3;

// h.size is the fireball's radius
export function drawExplosion(ctx: Ctx2D, h: Hit, ex: ExplosionLook) {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  drawSmoke(ctx, h, ex);
  drawFireball(ctx, h);
  drawDebris(ctx, h, ex);
  ctx.restore();
}

// dark puffs pushed out by the blast, then rising and spreading; drawn normally, so they hide
// what's behind. A mushroom cloud's rise in a column and spread into a cap.
function drawSmoke(ctx: Ctx2D, h: Hit, ex: ExplosionLook) {
  const { age, x, y, size: R } = h;
  const T = h.look.duration;
  const r = rngFor(h.seed, 21);
  const puffs = Math.round(10 + 16 * ex.smoke);
  ctx.globalCompositeOperation = 'source-over';
  for (let k = 0; k < puffs; k++) {
    const ang = r() * Math.PI * 2;
    const born = 0.06 + r() * 0.2 * T;
    const life = T * (0.75 + 0.25 * r()) - born;
    const size = R * (0.35 + 0.35 * r());
    const tone = r();
    const stem = ex.mushroom && k % 2 === 0;
    // where it drifts to: out and up; in a mushroom, straight up (stem) or up then outwards (cap)
    const outX = stem
      ? (r() - 0.5) * R * 0.3
      : Math.cos(ang) * R * (ex.mushroom ? 0.5 + 1.1 * r() : 0.4 + 0.8 * r());
    const outY = stem ? 0 : Math.sin(ang) * R * 0.35;
    const rise = R * (ex.mushroom ? (stem ? 1.2 + 2 * r() : 3 + 0.4 * r()) : 0.8 + 1.2 * r());
    const a = age - born;
    if (a < 0 || a > life) continue;
    const q = a / life;
    const move = ease(q * 1.6);
    const px = x + outX * move;
    const py = y + outY * move - rise * ease(q * 1.2);
    const rad = size * (0.6 + 1.6 * move);
    const alpha = ex.smoke * 0.75 * Math.min(1, a / 0.2) * (1 - q) ** 1.3;
    const g = ctx.createRadialGradient(px, py, 0, px, py, rad);
    const col = tone < 0.5 ? '#2a2524' : '#4a4240';
    g.addColorStop(0, rgba(col, alpha));
    g.addColorStop(0.6, rgba(col, alpha * 0.7));
    g.addColorStop(1, rgba(col, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(px, py, rad, 0, Math.PI * 2);
    ctx.fill();
  }
}

// the fireball: overlapping balls of fire that swell fast, rise a little and cool from yellow
// through orange to dark red as they burn out. Each is drawn as an opaque body (so it reads on a
// bright background too), then a white-hot glow on top while it's young.
function drawFireball(ctx: Ctx2D, h: Hit) {
  const { age, x, y, size: R, colors } = h;
  const T = h.look.duration;
  const r = rngFor(h.seed, 22);
  const balls = [];
  for (let k = 0; k < 18; k++) {
    const ang = r() * Math.PI * 2;
    const dist = R * 0.6 * Math.sqrt(r());
    const size = R * (0.35 + 0.35 * r());
    const life = T * 0.45 * (0.6 + 0.7 * r());
    const lift = R * (0.3 + 0.6 * r());
    if (age > life) continue;
    const q = age / life;
    const swell = 1 - Math.exp(-age * 12);
    balls.push({
      q,
      x: x + Math.cos(ang) * dist * swell,
      y: y + Math.sin(ang) * dist * 0.8 * swell - lift * q,
      rad: size * (0.3 + 0.9 * swell) * (1 + 0.3 * q),
    });
  }

  // the body: yellow-orange cooling to dark red, with a sooty edge
  ctx.globalCompositeOperation = 'source-over';
  for (const b of balls) {
    const inner = b.q < 0.3 ? colors[1] : b.q < 0.6 ? colors[2] : colors[3];
    const alpha = 0.92 * (1 - b.q) ** 1.1;
    const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.rad);
    g.addColorStop(0, rgba(inner, alpha));
    g.addColorStop(0.6, rgba(colors[2], alpha * 0.85));
    g.addColorStop(0.85, rgba('#3a1a10', alpha * 0.5));
    g.addColorStop(1, rgba('#3a1a10', 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.rad, 0, Math.PI * 2);
    ctx.fill();
  }

  // the white-hot heart, while it's young
  ctx.globalCompositeOperation = 'lighter';
  for (const b of balls) {
    if (b.q > 0.5) continue;
    const alpha = 0.7 * (1 - b.q / 0.5) ** 2;
    const rad = b.rad * 0.65;
    const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, rad);
    g.addColorStop(0, rgba(colors[0], alpha));
    g.addColorStop(1, rgba(colors[1], 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(b.x, b.y, rad, 0, Math.PI * 2);
    ctx.fill();
  }
}

// chunks thrown out, mostly upwards, tumbling and falling; some are glowing embers
function drawDebris(ctx: Ctx2D, h: Hit, ex: ExplosionLook) {
  const { age, x, y, size: R, colors } = h;
  const T = h.look.duration;
  const r = rngFor(h.seed, 23);
  const g = R * 5; // gravity
  for (let k = 0; k < ex.debris; k++) {
    const ang = -Math.PI / 2 + (r() * 2 - 1) * 1.4;
    const speed = R * (2 + 4 * r());
    const life = T * (0.5 + 0.5 * r());
    const size = R * (0.04 + 0.08 * r());
    const spin = (r() - 0.5) * 20;
    const ember = r() < 0.4;
    const [c1, c2, c3] = [0.3 + 0.7 * r(), 0.3 + 0.7 * r(), 0.3 + 0.7 * r()]; // its shape
    if (age > life) continue;
    const px = x + Math.cos(ang) * speed * age;
    const py = y + Math.sin(ang) * speed * age + 0.5 * g * age * age;
    const fade = 1 - age / life;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(spin * age);
    if (ember) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = rgba(colors[1], fade);
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = rgba('#241a14', Math.min(1, fade * 1.5));
    }
    // a jagged chunk
    ctx.beginPath();
    ctx.moveTo(-size, -size * c1);
    ctx.lineTo(size * c2, -size);
    ctx.lineTo(size, size * c3);
    ctx.lineTo(-size * c1, size * c2);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}
