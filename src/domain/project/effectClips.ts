// Effect clips: the user's own effect videos (fire, an explosion, sparks, filmed on black or on a
// green screen), kept in a library on the device and placed on the film. An overlay video is one
// too: another video put on top of the film (picked for it, not kept in the library), drawn as it
// is, on the Overlay layer. An effect clip plays a
// stretch of its video from where it's placed, where it's put in the frame (moved, sized, turned
// and faded), blended in: added onto the picture where it's bright (for black backgrounds), or with
// its green keyed out. Like music, trimming an end keeps what plays where it is.

export type Blend = 'screen' | 'add' | 'key' | 'normal';

export const BLENDS: readonly { id: Blend; label: string; about: string }[] = [
  { id: 'screen', label: 'Screen', about: 'For effects on black: the black disappears' },
  { id: 'add', label: 'Add', about: 'Like Screen, brighter where it overlaps' },
  { id: 'key', label: 'Green screen', about: 'For effects on green: the green is keyed out' },
  { id: 'normal', label: 'Normal', about: 'Drawn as it is' },
];

// an effect video in the library (its file is kept with it)
export interface PackItem {
  id: string;
  name: string;
  length: number; // seconds
  blend: Blend; // how a new clip of it is blended
}

export interface EffectClip {
  id: number;
  name: string;
  pack: string; // the library video it plays
  row: number | null; // the row the user put it on (null: wherever it fits)
  at: number; // when it starts, in the film's time
  src: { s: number; e: number }; // the stretch of its video it plays
  length: number; // its video's
  x: number; // its middle, as fractions of the frame
  y: number;
  scale: number; // 1: half the frame's width
  rot: number; // degrees
  opacity: number;
  blend: Blend;
  tolerance: number; // green screen: how far from the green is keyed out, 0..1
  overlay?: boolean; // another video on top of the film (on the Overlay layer), not an effect
}

export const MIN_EFFECT_S = 0.1,
  MIN_EFFECT_SCALE = 0.1,
  MAX_EFFECT_SCALE = 6;

// a clip of library video `item` placed at film time `at`, in the middle: all of it, or as much as
// fits before the film ends
export function newEffectClip(id: number, item: PackItem, at: number, filmLength: number): EffectClip {
  const room = filmLength - at;
  return {
    id,
    name: item.name,
    pack: item.id,
    row: null,
    at: Math.max(0, at),
    src: { s: 0, e: room > MIN_EFFECT_S ? Math.min(item.length, room) : item.length },
    length: item.length,
    x: 0.5,
    y: 0.5,
    scale: 1,
    rot: 0,
    opacity: 1,
    blend: item.blend,
    tolerance: 0.35,
  };
}

// another video (`file`: its id among the film's files, `length` long) on top of the film at film
// time `at`: drawn as it is, most of the frame's width, in the middle
export function newOverlayVideo(
  id: number,
  file: string,
  name: string,
  length: number,
  at: number,
  filmLength: number,
): EffectClip {
  const c = newEffectClip(id, { id: file, name, length, blend: 'normal' }, at, filmLength);
  return { ...c, scale: OVERLAY_SCALE, overlay: true };
}
const OVERLAY_SCALE = 1.6;

// when it plays, in the film's time
export const effectRange = (c: Pick<EffectClip, 'at' | 'src'>) => ({
  s: c.at,
  e: c.at + (c.src.e - c.src.s),
});

// its start or end moved to film time s or e, keeping what plays where it is (within its video,
// and not before the film's start)
export function trimEffect(c: EffectClip, r: { s?: number; e?: number }): EffectClip {
  const was = effectRange(c);
  let s = r.s ?? was.s;
  const e = r.e ?? was.e;
  let ss = c.src.s + (s - c.at),
    se = c.src.s + (e - c.at);
  if (ss < 0) {
    s -= ss;
    ss = 0;
  }
  if (s < 0) {
    ss -= s;
    s = 0;
  }
  se = Math.min(se, c.length);
  if (se - ss < MIN_EFFECT_S) {
    if (r.s !== undefined) ss = se - MIN_EFFECT_S;
    else se = ss + MIN_EFFECT_S;
    s = c.at + (ss - c.src.s);
  }
  return { ...c, at: s, src: { s: ss, e: se } };
}

export const placeEffect = (c: EffectClip, at: number): EffectClip => ({ ...c, at: Math.max(0, at) });

// where it's put in the frame, and how it's blended, kept in bounds
export function withLook(
  c: EffectClip,
  p: Partial<Pick<EffectClip, 'x' | 'y' | 'scale' | 'rot' | 'opacity' | 'blend' | 'tolerance'>>,
): EffectClip {
  const n = { ...c, ...p };
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
  return {
    ...n,
    scale: clamp(n.scale, MIN_EFFECT_SCALE, MAX_EFFECT_SCALE),
    opacity: clamp(n.opacity, 0, 1),
    tolerance: clamp(n.tolerance, 0, 1),
  };
}

// the clips playing at film time t, each with the time in its video then; lower rows first (so
// the top row ends up on top)
export function effectsAt(clips: readonly EffectClip[], t: number) {
  return clips
    .filter(c => {
      const r = effectRange(c);
      return t >= r.s - 1e-6 && t < r.e - 1e-6;
    })
    .sort((a, b) => (b.row ?? 0) - (a.row ?? 0))
    .map(clip => ({ clip, time: clip.src.s + (t - clip.at) }));
}

// how to blend a video in, from the colors in its first frame's corners (0..1): on green, keyed;
// on black, screened; anything else, as it is
export function guessBlend(corners: readonly (readonly [number, number, number])[]): Blend {
  if (!corners.length) return 'normal';
  const green = corners.filter(([r, g, b]) => g > 0.35 && g > r * 1.4 && g > b * 1.4).length;
  const dark = corners.filter(([r, g, b]) => Math.max(r, g, b) < 0.12).length;
  if (green * 2 > corners.length) return 'key';
  if (dark * 2 > corners.length) return 'screen';
  return 'normal';
}
