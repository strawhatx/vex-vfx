// A track: one clip on the timeline, on one tapped object. Two kinds:
// - an effect (fire, lightning…) lasts from its start to its end, which the user sets to match
//   the scene; the object is tracked only inside that range.
// - an impact is a hit at one moment (its start). It starts as long as its style's burst;
//   stretching it plays the burst slower, squeezing it faster. The object is also tracked a
//   little before the hit, to know which way it was moving.
// Clips can overlap, stacked on the timeline. Each keeps one shape per clip frame and the
// keyframes it was tracked from.
import { IMPACTS, type ImpactStyle } from '../effects/impacts';
import type { FxSettings } from '../effects/palettes';
import type { ClipFrame, Shape, TrackFrame } from '../tracking/types';
import { inSpan, type FrameSpan, type Key } from './keyframes';

export type TrackKind = 'effect' | 'impact';

export interface Track {
  id: number; name: string; color: string;
  kind: TrackKind;
  fx: FxSettings;               // look: effect type, colors, size, intensity (impacts use the colors and size)
  impact: ImpactStyle | null;   // for impacts
  range: { s: number; e: number }; // seconds; for an impact, s is the moment of the hit
  shapes: (Shape | null)[]; // per clip frame
  frames: TrackFrame[];     // what gets drawn: the shapes in the tracked frames
  keys: Key[];              // in frame order
}

export const TRACK_COLORS = ['#ff6a3d', '#3fb6ff', '#b6ff4a', '#d98bff', '#ffc640', '#ff5fa2'];
// a new effect lasts this long, from where the object was tapped
export const DEFAULT_EFFECT_S = 3;
// an effect has to last at least this long
export const MIN_RANGE_S = 0.1;
// an impact's object is tracked this long before the hit, for its direction
export const IMPACT_LEAD_S = 0.2;
// how far an impact can be squeezed or stretched: 4x faster to 8x slower than its style
export const IMPACT_MIN_SPEED = 1 / 8, IMPACT_MAX_SPEED = 4;

// how fast an impact plays its burst: 1 = its style's own timing, 0.5 = half speed
export const impactSpeed = (t: { impact: ImpactStyle | null; range: { s: number; e: number } }) =>
  t.impact ? IMPACTS[t.impact].duration / Math.max(1e-3, t.range.e - t.range.s) : 1;

function make(id: number, kind: TrackKind, clip: ClipFrame[], fx: FxSettings, range: { s: number; e: number }, impact: ImpactStyle | null): Track {
  const t: Track = {
    id, name: `${kind === 'impact' ? 'Impact' : 'Object'} ${id}`, color: TRACK_COLORS[(id - 1) % TRACK_COLORS.length], kind,
    fx: { ...fx }, impact, range, shapes: new Array(clip.length).fill(null), frames: [], keys: [],
  };
  refreshFrames(t, clip);
  return t;
}

export const newTrack = (id: number, clip: ClipFrame[], fx: FxSettings, range: { s: number; e: number }) =>
  make(id, 'effect', clip, fx, range, null);

// an impact hitting at frame i
export function newImpact(id: number, clip: ClipFrame[], fx: FxSettings, style: ImpactStyle, i: number, duration: number) {
  return make(id, 'impact', clip, fx, impactRange(clip, i, style, duration), style);
}

const impactRange = (clip: ClipFrame[], i: number, style: ImpactStyle, duration: number) =>
  ({ s: clip[i].t, e: Math.min(duration, clip[i].t + IMPACTS[style].duration) });

// the frames that start inside the clip's range
export function rangeFrames(t: Track, clip: ClipFrame[]): FrameSpan {
  let s = 0, e = clip.length;
  while (s < e && clip[s].t < t.range.s - 1e-6) s++;
  while (e > s && clip[e - 1].t >= t.range.e - 1e-6) e--;
  return { s, e };
}

