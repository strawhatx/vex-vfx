// The end card every video gets: the logo and name, the URL, and "Made with PromoReel".
import { displayUrl } from '@/domain/video/product';
import type { Ctx2D } from '../../canvas';
import { body, lin, type SceneCtx } from './common';
import { drawLogoReveal } from './logoReveal';

export function drawEndCard(g: Ctx2D, c: SceneCtx) {
  const { G, pal } = c;
  drawLogoReveal(g, c, c.product.name || 'Your product', displayUrl(c.product.url));
  const k = lin(c, 0.8, 0.5);
  if (k <= 0) return;
  g.save();
  g.globalAlpha = k * 0.85;
  g.font = body(c, G.u * 3, 500);
  g.fillStyle = pal.muted;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('Made with PromoReel', G.cx, G.tall ? G.H * 0.86 : G.H - G.u * 7);
  g.restore();
}
