// The Glitch effect: the picture's own pixels broken up (see domain/effects/glitches), on the
// tracked object only (its silhouette, or its box when there's no silhouette) or over the whole
// frame. It works on the frame as drawn so far, so effects under it glitch too. Glitches come in
// bursts; everything is a function of the frame's time and the clip's seed, so any frame renders
// the same whether playing, scrubbing or exporting.
import type { FxSettings } from '@/domain/effects/palettes';
import { mulberry32 } from './rng';
import type { Target } from './sim';
import type { Ctx2D } from './sprites';

type Scratch = { c: OffscreenCanvas; g: OffscreenCanvasRenderingContext2D };
const scratch = (w: number, h: number): Scratch => {
  const c = new OffscreenCanvas(w, h);
  return { c, g: c.getContext('2d') as OffscreenCanvasRenderingContext2D };
};

// where it glitches: the object (its silhouette on the mask canvas, at work size, or null for just
// its box), or null for the whole frame
export type GlitchArea = { mask: OffscreenCanvas | null; box: Target } | null;

type Rect = { x: number; y: number; w: number; h: number };

export class GlitchPainter {
  private cut: Scratch; // the frame, cut down to the area
  private tmp: Scratch;
  private tiny: Scratch; // blocks, shrunk to big pixels

  constructor(
    private CW: number,
    private CH: number,
  ) {
    this.cut = scratch(CW, CH);
    this.tmp = scratch(CW, CH);
    this.tiny = scratch(Math.ceil(CW / 4), Math.ceil(CH / 4));
  }

  // frame: the output as drawn so far; t: the frame's time; seed: the clip's
  draw(ctx: Ctx2D, frame: CanvasImageSource, area: GlitchArea, s: FxSettings, t: number, seed: number) {
    const { CW } = this;
    const I = s.intensity;
    const k = burst(t, seed, I);
    // a new jitter 24 times a second
    const r = mulberry32(seed * 7919 + Math.floor(t * 24));
    this.cutOut(frame, area);
    const bounds = this.bounds(area);

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    switch (s.glitch) {
      case 'rgb':
        this.split(ctx, CW * (0.004 + 0.025 * k) * I * s.size, (r() - 0.5) * CW * 0.006 * k);
        break;
      case 'slices':
        if (k) this.slices(ctx, r, k * I, bounds);
        break;
      case 'blocks':
        if (k) this.blocks(ctx, r, k * I, bounds);
        break;
      case 'vhs':
        this.vhs(ctx, r, t, k, I, bounds);
        break;
      case 'chaos':
        this.split(ctx, CW * (0.003 + 0.03 * k) * I * s.size, (r() - 0.5) * CW * 0.01 * k);
        if (k) {
          this.slices(ctx, r, k * I, bounds);
          this.blocks(ctx, r, k * I, bounds);
        }
        break;
    }
    ctx.restore();
  }

  // the frame, cut down to where it glitches
  private cutOut(frame: CanvasImageSource, area: GlitchArea) {
    const { g } = this.cut;
    const { CW, CH } = this;
    reset(g, CW, CH);
    g.drawImage(frame, 0, 0, CW, CH);
    if (!area) return;
    g.globalCompositeOperation = 'destination-in';
    if (area.mask) g.drawImage(area.mask, 0, 0, CW, CH);
    else {
      const b = area.box;
      g.beginPath();
      g.ellipse(b.x, b.y, b.rx, b.ry, 0, 0, Math.PI * 2);
      g.fill();
    }
    g.globalCompositeOperation = 'source-over';
  }

  // the box it glitches in, in output pixels
  private bounds(area: GlitchArea): Rect {
    if (!area) return { x: 0, y: 0, w: this.CW, h: this.CH };
    const b = area.box;
    return { x: b.x - b.rx, y: b.y - b.ry, w: b.rx * 2, h: b.ry * 2 };
  }

