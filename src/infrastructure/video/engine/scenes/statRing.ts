// stat-ring: a ring fills to the percentage while the number counts up inside it; the label sits
// below, and a badge pops onto the ring's shoulder at the end.
import { textOn } from '@/domain/video/palette';
import type { StatRing } from '@/domain/video/scenes';
import type { Ctx2D } from '../../canvas';
import { backOut } from '../ease';
import { at, body, counting, display, lin, roundRect, withAlpha, type SceneCtx } from './common';

export function drawStatRing(g: Ctx2D, c: SceneCtx, s: StatRing) {
  const { G, pal, recipe } = c;
  const u = G.u;
  const r = G.tall ? u * 30 : u * 24;
  const cx = G.cx,
    cy = G.cy - (G.tall ? u * 4 : u * 5);
  const lw = r * 0.13;
  const appear = lin(c, 0, 0.35);
  const fill = at(c, 0.2, 1.5);
  const pct = s.percent.value;

  // track and fill
  g.save();
  g.globalAlpha = appear;
  g.lineWidth = lw;
  g.strokeStyle = withAlpha(pal.fg, 0.08);
  g.beginPath();
  g.arc(cx, cy, r, 0, Math.PI * 2);
  g.stroke();
  if (pct != null && fill > 0) {
    g.lineCap = recipe.radius > 0 ? 'round' : 'butt';
    g.strokeStyle = pal.brand;
    if (recipe.texture === 'glow') {
      g.shadowColor = pal.brand;
      g.shadowBlur = u * 3;
    }
    g.beginPath();
    g.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (pct / 100) * fill);
    g.stroke();
  }
  g.restore();

  // the number inside
  g.save();
  g.globalAlpha = appear;
  g.font = display(c, r * 0.5, 800);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = pct == null ? pal.muted : pal.fg;
  g.fillText(pct == null ? '—' : `${counting(pct, fill)}%`, cx, cy + r * 0.03);
  g.restore();

  // the label
  const l = at(c, 0.5, 0.7);
  if (l > 0) {
    const ls = G.tall ? u * 5 : u * 4.4;
    g.save();
    g.globalAlpha = l;
    g.font = body(c, ls, 500);
    g.fillStyle = pal.muted;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(recipe.caps ? s.label.toUpperCase() : s.label, cx, cy + r + lw + ls * 1.6 + (1 - l) * u * 2);
    g.restore();
  }

  // the badge
  const b = lin(c, 1.4, 0.45);
  if (s.badge && b > 0) {
    const bs = u * 3.6;
    g.save();
    g.font = body(c, bs, 700);
    const text = recipe.caps ? s.badge.toUpperCase() : s.badge;
    const w = g.measureText(text).width + bs * 1.8,
      h = bs * 2.1;
    const k = backOut(b);
    g.translate(cx + r * 0.72, cy - r * 0.88);
    g.scale(k, k);
    roundRect(g, -w / 2, -h / 2, w, h, recipe.radius > 0 ? h / 2 : 0);
    g.fillStyle = pal.brand;
    g.fill();
    g.fillStyle = textOn(pal.brand);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, 0, bs * 0.05);
    g.restore();
  }
}
