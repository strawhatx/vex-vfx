// One clip being drawn: its spec from the editor, its geometry (outline and mask per frame), and
// a particle simulation for each of its particle passes (fire, lightning, aura, sparks). The
// simulations are rebuilt from track data, so any frame comes out the same in any order; playing
// forward just steps them along.
import type { LayerSpec } from '@/application/ports';
import { PARTICLE_KINDS, bodyAt, fxOf } from '@/domain/effects/body';
import type { ObjectPass } from '@/domain/effects/passes';
import { specOf } from '@/domain/effects/particles';
import { ParticleSystem } from './particles/system';
import { areaMul, unit } from './particles/types';
import { FrameGeometry } from './geometry';
import { EffectSim, MAX_LIFE, type FxFrame } from './sim';

export class Layer {
  private sims = new Map<number, EffectSim>(); // by pass
  private systems = new Map<number, ParticleSystem>(); // a particle emitter pass's, by pass
  private simIdx = -1; // the frame the simulations are at
  private dirty = true; // they have to be rebuilt
  private passKey: string;

  constructor(
    public spec: LayerSpec,
    public geo: FrameGeometry,
  ) {
    this.passKey = JSON.stringify(spec.passes);
  }

  // takes a new spec; unchanged track data and passes keep their simulations
  update(spec: LayerSpec) {
    if (spec.frames !== this.spec.frames) this.invalidate();
    const key = JSON.stringify(spec.passes);
    if (key !== this.passKey || spec.range.s !== this.spec.range.s || spec.range.e !== this.spec.range.e) {
      this.dirty = true;
      this.passKey = key;
    }
    this.spec = spec;
  }

  // the simulation of pass k (the first pass's is seeded as effects always were)
  sim(k: number) {
    let s = this.sims.get(k);
    if (!s) this.sims.set(k, (s = new EffectSim(k ? this.spec.id * 977 + k : this.spec.id)));
    return s;
  }

  // the particle system of emitter pass k
  system(k: number) {
    let s = this.systems.get(k);
    if (!s) this.systems.set(k, (s = new ParticleSystem(this.spec.id * 7919 + k)));
    return s;
  }

  // what an emitter is sized and spread by on frame f: its object's size, and the frame's
  scale(f: FxFrame) {
    const g = this.geo;
    return { u: unit(f.tgt, 1), intensity: 1, area: areaMul(f.tgt), W: g.W * g.q, H: g.H * g.q };
  }

  // its passes at frame i, their strength moved over time
  passesAt(i: number): ObjectPass[] {
    const { passes, range, frames, id } = this.spec;
    if (!passes) return [];
    return bodyAt(passes, (frames[i]?.t ?? 0) - range.s, range.e - range.s, id);
  }

  // the track data changed in place
  invalidate() {
    this.geo.clear();
    this.dirty = true;
  }

  // whether it draws at clip time t: nothing at all outside its range, not even flames still dying down
  isOn(t: number, clipLength: number) {
    const { frames, range } = this.spec;
    return frames.length === clipLength && t >= range.s - 1e-6 && t < range.e - 1e-6;
  }

  // steps the simulation to frame idx
  advanceTo(idx: number, shot: Int32Array) {
    const frames = this.spec.frames;
    const shotStart = shot[idx] ?? 0;
    const canContinue =
      !this.dirty &&
      this.simIdx >= 0 &&
      idx >= this.simIdx &&
      shot[this.simIdx] === shotStart &&
      frames[idx].t - frames[this.simIdx].t <= MAX_LIFE;
    let j = this.simIdx + 1;
    if (!canContinue) {
      // no particle outlives MAX_LIFE, so simulating from that far back (or the shot's start)
      // rebuilds the state exactly
      for (const s of this.sims.values()) s.reset();
      for (const s of this.systems.values()) s.reset();
      j = idx;
      while (j > shotStart && frames[j - 1].t >= frames[idx].t - MAX_LIFE) j--;
    }
    for (; j <= idx; j++) {
      const f = this.fxFrame(j, shot);
      const local = frames[j].t - this.spec.range.s;
      this.passesAt(j).forEach((p, k) => {
        if (p.kind === 'emitter') this.system(k).step(f, specOf(p.params), this.scale(f), local);
        else if (PARTICLE_KINDS.includes(p.kind))
          this.sim(k).step(f, fxOf(p.kind, p.params, this.spec.settings));
      });
    }
    this.simIdx = idx;
    this.dirty = false;
  }

  // what the simulation sees of frame i: the object's target and outline, and the time step
  fxFrame(i: number, shot: Int32Array): FxFrame {
    const frames = this.spec.frames;
    const f = frames[i];
    const prev = frames[i - 1];
    const sameShot = prev && shot[i - 1] === shot[i];
    const step = sameShot && f.t - prev.t < 0.2 ? f.t - prev.t : f.dur || 1 / 30;
    const dt = Math.max(0.001, Math.min(0.1, step));
    const o = this.geo.outline(frames, i);
    return {
      index: i,
      t: f.t,
      dt,
      tgt: this.geo.target(frames, i, dt, shot),
      contour: o.contour,
      n: o.n,
      hasShape: o.hasShape,
    };
  }
}
