// A track: one clip on the timeline. Two kinds:
// - an effect (fire, lightning…) follows one tapped object from its start to its end, which the
//   user sets to match the scene; the object is tracked only inside that range. Some effects can
//   instead come from a spot in the scene (see spot.ts), and track nothing.
// - an impact goes off at one moment (its start), at a spot tapped in the scene; nothing is
//   tracked. It starts as long as its style's burst; stretching it plays the burst slower,
//   squeezing it faster.
// - a cutout: an object rotoscoped out of the footage. Its object is tracked like an effect's over
//   its range (the frames it's cut from) and cut out along its outline; what's cut becomes a layer
//   of the film's own (see overlay.ts). Here it keeps what's left in the footage where it was.
// Clips can overlap, stacked on the timeline. Each keeps one shape per clip frame and the
// keyframes it was tracked from; a cutout also keeps pieces added to or taken out of its outline
// (see parts.ts), and what's drawn is its outline with them.
import { IMPACTS, familyOf, type ImpactStyle } from '../effects/impacts';
import type { Aim } from '../effects/laser';
import type { FxSettings } from '../effects/palettes';
import { partLabel, type BodyPart } from '../tracking/bodyParts';
import { type ClipFrame, type Shape, type TrackFrame } from '../tracking/types';
import type { Background } from './cutout';
import { inSpan, type FrameSpan, type Key } from './keyframes';
import type { EdgeSettings } from './edge';
import { DEFAULT_EDGE, outlinesOf } from './outlines';
import type { Part } from './parts';
import { reviewFlags } from './review';

export type TrackKind = 'effect' | 'impact' | 'cutout';

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
  // for cutouts: what's left in the footage where it was, whether its outlines have been checked
  // (it's only cut out once they have), and its edge settings
  cutout: { bg: Background; reviewed: boolean; edge: EdgeSettings } | null;
  // the size of the box drawn round the object when it was picked (work pixels): its outline is
  // only looked for in a box that size around it, which keeps it from spilling onto what's nearby
  focus: { w: number; h: number } | null;
  // the timeline row it sits on (among the effect rows, or the cutout rows), as the user left it;
  // null until it's first placed
  row: number | null;
  range: { s: number; e: number }; // seconds; for an impact, s is the moment of the hit; for a cutout, the frames it's cut from
  shapes: (Shape | null)[]; // per clip frame, as tracked
  parts: Part[]; // a cutout's pieces added or taken out, in the order picked (replaced, never changed in place, but for their tracked shapes)
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
    focus: null,
    row: null,
    range,
    shapes: new Array(clip.length).fill(null),
    parts: [],
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

// a new cutout of the object tapped, cut from `range`; bg: what's left in the footage where it was
export function newCutoutTrack(
  id: number,
  clip: ClipFrame[],
  fx: FxSettings,
  range: { s: number; e: number },
  bg: Background,
) {
  const t = make(id, 'cutout', clip, fx, range, null, null);
  t.cutout = { bg, reviewed: false, edge: DEFAULT_EDGE };
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

// rebuilds what gets drawn at frames [from, to) from the shapes and the tracked frames (see
// outlines.ts)
export function refreshFrames(t: Track, clip: ClipFrame[], from = 0, to = clip.length) {
  if (t.frames.length !== clip.length) t.frames = clip.map(f => ({ t: f.t, dur: f.dur, shapes: [] }));
  const span = trackSpan(t, clip),
    edge = t.cutout?.edge ?? (isPinned(t) ? null : DEFAULT_EDGE);
  // (a steadied frame is made from its neighbours too: they change with it)
  const r = Math.round(edge?.steady ?? 0);
  from = Math.max(0, from - r);
  to = Math.min(clip.length, to + r);
  const shapes = outlinesOf({ shapes: t.shapes, parts: t.parts, edge }, from, to, k => inSpan(span, k));
  for (let i = from; i < to; i++) {
    const sh = shapes[i - from];
    t.frames[i].shapes = sh ? [sh.id === t.id ? sh : { ...sh, id: t.id }] : [];
  }
}

// the outline drawn at each frame (null where there's none)
export const drawnShapes = (t: Track) => t.frames.map(f => f.shapes[0] ?? null);

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

// the clip whose object's box contains (x, y) at frame i, while that clip is on (cutouts are
// found where their layer is placed: see overlay.ts)
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

// ---------- timeline view ----------
// a stretch where the object was found; weak = it looks wrong there (see review.ts), to check and fix
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
  reel: number; // the video it's on (a cutout: the one it's cut from)
  spans: Span[]; // inside the range
  keys: number[]; // keyframe times inside the range
  // a cutout's: where it's cut from (seconds, the film's time; null once that video is gone), what's
  // left there, and its transform keyframes' times
  cutout: { from: number | null; bg: Background; moves: number[] } | null;
}

