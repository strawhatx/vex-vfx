// A track: one clip on the timeline. Two kinds:
// - an effect (fire, lightning…) follows one tapped object from its start to its end, which the
//   user sets to match the scene; the object is tracked only inside that range. Some effects can
//   instead come from a spot in the scene (see spot.ts), and track nothing.
// - an impact goes off at one moment (its start), at a spot tapped in the scene; nothing is
//   tracked. It starts as long as its style's burst; stretching it plays the burst slower,
//   squeezing it faster.
// - a path (an effect of type path): a strand anchored on the object tapped, or drawn freehand
//   (then pinned to the scene like a spot effect), its far end optionally held (see PathAnchor)
// - a cutout: an object rotoscoped out of the footage into a layer of its own (see cutout.ts). Its
//   object is tracked like an effect's over its range (the frames it's cut from); the layer can then
//   be placed at another time, and moved about.
// Clips can overlap, stacked on the timeline. Each keeps one shape per clip frame and the
// keyframes it was tracked from.
import { IMPACTS, familyOf, type ImpactStyle } from '../effects/impacts';
import type { Aim } from '../effects/laser';
import type { FxSettings } from '../effects/palettes';
import { partLabel, type BodyPart } from '../tracking/bodyParts';
import { frameIndexAt, type ClipFrame, type Shape, type TrackFrame } from '../tracking/types';
import { placedRange, sourceTime, transformAt, type Background, type Cutout } from './cutout';
import { inSpan, type FrameSpan, type Key } from './keyframes';

export type TrackKind = 'effect' | 'impact' | 'cutout';

// where a path is anchored besides its object: drawn freehand at frame i (work pixels; its first
// point is the anchor, and it stays put in the scene), and where its far end is held: on another
// clip's object (tapped at frame i), or a spot in the scene
export interface PathAnchor {
  drawn: { i: number; pts: { x: number; y: number }[] } | null;
  end: { i: number; x: number; y: number; clip: number | null } | null;
}

export interface Track {
  id: number;
  name: string;
  color: string;
  kind: TrackKind;
  part: BodyPart | null; // a body part of the person tapped, or null for the object under the tap
  spot: boolean; // an effect pinned to the tapped spot in the scene, not following anything
  fx: FxSettings; // look: effect type, colors, size, intensity (impacts use the colors and size)
  aim: Aim; // where a laser points
  impact: ImpactStyle | null; // for impacts
  cutout: Cutout | null; // for cutouts: where the layer is placed, and how
  path: PathAnchor | null; // for paths: drawn, and where the far end is held
  range: { s: number; e: number }; // seconds; for an impact, s is the moment of the hit; for a cutout, the frames it's cut from
  shapes: (Shape | null)[]; // per clip frame
  frames: TrackFrame[]; // what gets drawn: the shapes in the tracked frames
  keys: Key[]; // in frame order
}

export const TRACK_COLORS = ['#ff6a3d', '#3fb6ff', '#b6ff4a', '#d98bff', '#ffc640', '#ff5fa2'];
// a new effect lasts this long, from where the object was tapped
export const DEFAULT_EFFECT_S = 3;
// an effect has to last at least this long
export const MIN_RANGE_S = 0.1;
// how far an impact can be squeezed or stretched: 4x faster to 8x slower than its style
export const IMPACT_MIN_SPEED = 1 / 8,
  IMPACT_MAX_SPEED = 4;

// how fast an impact plays its burst: 1 = its style's own timing, 0.5 = half speed
export const impactSpeed = (t: { impact: ImpactStyle | null; range: { s: number; e: number } }) =>
  t.impact ? IMPACTS[t.impact].duration / Math.max(1e-3, t.range.e - t.range.s) : 1;

// what a new clip is called, before its number
const FAMILY_NAMES = {
  hit: 'Impact',
  explosion: 'Explosion',
  shockwave: 'Shockwave',
  word: 'Word',
  water: 'Splash',
} as const;
const kindName = (kind: TrackKind, impact: ImpactStyle | null) =>
  kind === 'effect'
    ? 'Object'
    : kind === 'cutout'
      ? 'Cutout'
      : FAMILY_NAMES[impact ? familyOf(impact) : 'hit'];

