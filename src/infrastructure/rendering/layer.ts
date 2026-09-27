// One clip being drawn: its spec from the editor, its geometry (outline and mask per frame), and
// its particle simulation. The simulation is rebuilt from track data, so any frame comes out the
// same in any order; playing forward just steps it along.
import type { LayerSpec } from '@/application/ports';
import type { StrandFrame } from '@/domain/effects/strands';
import { FrameGeometry } from './geometry';
import { EffectSim, MAX_LIFE, type FxFrame } from './sim';

export class Layer {
  sim: EffectSim;
  private simIdx = -1; // the frame the simulation is at
  private dirty = true; // it has to be rebuilt

  constructor(
    public spec: LayerSpec,
    public geo: FrameGeometry,
  ) {
    this.sim = new EffectSim(spec.id);
  }

  // takes a new spec; unchanged track data keeps its simulation
  update(spec: LayerSpec) {
    if (spec.frames !== this.spec.frames) this.invalidate();
    if (spec.settings !== this.spec.settings) this.dirty = true;
    this.spec = spec;
  }

  // the track data changed in place
  invalidate() {
    this.geo.clear();
    this.dirty = true;
    this.strand = null;
  }

  // a path's strand at each frame of its range, worked out when first drawn (see strandLayer.ts)
  strand: { key: string; from: number; frames: StrandFrame[] } | null = null;

  // whether it draws at clip time t: nothing at all outside its range, not even flames still dying down
  isOn(t: number, clipLength: number) {
    const { frames, range } = this.spec;
    return frames.length === clipLength && t >= range.s - 1e-6 && t < range.e - 1e-6;
  }

  // steps the simulation to frame idx. A path drives it with its own frames (what's along the
  // strand) and settings (its look's effect).
  advanceTo(
    idx: number,
    shot: Int32Array,
    frameAt = (i: number) => this.fxFrame(i, shot),
    settings = this.spec.settings,
  ) {
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
      this.sim.reset();
      j = idx;
      while (j > shotStart && frames[j - 1].t >= frames[idx].t - MAX_LIFE) j--;
    }
    for (; j <= idx; j++) this.sim.step(frameAt(j), settings);
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
