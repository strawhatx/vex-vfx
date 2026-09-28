// The film: the videos added to it, played one after another. Each video is edited on its own
// (split into scenes, some deleted: see edit.ts), and plays for as long as it's kept for; the film's
// time runs through them in order. A video with nothing kept takes no time.

// where each video plays in the film: from `at`, for `length` seconds
export interface ReelSpan {
  at: number;
  length: number;
}

// the videos, back to back, from how long each plays
export function layoutReels(lengths: readonly number[]): ReelSpan[] {
  let at = 0;
  return lengths.map(length => {
    const span = { at, length: Math.max(0, length) };
    at += span.length;
    return span;
  });
}

// how long the film is
export const filmLength = (spans: readonly ReelSpan[]) =>
  spans.reduce((end, s) => Math.max(end, s.at + s.length), 0);

// the video playing at film time t: the one whose stretch holds it (the last one at the very end);
// -1 when nothing plays
export function reelAt(spans: readonly ReelSpan[], t: number) {
  let last = -1;
  for (let k = 0; k < spans.length; k++) {
    const s = spans[k];
    if (s.length <= 0) continue;
    if (t < s.at + s.length - 1e-9) return k;
    last = k;
  }
  return last;
}

// the video after k that plays for some time, or -1
export function nextReel(spans: readonly ReelSpan[], k: number) {
  for (let n = k + 1; n < spans.length; n++) if (spans[n].length > 0) return n;
  return -1;
}
