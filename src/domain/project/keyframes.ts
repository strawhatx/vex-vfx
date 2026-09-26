// Keyframes: a tap on an object marks where it is in one frame, and every frame of the effect is
// tracked from the nearest keyframe. So a keyframe "owns" the frames from halfway to the previous
// keyframe to halfway to the next one, within the effect's frames. Adding a keyframe only
// re-tracks the frames it takes over; removing one hands its frames to its neighbours.

export interface Key { i: number; x: number; y: number } // frame, and where in it (work pixels)
export interface FrameSpan { s: number; e: number }       // frame indices, e exclusive

export const inSpan = (span: FrameSpan, i: number) => i >= span.s && i < span.e;

// the frames [from, to) that key tracks within span
export function ownedRange(keys: readonly Key[], key: Key, span: FrameSpan): [number, number] {
  let prev: Key | null = null, next: Key | null = null;
  for (const k of keys) {
    if (k === key || !inSpan(span, k.i)) continue;
    if (k.i < key.i && (!prev || k.i > prev.i)) prev = k;
    if (k.i > key.i && (!next || k.i < next.i)) next = k;
  }
  return [prev ? ((prev.i + key.i) >> 1) + 1 : span.s, next ? ((key.i + next.i) >> 1) + 1 : span.e];
}

// the keyframe that tracks frame i, if any
export function ownerOf(keys: readonly Key[], span: FrameSpan, i: number) {
  if (!inSpan(span, i)) return null;
  for (const k of keys) {
    if (!inSpan(span, k.i)) continue;
    const [a, b] = ownedRange(keys, k, span);
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

// the keyframes in span whose frames overlap [a, b)
export function keysCovering(keys: readonly Key[], span: FrameSpan, a: number, b: number) {
  return keys.filter(k => {
    if (!inSpan(span, k.i)) return false;
    const [ka, kb] = ownedRange(keys, k, span);
    return ka < b && kb > a;
  });
}

// the keyframes that now own frames they didn't before (the effect's range changed): only those
// frames need tracking; frames a keyframe gave up were already tracked
export function keysToRetrack(keys: readonly Key[], before: FrameSpan, after: FrameSpan) {
  return keys.filter(k => {
    if (!inSpan(after, k.i)) return false;
    if (!inSpan(before, k.i)) return true;
    const [a0, b0] = ownedRange(keys, k, before), [a1, b1] = ownedRange(keys, k, after);
    return a1 < a0 || b1 > b0;
  });
}
