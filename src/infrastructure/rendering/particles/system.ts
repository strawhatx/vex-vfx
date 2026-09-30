// The particle simulation: one emitter (see domain/effects/particles.ts) on an object, on
// text, or over the frame. Stepped once per video frame, all its randomness from the frame's own
// generator, so replaying, scrubbing and exporting draw the same; no particle lives longer than
// MAX_LIFE, so a frame's state can be rebuilt by stepping from that far back.
import { particleAlpha, particleGrowth, type EmitterSpec } from '@/domain/effects/particles';
import { PALETTES } from '@/domain/effects/palettes';
import { rngFor, type Rng } from '../rng';
import { drawTongue, flameSprite, sprite, type Ctx2D } from '../sprites';
import { Emitter } from './emitter';
import { MAX_LIFE, noise, type FxFrame } from './types';

// the most particles one system holds
const MAX = 1500;

interface Particle {
  x: number; // where it is: in the frame, or (following the object) from the object's middle
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number; // at birth, px
  seed: number;
}

// what the system is drawn on: the object's size unit (px), how strongly (the effect's intensity),
// how much more it emits for a bigger object, and the frame's size (for frame emitters)
export interface SystemScale {
  u: number;
  intensity: number;
  area: number;
  W: number;
  H: number;
}

export class ParticleSystem {
  private parts: Particle[] = [];

  constructor(private seed: number) {}

  reset() {
    this.parts = [];
  }

  // one frame on: new particles (and the burst, on the frame `local` seconds from the start), then
  // everything moves
  step(f: FxFrame, s: EmitterSpec, k: SystemScale, local: number) {
    const r = rngFor(this.seed, Math.round(f.t * 1000));
    const born = (f.tgt.active || s.from.startsWith('frame')) && s.amount > 0;
    if (born) {
      const e = new Emitter(f, { size: 1, intensity: 1 }, r, []);
      const rate = s.rate * s.amount * k.intensity * (s.from.startsWith('frame') ? 1 : k.area);
      let n = Math.floor(rate * f.dt + r());
      if (s.burst > 0 && local >= -1e-6 && local < f.dt - 1e-6) n += Math.round(s.burst * s.amount);
      for (; n > 0 && this.parts.length < MAX; n--) this.parts.push(this.birth(f, s, k, e, r));
    }
    this.move(f, s, k);
  }