// an impact, or an effect from a spot: pinned to the scene rather than following an object, so
// never tracked
export const isPinned = (t: { kind: TrackKind; spot: boolean }) => t.kind === 'impact' || t.spot;

function make(
  id: number,
  kind: TrackKind,
  clip: ClipFrame[],
  fx: FxSettings,
  range: { s: number; e: number },
  impact: ImpactStyle | null,
  part: BodyPart | null,
): Track {
  const t: Track = {
    id,
    name: part && part !== 'body' ? partLabel(part) : `${kindName(kind, impact)} ${id}`,
    color: TRACK_COLORS[(id - 1) % TRACK_COLORS.length],
    kind,
    part,
    spot: false,
    fx: { ...fx },
    aim: { h: 90, v: 0, target: null },
    impact,
    cutout: null,
    path: null,
    range,
    shapes: new Array(clip.length).fill(null),
    frames: [],
    keys: [],
  };
  refreshFrames(t, clip);
  return t;
}

export const newTrack = (
  id: number,
  clip: ClipFrame[],
  fx: FxSettings,
  range: { s: number; e: number },
  part: BodyPart | null = null,
) => make(id, 'effect', clip, fx, range, null, part);

// what a spot effect is called, if not Spot
const SPOT_NAMES: Partial<Record<FxSettings['effect'], string>> = {
  path: 'Path',
  glitch: 'Glitch',
  text: 'Text',
  water: 'Water',
};

// an effect coming from the spot tapped (placed with placeAtSpot); a glitch covers the whole frame
export function newSpotTrack(id: number, clip: ClipFrame[], fx: FxSettings, range: { s: number; e: number }) {
  const t = make(id, 'effect', clip, fx, range, null, null);
  t.spot = true;
  t.name = `${SPOT_NAMES[fx.effect] ?? 'Spot'} ${id}`;
  return t;
}

// an impact going off at frame i
export function newImpact(
  id: number,
  clip: ClipFrame[],
  fx: FxSettings,
  style: ImpactStyle,
  i: number,
  duration: number,
) {
  return make(id, 'impact', clip, fx, impactRange(clip, i, style, duration), style, null);
}

// a new cutout of the object tapped at frame i, cut from `range`; the layer starts where it was
// cut from
export function newCutoutTrack(
  id: number,
  clip: ClipFrame[],
  fx: FxSettings,
  range: { s: number; e: number },
  cutout: Cutout,
) {
  const t = make(id, 'cutout', clip, fx, range, null, null);
  t.cutout = cutout;
  return t;
}

const impactRange = (clip: ClipFrame[], i: number, style: ImpactStyle, duration: number) => ({
  s: clip[i].t,
  e: Math.min(duration, clip[i].t + IMPACTS[style].duration),
});

// the frames that start inside the clip's range
export function rangeFrames(t: Track, clip: ClipFrame[]): FrameSpan {
  let s = 0,
    e = clip.length;
  while (s < e && clip[s].t < t.range.s - 1e-6) s++;
  while (e > s && clip[e - 1].t >= t.range.e - 1e-6) e--;
  return { s, e };
}

// the frames the object is tracked in: the range (an impact tracks nothing, but keeps its range)
export const trackSpan = (t: Track, clip: ClipFrame[]): FrameSpan => rangeFrames(t, clip);

// the frame an impact hits on
export const hitFrame = (t: Track, clip: ClipFrame[]) => rangeFrames(t, clip).s;

// rebuilds what gets drawn at frames [from, to) from the shapes and the tracked frames
export function refreshFrames(t: Track, clip: ClipFrame[], from = 0, to = clip.length) {
  if (t.frames.length !== clip.length) t.frames = clip.map(f => ({ t: f.t, dur: f.dur, shapes: [] }));
  const span = trackSpan(t, clip);
  for (let i = from; i < to; i++) {
    const sh = t.shapes[i];
    t.frames[i].shapes = sh && inSpan(span, i) ? [sh] : [];
  }
}

export function clearShapes(t: Track, clip: ClipFrame[], from: number, to: number) {
  for (let k = from; k < to; k++) t.shapes[k] = null;
  refreshFrames(t, clip, from, to);
}

