// Making new particles for one frame: how many (a rate per second), and where on the object they
// start. All randomness comes from the frame's generator `r`, in a fixed order.
import type { FxSettings } from '@/domain/effects/palettes';
import type { Rng } from '../rng';
import { MAX_PARTS, areaMul, unit, type FxFrame, type Particle, type Target } from './types';

export class Emitter {
  readonly tgt: Target;
  readonly time: number;
  readonly u: number; // size unit
  readonly I: number; // intensity
  readonly A: number; // area multiplier

  constructor(
    readonly f: FxFrame,
    s: Pick<FxSettings, 'size' | 'intensity'>,
    readonly r: Rng,
    private parts: Particle[],
  ) {
    this.tgt = f.tgt;
    this.time = f.t;
    this.u = unit(f.tgt, s.size);
    this.I = s.intensity;
    this.A = areaMul(f.tgt);
  }

  // `rate` a second on average. Stochastic rounding keeps the average without carrying fractions
  // between frames.
  emit(rate: number, make: () => Particle) {
    const parts = this.parts;
    for (let n = Math.floor(rate * this.f.dt + this.r()); n > 0; n--) {
      if (parts.length < MAX_PARTS) parts.push(make());
    }
  }

  // a random point on the outline; upBias: prefer points whose normal faces up
  outlinePoint(upBias: boolean) {
    const { f, r } = this;
    let i = 0;
    for (let t = 0; t < 6; t++) {
      i = ((r() * f.n) | 0) * 4;
      if (!upBias || f.contour[i + 3] < 0.35) break;
    }
    const c = f.contour;
    return { x: c[i], y: c[i + 1], nx: c[i + 2], ny: c[i + 3], a: Math.atan2(c[i + 3], c[i + 2]) };
  }

  // a point on the rim, mostly the top: on the outline, or on the target's ellipse (at radius
  // r0..r1, within `spread` radians of straight up) when there's only a box
  rimPoint(spread: number, r0: number, r1: number) {
    const { f, r, tgt } = this;
    if (f.hasShape) {
      const p = this.outlinePoint(true);
      return { x: p.x, y: p.y, out: p.nx, a: p.a };
    }
    const a = -Math.PI / 2 + (r() + r() - 1) * spread;
    const rr = r0 + r() * (r1 - r0);
    return {
      x: tgt.x + Math.cos(a) * tgt.rx * rr,
      y: tgt.y + Math.sin(a) * tgt.ry * rr,
      out: Math.cos(a),
      a,
    };
  }

  // a point between `inner` (a fraction of the way out from the middle) and the edge
  edgePoint(inner: number) {
    const { f, r, tgt } = this;
    if (f.hasShape) {
      const p = this.outlinePoint(false);
      if (inner >= 0.7) return { a: p.a, x: p.x, y: p.y };
      const rr = inner + (1 - inner) * r();
      return { a: p.a, x: tgt.x + (p.x - tgt.x) * rr, y: tgt.y + (p.y - tgt.y) * rr };
    }
    const a = r() * 6.2832;
    const rr = inner + (1 - inner) * Math.sqrt(r());
    return { a, x: tgt.x + Math.cos(a) * tgt.rx * rr, y: tgt.y + Math.sin(a) * tgt.ry * rr };
  }
}
