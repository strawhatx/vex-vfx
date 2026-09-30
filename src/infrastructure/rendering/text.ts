// The Text effect (see domain/effects/text): words set behind the tracked object (cut away where
// the object is, so it stays in front), a label with an arrow stuck above the object, or a title
// slammed on at a spot. Each comes in with its own move and fades out at the end of its clip. A
// function of the frame's time only, so any frame renders the same in any order.
import { PALETTES } from '@/domain/effects/palettes';
import { backOut, fontFor } from './fonts';
import type { Layer } from './layer';
import { mulberry32 } from './rng';
import type { Ctx2D } from './sprites';
import { sceneSpotAt, type View } from './view';

const INK = '#111';
const IN_S = 0.25; // coming in
const OUT_S = 0.2; // fading out

export class TextPainter {
  private c: OffscreenCanvas;
  private g: OffscreenCanvasRenderingContext2D;

  constructor(
    private CW: number,
    private CH: number,
  ) {
    this.c = new OffscreenCanvas(CW, CH);
    this.g = this.c.getContext('2d') as OffscreenCanvasRenderingContext2D;
  }

  draw(v: View, l: Layer, idx: number) {
    const s = l.spec.settings;
    const words = s.text.trim();
    const tap = l.spec.tap;
    if (!words || !tap) return;
    const t = v.clip[idx].t;
    const age = t - l.spec.range.s;
    const fade = Math.min(1, Math.max(0, (l.spec.range.e - t) / OUT_S));
    const pal = PALETTES[s.pal].c;
    const { CW } = this;

    if (s.textStyle === 'follow') {
      // above the object's box (or at the spot, if it has none)
      let at = sceneSpotAt(v, tap, idx);
      if (!l.spec.pinned) {
        const tgt = l.fxFrame(idx, v.shot).tgt;
        if (!tgt.active) return;
        at = { x: tgt.x, y: tgt.y - tgt.ry - CW * 0.01 };
      }
      const px = fit(v.ctx, v, s.font, words, CW * 0.05 * s.size, 0.9);
      const pop = backOut(Math.min(1, age / 0.2));
      label(v.ctx, v, s.font, words, px, at.x, at.y, pop, fade * Math.min(1, age / 0.08), pal);
      return;
    }

    const at = sceneSpotAt(v, tap, idx);
    if (s.textStyle === 'title') {
      // slams down from big, then shakes as it lands
      const px = fit(v.ctx, v, s.font, words, CW * 0.1 * s.size, 0.94);
      const q = Math.min(1, age / 0.16);
      const scale = 1 + 1.4 * (1 - q) ** 2;
      const shake = age > 0.16 && age < 0.4 ? (1 - (age - 0.16) / 0.24) * px * 0.06 : 0;
      const r = mulberry32(l.spec.id * 31 + Math.floor(t * 30));
      const x = at.x + (r() - 0.5) * 2 * shake;
      const y = at.y + (r() - 0.5) * 2 * shake;
      const ctx = v.ctx;
      ctx.save();
      ctx.setTransform(scale, 0, 0, scale, x, y);
      ctx.globalAlpha = q * fade;
      letters(ctx, v, s.font, words, px);
      ctx.lineWidth = Math.max(2, px * 0.12);
      ctx.strokeStyle = INK;
      ctx.strokeText(words, 0, 0);
      ctx.fillStyle = pal[1];
      ctx.fillText(words, 0, 0);
      ctx.restore();
      return;
    }

    // behind: rises into place, drawn on a scratch canvas with the object cut out of it
    const px = fit(v.ctx, v, s.font, words, CW * 0.16 * s.size, 0.96);
    const q = Math.min(1, age / IN_S);
    const rise = (1 - (1 - q) ** 3) * 1;
    const g = this.g;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
    g.clearRect(0, 0, this.CW, this.CH);
    g.setTransform(1, 0, 0, 1, at.x, at.y + (1 - rise) * px * 0.4);
    letters(g, v, s.font, words, px);
    g.shadowColor = 'rgba(0,0,0,0.35)';
    g.shadowBlur = px * 0.08;
    g.fillStyle = pal[1];
    g.fillText(words, 0, 0);
    g.shadowColor = 'transparent';
    if (!l.spec.pinned) {
      const frames = l.spec.frames;
      if (l.geo.outline(frames, idx).hasShape) {
        l.geo.prepareCanvas(frames[idx]);
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.globalCompositeOperation = 'destination-out';
        g.drawImage(l.geo.maskCanvas, 0, 0, this.CW, this.CH);
        g.globalCompositeOperation = 'source-over';
      }
    }
    const ctx = v.ctx;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = q * fade;
    ctx.drawImage(this.c, 0, 0);
    ctx.restore();
  }
}

// sets up centered letters in the font
function letters(ctx: Ctx2D, v: View, font: Layer['spec']['settings']['font'], words: string, px: number) {
  ctx.font = fontFor(v.fonts, font, px);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
}

// the size the words are drawn at: px, or smaller so they fit in `room` of the frame's width
function fit(
  ctx: Ctx2D,
  v: View,
  font: Layer['spec']['settings']['font'],
  words: string,
  px: number,
  room: number,
) {
  ctx.save();
  ctx.font = fontFor(v.fonts, font, px);
  const w = ctx.measureText(words).width;
  ctx.restore();
  return w > v.CW * room ? (px * v.CW * room) / w : px;
}

// a label with an arrow under it pointing down at (x, y)
function label(
  ctx: Ctx2D,
  v: View,
  font: Layer['spec']['settings']['font'],
  words: string,
  px: number,
  x: number,
  y: number,
  scale: number,
  alpha: number,
  pal: readonly string[],
) {
  const arrow = px * 0.55;
  ctx.save();
  ctx.setTransform(scale, 0, 0, scale, x, y);
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
  // the arrow, its tip on the spot
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-arrow * 0.6, -arrow);
  ctx.lineTo(arrow * 0.6, -arrow);
  ctx.closePath();
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(2, px * 0.1);
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.fillStyle = pal[1];
  ctx.fill();
  // the words above it
  letters(ctx, v, font, words, px);
  const wy = -arrow - px * 0.7;
  ctx.lineWidth = Math.max(2, px * 0.18);
  ctx.strokeText(words, 0, wy);
  ctx.fillStyle = pal[0];
  ctx.fillText(words, 0, wy);
  ctx.restore();
}