// a copy of the clip, numbered id: the same look, timing and tracking, on the row below
export function duplicate(t: Track, id: number, clip: ClipFrame[]): Track {
  const suffix = ` ${t.id}`;
  const d: Track = {
    ...t,
    id,
    name: t.name.endsWith(suffix) ? `${t.name.slice(0, -suffix.length)} ${id}` : `${t.name} copy`,
    color: TRACK_COLORS[(id - 1) % TRACK_COLORS.length],
    range: { ...t.range },
    shapes: t.shapes.map(sh => sh && { ...sh, id }),
    parts: t.parts.map(p => ({ ...p, shapes: p.shapes.slice() })),
    keys: t.keys.slice(),
    frames: [],
    row: t.row === null ? null : t.row + 1,
  };
  refreshFrames(d, clip);
  return d;
}

// puts clips on timeline rows, like a video editor's tracks: each on the row it wants (where the
// user put it) if nothing there overlaps it, else the next free row below; one that wants none goes
// on the first free row. Rows left empty close up. Returns each clip's row, 0 at the top.
export function assignRows(ranges: readonly { s: number; e: number }[], wanted: readonly (number | null)[]) {
  const order = ranges
    .map((_, k) => k)
    .sort((a, b) => {
      const wa = wanted[a],
        wb = wanted[b];
      if (wa !== null && wb !== null && wa !== wb) return wa - wb;
      if ((wa === null) !== (wb === null)) return wa === null ? 1 : -1;
      return ranges[a].s - ranges[b].s || a - b;
    });
  const taken = new Map<number, { s: number; e: number }[]>();
  const free = (r: number, k: number) =>
    !(taken.get(r) ?? []).some(o => o.s < ranges[k].e - 1e-6 && ranges[k].s < o.e - 1e-6);
  const rows = new Array<number>(ranges.length);
  for (const k of order) {
    let r = wanted[k] ?? 0;
    while (!free(r, k)) r++;
    taken.set(r, [...(taken.get(r) ?? []), ranges[k]]);
    rows[k] = r;
  }
  // close up empty rows
  const used = [...new Set(rows)].sort((a, b) => a - b);
  return rows.map(r => used.indexOf(r));
}

export function toLane(t: Track, clip: ClipFrame[], row: number): Lane {
  const range = rangeFrames(t, clip),
    spans: Span[] = [],
    // (a clip pinned to a spot follows nothing: nothing to doubt)
    flags = isPinned(t) ? null : reviewFlags(drawnShapes(t), range.s, range.e);
  for (let i = range.s; i < range.e; i++) {
    const sh = t.frames[i].shapes[0];
    if (!sh) continue;
    const f = clip[i],
      weak = flags ? flags[i - range.s] !== 'ok' : false,
      last = spans[spans.length - 1];
    if (last && last.weak === weak && f.t - last.e < f.dur * 1.5) last.e = Math.min(t.range.e, f.t + f.dur);
    else spans.push({ s: f.t, e: Math.min(t.range.e, f.t + f.dur), weak });
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
    range: t.range,
    row,
    reel: 0,
    spans,
    keys: t.keys.filter(k => inSpan(range, k.i)).map(k => clip[k.i].t),
    cutout: null,
  };
}
