// Lasers: beams from a source (each eye, a fingertip, the tapped spot on an object) either in a
// direction, out to the edge of the frame, or to a target spot that stays put in the scene while
// the camera moves. Also the camera path that keeps such spots (and impacts) in place.
import type { Pt } from '../tracking/bodyParts';

// where a laser points: a direction in degrees (0 = right, 90 = down, as on screen), or, when it
// has one, a target spot tapped at frame i (work pixels) that it hits instead
export interface Aim {
  deg: number;
  target: { i: number; x: number; y: number } | null;
}

// ---------- the camera ----------
// how a frame relates to the first: a point at p in the first frame is at s·p + t in this one
export interface Cam {
  s: number;
  tx: number;
  ty: number;
}
export const NO_MOVE: Cam = { s: 1, tx: 0, ty: 0 };

export const applyCam = (c: Cam, p: Pt): Pt => ({ x: c.s * p.x + c.tx, y: c.s * p.y + c.ty });
export const unapplyCam = (c: Cam, p: Pt): Pt => ({ x: (p.x - c.tx) / c.s, y: (p.y - c.ty) / c.s });
// one more frame's move on top of the path so far
export const chainCam = (sofar: Cam, step: Cam): Cam => ({
  s: step.s * sofar.s,
  tx: step.s * sofar.tx + step.tx,
  ty: step.s * sofar.ty + step.ty,
});

// a spot in the scene seen at frame `from`, where it is at frame `to`; and how much bigger it looks
export function carry(p: Pt, from: Cam, to: Cam): { at: Pt; scale: number } {
  return { at: applyCam(to, unapplyCam(from, p)), scale: to.s / from.s };
}

// ---------- beams ----------
// the default aim for a new laser: sideways, towards whichever side of the frame has more room
export const defaultAim = (source: Pt, W: number): Aim => ({ deg: source.x < W / 2 ? 0 : 180, target: null });

// where a ray from p at `deg` leaves the W x H frame
export function toEdge(p: Pt, deg: number, W: number, H: number): Pt {
  const dx = Math.cos((deg * Math.PI) / 180),
    dy = Math.sin((deg * Math.PI) / 180);
  let t = Infinity;
  if (dx > 1e-9) t = Math.min(t, (W - p.x) / dx);
  else if (dx < -1e-9) t = Math.min(t, -p.x / dx);
  if (dy > 1e-9) t = Math.min(t, (H - p.y) / dy);
  else if (dy < -1e-9) t = Math.min(t, -p.y / dy);
  t = Math.max(0, t);
  return { x: p.x + dx * t, y: p.y + dy * t };
}

// the beams this frame: one from each source, to the target if there is one, otherwise to the edge
export function beams(
  sources: Pt[],
  deg: number,
  target: Pt | null,
  W: number,
  H: number,
): { a: Pt; b: Pt }[] {
  return sources.map(a => ({ a, b: target ?? toEdge(a, deg, W, H) }));
}
