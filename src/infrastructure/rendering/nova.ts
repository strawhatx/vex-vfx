// Drawing a nova: hundreds of particles bursting out from the spot, each curling as it flies and
// leaving a glowing trail, so together they make a ring of wispy energy layered in the palette's
// colors (the inner ones reach less far), with clumps of flame round the edge and a dark, streaked hollow
// in the middle. Like the other impacts, a function of its age and seed only, so any frame
// renders the same whether playing, scrubbing or exporting.
import type { NovaLook, WaveLook } from '@/domain/effects/impacts';
import type { Hit } from './impacts';
import { rngFor, type Rng } from './rng';
import { spread } from './shockwave';
import { rgba, type Ctx2D } from './sprites';

const TRAIL = 10; // points along each particle's trail
const TRAIL_LEN = 0.45; // how far back along its path the trail reaches (fraction of its flight)
const CLUMPS = 9; // clumps of flame round the edge
const STREAKS = 70; // streaks round the hollow middle

// the ring the nova's particles race out in, for bending the picture as it passes
export const novaWave = (n: NovaLook): WaveLook => ({
  rings: 1,
  gap: 0,
  reach: n.reach,
  particles: 0,
  flatten: 1,
  dust: false,
  distort: n.distort,
});

// the palette (hottest to coolest) as the nova's layers, from the middle out: the mid color, then
// the hottest, then the bright one on the outside
const layers = (h: Hit) => [h.colors[2], h.colors[0], h.colors[1]];
// the flames round the edge and the streaks round the hollow: the deepest color
const flameColor = (h: Hit) => h.colors[3];

interface Particle {
  a: number; // the direction it flies
  reach: number; // how far it gets, as a fraction of the ring's reach
  settle: number; // seconds to get there
  life: number; // seconds until it has faded
  swirl: number; // how far it turns as it flies (radians, either way)
  wobble: number; // how far it wanders sideways, in impact sizes
  freq: number; // how many times it wanders from side to side over its flight
  phase: number;
  width: number; // in impact sizes
  color: string;
}

// every particle, the same for every frame of the nova
function particles(h: Hit, n: NovaLook, r: Rng): Particle[] {
  const T = h.look.duration;
  // spaced round the edge, a little uneven
  const clumps = Array.from({ length: CLUMPS }, (_, k) => ((k + 0.7 * r()) / CLUMPS) * Math.PI * 2);
  const out: Particle[] = [];
  for (let k = 0; k < n.particles; k++) {
    const flame = r() < 0.12;
    // the layer: 0 in the middle, 1 at the edge; flames sit on the edge in clumps
    const layer = flame ? 1 : r();
    const color = flame ? flameColor(h) : layers(h)[Math.min(2, Math.floor(layer * 3))];
    const a = flame ? clumps[k % CLUMPS] + (r() - 0.5) * 0.3 : r() * Math.PI * 2;
    out.push({
      a,
      reach: flame ? 0.85 + 0.2 * r() : 0.35 + 0.6 * layer + 0.25 * (r() - 0.5),
      settle: T * 0.75 * (0.8 + 0.4 * r()),
      life: T * (0.65 + 0.35 * r()),
      swirl: n.curl * (r() - 0.5) * 0.6,
      wobble: n.curl * (flame ? 0.5 : 0.3) * (0.3 + r()),
      freq: 1.5 + 3 * r(),
      phase: r() * Math.PI * 2,
      width: (flame ? 0.1 : 0.05) * (0.5 + r()),
      color,
    });
  }
  return out;
}

// where a particle is once it's q (0..1) of the way out; t: seconds since the burst, which sets
// the path swaying slowly, so a trail flows rather than sits still
function place(h: Hit, n: NovaLook, p: Particle, q: number, t: number) {
  const dist = h.size * (0.15 + (0.25 + n.reach) * p.reach * q);
  const a = p.a + p.swirl * q;
  const side = h.size * p.wobble * q * Math.sin(p.freq * q * Math.PI * 2 + p.phase + t * 2);
  return {
    x: h.x + Math.cos(a) * dist - Math.sin(a) * side,
    y: h.y + Math.sin(a) * dist + Math.cos(a) * side,
  };
}

export function drawNova(ctx: Ctx2D, h: Hit, n: NovaLook) {
  const { age, x, y, size } = h;
  const T = h.look.duration;
  if (age >= T) return;
  const fade = (1 - age / T) ** 1.2;
  const ring = size * (0.4 + n.reach * spread(Math.min(1, age / (T * 0.75))));
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  // the hollow middle: dark, once the flash has gone
  ctx.globalCompositeOperation = 'source-over';
  const hole = ring * 0.22;
  const dark = ctx.createRadialGradient(x, y, 0, x, y, hole);
  dark.addColorStop(0, rgba('#000000', 0.85 * fade * Math.min(1, age / 0.12)));
  dark.addColorStop(1, rgba('#000000', 0));
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.arc(x, y, hole, 0, Math.PI * 2);
  ctx.fill();

  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // a soft glow round the ring
  const outer = layers(h)[2];
  const glow = ctx.createRadialGradient(x, y, ring * 0.5, x, y, ring * 1.35);
  glow.addColorStop(0, rgba(outer, 0));
  glow.addColorStop(0.7, rgba(outer, 0.16 * fade));
  glow.addColorStop(1, rgba(outer, 0));
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(x, y, ring * 1.35, 0, Math.PI * 2);
  ctx.fill();

  // streaks round the hollow, pointing in
  const rs = rngFor(h.seed, 41);
  ctx.strokeStyle = rgba(flameColor(h), 0.45 * fade);
  for (let k = 0; k < STREAKS; k++) {
    const a = rs() * Math.PI * 2;
    const from = ring * (0.18 + 0.08 * rs());
    const to = from + ring * (0.12 + 0.25 * rs());
    ctx.lineWidth = Math.max(1, size * 0.03 * (0.5 + rs()));
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(a) * from, y + Math.sin(a) * from);
    ctx.lineTo(x + Math.cos(a) * to, y + Math.sin(a) * to);
    ctx.stroke();
  }

  // the particles: each drawn as its trail back along the path it took, a wide soft pass for the
  // glow and a thin bright one
  for (const p of particles(h, n, rngFor(h.seed, 40))) {
    if (age >= p.life) continue;
    const alpha = (1 - age / p.life) ** 1.3 * Math.min(1, age / 0.04);
    if (alpha <= 0.01) continue;
    const q = spread(Math.min(1, age / p.settle));
    ctx.beginPath();
    for (let j = 0; j < TRAIL; j++) {
      const pt = place(h, n, p, q * (1 - (TRAIL_LEN * j) / (TRAIL - 1)), age);
      if (j) ctx.lineTo(pt.x, pt.y);
      else ctx.moveTo(pt.x, pt.y);
    }
    const w = Math.max(1, size * p.width);
    ctx.strokeStyle = rgba(p.color, 0.12 * alpha);
    ctx.lineWidth = w * 3.5;
    ctx.stroke();
    ctx.strokeStyle = rgba(p.color, 0.5 * alpha);
    ctx.lineWidth = w;
    ctx.stroke();
  }
  ctx.restore();
}
