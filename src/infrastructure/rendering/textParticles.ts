// Lightning and aura on text: the letters' shape (a mask, usually at half the frame's size) made
// into what a tracked object gives the particle effects (its outline and where it is), so the same
// simulations run on words as on people. Each text's simulation carries on while it plays; after a
// jump (a seek, or its start), it's rebuilt from MAX_LIFE seconds before on the shape then, so a
// frame comes out the same however it's reached.
import type { FxSettings } from '@/domain/effects/palettes';
import { encodeRle, type Shape, type TrackFrame } from '@/domain/tracking/types';
import { FrameGeometry } from './geometry';
import { MaskPainter } from './masks';
import { EffectSim, MAX_LIFE, type FxFrame } from './sim';
import type { Ctx2D } from './sprites';

// how often a rebuilt simulation steps (s), and the most it steps at once while playing
const STEP = 1 / 30,
  MAX_STEP = 0.25;

export class TextParticles {
  private sims = new Map<string, { sim: EffectSim; t: number }>();
  private geo: FrameGeometry | null = null;
  private masks = new MaskPainter(1, 1);
  private W = 0;
  private H = 0;

  // the effect (s: which, its colors, size and strength) on the letters in `mask`, at t seconds into
  // the text, onto g (W x H); key: which text and effect, seed: which randomness
  draw(
    g: Ctx2D,
    mask: OffscreenCanvas,
    s: FxSettings,
    t: number,
    W: number,
    H: number,
    key: string,
    seed: number,
  ) {
    const shape = shapeOf(mask);
    if (!shape) {
      this.sims.delete(key);
      return;
    }
    const geo = this.geometry(mask.width, mask.height, W, H);
    const frames: TrackFrame[] = [{ t, dur: STEP, shapes: [shape] }];
    geo.clear();
    geo.prepareCanvas(frames[0]);
    const at = (time: number, dt: number): FxFrame => {
      frames[0].t = time;
      const o = geo.outline(frames, 0);
      return {
        index: 0,
        t: time,
        dt,
        tgt: geo.target(frames, 0, dt),
        contour: o.contour,
        n: o.n,
        hasShape: o.hasShape,
      };
    };
    let state = this.sims.get(key);
    if (!state || t < state.t - 1e-6 || t - state.t > MAX_STEP) {
      state = { sim: state?.sim ?? new EffectSim(seed), t: Math.max(0, t - MAX_LIFE) };
      state.sim.reset();
      for (let u = state.t; u < t - 1e-6; u += STEP) state.sim.step(at(u, STEP), s);
      this.sims.set(key, state);
    }
    if (t > state.t + 1e-6) state.sim.step(at(t, t - state.t), s);
    state.t = t;
    const f = at(t, STEP);
    state.sim.draw(g, f, s, {
      maskGlow: (c, col, blur, alpha) => this.masks.glow(geo.maskCanvas, c, col, blur, alpha),
    });
  }

  // forgets the simulations of texts not drawn now
  keepOnly(keys: Set<string>) {
    for (const k of this.sims.keys()) if (!keys.has(k)) this.sims.delete(k);
  }

  private geometry(w: number, h: number, W: number, H: number) {
    if (!this.geo || this.geo.W !== w || this.geo.H !== h || this.W !== W || this.H !== H) {
      this.geo = new FrameGeometry(w, h, W / w);
      this.masks = new MaskPainter(W, H);
      this.W = W;
      this.H = H;
    }
    return this.geo;
  }
}

// the letters in the mask as a tracked shape (null: none showing)
function shapeOf(mask: OffscreenCanvas): Shape | null {
  const { width: w, height: h } = mask;
  const px = (mask.getContext('2d') as OffscreenCanvasRenderingContext2D).getImageData(0, 0, w, h).data;
  const on = new Uint8Array(w * h);
  let x0 = w,
    y0 = h,
    x1 = -1,
    y1 = -1;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (px[(y * w + x) * 4 + 3] > 127) {
        on[y * w + x] = 1;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  if (x1 < 0) return null;
  return {
    id: 1,
    cx: (x0 + x1) / 2,
    cy: (y0 + y1) / 2,
    w: x1 - x0 + 1,
    h: y1 - y0 + 1,
    mask: encodeRle(on, w, x0, y0, x1, y1),
  };
}
