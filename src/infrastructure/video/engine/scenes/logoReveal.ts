// logo-reveal: the logo (or a monogram in the brand colour) resolves, the name slides out from behind
// an edge beside it, and the tagline fades in. Also draws the end card, with the URL as tagline.
import { textOn } from '@/domain/video/palette';
import type { Ctx2D } from '../../canvas';
import { sizeOf } from '../../canvas';
import { backOut } from '../ease';
import { at, body, display, fitLine, lin, roundRect, withAlpha, type SceneCtx } from './common';

export function drawLogoReveal(g: Ctx2D, c: SceneCtx, name: string, tagline: string) {
  const { G, pal, recipe } = c;
  const u = G.u;
  const stacked = G.tall;
  const m = stacked ? u * 22 : u * 16;
  const shown = recipe.caps ? name.toUpperCase() : name;

  // a soft glow in the brand colour behind it
  const glow = lin(c, 0, 1.2);
  if (recipe.texture === 'soft' || recipe.texture === 'glow') {
    const rad = u * 55;
    const gr = g.createRadialGradient(G.cx, G.cy, 0, G.cx, G.cy, rad);
    gr.addColorStop(0, withAlpha(pal.brand, 0.16 * glow));
    gr.addColorStop(1, withAlpha(pal.brand, 0));
    g.fillStyle = gr;
    g.fillRect(G.cx - rad, G.cy - rad, rad * 2, rad * 2);
  }

  // where the mark and name sit: side by side, or the mark above the name on tall frames
  const nameSize = fitLine(g, shown, stacked ? u * 11 : u * 10, stacked ? G.maxW : G.maxW - m * 1.3, px =>
    display(c, px),
  );
  g.font = display(c, nameSize);
  const nameW = g.measureText(shown).width;
  const gap = m * 0.32;
  const mx = stacked ? G.cx - m / 2 : G.cx - (m + gap + nameW) / 2;
  const my = stacked ? G.cy - m * 0.85 : G.cy - m / 2 - u * 2;
  const nx = stacked ? G.cx - nameW / 2 : mx + m + gap;
  const ny = stacked ? my + m + nameSize * 0.85 : my + m / 2;

  // the mark: scales up with a little overshoot, a ring ripples out
  const k = at(c, 0, 0.7);
  const pop = 0.6 + 0.4 * backOut(Math.min(1, lin(c, 0, 0.7)));
  const ring = lin(c, 0.25, 1);
  if (ring > 0 && ring < 1) {
    g.save();
    g.strokeStyle = withAlpha(pal.brand, 0.35 * (1 - ring));
    g.lineWidth = u * 0.5;
    g.beginPath();
    g.arc(mx + m / 2, my + m / 2, m * (0.55 + ring * 0.6), 0, Math.PI * 2);
    g.stroke();
    g.restore();
  }
  g.save();
  g.globalAlpha = k;
  g.translate(mx + m / 2, my + m / 2);
  g.scale(pop, pop);
  if (c.logo) {
    const { w, h } = sizeOf(c.logo);
    const s = Math.min(m / w, m / h);
    g.drawImage(c.logo, (-w * s) / 2, (-h * s) / 2, w * s, h * s);
  } else {
    roundRect(g, -m / 2, -m / 2, m, m, recipe.radius > 0 ? m * 0.26 : 0);
    g.fillStyle = pal.brand;
    g.fill();
    g.fillStyle = textOn(pal.brand);
    g.font = display(c, m * 0.56, 800);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText((name.trim()[0] ?? '•').toUpperCase(), 0, m * 0.03);
  }
  g.restore();

  // the name rises from behind an edge
  const n = at(c, 0.4, 0.7);
  if (n > 0) {
    g.save();
    g.beginPath();
    g.rect(nx - u * 2, ny - nameSize * 0.75, nameW + u * 4, nameSize * 1.5);
    g.clip();
    g.font = display(c, nameSize);
    g.fillStyle = pal.fg;
    g.textBaseline = 'middle';
    g.fillText(shown, nx, ny + (1 - n) * nameSize * 1.2);
    g.restore();
  }

  // the tagline
  const tl = at(c, 0.85, 0.6);
  if (tagline && tl > 0) {
    const size = stacked ? u * 4.6 : u * 4;
    g.save();
    g.globalAlpha = tl;
    g.font = body(c, size, 500);
    g.fillStyle = pal.muted;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const ty = (stacked ? ny + nameSize * 0.6 : my + m) + size * 1.6 + (1 - tl) * u * 2;
    g.fillText(fitText(g, tagline, G.maxW), G.cx, ty);
    g.restore();
  }
}

function fitText(g: Ctx2D, s: string, maxW: number) {
  if (g.measureText(s).width <= maxW) return s;
  let t = s;
  while (t.length > 1 && g.measureText(t + '…').width > maxW) t = t.slice(0, -1);
  return t + '…';
}
