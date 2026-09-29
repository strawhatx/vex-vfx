// What the particle effects work with: the object's target and outline for a frame, the particles
// themselves, and the drawing the renderer does for them.
import type { Ctx2D } from '../sprites';

export const MAX_LIFE = 4.2; // seconds: no particle lives longer
export const MAX_PARTS = 2600;

// the object, as an ellipse, and how it's moving
export interface Target {
  x: number;
  y: number;
  rx: number;
  ry: number;
  vx: number;
  vy: number;
  active: boolean; // found in this frame
}

// everything the effects need to know about one frame, in output-canvas pixels
export interface FxFrame {
  index: number;
  t: number;
  dt: number;
  tgt: Target;
  contour: Float32Array; // outline points: x, y, normal x, normal y
  n: number; // how many
  hasShape: boolean; // a silhouette, not just a box
}

// draws a soft glow hugging the current outline
export type MaskGlow = (ctx: Ctx2D, col: string, blur: number, alpha: number) => void;

// drawing the renderer does for the effects; fire returns false when the GPU fire isn't available
export interface Layers {
  maskGlow: MaskGlow;
  fire?: (ctx: Ctx2D, f: FxFrame, u: number, intensity: number) => boolean;
}

// lightning's sparks (the other effects' particles are the particle engine's: see system.ts)
export type Particle = { k: 's'; x: number; y: number; vx: number; vy: number; life: number; max: number };

// smooth pseudo-noise, -1..1
export const noise = (t: number, s: number) =>
  Math.sin(t * 2.3 + s) * 0.5 + Math.sin(t * 5.7 + s * 1.7) * 0.3 + Math.sin(t * 11.1 + s * 2.9) * 0.2;

// the effect's size unit: from the object's size and the Size setting
export const unit = (tgt: Target, size: number) => Math.max(3, Math.sqrt(tgt.rx * tgt.ry) / 6) * size;

// how much more to emit for a bigger object
export const areaMul = (tgt: Target) => Math.max(0.6, Math.min(3.5, Math.sqrt(tgt.rx * tgt.ry) / 45));