// sets a clip's start and/or end, kept inside the video; false if it would be too short (or, for
// an impact, faster or slower than it can play). Moving an impact's start moves its hit.
export function setRange(t: Track, r: { s?: number; e?: number }, duration: number, clip: ClipFrame[]) {
  const clamp = (v: number) => Math.max(0, Math.min(v, duration));
  const s = clamp(r.s ?? t.range.s),
    e = clamp(r.e ?? t.range.e);
  if (e - s < MIN_RANGE_S) return false;
  if (t.impact) {
    const speed = IMPACTS[t.impact].duration / (e - s);
    if (speed < IMPACT_MIN_SPEED || speed > IMPACT_MAX_SPEED) return false;
  }
  t.range = { s, e };
  refreshFrames(t, clip);
  return true;
}

// moves an impact to hit at frame i, keeping its speed, and/or changes its style. A new style
// keeps a stretched impact's length; an unstretched one takes the new style's own length.
export function setHit(
  t: Track,
  clip: ClipFrame[],
  duration: number,
  i = hitFrame(t, clip),
  style = t.impact,
) {
  if (t.kind !== 'impact' || !style || !t.impact || !clip[i]) return false;
  const len = t.range.e - t.range.s,
    stretched = Math.abs(len - IMPACTS[t.impact].duration) > 1e-3;
  t.impact = style;
  const s = clip[i].t;
  t.range = { s, e: Math.min(duration, s + (stretched ? len : IMPACTS[style].duration)) };
  refreshFrames(t, clip);
  return true;
}

// the other clip whose object is nearest to `a`'s at frame i (for swapping two objects the
// tracker mixed up as they crossed)
export function nearestOther(tracks: readonly Track[], a: Track, i: number) {
  const sa = a.frames[i]?.shapes[0];
  let best: Track | null = null,
    bd = Infinity;
  for (const t of tracks) {
    const sb = t.frames[i]?.shapes[0];
    if (t === a || !sb || isPinned(t)) continue;
    const d = sa ? Math.hypot(sa.cx - sb.cx, sa.cy - sb.cy) : 0;
    if (d < bd) {
      bd = d;
      best = t;
    }
  }
  return best;
}

// swaps everything the two tracks have from frame i on: shapes and keyframes
export function swapFrom(a: Track, b: Track, i: number, clip: ClipFrame[]) {
  for (let k = i; k < clip.length; k++) {
    const s = a.shapes[k];
    a.shapes[k] = b.shapes[k] && { ...b.shapes[k]!, id: a.id };
    b.shapes[k] = s && { ...s, id: b.id };
  }
  const ak = a.keys.filter(k => k.i >= i),
    bk = b.keys.filter(k => k.i >= i);
  a.keys = [...a.keys.filter(k => k.i < i), ...bk];
  b.keys = [...b.keys.filter(k => k.i < i), ...ak];
  refreshFrames(a, clip);
  refreshFrames(b, clip);
}

// the clip whose object's box contains (x, y) at frame i, while that clip is on (a cutout's
// object is looked for where the layer is placed; see cutoutAt)
export const trackAt = (tracks: readonly Track[], clip: ClipFrame[], i: number, x: number, y: number) =>
  tracks.find(t => {
    const s = t.frames[i]?.shapes[0];
    return (
      t.kind !== 'cutout' &&
      !!s &&
      inSpan(rangeFrames(t, clip), i) &&
      Math.abs(x - s.cx) < s.w / 2 &&
      Math.abs(y - s.cy) < s.h / 2
    );
  }) ?? null;

// the cutout frame j shows at frame i (the source frame, where the layer is placed at another
// time), or -1 if the layer isn't showing then
export function cutoutSource(t: Track, clip: ClipFrame[], i: number) {
  const c = t.cutout,
    f = clip[i];
  if (!c || !f) return -1;
  const p = placedRange(t.range, c);
  if (f.t < p.s - 1e-6 || f.t >= p.e - 1e-6) return -1;
  const j = frameIndexAt(clip, sourceTime(t.range, c, f.t));
  return j >= 0 && inSpan(rangeFrames(t, clip), j) ? j : -1;
}

