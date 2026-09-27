// Cutouts: objects cut out of the footage into layers of their own. Two parts, drawn at different
// times of the frame:
//   - where it was cut from: the background rebuilt behind the object (a clean plate), or a hole
//     cleared through the picture; or nothing, if the footage keeps the object
//   - the layer itself: the object as cut out of the frame it's playing, placed where the layer is
//     (moved, scaled and turned about the object's middle, and faded)
// The cut-out pictures come from the analysis worker (see CutFrame) and are kept here per frame.
import type { CutFrame, Sprite } from '@/application/ports';
import { sourceTime, transformAt } from '@/domain/project/cutout';
import { frameIndexAt } from '@/domain/tracking/types';
import type { Layer } from './layer';
import type { View } from './view';

type Stored = { cut?: Sprite | null; plate?: Sprite | null };

export class CutoutStore {
  private byId = new Map<number, Map<number, Stored>>();

  put(id: number, frames: CutFrame[]) {
    let m = this.byId.get(id);
    if (!m) this.byId.set(id, (m = new Map()));
    for (const { i, ...parts } of frames) {
      const had = m.get(i) ?? {};
      if (parts.cut !== undefined) {
        if (had.cut && had.cut !== parts.cut) had.cut.image.close();
        had.cut = parts.cut;
      }
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
        f.cut?.image.close();
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

// the layer at frame idx, where it's placed; its box (output pixels, before turning) for the
// editor's outline, or null if it isn't showing
export function drawCutout(v: View, store: CutoutStore, l: Layer, idx: number) {
  const c = l.spec.cutout;
  const t = v.clip[idx].t;
  if (!c) return null;
  const len = l.spec.range.e - l.spec.range.s;
  if (!inRange(t, { s: c.at, e: c.at + len })) return null;
  const j = frameIndexAt(v.clip, sourceTime(l.spec.range, c, t));
  if (j < 0 || !inRange(v.clip[j].t, l.spec.range)) return null;
  const tgt = l.geo.target(l.spec.frames, j, 1 / 30, v.shot);
  if (!tgt.active) return null;
  const tf = transformAt(c, t - c.at);
  const px = tgt.x,
    py = tgt.y;
  const ctx = v.ctx;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.translate(px + tf.x * v.q, py + tf.y * v.q);
  ctx.rotate((tf.rot * Math.PI) / 180);
  ctx.scale(tf.scale, tf.scale);
  ctx.translate(-px, -py);
  const cut = store.get(l.spec.id, j)?.cut;
  if (cut && tf.opacity > 0) {
    ctx.globalAlpha = tf.opacity;
    drawSprite(v, cut, ctx);
  }
  const box = { x: px - tgt.rx, y: py - tgt.ry, w: tgt.rx * 2, h: tgt.ry * 2 };
  ctx.restore();
  return { box, at: { x: px + tf.x * v.q, y: py + tf.y * v.q }, pivot: { x: px, y: py }, tf, ready: !!cut };
}

// the selected cutout's box as placed: a dashed frame round it
export function drawCutoutFrame(
  v: View,
  l: Layer,
  placed: NonNullable<ReturnType<typeof drawCutout>>,
  selected: boolean,
) {
  const { box, pivot, at, tf } = placed;
  const ctx = v.ctx;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.translate(at.x, at.y);
  ctx.rotate((tf.rot * Math.PI) / 180);
  ctx.scale(tf.scale, tf.scale);
  ctx.translate(-pivot.x, -pivot.y);
  ctx.strokeStyle = l.spec.color;
  ctx.lineWidth = (selected ? 2 : 1) / tf.scale;
  ctx.setLineDash([8 / tf.scale, 5 / tf.scale]);
  ctx.shadowColor = '#000';
  ctx.shadowBlur = 3;
  ctx.strokeRect(box.x, box.y, box.w, box.h);
  ctx.restore();
}

function drawSprite(v: View, s: Sprite, ctx = v.ctx) {
  ctx.drawImage(s.image, s.x * v.q, s.y * v.q, s.w * v.q, s.h * v.q);
}
