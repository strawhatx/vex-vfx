// Lasers: beams from a source (each eye, a fingertip, the tapped spot on an object) either in a
// direction, out to the edge of the frame, or to a target spot that stays put in the scene while
// the camera moves. Also the camera path that keeps such spots (and impacts) in place.
import type { Pt } from '../tracking/bodyParts';

// where a laser points, as a direction in 3D so it can come out of the screen:
//   h: left-right, in degrees around the vertical: 0 = straight at the camera, 90 = right across
//      the screen, -90 = left, ±180 = away into the scene
//   v: up-down, in degrees: -90 = straight up, 90 = straight down
// When it has a target (a spot tapped at frame i, in work pixels) it hits that instead.
export interface Aim {
  h: number;
  v: number;
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
export const defaultAim = (source: Pt, W: number): Aim => ({
  h: source.x < W / 2 ? 90 : -90,
  v: 0,
  target: null,
});

// keeps an aim's angles in range: h wraps around, v stops at straight up or down
export function normalAim(h: number, v: number) {
  return { h: 180 - ((((180 - h) % 360) + 360) % 360), v: Math.max(-90, Math.min(90, v)) };
}

// a point along a beam on screen, and how wide the beam is there (1 = at its source)
export interface BeamPoint {
  x: number;
  y: number;
  w: number;
}

// the beam's direction in 3D: x right, y down, z into the scene
export function aimDirection(h: number, v: number): [number, number, number] {
  const hr = (h * Math.PI) / 180;
  const vr = (v * Math.PI) / 180;
  return [Math.sin(hr) * Math.cos(vr), Math.sin(vr), -Math.cos(hr) * Math.cos(vr)];
}

const NEAR = 0.12; // how close to the camera a beam coming at it is drawn (its source is at 1)
const FAR = 40; // how far into the scene a beam going away is drawn
const STEPS = 64;

// the beam from `src` in the W x H frame, in perspective: straight across if it goes sideways,
// swelling as it comes at the camera, narrowing as it goes away into the scene. The perspective is
// centred on the source (as if the camera looked straight at it), so a beam aimed at the camera
// comes straight out at the viewer and only its angles move it. It stops just past the frame's edge.
export function beamPath(src: Pt, h: number, v: number, W: number, H: number): BeamPoint[] {
  const f = Math.max(W, H); // focal length, in pixels
  const [dx, dy, dz] = aimDirection(h, v);
  // the source is 1 unit from the camera
  const at = (s: number): BeamPoint => {
    const z = 1 + s * dz;
    return { x: src.x + (f * s * dx) / z, y: src.y + (f * s * dy) / z, w: 1 / z };
  };
  // how far along to go, and where to sample: evenly in 1/depth when it's heading towards or away
  // from the camera (so the part near the camera gets its share), evenly along it otherwise
  const end = dz < -1e-3 ? (1 - NEAR) / -dz : FAR;
  const zEnd = 1 + end * dz;
  const deep = Math.abs(dz) > 0.05;
  const out = [at(0)];
  for (let k = 1; k <= STEPS; k++) {
    const u = k / STEPS;
    const s = deep ? (1 / (1 + u * (1 / zEnd - 1)) - 1) / dz : end * u;
    const p = at(s);
    out.push(p);
    if (p.x < 0 || p.y < 0 || p.x > W || p.y > H) break;
  }
  return out;
}
