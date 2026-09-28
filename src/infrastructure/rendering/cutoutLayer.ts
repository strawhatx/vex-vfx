// Cutouts, in the video they're cut from: what's left there — the background rebuilt behind the
// object (a clean plate), or a hole cleared through the picture; or nothing, if the footage keeps
// the object. (The object cut out is a layer of the film's: see overlays.ts.) The clean plates come
// from the analysis worker (see CutFrame) and are kept here per frame.
import type { CutFrame, Sprite } from '@/application/ports';
import type { Layer } from './layer';
import type { View } from './view';

type Stored = { plate?: Sprite | null };

export class CutoutStore {
  private byId = new Map<number, Map<number, Stored>>();

  put(id: number, frames: CutFrame[]) {
    let m = this.byId.get(id);
    if (!m) this.byId.set(id, (m = new Map()));
    // (the cut-out pictures belong to the film's overlays, not here)
    for (const { i, ...parts } of frames) {
      const had = m.get(i) ?? {};
      if (parts.plate !== undefined) {
        if (had.plate && had.plate !== parts.plate) had.plate.image.close();
        had.plate = parts.plate;
      }
      m.set(i, had);
    }
  }

  // drops frames outside [s, e)
  trim(id: number, span: { s: number; e: number }) {
    const m = this.byId.get(id);
    if (!m) return;
    for (const [i, f] of m)
      if (i < span.s || i >= span.e) {
        f.plate?.image.close();
        m.delete(i);
      }
  }

  // drops every cutout not in keep
  keepOnly(keep: Set<number>) {
    for (const id of this.byId.keys()) if (!keep.has(id)) this.trim(id, { s: 0, e: 0 });
    for (const id of [...this.byId.keys()]) if (!keep.has(id)) this.byId.delete(id);
  }

  clear() {
    this.keepOnly(new Set());
  }

  get(id: number, i: number) {
    return this.byId.get(id)?.get(i) ?? null;
  }
}

const inRange = (t: number, r: { s: number; e: number }) => t >= r.s - 1e-6 && t < r.e - 1e-6;

// what's left in the footage at frame idx where the cutout was cut from. reveal: show the footage
// as it is (the selected cutout, paused, so its object can be seen to fix it)
export function drawCutoutHole(v: View, store: CutoutStore, l: Layer, idx: number, reveal: boolean) {
  const c = l.spec.cutout;
  if (!c || c.bg === 'keep' || reveal) return;
  if (!inRange(v.clip[idx].t, l.spec.range)) return;
  const ctx = v.ctx;
  if (c.bg === 'clean') {
    const p = store.get(l.spec.id, idx)?.plate;
    if (p) drawSprite(v, p);
    return;
  }
  // a hole: the object's outline cleared out of the picture
  if (!l.spec.frames[idx]?.shapes.length) return;
  l.geo.prepareCanvas(l.spec.frames[idx]);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'destination-out';
  ctx.drawImage(l.geo.maskCanvas, 0, 0, v.CW, v.CH);
  ctx.restore();
}

function drawSprite(v: View, s: Sprite, ctx = v.ctx) {
  ctx.drawImage(s.image, s.x * v.q, s.y * v.q, s.w * v.q, s.h * v.q);
}
