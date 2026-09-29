// The Clones effect: copies of the tracked object beside it, fanned out either side, tinted and
// glowing, the object itself kept in front. With a delay, each copy is the object as it was a moment
// before, so moving it leaves a trail. The object is cut from the frame along its silhouette; recent
// cuts are kept for the trail (while scrubbing, a moment not kept uses the one now).
import type { Params } from '@/domain/effects/params';
import { frameIndexAt, type TrackFrame } from '@/domain/tracking/types';
import { unit } from './particles/types';
import type { FxFrame } from './sim';
import type { Ctx2D } from './sprites';

// how many recent cuts are kept for trails, per clip
const KEEP = 24;

export class ClonePainter {
  private now = new OffscreenCanvas(1, 1);
  private tinted = new OffscreenCanvas(1, 1);
  private past = new Map<string, OffscreenCanvas>(); // by clip and frame

  constructor(
    private CW: number,
    private CH: number,
  ) {
    for (const c of [this.now, this.tinted]) {
      c.width = CW;
      c.height = CH;
    }
  }

  draw(
    ctx: Ctx2D,
    source: CanvasImageSource,
    mask: OffscreenCanvas,
    f: FxFrame,
    p: Params,
    clip: { id: number; frames: readonly TrackFrame[] },
  ) {
    if (!f.tgt.active || !f.hasShape) return;
    const { CW, CH } = this;
    const cut = this.cut(this.now, source, mask);
    this.keep(clip.id, f.index, cut);
    const count = Math.round(p.count as number),
      u = unit(f.tgt, 1);
    // the farthest first, so nearer ones are drawn over them
    for (let j = count; j >= 1; j--) {
      const side = j % 2 ? -1 : 1,
        step = Math.ceil(j / 2);
      const dx = side * step * (p.spread as number) * f.tgt.rx * 1.6;
      const delay = (p.delay as number) * j;
      const then = delay > 0 ? frameIndexAt(clip.frames, f.t - delay) : f.index;
      const src = this.past.get(`${clip.id}:${then}`) ?? cut;
      const g = this.tinted.getContext('2d') as OffscreenCanvasRenderingContext2D;
      g.globalCompositeOperation = 'copy';
      g.drawImage(src, 0, 0, CW, CH);
      g.globalCompositeOperation = 'source-atop';
      g.globalAlpha = p.tint as number;
      g.fillStyle = p.color as string;
      g.fillRect(0, 0, CW, CH);
      g.globalAlpha = 1;
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = Math.min(1, (p.amount as number) * (1 - ((j - 1) / (count + 1)) * 0.6));
      if ((p.glow as number) > 0) {
        ctx.shadowColor = p.color as string;
        ctx.shadowBlur = (p.glow as number) * u * 3;
      }
      ctx.drawImage(this.tinted, dx, 0);
      ctx.restore();
    }
    // the object itself in front
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(cut, 0, 0);
    ctx.restore();
  }

  // the object cut from the frame along its silhouette, onto c
  private cut(c: OffscreenCanvas, source: CanvasImageSource, mask: OffscreenCanvas) {
    const g = c.getContext('2d') as OffscreenCanvasRenderingContext2D;
    g.globalCompositeOperation = 'copy';
    g.drawImage(source, 0, 0, this.CW, this.CH);
    g.globalCompositeOperation = 'destination-in';
    g.drawImage(mask, 0, 0, this.CW, this.CH);
    g.globalCompositeOperation = 'source-over';
    return c;
  }

  // a copy of the cut at frame i of clip id, for trails (at half size: they're faint copies)
  private keep(id: number, i: number, cut: OffscreenCanvas) {
    const key = `${id}:${i}`;
    if (this.past.has(key)) return;
    const c = new OffscreenCanvas(Math.max(1, this.CW >> 1), Math.max(1, this.CH >> 1));
    (c.getContext('2d') as OffscreenCanvasRenderingContext2D).drawImage(cut, 0, 0, c.width, c.height);
    this.past.set(key, c);
    if (this.past.size > KEEP * 4) this.past.delete(this.past.keys().next().value!);
  }
}
