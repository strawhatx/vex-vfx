// A track: one tapped object. It keeps one shape per clip frame, the keyframes it was tracked
// from, its own effect, and when that effect starts and ends.
import type { Appearance } from '../tracking/appearance';
import type { FxSettings } from '../effects/palettes';
import type { ClipFrame, Shape, TrackFrame } from '../tracking/types';
import { hasKeyIn, type Key } from './keyframes';
import type { Shot } from './shots';

export interface Track {
  id: number; name: string; color: string;
  fx: FxSettings;
  shapes: (Shape | null)[]; // per clip frame
  frames: TrackFrame[];     // what gets drawn: the shapes inside the effect's range
  keys: Key[];              // in frame order
  appearance: Appearance | null; // how it looked where it was first tapped, to find it after cuts
  searched: Set<number>;    // shots it has been looked for in
  range: { s: number; e: number }; // effect start and end, seconds
}

export const TRACK_COLORS = ['#ff6a3d', '#3fb6ff', '#b6ff4a', '#d98bff', '#ffc640', '#ff5fa2'];
// the effect has to last at least this long
export const MIN_RANGE_S = 0.1;

export function newTrack(id: number, clip: ClipFrame[], fx: FxSettings, duration: number): Track {
  const t: Track = {
    id, name: `Object ${id}`, color: TRACK_COLORS[(id - 1) % TRACK_COLORS.length], fx: { ...fx },
    shapes: new Array(clip.length).fill(null), frames: [], keys: [], appearance: null, searched: new Set(),
    range: { s: 0, e: duration },
  };
  refreshFrames(t, clip);
  return t;
}

// rebuilds what gets drawn at frames [from, to) from the shapes and the effect's range
export function refreshFrames(t: Track, clip: ClipFrame[], from = 0, to = clip.length) {
  if (t.frames.length !== clip.length) t.frames = clip.map(f => ({ t: f.t, dur: f.dur, shapes: [] }));
  for (let i = from; i < to; i++) {
    const sh = t.shapes[i], f = clip[i];
    t.frames[i].shapes = sh && f.t >= t.range.s && f.t < t.range.e ? [sh] : [];
  }
}

export function clearShapes(t: Track, clip: ClipFrame[], from: number, to: number) {
  for (let k = from; k < to; k++) t.shapes[k] = null;
  refreshFrames(t, clip, from, to);
}

// sets the effect's start and/or end, kept inside the clip; false if it would be too short
export function setRange(t: Track, r: { s?: number; e?: number }, duration: number, clip: ClipFrame[]) {
  const clamp = (v: number) => Math.max(0, Math.min(v, duration));
  const s = clamp(r.s ?? t.range.s), e = clamp(r.e ?? t.range.e);
  if (e - s < MIN_RANGE_S) return false;
  t.range = { s, e };
  refreshFrames(t, clip);
  return true;
}

// the track nearest to `a` at frame i (for swapping two objects the tracker mixed up)
export function nearestOther(tracks: readonly Track[], a: Track, i: number) {
  const sa = a.shapes[i];
  let best: Track | null = null, bd = Infinity;
  for (const t of tracks) {
    if (t === a) continue;
    const sb = t.shapes[i], d = sa && sb ? Math.hypot(sa.cx - sb.cx, sa.cy - sb.cy) : 1e9 + t.id;
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

// the track whose box contains (x, y) at frame i
export const trackAt = (tracks: readonly Track[], i: number, x: number, y: number) =>
  tracks.find(t => { const s = t.shapes[i]; return !!s && Math.abs(x - s.cx) < s.w / 2 && Math.abs(y - s.cy) < s.h / 2; }) ?? null;

// ---------- timeline view of a track ----------
// a stretch of the clip where the object was found; weak = the tracker was searching
export interface Span { s: number; e: number; weak: boolean }

export interface Lane {
  id: number; name: string; color: string; fx: FxSettings;
  spans: Span[];
  keys: { t: number; auto: boolean }[];
  missing: { s: number; e: number; shot: number }[]; // shots it was looked for in and not found
  range: { s: number; e: number };
}

export function toLane(t: Track, clip: ClipFrame[], shots: Shot[]): Lane {
  const spans: Span[] = [];
  for (let i = 0; i < clip.length; i++) {
    const sh = t.shapes[i];
    if (!sh) continue;
    const f = clip[i], weak = !!sh.lost, last = spans[spans.length - 1];
    if (last && last.weak === weak && f.t - last.e < f.dur * 1.5) last.e = f.t + f.dur;
    else spans.push({ s: f.t, e: f.t + f.dur, weak });
  }
  const end = (sh: Shot) => { const f = clip[sh.e - 1]; return f.t + f.dur; };
  const missing = [...t.searched].filter(n => shots[n] && !hasKeyIn(t.keys, shots[n]))
    .sort((a, b) => a - b).map(n => ({ shot: n, s: clip[shots[n].s].t, e: end(shots[n]) }));
  return { id: t.id, name: t.name, color: t.color, fx: t.fx, spans, missing, range: t.range,
    keys: t.keys.map(k => ({ t: clip[k.i].t, auto: k.auto })) };
}
