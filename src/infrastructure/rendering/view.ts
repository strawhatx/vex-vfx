// What every layer needs to know about the frame being drawn, and the spots that stay put while
// things move: a tap on an object (carried along with the object's box) and a spot in the scene
// (carried along with the camera). Output pixels unless noted.
import { carry, type Cam } from '@/domain/effects/laser';
import type { TrackFrame } from '@/domain/tracking/types';
import type { Ctx2D } from './sprites';

export interface View {
  ctx: Ctx2D;
  CW: number; // output size
  CH: number;
  q: number; // output pixels per analysis pixel
  clip: TrackFrame[];
  shot: Int32Array; // each frame's first frame of its shot
  cam: (Cam | null)[]; // the camera's path through the clip (analysis pixels), as far as it's known
}

export type Spot = { i: number; x: number; y: number }; // frame, and analysis pixels

// a spot tapped on an object, at frame i: where it sat in the object's box when tapped, in the box
// at frame i (the tap itself on its own frame, or where the object isn't found at frame i). Null
// if the object wasn't found where it was tapped.
export function tapAt(v: View, frames: TrackFrame[], tap: Spot, i: number) {
  const a = frames[tap.i]?.shapes[0];
  const b = frames[i]?.shapes[0];
  if (tap.i === i || !b) return { x: tap.x * v.q, y: tap.y * v.q };
  if (!a) return null;
  const u = (tap.x - a.cx) / a.w;
  const w = (tap.y - a.cy) / a.h;
  return { x: (b.cx + u * b.w) * v.q, y: (b.cy + w * b.h) * v.q };
}

// a spot in the scene, at frame i: where it was tapped, carried along with the camera (as tapped,
// if the camera's path isn't worked out yet)
export function sceneSpotAt(v: View, spot: Spot, i: number) {
  const from = v.cam[spot.i];
  const to = v.cam[i];
  const at = from && to ? carry(spot, from, to).at : spot;
  return { x: at.x * v.q, y: at.y * v.q };
}