// the frames the object is tracked in: the range, and for an impact also the lead-up to the hit
// and wherever it was tapped (so a moved impact still follows the object from the tap)
export function trackSpan(t: Track, clip: ClipFrame[]): FrameSpan {
  const r = rangeFrames(t, clip);
  if (t.kind !== 'impact') return r;
  let s = r.s, e = r.e;
  while (s > 0 && clip[s - 1].t >= t.range.s - IMPACT_LEAD_S - 1e-6) s--;
  for (const k of t.keys) { s = Math.min(s, k.i); e = Math.max(e, k.i + 1); }
  return { s, e };
}

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
  const s = clamp(r.s ?? t.range.s), e = clamp(r.e ?? t.range.e);
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
export function setHit(t: Track, clip: ClipFrame[], duration: number, i = hitFrame(t, clip), style = t.impact) {
  if (t.kind !== 'impact' || !style || !t.impact || !clip[i]) return false;
  const len = t.range.e - t.range.s, stretched = Math.abs(len - IMPACTS[t.impact].duration) > 1e-3;
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
  let best: Track | null = null, bd = Infinity;
  for (const t of tracks) {
    const sb = t.frames[i]?.shapes[0];
    if (t === a || !sb) continue;
    const d = sa ? Math.hypot(sa.cx - sb.cx, sa.cy - sb.cy) : 0;
    if (d < bd) { bd = d; best = t; }
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
  const ak = a.keys.filter(k => k.i >= i), bk = b.keys.filter(k => k.i >= i);
  a.keys = [...a.keys.filter(k => k.i < i), ...bk]; b.keys = [...b.keys.filter(k => k.i < i), ...ak];
  refreshFrames(a, clip); refreshFrames(b, clip);
}

// the clip whose object's box contains (x, y) at frame i, while that clip is on
export const trackAt = (tracks: readonly Track[], clip: ClipFrame[], i: number, x: number, y: number) =>
  tracks.find(t => {
    const s = t.frames[i]?.shapes[0];
    return !!s && inSpan(rangeFrames(t, clip), i) && Math.abs(x - s.cx) < s.w / 2 && Math.abs(y - s.cy) < s.h / 2;
  }) ?? null;

// ---------- timeline view ----------
// a stretch where the object was found; weak = the tracker was searching
export interface Span { s: number; e: number; weak: boolean }

export interface Lane {
  id: number; name: string; color: string; kind: TrackKind; fx: FxSettings; impact: ImpactStyle | null;
  speed: number; // impacts: how fast the burst plays (1 = its style's own timing)
  range: { s: number; e: number };
  row: number;   // which timeline row it sits on
  spans: Span[]; // inside the range
  keys: number[]; // keyframe times inside the range
}

// stacks clips into as few rows as possible, like a video editor's tracks: each goes on the
// first row where it doesn't overlap anything, in order of start time
export function packRows(ranges: readonly { s: number; e: number }[]) {
  const order = ranges.map((_, k) => k).sort((a, b) => ranges[a].s - ranges[b].s || a - b);
  const rowEnds: number[] = [], rows = new Array<number>(ranges.length);
  for (const k of order) {
    let r = rowEnds.findIndex(end => end <= ranges[k].s + 1e-6);
    if (r < 0) { r = rowEnds.length; rowEnds.push(0); }
    rowEnds[r] = ranges[k].e; rows[k] = r;
  }
  return rows;
}

export function toLane(t: Track, clip: ClipFrame[], row: number): Lane {
  const range = rangeFrames(t, clip), spans: Span[] = [];
  for (let i = range.s; i < range.e; i++) {
    const sh = t.frames[i].shapes[0];
    if (!sh) continue;
    const f = clip[i], weak = !!sh.lost, last = spans[spans.length - 1];
    if (last && last.weak === weak && f.t - last.e < f.dur * 1.5) last.e = Math.min(t.range.e, f.t + f.dur);
    else spans.push({ s: f.t, e: Math.min(t.range.e, f.t + f.dur), weak });
  }
  return { id: t.id, name: t.name, color: t.color, kind: t.kind, fx: t.fx, impact: t.impact, speed: impactSpeed(t), range: t.range, row, spans,
    keys: t.keys.filter(k => inSpan(range, k.i)).map(k => clip[k.i].t) };
}
