// An impact's particle emitters (see domain/effects/bursts.ts): each runs from the moment of the
// hit, at its spot (its object is a circle the burst's size there), so its burst goes off with the
// hit. Each carries on while the hit plays; after a jump it's rebuilt from the hit, so a frame
// comes out the same however it's reached.
import { specOf } from '@/domain/effects/particles';
import type { Hit } from './impacts';
import { ParticleSystem, type SystemScale } from './particles/system';
import { unit, type FxFrame } from './particles/types';
import type { Ctx2D } from './sprites';

// how often a rebuilt system steps (s), and the most it steps at once while playing
const STEP = 1 / 30,
  MAX_STEP = 0.25;

export class ImpactParticles {
  private systems = new Map<string, { sys: ParticleSystem; age: number }>();
  private seen = new Set<string>();
  private none = new Float32Array(0);

  // the hit's emitters at its age, onto ctx
  draw(ctx: Ctx2D, h: Hit) {
    const emitters = h.look.emitters;
    if (!emitters?.length) return;
    const { width: W, height: H } = ctx.canvas;
    const r = Math.max(1, h.size);
    const frame = (age: number, dt: number): FxFrame => ({
      index: 0,
      t: age,
      dt,
      tgt: { x: h.x, y: h.y, rx: r, ry: r, vx: 0, vy: 0, active: true },
      contour: this.none,
      n: 0,
      hasShape: false,
    });
    emitters.forEach((params, k) => {
      const key = `${h.seed}:${k}`;
      this.seen.add(key);
      const spec = specOf(params),
        age = h.age;
      const scale: SystemScale = { u: unit(frame(age, STEP).tgt, 1), intensity: 1, area: 1, W, H };
      let state = this.systems.get(key);
      if (!state || age < state.age - 1e-6 || age - state.age > MAX_STEP) {
        state = { sys: state?.sys ?? new ParticleSystem(h.seed * 31 + k), age: 0 };
        state.sys.reset();
        // (the hit's own frame, then on in steps to just before now)
        state.sys.step(frame(0, STEP), spec, scale, 0);
        while (state.age + STEP < age - 1e-6) {
          state.age += STEP;
          state.sys.step(frame(state.age, STEP), spec, scale, state.age);
        }
        this.systems.set(key, state);
      }
      if (age > state.age + 1e-6) state.sys.step(frame(age, age - state.age), spec, scale, age);
      state.age = Math.max(state.age, age);
      state.sys.draw(ctx, frame(age, STEP), spec, scale);
    });
  }

  // after a frame: forgets the systems of hits not drawn in it
  sweep() {
    for (const key of this.systems.keys()) if (!this.seen.has(key)) this.systems.delete(key);
    this.seen.clear();
  }
}
