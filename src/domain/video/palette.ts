// The brand colour, sampled from the screenshots' pixels: the most common colourful colour, skipping
// greys, near-black and near-white (the UI's background and text). And which text colour reads on it.

// pixels: RGBA bytes, as a canvas gives them. Null if nothing colourful was found.
export function brandColor(pixels: Uint8ClampedArray | number[]): string | null {
  const buckets = new Map<number, { n: number; r: number; g: number; b: number }>();
  for (let i = 0; i + 3 < pixels.length; i += 4) {
    const r = pixels[i],
      g = pixels[i + 1],
      b = pixels[i + 2],
      a = pixels[i + 3];
    if (a < 128) continue;
    const max = Math.max(r, g, b),
      min = Math.min(r, g, b);
    const l = (max + min) / 510;
    const s = max === min ? 0 : (max - min) / (255 - Math.abs(max + min - 255));
    if (s < 0.35 || l < 0.15 || l > 0.9) continue;
    // 4 bits a channel; weighted by how colourful it is
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const w = s;
    const e = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    e.n += w;
    e.r += r * w;
    e.g += g * w;
    e.b += b * w;
    buckets.set(key, e);
  }
  let best: { n: number; r: number; g: number; b: number } | null = null;
  for (const e of buckets.values()) if (!best || e.n > best.n) best = e;
  if (!best || best.n < 4) return null;
  return toHex(best.r / best.n, best.g / best.n, best.b / best.n);
}

export const toHex = (r: number, g: number, b: number) =>
  '#' +
  [r, g, b]
    .map(v =>
      Math.round(Math.max(0, Math.min(255, v)))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('');

export function parseHex(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// WCAG relative luminance
export function luminance(hex: string): number {
  const c = parseHex(hex);
  if (!c) return 0;
  const [r, g, b] = c.map(v => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export const contrast = (a: string, b: string) => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

// black or white, whichever reads better on the colour
export const textOn = (hex: string) =>
  contrast(hex, '#000000') >= contrast(hex, '#ffffff') ? '#000000' : '#ffffff';
