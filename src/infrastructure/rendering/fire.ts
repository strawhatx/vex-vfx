// Fire drawn on the GPU (FireShader) at half the output size, rising from a heat source: the
// object's silhouette, or an ellipse around it when there's only a box.
import type { Ctx2D } from './sprites';
import { FireShader } from './fireShader';
import type { FxFrame } from './sim';

export class GpuFire {
  private shader: FireShader | null = null;
  private failed = false; // no WebGL here: the particle fire is used instead
  private source = new OffscreenCanvas(1, 1);
  private CW = 1;
  private CH = 1;

  // the output size; the one WebGL context is kept and resized (browsers allow only a few)
  resize(CW: number, CH: number) {
    this.CW = CW;
    this.CH = CH;
    const fw = Math.max(1, Math.round(CW / 2));
    const fh = Math.max(1, Math.round(CH / 2));
    this.source = new OffscreenCanvas(fw, fh);
    this.shader?.resize(fw, fh);
  }

  // false if the GPU fire isn't available
  draw(ctx: Ctx2D, mask: OffscreenCanvas, f: FxFrame, u: number, intensity: number, pal: number) {
    const src = this.source;
    const fw = src.width;
    const fh = src.height;
    if (!this.shader && !this.failed) {
      this.shader = FireShader.create(fw, fh);
      this.failed = !this.shader;
    }
    if (!this.shader) return false;

    // the heat source
    const g = src.getContext('2d') as OffscreenCanvasRenderingContext2D;
    const k = fw / this.CW;
    const t = f.tgt;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, fw, fh);
    if (f.hasShape) {
      g.drawImage(mask, 0, 0, fw, fh);
    } else {
      g.fillStyle = '#fff';
      g.beginPath();
      g.ellipse(t.x * k, t.y * k, t.rx * k, t.ry * k, 0, 0, Math.PI * 2);
      g.fill();
    }

    const out = this.shader.render(src, f.t, u * k, u * k * 9, Math.min(1.6, intensity), pal);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'lighter';
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(out, 0, 0, this.CW, this.CH);
    ctx.restore();
    return true;
  }
}
