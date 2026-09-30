// The Outline effect: a line traced round the tracked object's silhouette in the palette's colors,
// in one of several styles (see domain/effects/outlines). Where only a box could be tracked, a
// glowing ellipse round it instead. A function of the frame's time only, so any frame renders the
// same whether playing, scrubbing or exporting.
import type { FxSettings } from '@/domain/effects/palettes';
import { PALETTES } from '@/domain/effects/palettes';
import type { MaskPainter } from './masks';
import { noise, unit } from './particles/types';
import { mulberry32 } from './rng';
import type { FxFrame } from './sim';
import type { Ctx2D } from './sprites';

// mask: the frame's silhouette, prepared on the layer's mask canvas
export function drawOutlineFx(
  ctx: Ctx2D,
  masks: MaskPainter,
  mask: OffscreenCanvas,
  f: FxFrame,
  s: FxSettings,
  seed: number,
) {
  if (!f.tgt.active) return;
  const pal = PALETTES[s.pal].c;
  const u = unit(f.tgt, s.size);
  const I = s.intensity;
  const w = Math.max(1.5, u * 0.2); // the line's width
  const t = f.t;
  if (!f.hasShape) return boxOutline(ctx, f, pal, u, w, I);
  const edge = (e: Parameters<MaskPainter['edge']>[2]) => masks.edge(mask, ctx, e);

  switch (s.outline) {
    case 'neon': {
      // a wide soft glow, then the tube, then its white-hot core; flickering a little
      const flick = 0.9 + 0.1 * noise(t * 9, 3);
      edge({ col: pal[2], width: w * 1.5, blur: u * 1.8, alpha: 0.8 * I * flick });
      edge({ col: pal[1], width: w * 1.4, blur: u * 0.6, alpha: I * flick, solid: true });
      edge({ col: pal[0], width: w * 0.35, alpha: 0.7 * I });
      return;
    }
    case 'double':
      edge({ col: pal[0], width: w * 0.7, blur: u * 0.3, alpha: I });
      edge({ col: pal[1], width: w * 0.8, gap: u * 0.9, blur: u * 0.6, alpha: 0.9 * I });
      return;
    case 'glitch': {
      // colors pulled apart, jumping to a new offset a dozen times a second (further, now and then)
      const r = mulberry32(seed * 7919 + Math.floor(t * 12));
      const far = r() < 0.25 ? 2.5 : 1;
      const dx = (r() < 0.5 ? -1 : 1) * u * (0.25 + 0.3 * r()) * far;
      const dy = (r() - 0.5) * u * 0.25 * far;
      edge({ col: pal[1], width: w, dx, dy, blur: u * 0.3, alpha: 0.9 * I });
      edge({ col: pal[2], width: w, dx: -dx, dy: -dy, blur: u * 0.3, alpha: 0.9 * I });
      edge({ col: pal[0], width: w * 0.5, alpha: I });
      return;
    }
    case 'pulse': {
      edge({ col: pal[1], width: w, blur: u * 0.6, alpha: I });
      // copies of the outline rippling out from the object's middle, fading as they grow
      const at = { x: f.tgt.x, y: f.tgt.y };
      for (let k = 0; k < 3; k++) {
        const q = (t * 0.9 + k / 3) % 1;
        edge({
          col: k % 2 ? pal[2] : pal[1],
          width: w * (0.6 + 0.6 * q),
          scale: 1.04 + q * 0.45 * s.size,
          at,
          blur: u * 0.4,
          alpha: 0.8 * I * (1 - q) ** 1.5,
        });
      }
      return;
    }
    case 'sketch': {
      // a few rough lines, each redrawn a little off every tenth of a second
      const r = mulberry32(seed * 104729 + Math.floor(t * 10));
      for (let k = 0; k < 3; k++) {
        edge({
          col: k ? pal[1] : pal[0],
          width: w * (0.4 + 0.3 * r()),
          gap: u * 0.15 * r(),
          dx: (r() - 0.5) * u * 0.4,
          dy: (r() - 0.5) * u * 0.4,
          alpha: 0.8 * I,
        });
      }
      return;
    }
  }
}

// no silhouette: a glowing ellipse round the object's box
function boxOutline(ctx: Ctx2D, f: FxFrame, pal: readonly string[], u: number, w: number, I: number) {
  const { x, y, rx, ry } = f.tgt;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = Math.min(1, I);
  ctx.shadowColor = pal[2];
  ctx.shadowBlur = u;
  ctx.strokeStyle = pal[1];
  ctx.lineWidth = w;
  ctx.beginPath();
  ctx.ellipse(x, y, rx * 1.05 + u * 0.3, ry * 1.05 + u * 0.3, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}
