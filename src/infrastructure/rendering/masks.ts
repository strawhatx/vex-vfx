// Effects drawn from an object's silhouette (its mask canvas, at output size): a soft glow hugging
// it, or a tint over it. Uses one scratch canvas the size of the output.
import type { Ctx2D } from './sprites';

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
