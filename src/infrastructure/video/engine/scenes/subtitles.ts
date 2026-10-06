// The subtitle bar: the scene's caption on a soft pill near the bottom, words appearing in step with
// the scene (as if read aloud), the *key word* in the brand colour.
import { luminance } from '@/domain/video/palette';
import type { Ctx2D } from '../../canvas';
import { layoutText, type TextStyle } from '../text';
import { body, lin, roundRect, type SceneCtx } from './common';

export function drawSubtitles(g: Ctx2D, c: SceneCtx, caption: string) {
  if (!caption.trim()) return;
  const { G, pal, recipe } = c;
  const u = G.u;
  const light = luminance(pal.bg) > 0.4;
  const size = G.caption;
  const style: TextStyle = {
    font: body(c, size, 600),
    size,
    color: light ? pal.fg : '#ffffff',
    hi: pal.brand,
    bar: pal.brand,
    onBar: pal.bg,
    caps: false,
    align: 'center',
    lineHeight: 1.3,
  };
  const L = layoutText(g, caption, style, G.W * 0.8, 2);
  // the words come in over the first part of the scene, as if read aloud
  const p = lin(c, 0.1, Math.min(c.len * 0.6, 0.25 + L.words * 0.22)) * L.words;
  const appear = lin(c, 0, 0.25);
  if (appear <= 0) return;

  const padX = u * 3,
    padY = u * 1.6;
  const w = L.width + padX * 2,
    h = L.height + padY * 2;
  g.save();
  g.globalAlpha = appear;
  roundRect(g, G.cx - w / 2, G.captionY - h / 2, w, h, recipe.radius > 0 ? Math.min(h / 2, u * 3) : 0);
  if (light) {
    g.shadowColor = 'rgba(16, 24, 40, 0.08)';
    g.shadowBlur = u * 3;
    g.fillStyle = pal.surface;
  } else g.fillStyle = 'rgba(0, 0, 0, 0.55)';
  g.fill();
  g.restore();

  g.save();
  g.font = style.font;
  g.textBaseline = 'middle';
  let i = 0;
  for (const l of L.lines) {
    const lx = G.cx - l.w / 2;
    for (const w2 of l.words) {
      const a = Math.max(0, Math.min(1, (p - i) * 1.5));
      i++;
      g.globalAlpha = appear * (0.25 + 0.75 * a);
      g.fillStyle = w2.hi ? style.hi : style.color;
      g.fillText(w2.text, lx + w2.x, G.captionY + l.y);
    }
  }
  g.restore();
}
