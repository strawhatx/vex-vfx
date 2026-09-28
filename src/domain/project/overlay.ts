// Overlays: objects cut out of a video (see cutout.ts) as layers of their own, over the whole
// film. An overlay is cut from one video, but belongs to the film: it can be placed at any time,
// over any video, and it stays when the video it was cut from is taken out (it keeps what was cut).
// It plays the stretch of its video it was cut from, from where it's placed, at the same speed;
// its placement (moved, scaled, turned, faded) is keyframed in seconds from its start.
import { transformAt, type Placement, type Transform } from './cutout';

// the object in one frame it was cut from: when (seconds, its video's own time), and its box
// (middle and size, as fractions of that video's frame)
export interface OverlayFrame {
  t: number;
  cx: number;
  cy: number;
  w: number;
  h: number;
}

export interface Overlay extends Placement {
  id: number;
  name: string;
  color: string;
  row: number | null; // the timeline row the user put it on (null: wherever it fits)
  source: { reel: number; track: number }; // the video it's cut from, and the clip there cutting it
  aspect: number; // width / height of that video's frame
  at: number; // when it starts, in the film's time
  src: { s: number; e: number }; // the stretch of its video it plays (the video's own time)
  frames: OverlayFrame[]; // the object in each frame cut, in time order
}

export const overlayLength = (o: Pick<Overlay, 'src'>) => o.src.e - o.src.s;

// when it shows, in the film's time
export const shownRange = (o: Pick<Overlay, 'at' | 'src'>) => ({ s: o.at, e: o.at + overlayLength(o) });

// whether it's showing at film time t
export const showingAt = (o: Pick<Overlay, 'at' | 'src'>, t: number) => {
  const r = shownRange(o);
  return t >= r.s - 1e-6 && t < r.e - 1e-6;
};

// the time in its video shown at film time t
export const sourceTimeAt = (o: Pick<Overlay, 'at' | 'src'>, t: number) => o.src.s + (t - o.at);

// the frame it shows at film time t: the last one cut at or before then; null when it isn't
// showing, or nothing was cut there
export function frameAt(o: Overlay, t: number): OverlayFrame | null {
  if (!showingAt(o, t)) return null;
  const st = sourceTimeAt(o, t) + 1e-6;
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

// its transform at film time t
export const overlayTransform = (o: Overlay, t: number): Transform => transformAt(o, t - o.at);

// where a frame of this aspect sits in a W x H picture: as big as fits, centred (bars either side
// or above and below when the shapes differ)
export function fitRect(aspect: number, W: number, H: number) {
  const k = Math.min(W / aspect, H);
  const w = k * aspect,
    h = k;
  return { x: (W - w) / 2, y: (H - h) / 2, w, h };
}

// the object's box at film time t in a W x H picture, as placed: where its middle is, its size
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

// the top overlay (last in the list) whose object, as placed, is under (x, y) at film time t, in a
// W x H picture
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

// the shortest an overlay can be trimmed to
export const MIN_OVERLAY_S = 0.1;

// its start or end moved to film time s or e, keeping what shows where it is: moving the start
// later plays from later in its video, and moving it earlier from earlier. It can't reach past
// `limit` (the stretch of its video that can be cut; its own time) or before the film's start.
export function trimmed(o: Overlay, r: { s?: number; e?: number }, limit: { s: number; e: number }): Overlay {
  const shown = shownRange(o);
  let s = r.s ?? shown.s;
  const e = r.e ?? shown.e;
  // in its video's time
  let ss = sourceTimeAt(o, s),
    se = sourceTimeAt(o, e);
  if (ss < limit.s) {
    s += limit.s - ss;
    ss = limit.s;
  }
  if (s < 0) {
    ss -= s;
    s = 0;
  }
  se = Math.min(se, limit.e);
  if (se - ss < MIN_OVERLAY_S) {
    if (r.s !== undefined) ss = se - MIN_OVERLAY_S;
    else se = ss + MIN_OVERLAY_S;
    s = o.at + (ss - o.src.s);
  }
  const moved = s - o.at;
  return {
    ...o,
    at: s,
    src: { s: ss, e: se },
    keys: o.keys.map(k => ({ ...k, t: k.t - moved })),
  };
}