// the top cutout whose object, as placed (moved, scaled and turned), is under (x, y) at frame i
export function cutoutAt(tracks: readonly Track[], clip: ClipFrame[], i: number, x: number, y: number) {
  for (let n = tracks.length - 1; n >= 0; n--) {
    const t = tracks[n],
      j = cutoutSource(t, clip, i),
      s = j >= 0 ? t.frames[j].shapes[0] : null;
    if (!s || !t.cutout) continue;
    const tf = transformAt(t.cutout, clip[i].t - t.cutout.at);
    // the point in the object's own box: undo the move, the turn and the scale
    const a = (-tf.rot * Math.PI) / 180,
      dx = x - (s.cx + tf.x),
      dy = y - (s.cy + tf.y);
    const u = (dx * Math.cos(a) - dy * Math.sin(a)) / tf.scale,
      v = (dx * Math.sin(a) + dy * Math.cos(a)) / tf.scale;
    if (Math.abs(u) < s.w / 2 && Math.abs(v) < s.h / 2) return t;
  }
  return null;
}

// ---------- timeline view ----------
// a stretch where the object was found; weak = the tracker was searching
export interface Span {
  s: number;
  e: number;
  weak: boolean;
}

export interface Lane {
  id: number;
  name: string;
  color: string;
  kind: TrackKind;
  pinned: boolean; // at a spot in the scene: moved by tapping, nothing to fix
  fx: FxSettings;
  impact: ImpactStyle | null;
  aim: Aim;
  speed: number; // impacts: how fast the burst plays (1 = its style's own timing)
  range: { s: number; e: number }; // when it shows (a cutout: where it's placed)
  row: number; // which timeline row it sits on (cutouts have rows of their own)
  spans: Span[]; // inside the range
  keys: number[]; // keyframe times inside the range
  // a cutout's: where it's cut from (seconds), what's left there, and its transform keyframes' times
  cutout: { from: number; bg: Background; moves: number[] } | null;
  // a path's: whether it was drawn, and whether its far end is held
  path: { drawn: boolean; end: boolean } | null;
}

// stacks clips into as few rows as possible, like a video editor's tracks: each goes on the
// first row where it doesn't overlap anything, in order of start time
export function packRows(ranges: readonly { s: number; e: number }[]) {
  const order = ranges.map((_, k) => k).sort((a, b) => ranges[a].s - ranges[b].s || a - b);
  const rowEnds: number[] = [],
    rows = new Array<number>(ranges.length);
  for (const k of order) {
    let r = rowEnds.findIndex(end => end <= ranges[k].s + 1e-6);
    if (r < 0) {
      r = rowEnds.length;
      rowEnds.push(0);
    }
    rowEnds[r] = ranges[k].e;
    rows[k] = r;
  }
  return rows;
}

export function toLane(t: Track, clip: ClipFrame[], row: number): Lane {
  const range = rangeFrames(t, clip),
    spans: Span[] = [];
  // a cutout shows where it's placed: its tracking is shifted there too
  const c = t.cutout,
    shift = c ? c.at - t.range.s : 0;
  for (let i = range.s; i < range.e; i++) {
    const sh = t.frames[i].shapes[0];
    if (!sh) continue;
    const f = clip[i],
      weak = !!sh.lost,
      last = spans[spans.length - 1];
    if (last && last.weak === weak && f.t - last.e < f.dur * 1.5) last.e = Math.min(t.range.e, f.t + f.dur);
    else spans.push({ s: f.t, e: Math.min(t.range.e, f.t + f.dur), weak });
  }
  for (const sp of spans) {
    sp.s += shift;
    sp.e += shift;
  }
  return {
    id: t.id,
    name: t.name,
    color: t.color,
    kind: t.kind,
    pinned: isPinned(t),
    fx: t.fx,
    impact: t.impact,
    aim: t.aim,
    speed: impactSpeed(t),
    range: c ? placedRange(t.range, c) : t.range,
    row,
    spans,
    keys: t.keys.filter(k => inSpan(range, k.i)).map(k => clip[k.i].t + shift),
    cutout: c && { from: t.range.s, bg: c.bg, moves: c.keys.map(k => c.at + k.t) },
    path: t.fx.effect === 'path' ? { drawn: !!t.path?.drawn, end: !!t.path?.end } : null,
  };
}
