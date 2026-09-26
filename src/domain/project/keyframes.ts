// Keyframes: a tap on an object (or an automatic match after a cut) marks where it is in one
// frame, and every frame is tracked from the nearest keyframe in its shot. So a keyframe "owns"
// the frames from halfway to the previous keyframe to halfway to the next one, never crossing a
// cut. Adding a keyframe only re-tracks the frames it takes over; removing one hands its frames
// to its neighbours.
import { inShot, shotIndex, type Shot } from './shots';

export interface Key { i: number; x: number; y: number; auto: boolean } // frame, and where in it (work pixels)

// the frames [from, to) that key tracks
export function ownedRange(keys: readonly Key[], key: Key, shot: Shot): [number, number] {
  let prev: Key | null = null, next: Key | null = null;
  for (const k of keys) {
    if (k === key || !inShot(shot, k.i)) continue;
    if (k.i < key.i && (!prev || k.i > prev.i)) prev = k;
    if (k.i > key.i && (!next || k.i < next.i)) next = k;
  }
  return [prev ? ((prev.i + key.i) >> 1) + 1 : shot.s, next ? ((key.i + next.i) >> 1) + 1 : shot.e];
}

// the keyframe that tracks frame i, if any
export function ownerOf(keys: readonly Key[], shots: Shot[], i: number) {
  const shot = shots[shotIndex(shots, i)];
  if (!shot) return null;
  for (const k of keys) {
    if (!inShot(shot, k.i)) continue;
    const [a, b] = ownedRange(keys, k, shot);
    if (i >= a && i < b) return k;
  }
  return null;
}

// adds a keyframe, replacing any on the same frame; keeps them in frame order
export function insertKey(keys: readonly Key[], key: Key) {
  const out = keys.filter(k => k.i !== key.i);
  out.push(key); out.sort((a, b) => a.i - b.i);
  return out;
}

// the other keyframes in the shot whose frames overlap [a, b) once `removed` is gone
export function neighboursTakingOver(keys: readonly Key[], shot: Shot, a: number, b: number) {
  return keys.filter(k => {
    if (!inShot(shot, k.i)) return false;
    const [ka, kb] = ownedRange(keys, k, shot);
    return ka < b && kb > a;
  });
}

export const hasKeyIn = (keys: readonly Key[], shot: Shot) => keys.some(k => inShot(shot, k.i));
