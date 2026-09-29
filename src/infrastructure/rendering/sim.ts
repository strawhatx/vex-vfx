// A clip's particle effect, stepped once per video frame. Repeatable: all randomness comes from a
// per-frame seeded generator and time is the frame's timestamp, so replaying, scrubbing and
// exporting produce the same pictures. No particle lives longer than MAX_LIFE, so the state at any
// frame can be rebuilt by simulating from MAX_LIFE seconds earlier.
//
// Fire, aura and sparks are emitters (the object engine's) (see domain/effects/particles.ts and
// particles/system.ts), drawn round what only they have: fire's glow and its GPU flames, aura's
// halo. Lightning is its own (particles/lightning.ts).
import type { FxSettings } from '@/domain/effects/palettes';
import { PALETTES } from '@/domain/effects/palettes';
import {
  AURA_PARTICLES,
  FIRE_PARTICLES,
  FIRE_TONGUES,
  SPARK_PARTICLES,
  specOf,
  type EmitterSpec,
} from '@/domain/effects/particles';
import { drawAuraGlow } from './particles/aura';
import { Emitter } from './particles/emitter';
import { drawFireGlow } from './particles/fire';
import { Lightning } from './particles/lightning';
import type { Painter } from './particles/painter';
import { drawSparks } from './particles/sparks';
import { ParticleSystem, type SystemScale } from './particles/system';
import { areaMul, unit, type FxFrame, type Layers, type Particle } from './particles/types';
import { rngFor } from './rng';
import type { Ctx2D } from './sprites';

export { MAX_LIFE, type FxFrame, type Layers, type Target } from './particles/types';

// each built-in effect's emitters, in the order they're drawn
const [EMBERS, SMOKE] = FIRE_PARTICLES.map(specOf);
const TONGUES = specOf(FIRE_TONGUES);
const [WISPS, GLINTS] = AURA_PARTICLES.map(specOf);
const SPARKS = specOf(SPARK_PARTICLES);
const EMITTERS: Partial<Record<FxSettings['effect'], EmitterSpec[]>> = {
  fire: [SMOKE, TONGUES, EMBERS],
  aura: [WISPS, GLINTS],
  sparks: [SPARKS],
};

export class EffectSim {
  private parts: Particle[] = []; // lightning's sparks
  private lightning = new Lightning();
  private systems: ParticleSystem[] = [];

  constructor(private seed = 1) {
    this.systems = [0, 1, 2].map(k => new ParticleSystem(seed * 131 + k));
  }

  reset() {
    this.parts = [];
    this.lightning.reset();
    for (const s of this.systems) s.reset();
  }

  // one frame on: new particles, then everything moves
  step(f: FxFrame, s: FxSettings) {
    const emitters = EMITTERS[s.effect];
    if (emitters) {
      const k = scale(f, s);
      emitters.forEach((e, n) => this.systems[n].step(f, e, k, Infinity));
      return;
    }
    const e = new Emitter(f, s, rngFor(this.seed, frameKey(f)), this.parts);
    if (f.tgt.active && s.effect === 'lightning') this.lightning.emit(e);
    if (!f.tgt.active || s.effect !== 'lightning') this.lightning.clearBolts();
    this.moveSparks(f, e.u);
  }

  draw(ctx: Ctx2D, f: FxFrame, s: FxSettings, layers: Layers) {
    const k = scale(f, s);
    const p: Painter = {
      ctx,
      f,
      tgt: f.tgt,
      parts: this.parts,
      pal: PALETTES[s.pal].c,
      u: k.u,
      I: s.intensity,
      time: f.t,
      r: rngFor(this.seed ^ 0x5bd1e995, frameKey(f)),
      layers,
    };
    ctx.save();
    const [a, b, c] = this.systems;
    if (s.effect === 'fire') {
      a.draw(ctx, f, SMOKE, k, s.pal);
      // (the flames: the GPU's where it can, else the particle tongues)
      if (!drawFireGlow(p)) b.draw(ctx, f, TONGUES, k, s.pal);
      c.draw(ctx, f, EMBERS, k, s.pal);
    } else if (s.effect === 'aura') {
      drawAuraGlow(p);
      a.draw(ctx, f, WISPS, k, s.pal);
      b.draw(ctx, f, GLINTS, k, s.pal);
    } else if (s.effect === 'sparks') a.draw(ctx, f, SPARKS, k, s.pal);
    else if (s.effect === 'lightning') {
      this.lightning.draw(p);
      drawSparks(p);
    }
    ctx.restore();
  }

  // lightning's sparks fall
  private moveSparks(f: FxFrame, u: number) {
    const { dt } = f;
    const parts = this.parts;
    let alive = 0;
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      p.life += dt;
      if (p.life >= p.max) continue;
      parts[alive++] = p;
      p.vy += u * 60 * dt;
      p.vx *= 0.985;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    parts.length = alive;
  }
}

// the size unit, strength and spread of an effect on this frame's object
const scale = (f: FxFrame, s: FxSettings): SystemScale => ({
  u: unit(f.tgt, s.size),
  intensity: s.intensity,
  area: areaMul(f.tgt),
  W: 0,
  H: 0,
});

// randomness is keyed on the frame's timestamp, which doesn't change between analyses
const frameKey = (f: FxFrame) => Math.round(f.t * 1000);
