// Track data: the contract between tracking and effects. The analysis pass writes one
// TrackFrame per decoded video frame; the compositor and effects only ever read it.
// All coordinates are in analysis ("work") pixels: the video scaled so its long side is
// at most WORK_LONG_SIDE.

export const WORK_LONG_SIDE = 480;

// Silhouette as run-length rows inside its bounding box: for each row, the number of runs,
// then (start, length) per run, with x relative to x0.
export interface Rle {
  x0: number;
  y0: number;
  w: number;
  h: number;
  runs: Uint16Array;
}

// One tracked object in one frame.
export interface Shape {
  id: number;
  // tracking box (center and size); drives the effect's position and scale
  cx: number;
  cy: number;
  w: number;
  h: number;
  // silhouette; absent when only a box could be tracked
  mask?: Rle;
  // true when the object tracker has lost its target and is searching
  lost?: boolean;
  // the spots on it a laser fires from (each eye, a fingertip…), when it's a body part
  points?: { x: number; y: number }[];
}

// one frame of the clip: when it starts and how long it shows, in seconds
export interface ClipFrame {
  t: number;
  dur: number;
}

// a point in a frame, in work pixels (where the user tapped)
export type Selection = { x: number; y: number };

export interface TrackFrame {
  t: number; // presentation timestamp, seconds
  dur: number; // frame duration, seconds
  shapes: Shape[];
}

export interface TrackMeta {
  videoW: number;
  videoH: number;
  W: number;
  H: number;
  duration: number;
  frameCount: number; // estimate, for progress
}

export function workSize(videoW: number, videoH: number) {
  const s = Math.min(1, WORK_LONG_SIDE / Math.max(videoW, videoH));
  return { W: Math.round(videoW * s), H: Math.round(videoH * s) };
}

// ---------- RLE ----------
// mask: W x H, nonzero = inside. Encodes the region inside [x0..x1] x [y0..y1].
export function encodeRle(mask: Uint8Array, W: number, x0: number, y0: number, x1: number, y1: number): Rle {
  const out: number[] = [];
  for (let y = y0; y <= y1; y++) {
    const countAt = out.length;
    out.push(0);
    let x = x0,
      n = 0;
    while (x <= x1) {
      while (x <= x1 && !mask[y * W + x]) x++;
      if (x > x1) break;
      const s = x;
      while (x <= x1 && mask[y * W + x]) x++;
      out.push(s - x0, x - s);
      n++;
    }
    out[countAt] = n;
  }
  return { x0, y0, w: x1 - x0 + 1, h: y1 - y0 + 1, runs: Uint16Array.from(out) };
}

// ORs the silhouette into mask (W x H), shifted by (dx, dy); returns its bounds in mask space
export function paintRle(rle: Rle, mask: Uint8Array, W: number, H: number, dx = 0, dy = 0) {
  const r = rle.runs;
  let i = 0,
    bx0 = W,
    by0 = H,
    bx1 = -1,
    by1 = -1;
  for (let row = 0; row < rle.h; row++) {
    const n = r[i++],
      y = rle.y0 + row + dy;
    for (let k = 0; k < n; k++) {
      const s = r[i++],
        len = r[i++];
      if (y < 0 || y >= H) continue;
      const xs = Math.max(0, rle.x0 + s + dx),
        xe = Math.min(W, rle.x0 + s + len + dx);
      if (xe <= xs) continue;
      mask.fill(1, y * W + xs, y * W + xe);
      if (xs < bx0) bx0 = xs;
      if (xe - 1 > bx1) bx1 = xe - 1;
      if (y < by0) by0 = y;
      if (y > by1) by1 = y;
    }
  }
  return { bx0, by0, bx1, by1 };
}

// binary search for the frame shown at time t (the last frame starting at or before t)
export function frameIndexAt(frames: readonly { t: number; dur: number }[], t: number) {
  let lo = 0,
    hi = frames.length - 1,
    ans = -1;
  const eps = 1e-4;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (frames[mid].t <= t + eps) {
      ans = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  if (ans < 0) return -1;
  const f = frames[ans];
  return t < f.t + f.dur + 0.05 ? ans : -1;
}
