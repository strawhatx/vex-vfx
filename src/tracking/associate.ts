// Gives each hand / body / face a stable id across the clip, so picking someone is just
// picking an id. A detection continues a track if it's near where that track was heading,
// a similar size, and has similar colours (clothes); the colours are what keep ids apart
// when people cross. Tracks that disappear can be picked up again by colour.

export interface Candidate { cx: number; cy: number; w: number; h: number; look: Float32Array }

interface Track { id: number; cx: number; cy: number; w: number; h: number; vx: number; vy: number; look: Float32Array; miss: number }

const FORGET_AFTER = 150; // frames

// colour histogram (4 levels per channel) of the middle of the box
export function lookOf(rgba: Uint8ClampedArray, W: number, H: number, cx: number, cy: number, w: number, h: number) {
  const hist = new Float32Array(64);
  const x0 = Math.max(0, Math.round(cx - w * 0.15)), x1 = Math.min(W - 1, Math.round(cx + w * 0.15));
  const y0 = Math.max(0, Math.round(cy - h * 0.25)), y1 = Math.min(H - 1, Math.round(cy + h * 0.05));
  let n = 0;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const i = (y * W + x) * 4; hist[(rgba[i] >> 6) * 16 + (rgba[i + 1] >> 6) * 4 + (rgba[i + 2] >> 6)]++; n++;
  }
  if (n) for (let i = 0; i < 64; i++) hist[i] /= n;
  return hist;
}
const lookDiff = (a: Float32Array, b: Float32Array) => { let s = 0; for (let i = 0; i < 64; i++) s += Math.min(a[i], b[i]); return 1 - s; };

export class Associator {
  private tracks: Track[] = [];
  private nextId = 1;

  // returns an id per candidate
  assign(cands: Candidate[]): number[] {
    const pairs: { t: Track; c: number; cost: number }[] = [];
    for (const t of this.tracks) {
      const px = t.cx + t.vx, py = t.cy + t.vy, size = Math.max(t.w, t.h, 12);
      // search wider the longer a track has been missing; after a while, a close colour
      // match anywhere counts as them reappearing
      const reach = t.miss > 8 ? Infinity : 0.5 + Math.min(1.5, t.miss * 0.15), maxDiff = t.miss > 8 ? 0.3 : 0.55;
      cands.forEach((c, i) => {
        const off = Math.hypot(c.cx - px, c.cy - py) / size, diff = lookDiff(c.look, t.look);
        if (off > reach || diff > maxDiff) return;
        pairs.push({ t, c: i, cost: off + Math.abs(Math.log((c.w * c.h + 1) / (t.w * t.h + 1))) * 0.3 + diff * 2 });
      });
    }
    pairs.sort((a, b) => a.cost - b.cost);
    const ids = new Array<number>(cands.length).fill(0), used = new Set<Track>();
    for (const p of pairs) {
      if (ids[p.c] || used.has(p.t)) continue;
      ids[p.c] = p.t.id; used.add(p.t);
      const c = cands[p.c], t = p.t;
      t.vx = 0.6 * (c.cx - t.cx) + 0.4 * t.vx; t.vy = 0.6 * (c.cy - t.cy) + 0.4 * t.vy;
      t.cx = c.cx; t.cy = c.cy; t.w = c.w; t.h = c.h; t.miss = 0;
      t.look = t.look.map((v, i) => 0.95 * v + 0.05 * c.look[i]); // follow slow lighting changes
    }
    for (const t of this.tracks) if (!used.has(t)) {
      // coast while hidden, slowing down so the search stays near where they went
      t.miss++; t.cx += t.vx; t.cy += t.vy; t.vx *= 0.8; t.vy *= 0.8;
    }
    this.tracks = this.tracks.filter(t => t.miss <= FORGET_AFTER);
    cands.forEach((c, i) => {
      if (ids[i]) return;
      const t: Track = { id: this.nextId++, cx: c.cx, cy: c.cy, w: c.w, h: c.h, vx: 0, vy: 0, look: c.look, miss: 0 };
      this.tracks.push(t); ids[i] = t.id;
    });
    return ids;
  }
}