  draw(ctx: Ctx2D, f: FxFrame, s: EmitterSpec, k: SystemScale, pal = s.pal) {
    if (!this.parts.length) return;
    const colors = [...PALETTES[pal].c, '#ffffff'];
    const tgt = f.tgt;
    ctx.save();
    ctx.globalCompositeOperation = s.add ? 'lighter' : 'source-over';
    const strength = Math.min(1, s.amount * k.intensity);
    for (const q of this.parts) {
      const g = q.life / q.max;
      let a = particleAlpha(s, g) * strength;
      if (s.twinkle > 0) a *= 1 - s.twinkle + s.twinkle * (0.5 + 0.5 * Math.sin(f.t * 25 + q.seed));
      if (a <= 0.003) continue;
      const x = s.follow ? tgt.x + q.x : q.x,
        y = s.follow ? tgt.y + q.y : q.y;
      const size = q.size * particleGrowth(s, g);
      const col = g < 0.5 ? colors[s.colorStart] : colors[s.colorEnd];
      ctx.globalAlpha = Math.min(1, a);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      switch (s.shape) {
        case 'dot':
        case 'star':
          ctx.drawImage(sprite(col), x - size * 3, y - size * 3, size * 6, size * 6);
          if (s.shape === 'star') {
            ctx.strokeStyle = col;
            ctx.lineWidth = Math.max(1, size * 0.3);
            ctx.beginPath();
            ctx.moveTo(x - size * 3, y);
            ctx.lineTo(x + size * 3, y);
            ctx.moveTo(x, y - size * 3);
            ctx.lineTo(x, y + size * 3);
            ctx.stroke();
          }
          break;
        case 'confetti': {
          // (a scrap of paper, turning and flipping as it falls)
          const turn = q.seed + f.t * (2 + (q.seed % 3));
          ctx.fillStyle = col;
          ctx.setTransform(1, 0, 0, 1, x, y);
          ctx.rotate(turn);
          ctx.fillRect(
            -size,
            (-size * Math.abs(Math.sin(turn * 1.7))) / 2,
            size * 2,
            size * Math.abs(Math.sin(turn * 1.7)),
          );
          break;
        }
        case 'smoke':
          ctx.drawImage(sprite(col), x - size, y - size, size * 2, size * 2);
          break;
        case 'spark':
          ctx.strokeStyle = col;
          ctx.lineWidth = Math.max(1, size);
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x - q.vx * 0.035, y - q.vy * 0.035);
          ctx.stroke();
          break;
        case 'tongue': {
          const speed = Math.hypot(q.vx, q.vy);
          drawTongue(
            ctx,
            flameSprite(col),
            x,
            y,
            q.vx,
            q.vy || -1,
            size,
            size * (2.2 + Math.min(1.5, speed / (k.u * 25))),
          );
          break;
        }
      }
    }
    ctx.restore();
  }

  // a new particle, where and how the emitter says
  private birth(f: FxFrame, s: EmitterSpec, k: SystemScale, e: Emitter, r: Rng): Particle {
    const tgt = f.tgt;
    let x: number,
      y: number,
      nx = 0,
      ny = -1;
    switch (s.from) {
      case 'outline': {
        const p = e.edgePoint(1);
        x = p.x;
        y = p.y;
        nx = Math.cos(p.a);
        ny = Math.sin(p.a);
        break;
      }
      case 'top': {
        const p = e.rimPoint(2.4, 0.9, 1.08);
        x = p.x;
        y = p.y;
        nx = Math.cos(p.a);
        ny = Math.sin(p.a);
        break;
      }
      case 'inside': {
        const p = e.edgePoint(0.2);
        x = p.x;
        y = p.y;
        nx = Math.cos(p.a);
        ny = Math.sin(p.a);
        break;
      }
      case 'center':
        x = tgt.x;
        y = tgt.y;
        break;
      case 'frameTop':
        x = r() * k.W;
        y = -k.u;
        break;
      case 'frameBottom':
        x = r() * k.W;
        y = k.H + k.u;
        break;
      case 'frameSides':
        x = r() < 0.5 ? -k.u : k.W + k.u;
        y = r() * k.H;
        nx = x < 0 ? 1 : -1;
        ny = 0;
        break;
      default:
        x = r() * k.W;
        y = r() * k.H;
    }
    // its heading: the emitter's direction (0: up) within its spread, swung out along the outline
    const a = s.direction + (r() * 2 - 1) * s.spread;
    let dx = Math.sin(a) * (1 - s.outward) + nx * s.outward,
      dy = -Math.cos(a) * (1 - s.outward) + ny * s.outward;
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;
    const speed = s.speed * k.u * (1 - s.speedRandom * r());
    const max = Math.min(MAX_LIFE, s.life * (1 - s.lifeRandom * r()));
    const size = s.size * k.u * (1 - s.sizeRandom * r());
    const follow = s.follow && tgt.active;
    return {
      x: follow ? x - tgt.x : x,
      y: follow ? y - tgt.y : y,
      vx: dx * speed,
      vy: dy * speed,
      life: 0,
      max: Math.max(0.05, max),
      size,
      seed: r() * 100,
    };
  }

  // ages and moves every particle; dead ones are removed keeping birth order
  private move(f: FxFrame, s: EmitterSpec, k: SystemScale) {
    const { dt, tgt } = f;
    const damp = Math.exp(-s.drag * dt);
    const parts = this.parts;
    let alive = 0;
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      p.life += dt;
      if (p.life >= p.max) continue;
      parts[alive++] = p;
      p.vy += s.gravity * k.u * dt;
      if (s.sway) p.vx += noise(f.t * 2 + p.life * 3, p.seed) * s.sway * k.u * dt;
      if (s.pull && !s.follow && tgt.active) p.vx += (tgt.x - p.x) * s.pull * dt;
      p.vx *= damp;
      p.vy *= damp;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    parts.length = alive;
  }
}
