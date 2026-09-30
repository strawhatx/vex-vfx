// Particle emitters over the whole frame (snow, rain, confetti, fireflies: see
// domain/project/looks.ts particlesAt). The frame is their object: born on it, inside it or at its
// middle, sized by the frame (not by anything in it). Each look's system carries on while it plays;
// after a jump (a seek, or its start) it's rebuilt from MAX_LIFE seconds before, so a frame comes
// out the same however it's reached.
import { specOf } from '@/domain/effects/particles';
import type { DrawnEmitter } from '@/domain/project/looks';
import { ParticleSystem, type SystemScale } from './particles/system';
import { MAX_LIFE, type FxFrame } from './particles/types';
import type { Ctx2D } from './sprites';

// how often a rebuilt system steps (s), and the most it steps at once while playing
const STEP = 1 / 30,
  MAX_STEP = 0.25;
// the size unit, of the frame's shorter side
const UNIT = 1 / 60;

export class FrameParticles {
  private systems = new Map<string, { sys: ParticleSystem; t: number }>();
  private none = new Float32Array(0);

  // the emitters playing now over ctx's canvas; systems of the ones not playing are forgotten.
  // zoom: how much bigger the particles are drawn than on a film (a small picture's, to be seen)
  draw(ctx: Ctx2D, emitters: readonly DrawnEmitter[], zoom = 1) {
    const { width: W, height: H } = ctx.canvas;
    const k: SystemScale = { u: Math.max(2, Math.min(W, H) * UNIT) * zoom, intensity: 1, area: 1, W, H };
    const frame = (t: number, dt: number): FxFrame => ({
      index: 0,
      t,
      dt,
      tgt: { x: W / 2, y: H / 2, rx: W / 2, ry: H / 2, vx: 0, vy: 0, active: true },
      contour: this.none,
      n: 0,
      hasShape: false,
    });
    const on = new Set(emitters.map(e => e.key));
    for (const key of this.systems.keys()) if (!on.has(key)) this.systems.delete(key);
    for (const e of emitters) {
      const spec = specOf(e.params),
        t = e.local;
      let state = this.systems.get(e.key);
      if (!state || t < state.t - 1e-6 || t - state.t > MAX_STEP) {
        state = { sys: state?.sys ?? new ParticleSystem(e.seed), t: Math.max(0, t - MAX_LIFE) };
        state.sys.reset();
        for (let u = state.t; u < t - 1e-6; u += STEP) state.sys.step(frame(u, STEP), spec, k, u);
        this.systems.set(e.key, state);
      }
      if (t > state.t + 1e-6) state.sys.step(frame(t, t - state.t), spec, k, t);
      state.t = t;
      state.sys.draw(ctx, frame(t, STEP), spec, k);
    }
  }
}
