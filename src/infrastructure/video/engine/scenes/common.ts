// What every scene draws with: its local time, the style (palette with the brand colour, fonts,
// ease, speed), and helpers for timing, cards and numbers. Everything is a function of time, so any
// frame can be drawn in any order.
import { textOn } from '@/domain/video/palette';
import type { Palette, Recipe } from '@/domain/video/recipe';
import type { Ctx2D, ImageLike } from '../../canvas';
import { easeFn } from '../ease';
import { fontString, type FontFamilies } from '../fonts';
import type { Geometry } from '../geometry';
import type { TextStyle } from '../text';

export interface SceneCtx {
  G: Geometry;
  recipe: Recipe;
  pal: Palette & { brand: string };
  fonts: FontFamilies;
  // the video's time, and this scene's own time (0 at its start; negative while it's cutting in)
  t: number;
  lt: number;
  // the scene's length
  len: number;
  frame: number;
  logo: ImageLike | null;
  product: { name: string; url: string };
}

const clamp01 = (u: number) => Math.max(0, Math.min(1, u));
const eases = new Map<string, (u: number) => number>();
const styleEase = (r: Recipe) => {
  let f = eases.get(r.motion.ease);
  if (!f) eases.set(r.motion.ease, (f = easeFn(r.motion.ease)));
  return f;
};

// 0..1 through a window of the scene that starts at `start` seconds and lasts `dur`, in the style's
// ease and at its speed
export const at = (c: SceneCtx, start: number, dur: number) =>
  styleEase(c.recipe)(clamp01((c.lt * c.recipe.motion.speed - start) / dur));
// the same, linear
export const lin = (c: SceneCtx, start: number, dur: number) =>
  clamp01((c.lt * c.recipe.motion.speed - start) / dur);

export const withAlpha = (hex: string, a: number) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

export const display = (c: SceneCtx, px: number, weight?: number) =>
  fontString(c.fonts, c.recipe.fonts.display, px, weight);
export const body = (c: SceneCtx, px: number, weight?: number) =>
  fontString(c.fonts, c.recipe.fonts.body, px, weight);

// a text style in the display face
export function titleStyle(c: SceneCtx, size: number, align: 'center' | 'left' = 'center'): TextStyle {
  return {
    font: display(c, size),
    size,
    color: c.pal.fg,
    hi: c.pal.brand,
    bar: c.pal.brand,
    onBar: textOn(c.pal.brand),
    caps: c.recipe.caps,
    align,
    lineHeight: c.recipe.fonts.display === 'vt323' ? 0.95 : 1.06,
  };
}

export function roundRect(g: Ctx2D, x: number, y: number, w: number, h: number, r: number) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

// a card on the stage, in the style's own look: soft shadow (Clean Soft), glowing edge (Y2K), hairline
// (Swiss), heavy border with a hard offset block (Brutalist), phosphor outline (Terminal)
export function card(g: Ctx2D, c: SceneCtx, x: number, y: number, w: number, h: number, alpha = 1) {
  const { pal, recipe, G } = c;
  const r = recipe.radius * G.min;
  g.save();
  g.globalAlpha *= alpha;
  switch (recipe.texture) {
    case 'soft':
      g.shadowColor = 'rgba(16, 24, 40, 0.10)';
      g.shadowBlur = G.u * 4;
      g.shadowOffsetY = G.u * 1;
      roundRect(g, x, y, w, h, r);
      g.fillStyle = pal.surface;
      g.fill();
      g.shadowColor = 'transparent';
      g.strokeStyle = 'rgba(16, 24, 40, 0.06)';
      g.lineWidth = Math.max(1, G.u * 0.15);
      g.stroke();
      break;
    case 'glow':
      g.shadowColor = withAlpha(pal.brand, 0.45);
      g.shadowBlur = G.u * 3;
      roundRect(g, x, y, w, h, r);
      g.fillStyle = pal.surface;
      g.fill();
      g.shadowColor = 'transparent';
      g.strokeStyle = withAlpha(pal.accent, 0.5);
      g.lineWidth = Math.max(1, G.u * 0.25);
      g.stroke();
      break;
    case 'grain': {
      const o = G.u * 1.2;
      g.fillStyle = pal.accent;
      g.fillRect(x + o, y + o, w, h);
      g.fillStyle = pal.surface;
      g.fillRect(x, y, w, h);
      g.strokeStyle = pal.fg;
      g.lineWidth = Math.max(2, G.u * 0.6);
      g.strokeRect(x, y, w, h);
      break;
    }
    case 'scanlines':
      roundRect(g, x, y, w, h, r);
      g.fillStyle = pal.surface;
      g.fill();
      g.strokeStyle = withAlpha(pal.accent, 0.7);
      g.lineWidth = Math.max(1, G.u * 0.3);
      g.stroke();
      break;
    default:
      g.fillStyle = pal.surface;
      g.fillRect(x, y, w, h);
      g.strokeStyle = withAlpha(pal.fg, 0.14);
      g.lineWidth = Math.max(1, G.u * 0.15);
      g.strokeRect(x, y, w, h);
  }
  g.restore();
}

// a number as it reads: thousands separated, with the target's decimals (3.2 → "3.2", 12000 → "12,000")
export function formatNumber(v: number, like: number): string {
  const decimals = Number.isInteger(like) ? 0 : Math.min(2, (String(like).split('.')[1] ?? '').length);
  const fixed = v.toFixed(decimals);
  const [int, frac] = fixed.split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return frac ? `${grouped}.${frac}` : grouped;
}

// a number counting up from 0 to `to` over the progress k (an empty number shows a dash)
export const counting = (to: number | null, k: number) => (to == null ? '—' : formatNumber(to * k, to));

// the number with its prefix and suffix: a word gets a space ("Week 6", "2 min"); a symbol or a
// single unit letter doesn't ("$40", "98%", "3.2M")
export function affixed(prefix: string, num: string, suffix: string) {
  const wordy = (s: string) => s.length > 1 && /^[\p{L}]+$/u.test(s);
  return `${prefix}${wordy(prefix) ? ' ' : ''}${num}${wordy(suffix) ? ' ' : ''}${suffix}`;
}

// shrinks a font until a single line fits maxW
export function fitLine(g: Ctx2D, text: string, size: number, maxW: number, font: (px: number) => string) {
  let s = size;
  for (let i = 0; i < 16; i++) {
    g.font = font(s);
    if (g.measureText(text).width <= maxW) break;
    s *= 0.92;
  }
  return s;
}
