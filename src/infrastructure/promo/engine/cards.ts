// The hook card that opens the video and the outro card that ends it: the product's name, its URL,
// a call to action, and "Made with PromoReel".
import { textOn } from '@/domain/promo/palette';
import type { Plan } from '@/domain/promo/plan';
import type { Recipe } from '@/domain/promo/recipe';
import type { Ctx2D } from '../canvas';
import { backOut, reel } from './ease';
import { fontString, type FontFamilies } from './fonts';
import type { Geometry } from './geometry';
import { roundRect } from './screens';
import { drawText, layoutText, type TextStyle } from './text';
import type { PartState } from './timeline';

const clamp01 = (u: number) => Math.max(0, Math.min(1, u));

export interface CardStyle {
  recipe: Recipe;
  brand: string;
  fonts: FontFamilies;
}

export function titleStyle(st: CardStyle, size: number, align: 'center' | 'left' = 'center'): TextStyle {
  const r = st.recipe;
  return {
    font: fontString(st.fonts, r.fonts.display, size),
    size,
    color: r.palette.fg,
    bar: st.brand,
    onBar: textOn(st.brand),
    caps: r.caps,
    align,
    lineHeight: r.fonts.display === 'vt323' ? 0.95 : 1.04,
  };
}

export function drawHook(g: Ctx2D, plan: Plan, s: PartState, G: Geometry, st: CardStyle, t: number) {
  const style = titleStyle(st, G.title.size);
  const L = layoutText(g, plan.hook.text, style, G.title.maxW, 4);
  drawText(g, L, style, plan.hook.move, s.words, G.W / 2, G.H * 0.46, t);
  // a short rule in the brand colour under it
  const w = G.min * 0.12 * reel(s.enter);
  g.fillStyle = st.brand;
  g.fillRect(G.W / 2 - w / 2, G.H * 0.46 + L.height / 2 + G.min * 0.05, w, G.min * 0.008);
}

export function drawOutro(g: Ctx2D, plan: Plan, s: PartState, G: Geometry, st: CardStyle, t: number) {
  const r = st.recipe;
  const { W, H, min } = G;
  const name = titleStyle(st, G.title.size * 1.1);
  const L = layoutText(g, plan.outro.title, name, G.title.maxW, 2);
  const cy = H * (W > H ? 0.4 : 0.42);
  drawText(g, L, name, 'word-pop', s.words, W / 2, cy, t);

  g.save();
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  let y = cy + L.height / 2 + min * 0.06;
  // the URL
  if (plan.outro.url) {
    g.globalAlpha = clamp01((s.enter - 0.25) / 0.4);
    g.font = fontString(st.fonts, r.fonts.body, min * 0.045, 500);
    g.fillStyle = r.palette.muted;
    g.fillText(plan.outro.url, W / 2, y);
    y += min * 0.1;
  }
  // the call to action, as a pill in the brand colour
  const k = backOut(clamp01((s.enter - 0.4) / 0.6));
  if (k > 0) {
    g.globalAlpha = clamp01(k);
    const size = min * 0.042;
    g.font = fontString(st.fonts, r.fonts.body, size, 700);
    const label = r.caps ? plan.outro.cta.toUpperCase() : plan.outro.cta;
    const w = g.measureText(label).width + size * 2.2,
      h = size * 2.2;
    g.save();
    g.translate(W / 2, y);
    g.scale(k, k);
    roundRect(g, -w / 2, -h / 2, w, h, r.layout === 'full-bleed' || r.layout === 'grid' ? 0 : h / 2);
    g.fillStyle = st.brand;
    g.fill();
    g.fillStyle = textOn(st.brand);
    g.fillText(label, 0, size * 0.04);
    g.restore();
  }
  // the credit every video carries
  g.globalAlpha = clamp01((s.enter - 0.2) / 0.5) * 0.85;
  g.font = fontString(st.fonts, r.fonts.body, min * 0.03, 500);
  g.fillStyle = r.palette.muted;
  g.fillText('Made with PromoReel', W / 2, W > H ? H - min * 0.08 : H * 0.86);
  g.restore();
}
