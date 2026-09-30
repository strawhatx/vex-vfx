// Subject layers: objects cut out of a video (see cutout.ts), each the clip seen through its
// object's outline (docs/timeline-rules.md). A subject layer belongs to the video it's cut from and
// shows only while those frames play there: it moves, trims and splits with its clip, and goes when
// the video goes. On top of where the object is, it can be moved, scaled, turned and faded, with
// keyframes, and animated in and out.
//
// Times: all in its video's own time (source time), never the film's, so trimming, splitting or
// speeding up the clip never moves it off its frames (rule 9).
import { poseAt, type ClipAnim } from '../effects/animation';
import { transformAt, type Placement, type Transform, type TransformKey } from './cutout';

// the object in one frame it was cut from: when (seconds, its video's own time), and its box
// (middle and size, as fractions of that video's frame)
export interface OverlayFrame {
  t: number;
  cx: number;
  cy: number;
  w: number;
  h: number;
}

// (its placement's keyframes are at times in its video)
export interface Overlay extends Placement {
  id: number;
  name: string;
  color: string;
  row: number | null; // the timeline row the user put it on (null: wherever it fits)
  source: { reel: number; track: number }; // the video it's cut from, and the clip there cutting it
  aspect: number; // width / height of that video's frame
  src: { s: number; e: number }; // the stretch of its video it's cut from
  frames: OverlayFrame[]; // the object in each frame cut, in time order
  anim: ClipAnim; // how it moves as it plays (in, out, combo), on top of its placement
}

export const overlayLength = (o: Pick<Overlay, 'src'>) => o.src.e - o.src.s;

// whether it shows at time t of its video
export const showingAt = (o: Pick<Overlay, 'src'>, t: number) => t >= o.src.s - 1e-6 && t < o.src.e - 1e-6;

// the frame it shows at time t of its video: the last one cut at or before then; null when it isn't
// showing, or nothing was cut there
export function frameAt(o: Overlay, t: number): OverlayFrame | null {
  if (!showingAt(o, t)) return null;
  const st = t + 1e-6;
  const f = o.frames;
  let lo = 0,
    hi = f.length - 1,
    best = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (f[mid].t <= st) {
      best = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return best >= 0 && f[best].t >= o.src.s - 1e-6 ? f[best] : null;
}

// its transform at time t of its video
export const overlayTransform = (o: Overlay, t: number): Transform => transformAt(o, t);

// how its animation moves it at time t of its video
export const overlayPose = (o: Overlay, t: number) => poseAt(o.anim, t - o.src.s, overlayLength(o));

// where a frame of this aspect sits in a W x H picture: as big as fits, centred (bars either side
// or above and below when the shapes differ)
export function fitRect(aspect: number, W: number, H: number) {
  const k = Math.min(W / aspect, H);
  const w = k * aspect,
    h = k;
  return { x: (W - w) / 2, y: (H - h) / 2, w, h };
}

// the object's box at time t of its video in a W x H picture, as placed: where its middle is, its size
// before scaling, and its transform; null when it isn't showing
export function placedBox(o: Overlay, t: number, W: number, H: number) {
  const f = frameAt(o, t);
  if (!f) return null;
  const r = fitRect(o.aspect, W, H),
    tf = overlayTransform(o, t);
  return {
    // the object's middle where it was, and where it's moved to
    pivot: { x: r.x + f.cx * r.w, y: r.y + f.cy * r.h },
    at: { x: r.x + (f.cx + tf.x) * r.w, y: r.y + (f.cy + tf.y) * r.h },
    w: f.w * r.w,
    h: f.h * r.h,
    tf,
    rect: r,
  };
}

// the top overlay (last in the list) whose object, as placed, is under (x, y) at time t of their
// video (all of the same one), in a W x H picture
export function overlayAt(
  overlays: readonly Overlay[],
  t: number,
  x: number,
  y: number,
  W: number,
  H: number,
) {
  for (let n = overlays.length - 1; n >= 0; n--) {
    const b = placedBox(overlays[n], t, W, H);
    if (!b) continue;
    // the point in the object's own box: undo the move, the turn and the scale
    const a = (-b.tf.rot * Math.PI) / 180,
      dx = x - b.at.x,
      dy = y - b.at.y;
    const u = (dx * Math.cos(a) - dy * Math.sin(a)) / b.tf.scale,
      v = (dx * Math.sin(a) + dy * Math.cos(a)) / b.tf.scale;
    if (Math.abs(u) < b.w / 2 && Math.abs(v) < b.h / 2) return overlays[n];
  }
  return null;
}

// the shortest a subject layer can be trimmed to (seconds)
export const MIN_OVERLAY_S = 0.1;

// the stretch of its video it's cut from with its start or end moved to s or e (its video's time),
// kept inside `limit` and no shorter than MIN_OVERLAY_S
export function trimSpan(
  src: { s: number; e: number },
  r: { s?: number; e?: number },
  limit: { s: number; e: number },
) {
  let s = Math.max(limit.s, r.s ?? src.s),
    e = Math.min(limit.e, r.e ?? src.e);
  if (e - s < MIN_OVERLAY_S) {
    if (r.s !== undefined) s = e - MIN_OVERLAY_S;
    else e = s + MIN_OVERLAY_S;
  }
  return { s, e };
}

// a layer as saved before subject layers kept to their video: it was placed at film time `at`, its
// keyframes timed from there; now they're timed in its video (it played at its own speed from src.s)
export function upgradeOverlay(o: Overlay & { at?: number }): Overlay {
  if (o.at === undefined) return o;
  const rest: Overlay & { at?: number } = {
    ...o,
    keys: o.keys.map((k): TransformKey => ({ ...k, t: o.src.s + k.t })),
  };
  delete rest.at;
  return rest;
}
