// What a tracked object looks like, so it can be found again after a cut: color histograms of
// the top and bottom halves of its silhouette (a person's shirt and trousers, say), plus its
// size and shape. Hue x saturation bins for colored pixels and a few brightness bins for
// grays, so black, white and gray objects still tell apart.
import type { Rle } from './types';

const HB = 12, SB = 3, GB = 4, BINS = HB * SB + GB;

export interface Appearance { top: Float32Array; bottom: Float32Array; area: number; aspect: number }

function bin(r: number, g: number, b: number) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b), v = max / 255, s = max ? (max - min) / max : 0;
  if (s < 0.2 || v < 0.15) return HB * SB + Math.min(GB - 1, (v * GB) | 0);
  let h = 0;
  const d = max - min;
  if (max === r) h = ((g - b) / d + 6) % 6; else if (max === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
  return Math.min(HB - 1, ((h / 6) * HB) | 0) * SB + Math.min(SB - 1, (((s - 0.2) / 0.8) * SB) | 0);
}

// rgba: W x H frame; rle: the object's silhouette in the same frame
export function describe(rgba: Uint8ClampedArray, W: number, H: number, rle: Rle): Appearance | null {
  const top = new Float32Array(BINS), bottom = new Float32Array(BINS), r = rle.runs, mid = rle.h / 2;
  let i = 0, nt = 0, nb = 0;
  for (let row = 0; row < rle.h; row++) {
    const cnt = r[i++], y = rle.y0 + row, hist = row < mid ? top : bottom;
    for (let k = 0; k < cnt; k++) {
      const s = r[i++], len = r[i++];
      if (y < 0 || y >= H) continue;
      for (let x = Math.max(0, rle.x0 + s), xe = Math.min(W, rle.x0 + s + len); x < xe; x++) {
        const j = (y * W + x) * 4;
        hist[bin(rgba[j], rgba[j + 1], rgba[j + 2])]++;
        if (row < mid) nt++; else nb++;
      }
    }
  }
  if (nt + nb < 30) return null;
  for (let b = 0; b < BINS; b++) { top[b] /= nt || 1; bottom[b] /= nb || 1; }
  return { top, bottom, area: (nt + nb) / (W * H), aspect: rle.w / Math.max(1, rle.h) };
}

const bc = (a: Float32Array, b: Float32Array) => { let s = 0; for (let i = 0; i < BINS; i++) s += Math.sqrt(a[i] * b[i]); return s; };

// 0..1; colors matter most, size and shape less (the object can move nearer or turn between shots)
export function similarity(a: Appearance, b: Appearance) {
  const color = Math.sqrt(bc(a.top, b.top) * bc(a.bottom, b.bottom));
  const size = Math.min(a.area, b.area) / Math.max(a.area, b.area);
  const shape = Math.min(a.aspect, b.aspect) / Math.max(a.aspect, b.aspect);
  return color * size ** 0.12 * shape ** 0.3;
}