  // RGB split: the area blacked out, then its red, green and blue added back, red and blue slid
  // apart by d (and dy up and down)
  private split(ctx: Ctx2D, d: number, dy: number) {
    const { g, c } = this.tmp;
    const cut = this.cut.c;
    const { CW, CH } = this;
    reset(g, CW, CH);
    g.drawImage(cut, 0, 0);
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = '#000';
    g.fillRect(0, 0, CW, CH);
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(c, 0, 0);
    for (const [col, x, y] of [
      ['#ff0000', -d, -dy],
      ['#00ff00', 0, 0],
      ['#0000ff', d, dy],
    ] as const) {
      reset(g, CW, CH);
      g.drawImage(cut, 0, 0);
      g.globalCompositeOperation = 'multiply';
      g.fillStyle = col;
      g.fillRect(0, 0, CW, CH);
      // multiplying fills the see-through parts too: cut them away again
      g.globalCompositeOperation = 'destination-in';
      g.drawImage(cut, 0, 0);
      ctx.globalCompositeOperation = 'lighter';
      ctx.drawImage(c, x, y);
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  // strips of the area jumping sideways
  private slices(ctx: Ctx2D, r: () => number, k: number, b: Rect) {
    const { CW } = this;
    const cut = this.cut.c;
    ctx.globalCompositeOperation = 'source-over';
    const n = 3 + Math.floor(8 * Math.min(1.5, k));
    for (let j = 0; j < n; j++) {
      const y = b.y + r() * b.h;
      const h = Math.max(2, b.h * (0.02 + 0.08 * r()));
      const dx = (r() - 0.5) * Math.max(b.w, CW * 0.1) * 0.35 * k;
      ctx.drawImage(cut, 0, y, CW, h, dx, y, CW, h);
    }
  }

  // chunks of the area turned into big pixels, some shifted, some tinted
  private blocks(ctx: Ctx2D, r: () => number, k: number, b: Rect) {
    const { CW } = this;
    const { g, c } = this.tiny;
    const cut = this.cut.c;
    const n = 2 + Math.floor(6 * Math.min(1.5, k));
    for (let j = 0; j < n; j++) {
      const bw = b.w * (0.15 + 0.35 * r());
      const bh = b.h * (0.05 + 0.2 * r());
      const x = b.x + r() * (b.w - bw);
      const y = b.y + r() * (b.h - bh);
      const px = Math.max(4, CW * 0.012 * (1 + 2 * r()));
      const tw = Math.max(1, Math.min(c.width, Math.ceil(bw / px)));
      const th = Math.max(1, Math.min(c.height, Math.ceil(bh / px)));
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.globalCompositeOperation = 'source-over';
      g.clearRect(0, 0, tw, th);
      g.drawImage(cut, x, y, bw, bh, 0, 0, tw, th);
      if (r() < 0.35) {
        g.globalCompositeOperation = 'source-atop';
        g.fillStyle = TINTS[Math.floor(r() * TINTS.length)];
        g.fillRect(0, 0, tw, th);
      }
      const shift = r() < 0.5 ? 0 : (r() - 0.5) * bw * 0.6;
      ctx.imageSmoothingEnabled = false;
      ctx.globalCompositeOperation = 'source-over';
      ctx.drawImage(c, 0, 0, tw, th, x + shift, y, bw, bh);
      ctx.imageSmoothingEnabled = true;
    }
  }

  // an old tape: a slight color bleed, scanlines, noise, and a band rolling down that tears sideways
  private vhs(ctx: Ctx2D, r: () => number, t: number, k: number, I: number, b: Rect) {
    const { CW, CH } = this;
    const { g, c } = this.tmp;
    const cut = this.cut.c;
    this.split(ctx, CW * (0.003 + 0.012 * k) * I, 0);

    // the tracking band
    const bandH = Math.max(4, b.h * 0.08);
    const bandY = b.y + (((t * 0.3) % 1.3) - 0.15) * b.h;
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(cut, 0, bandY, CW, bandH, (r() - 0.5) * CW * 0.03 * I, bandY, CW, bandH);

    // scanlines, darkening
    reset(g, CW, CH);
    g.fillStyle = g.createPattern(scanlines(), 'repeat')!;
    g.fillRect(0, 0, CW, CH);
    g.globalCompositeOperation = 'destination-in';
    g.drawImage(cut, 0, 0);
    ctx.globalAlpha = Math.min(1, 0.45 * I);
    ctx.drawImage(c, 0, 0);

    // noise, and the band's glow
    reset(g, CW, CH);
    const ox = Math.floor(r() * 256),
      oy = Math.floor(r() * 256);
    g.translate(-ox, -oy);
    g.fillStyle = g.createPattern(noiseTile(), 'repeat')!;
    g.fillRect(ox, oy, CW, CH);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = 'rgba(255,255,255,0.35)';
    g.fillRect(0, bandY, CW, bandH);
    g.globalCompositeOperation = 'destination-in';
    g.drawImage(cut, 0, 0);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = Math.min(1, (0.05 + 0.1 * k) * I);
    ctx.drawImage(c, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
}

const TINTS = ['rgba(255,0,200,0.45)', 'rgba(0,255,255,0.45)', 'rgba(0,255,100,0.4)'];

// how hard it's glitching at time t (0 = calm): bursts an eighth of a second long, more often with
// more intensity
function burst(t: number, seed: number, I: number) {
  const r = mulberry32(seed * 9973 + Math.floor(t * 8));
  return r() < Math.min(0.85, 0.35 * I) ? 0.4 + 0.6 * r() : 0;
}

function reset(g: OffscreenCanvasRenderingContext2D, w: number, h: number) {
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalCompositeOperation = 'source-over';
  g.globalAlpha = 1;
  g.clearRect(0, 0, w, h);
}

// every third row dark
let lines: OffscreenCanvas | null = null;
function scanlines() {
  if (lines) return lines;
  const { c, g } = scratch(1, 3);
  g.fillStyle = 'rgba(0,0,0,0.5)';
  g.fillRect(0, 2, 1, 1);
  return (lines = c);
}

// grey speckle, the same every time
let noise: OffscreenCanvas | null = null;
function noiseTile() {
  if (noise) return noise;
  const { c, g } = scratch(256, 256);
  const img = g.createImageData(256, 256);
  const r = mulberry32(1);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = r() < 0.5 ? 0 : Math.floor(r() * 255);
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return (noise = c);
}
