// Cut detection, the way PySceneDetect's content detector works: compare each frame with the
// one before in HSV. Normal motion changes a little; a cut changes almost everything at once.
// A frame starts a new shot when its change is large in absolute terms and also well above the
// last few frames' changes (so fast camera moves don't count), and the shot so far is long enough.

const THRESHOLD = 27, RATIO = 3, WINDOW = 6;

// small rgba frame -> hsv with OpenCV's ranges (h 0..179, s and v 0..255)
export function toHsv(rgba: Uint8ClampedArray, out: Uint8Array) {
  for (let i = 0, j = 0; j < out.length; i += 4, j += 3) {
    const r = rgba[i], g = rgba[i + 1], b = rgba[i + 2], max = Math.max(r, g, b), d = max - Math.min(r, g, b);
    let h = 0;
    if (d) h = max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    out[j] = Math.round(h * 30) % 180; out[j + 1] = max ? Math.round(d / max * 255) : 0; out[j + 2] = max;
  }
}

export function frameDelta(a: Uint8Array, b: Uint8Array) {
  let dh = 0, ds = 0, dv = 0;
  for (let j = 0; j < a.length; j += 3) { dh += Math.abs(a[j] - b[j]); ds += Math.abs(a[j + 1] - b[j + 1]); dv += Math.abs(a[j + 2] - b[j + 2]); }
  const n = a.length / 3;
  return (dh + ds + dv) / (3 * n);
}

// deltas[i]: change from frame i-1 to i (deltas[0] unused); returns the frames that start a new shot
export function findCuts(deltas: number[], minShotFrames: number) {
  const cuts: number[] = [];
  let last = 0;
  for (let i = 1; i < deltas.length; i++) {
    let sum = 0, n = 0;
    for (let k = Math.max(1, i - WINDOW); k < i; k++) { sum += deltas[k]; n++; }
    const base = Math.max(2, n ? sum / n : 0);
    if (deltas[i] >= THRESHOLD && deltas[i] >= base * RATIO && i - last >= minShotFrames) { cuts.push(i); last = i; }
  }
  return cuts;
}
