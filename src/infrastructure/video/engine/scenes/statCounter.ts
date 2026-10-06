// stat-counter: one big number counts up, a brand-colour rule grows under it, the label rises in.
import type { StatCounter } from '@/domain/video/scenes';
import type { Ctx2D } from '../../canvas';
import { affixed, at, body, counting, display, fitLine, lin, type SceneCtx } from './common';

export function drawStatCounter(g: Ctx2D, c: SceneCtx, s: StatCounter) {
  const { G, pal, recipe } = c;
  const u = G.u;
  const k = at(c, 0.15, 1.5);
  const target = s.value.value;
  const final = affixed(s.prefix, counting(target, 1), s.suffix);
  const shown = affixed(s.prefix, counting(target, k), s.suffix);
  // sized for the final number, so the layout doesn't jump as it counts
  const size = fitLine(g, final, G.title * 2.1, G.maxW, px => display(c, px, 800));
  const y = G.cy - u * 3;

  g.save();
  g.globalAlpha = lin(c, 0, 0.3);
  g.font = display(c, size, 800);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = target == null ? pal.muted : pal.fg;
  g.fillText(shown, G.cx, y);
  g.restore();

  // the rule
  const r = at(c, 0.5, 0.9);
  const rw = Math.min(G.maxW * 0.5, u * 30) * r;
  g.fillStyle = pal.brand;
  g.fillRect(G.cx - rw / 2, y + size * 0.62, rw, Math.max(2, u * 0.7));

  // the label
  const l = at(c, 0.6, 0.7);
  if (l > 0) {
    const ls = G.tall ? u * 5.2 : u * 4.6;
    g.save();
    g.globalAlpha = l;
    g.font = body(c, ls, 500);
    g.fillStyle = pal.muted;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(
      recipe.caps ? s.label.toUpperCase() : s.label,
      G.cx,
      y + size * 0.62 + ls * 2 + (1 - l) * u * 2,
    );
    g.restore();
  }
}
