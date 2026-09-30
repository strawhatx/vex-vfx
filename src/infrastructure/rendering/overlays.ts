// The subject layers (objects cut out of the film's videos: see domain/project/overlay): their
// pictures, kept here as they're cut, and drawn over their video's picture while it plays, where
// each is placed: on its object, or moved, scaled and turned about the object's middle, and faded. In the editor, the selected one gets a dashed frame, as do ones still being cut; one
// can also be shown on its own, on a checkerboard. Its animation (in, out, combo) moves it on top of
// where it's placed.
import type { OverlayPictures, OverlaySprite } from '@/application/ports';
import { frameAt, overlayPose, placedBox, type Overlay } from '@/domain/project/overlay';
import { applyPose } from './pose';
import type { Ctx2D } from './sprites';

// pictures are kept by their time in the video, to the millisecond
const key = (t: number) => Math.round(t * 1000);

export interface OverlayDrawOptions {
  selected: number | null;
  outline: boolean; // editing, not exporting
  isolate: number | null; // show this one on its own
}

export class OverlayPainter implements OverlayPictures {
  private byId = new Map<number, Map<number, OverlaySprite | null>>();

  put(id: number, frames: { t: number; cut: OverlaySprite | null }[]) {
    let m = this.byId.get(id);
    if (!m) this.byId.set(id, (m = new Map()));
    for (const f of frames) m.set(key(f.t), f.cut);
  }

  trim(id: number, span: { s: number; e: number }) {
    const m = this.byId.get(id);
    if (!m) return;
    for (const k of [...m.keys()]) if (k < key(span.s) || k >= key(span.e)) m.delete(k);
  }

  copy(from: number, to: number) {
    this.byId.set(to, new Map(this.byId.get(from)));
  }

  clear() {
    this.byId.clear();
  }

  // draws the subject layers showing at time t of their video (all of the one playing) onto ctx, a
  // W x H picture (top last)
  draw(ctx: Ctx2D, W: number, H: number, overlays: readonly Overlay[], t: number, opts: OverlayDrawOptions) {
    const alone = opts.isolate !== null ? overlays.find(o => o.id === opts.isolate) : undefined;
    if (alone) {
      drawChecker(ctx, W, H);
      overlays = [alone];
    }
    for (const o of overlays) {
      const b = placedBox(o, t, W, H);
      if (!b) continue;
      const f = frameAt(o, t)!;
      const pic = this.byId.get(o.id)?.get(key(f.t));
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      applyPose(ctx, overlayPose(o, t), b.at.x, b.at.y, W, H);
      ctx.translate(b.at.x, b.at.y);
      ctx.rotate((b.tf.rot * Math.PI) / 180);
      ctx.scale(b.tf.scale, b.tf.scale);
      ctx.translate(-b.pivot.x, -b.pivot.y);
      if (pic && b.tf.opacity > 0) {
        ctx.globalAlpha *= b.tf.opacity;
        const r = b.rect;
        ctx.drawImage(pic.image, r.x + pic.x * r.w, r.y + pic.y * r.h, pic.w * r.w, pic.h * r.h);
        ctx.globalAlpha = 1;
      }
      // the selected one, and ones still being cut, show their frame
      const selected = opts.selected === o.id;
      if (opts.outline && (selected || pic === undefined)) {
        ctx.strokeStyle = o.color;
        ctx.lineWidth = (selected ? 2 : 1) / b.tf.scale;
        ctx.setLineDash([8 / b.tf.scale, 5 / b.tf.scale]);
        ctx.shadowColor = '#000';
        ctx.shadowBlur = 3;
        ctx.strokeRect(b.pivot.x - b.w / 2, b.pivot.y - b.h / 2, b.w, b.h);
      }
      ctx.restore();
    }
  }
}

// the grey and white squares behind something shown on its own, where nothing is
function drawChecker(ctx: Ctx2D, W: number, H: number) {
  const n = Math.max(8, Math.round(W / 48));
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#d6d6d6';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#9a9a9a';
  for (let y = 0; y * n < H; y++) for (let x = y % 2; x * n < W; x += 2) ctx.fillRect(x * n, y * n, n, n);
  ctx.restore();
}
