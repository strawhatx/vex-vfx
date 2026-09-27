// Particle effects, stepped once per video frame. Repeatable: all randomness comes from a
// per-frame seeded generator and time is the frame's timestamp, so replaying, scrubbing and
// exporting produce the same pictures. No particle lives longer than MAX_LIFE, so the state at any
// frame can be rebuilt by simulating from MAX_LIFE seconds earlier.
//
// Each effect lives in particles/: what it emits, and how it's drawn.
import type { Effect, FxSettings } from '@/domain/effects/palettes';
import { PALETTES } from '@/domain/effects/palettes';
import { drawAura, emitAura } from './particles/aura';
import { Emitter } from './particles/emitter';
import { drawFire, emitFire } from './particles/fire';
import { Lightning } from './particles/lightning';
import type { Painter } from './particles/painter';
import { drawSparks, emitSparks } from './particles/sparks';
import { noise, unit, type FxFrame, type Layers, type Particle } from './particles/types';
import { rngFor } from './rng';
import type { Ctx2D } from './sprites';

export { MAX_LIFE, type FxFrame, type Layers, type Target } from './particles/types';

export class EffectSim {
  private parts: Particle[] = [];
  private lightning = new Lightning();

  constructor(private seed = 1) {}

  reset() {
    this.parts = [];
    this.lightning.reset();
  }

  // one frame on: new particles, then everything moves
  step(f: FxFrame, s: FxSettings) {
    const e = new Emitter(f, s, rngFor(this.seed, frameKey(f)), this.parts);
    if (f.tgt.active) this.emit(s.effect, e);
    if (!f.tgt.active || s.effect !== 'lightning') this.lightning.clearBolts();
    this.move(f, e.u);
  }

  draw(ctx: Ctx2D, f: FxFrame, s: FxSettings, layers: Layers) {
    if (!f.tgt.active && !this.parts.length) return;
    const p: Painter = {
      ctx,
      f,
      tgt: f.tgt,
      parts: this.parts,
      pal: PALETTES[s.pal].c,
      u: unit(f.tgt, s.size),
      I: s.intensity,
      time: f.t,
      r: rngFor(this.seed ^ 0x5bd1e995, frameKey(f)),
      layers,
    };
    ctx.save();
    if (s.effect === 'fire') drawFire(p);
    else if (s.effect === 'aura') drawAura(p);
    else if (s.effect === 'lightning') this.lightning.draw(p);
    if (s.effect === 'sparks' || s.effect === 'lightning') drawSparks(p);
    ctx.restore();
  }

  private emit(effect: Effect, e: Emitter) {
    if (effect === 'fire') emitFire(e);
    else if (effect === 'aura') emitAura(e);
    else if (effect === 'sparks') emitSparks(e);
    else if (effect === 'lightning') this.lightning.emit(e);
  }

  // ages and moves every particle. Dead ones are removed in place keeping birth order: the drawing
  // order must not depend on particles from before the rebuild window, or the rounding of blended
  // pixels would.
  private move(f: FxFrame, u: number) {
    const { dt, tgt } = f;
    const time = f.t;
    const parts = this.parts;
    let alive = 0;
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      p.life += dt;
      if (p.life >= p.max) continue;
      parts[alive++] = p;
      switch (p.k) {
        case 'f': // buoyant, swaying, drawn toward the centerline so tongues meet in a peak
          p.vx += (noise(time * 2 + p.life * 3, p.seed) * u * 30 + (tgt.x - p.x) * 0.5) * dt;
          p.vx *= 0.97;
          p.vy -= u * 14 * dt;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          break;
        case 'e': // embers drift and flutter up
          p.vx += noise(time * 3, p.seed) * u * 40 * dt;
          p.vx *= 0.98;
          p.vy -= u * 2 * dt;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          break;
        case 'm': // smoke drifts slowly
          p.vx += noise(time, p.seed) * u * 6 * dt;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          break;
        case 'w': // wisps rise and lean out
          p.oy -= p.rise * dt;
          p.ox += (p.out * u * 3 + noise(time * 3, p.seed) * u * 6) * dt;
          break;
        case 'g': // glints rise and sway
          p.oy -= p.rise * dt;
          p.ox += noise(time * 2, p.seed) * u * 5 * dt;
          break;
        case 's': // sparks fall
          p.vy += u * 60 * dt;
          p.vx *= 0.985;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          break;
      }
    }
    parts.length = alive;
  }
}

// randomness is keyed on the frame's timestamp, which doesn't change between analyses
const frameKey = (f: FxFrame) => Math.round(f.t * 1000);
