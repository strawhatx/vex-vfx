// ambient-wall: a wall of small cards, each with the same icon, drifts slowly (rows in opposite
// directions); the cards gain checkmarks one by one, and a line of text sits on a card in the middle.
// "Which card gets its check when" comes from a fixed hash, so every frame repeats exactly.
import { textOn } from '@/domain/video/palette';
import { hash01 } from '@/domain/video/rng';
import type { AmbientWall } from '@/domain/video/scenes';
import type { Ctx2D } from '../../canvas';
import { backOut } from '../ease';
import { drawText, layoutText, textSeconds } from '../text';
import { at, card, lin, titleStyle, withAlpha, type SceneCtx } from './common';
import { drawIcon } from './icons';

export function drawAmbientWall(g: Ctx2D, c: SceneCtx, s: AmbientWall) {
  const { G, pal, recipe } = c;
  const u = G.u;
  const ts = u * 15,
    pitch = ts + u * 3.2;
  const speed = recipe.motion.speed;
  const wall = lin(c, 0, 0.6);
  const rows = Math.ceil(G.H / pitch) + 1;
  const checkWindow = Math.max(0.6, c.len * speed * 0.7);

  g.save();
  g.globalAlpha = wall * 0.95;
  for (let r = 0; r < rows; r++) {
    const dir = r % 2 ? 1 : -1;
    const shift = dir * c.lt * speed * u * 3.5 + (r % 2) * pitch * 0.5;
    const y = r * pitch - pitch * 0.35;
    const first = Math.floor(-shift / pitch) - 1;
    for (let col = first; col * pitch + shift < G.W + pitch; col++) {
      const x = col * pitch + shift;
      card(g, c, x, y, ts, ts);
      const id = r * 1009 + col;
      drawIcon(g, s.icon, x + ts / 2, y + ts / 2, ts * 0.42, withAlpha(pal.fg, 0.4));
      // its checkmark
      const when = 0.35 + hash01(id) * checkWindow;
      const k = lin(c, when, 0.35);
      if (k > 0) {
        const b = backOut(k);
        const bx = x + ts * 0.82,
          by = y + ts * 0.18,
          br = ts * 0.17 * b;
        g.beginPath();
        g.arc(bx, by, br, 0, Math.PI * 2);
        g.fillStyle = pal.brand;
        g.fill();
        drawIcon(g, 'check', bx, by, br * 1.25, textOn(pal.brand), 3);
      }
    }
  }
  g.restore();

  // the middle clears so the line on top reads
  const rad = Math.max(G.W, G.H) * 0.48;
  const fade = g.createRadialGradient(G.cx, G.cy, 0, G.cx, G.cy, rad);
  fade.addColorStop(0, withAlpha(pal.bg, 0.92));
  fade.addColorStop(0.55, withAlpha(pal.bg, 0.6));
  fade.addColorStop(1, withAlpha(pal.bg, 0));
  g.fillStyle = fade;
  g.fillRect(0, 0, G.W, G.H);

  // the line, on its own card
  const style = titleStyle(c, G.title * 0.62);
  const L = layoutText(g, s.title, style, G.maxW * 0.86, 3);
  const pad = u * 4;
  const panel = at(c, 0.3, 0.6);
  if (panel <= 0) return;
  const w = L.width + pad * 2,
    h = L.height + pad * 1.6;
  card(g, c, G.cx - w / 2, G.cy - h / 2 + (1 - panel) * u * 3, w, h, panel);
  drawText(g, L, style, 'mask-reveal', lin(c, 0.45, textSeconds('mask-reveal', L)), G.cx, G.cy, c.t);
}
