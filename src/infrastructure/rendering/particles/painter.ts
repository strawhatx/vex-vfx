// What each effect's drawing gets for one frame.
import type { Rng } from '../rng';
import { sprite, type Ctx2D } from '../sprites';
import type { FxFrame, Layers, Particle, Target } from './types';

export interface Painter {
  ctx: Ctx2D;
  f: FxFrame;
  tgt: Target;
  parts: readonly Particle[];
  pal: readonly string[]; // hottest to coolest
  u: number; // size unit
  I: number; // intensity
  time: number;
  r: Rng; // the frame's generator for drawing (separate from the one for stepping)
  layers: Layers;
}

// a soft round glow around the target
export function targetGlow(p: Painter, col: string, rx: number, ry: number, alpha: number) {
  p.ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
  p.ctx.drawImage(sprite(col), p.tgt.x - rx, p.tgt.y - ry, rx * 2, ry * 2);
}
