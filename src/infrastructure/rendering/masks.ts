// Effects drawn from an object's silhouette (its mask canvas, at output size): a soft glow hugging
// it, a tint over it, or a line round it. Uses one scratch canvas the size of the output.
import type { Ctx2D } from './sprites';

export interface Edge {
  col: string;
  width: number; // output pixels
  alpha: number;
  gap?: number; // how far outside the silhouette it starts
  blur?: number; // glow
  dx?: number;
  dy?: number;
  scale?: number; // the silhouette grown by this factor about `at` first
  at?: { x: number; y: number };
  solid?: boolean; // drawn over the picture rather than added to it, so it keeps its color
}

export class MaskPainter {
  private canvas: OffscreenCanvas;
  private g: OffscreenCanvasRenderingContext2D;

  constructor(
    private CW: number,
    private CH: number,
  ) {
    this.canvas = new OffscreenCanvas(CW, CH);
    this.g = this.canvas.getContext('2d') as OffscreenCanvasRenderingContext2D;
  }

  // a soft glow around the silhouette; cut keeps the inside clear
  glow(mask: OffscreenCanvas, ctx: Ctx2D, col: string, blur: number, alpha: number, cut = true) {
    const { g, CW, CH } = this;
    // the shadow of a copy drawn off to the side, so only the blur lands on the canvas
    const off = CW + 64;
    this.reset();
    g.save();
    g.shadowColor = col;
    g.shadowBlur = blur;
    g.shadowOffsetX = off;
    g.drawImage(mask, -off, 0, CW, CH);
    g.restore();
    if (cut) {
      g.globalCompositeOperation = 'destination-out';
      g.drawImage(mask, 0, 0, CW, CH);
      g.globalCompositeOperation = 'source-over';
    }
    this.drawOnto(ctx, Math.max(0, Math.min(1, alpha)), 'lighter');
  }

  // the silhouette filled with a color
  tint(mask: OffscreenCanvas, ctx: Ctx2D, col: string, alpha: number) {
    const { g, CW, CH } = this;
    this.reset();
    g.drawImage(mask, 0, 0, CW, CH);
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = col;
    g.fillRect(0, 0, CW, CH);
    g.globalCompositeOperation = 'source-over';
    this.drawOnto(ctx, alpha, 'source-over');
  }

  // everything but the silhouette covered with `col`, fading in over `soft` px at its edge
  outside(mask: OffscreenCanvas, ctx: Ctx2D, col: string, alpha: number, soft = 0) {
    const { g, CW, CH } = this;
    this.reset();
    g.fillStyle = col;
    g.fillRect(0, 0, CW, CH);
    g.globalCompositeOperation = 'destination-out';
    if (soft > 0) g.filter = `blur(${soft / 2}px)`;
    g.drawImage(mask, 0, 0, CW, CH);
    g.filter = 'none';
    g.globalCompositeOperation = 'source-over';
    this.drawOnto(ctx, alpha, 'source-over');
  }

  // a line round the silhouette: a band `width` wide, starting `gap` outside it, shifted by
  // (dx, dy) and scaled, with a glow of `blur` around it
  edge(mask: OffscreenCanvas, ctx: Ctx2D, e: Edge) {
    const { g, CW, CH } = this;
    const k = e.scale ?? 1,
      at = e.at ?? { x: 0, y: 0 },
      dx = (e.dx ?? 0) + at.x * (1 - k),
      dy = (e.dy ?? 0) + at.y * (1 - k),
      gap = e.gap ?? 0;
    this.reset();
    this.spread(mask, gap + e.width, dx, dy, k);
    g.globalCompositeOperation = 'destination-out';
    this.spread(mask, gap, dx, dy, k);
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = e.col;
    g.fillRect(0, 0, CW, CH);
    g.globalCompositeOperation = 'source-over';
    const alpha = Math.max(0, Math.min(1, e.alpha));
    if (e.blur) {
      // the glow: the shadow of a copy drawn off to the side, so only the blur lands
      const off = CW + 64;
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = alpha;
      ctx.shadowColor = e.col;
      ctx.shadowBlur = e.blur;
      ctx.shadowOffsetX = off;
      ctx.drawImage(this.canvas, -off, 0);
      ctx.restore();
    }
    this.drawOnto(ctx, alpha, e.solid ? 'source-over' : 'lighter');
  }

  // the silhouette (scaled by k) grown by r pixels, by drawing it shifted round a circle, onto the
  // scratch canvas. Close enough steps that corners don't come out stepped; best kept to small r.
  private spread(mask: OffscreenCanvas, r: number, dx: number, dy: number, k: number) {
    const { g, CW, CH } = this;
    const w = CW * k,
      h = CH * k;
    g.drawImage(mask, dx, dy, w, h);
    if (r < 0.5) return;
    const rings = r > 4 ? [r / 2, r] : [r];
    for (const rr of rings) {
      const steps = Math.min(64, Math.max(8, Math.round(rr * 3)));
      for (let n = 0; n < steps; n++) {
        const a = (n / steps) * Math.PI * 2;
        g.drawImage(mask, dx + Math.cos(a) * rr, dy + Math.sin(a) * rr, w, h);
      }
    }
  }

  private reset() {
    const g = this.g;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
    g.clearRect(0, 0, this.CW, this.CH);
  }

  private drawOnto(ctx: Ctx2D, alpha: number, op: GlobalCompositeOperation) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = op;
    ctx.globalAlpha = alpha;
    ctx.drawImage(this.canvas, 0, 0);
    ctx.restore();
  }
}
