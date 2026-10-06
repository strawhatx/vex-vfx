// card-stack: cards step in one after another along a timeline (a line with a dot per step), and a
// big stat counts up beside them (above them on tall frames). Without a stat the cards take the centre.
import type { CardStack } from '@/domain/video/scenes';
import type { Ctx2D } from '../../canvas';
import { affixed, at, body, card, counting, display, fitLine, lin, withAlpha, type SceneCtx } from './common';

export function drawCardStack(g: Ctx2D, c: SceneCtx, s: CardStack) {
  const { G, pal, recipe } = c;
  const u = G.u;
  const hasStat = s.stat.value != null;
  const n = s.cards.length;
  const caps = (t: string) => (recipe.caps ? t.toUpperCase() : t);

  // the layout: cards column, and where the stat goes
  let x0: number, cw: number, statX: number, statY: number, statW: number;
  const ch = G.tall ? u * 13 : u * 11.5;
  const gap = G.tall ? u * 3 : u * 2.6;
  const stackH = n * ch + (n - 1) * gap;
  let y0: number;
  if (G.tall) {
    x0 = G.W * 0.16;
    cw = G.W * 0.76;
    statX = G.cx;
    statW = G.maxW;
    // the stat (number and label) and the cards, centred together on the content area
    const statH = hasStat ? G.title * 1.5 + u * 12 : 0;
    const top = G.cy - (statH + stackH) / 2;
    statY = top + G.title * 0.75;
    y0 = top + statH;
  } else {
    const twoCol = hasStat;
    x0 = twoCol ? G.W * (G.wide ? 0.13 : 0.11) : G.W * (G.wide ? 0.29 : 0.17);
    cw = twoCol ? G.W * (G.wide ? 0.42 : 0.5) : G.W * (G.wide ? 0.42 : 0.66);
    statX = G.W * (G.wide ? 0.76 : 0.81);
    statY = G.cy - u * 3;
    statW = G.W * (G.wide ? 0.3 : 0.28);
    y0 = G.cy - stackH / 2;
  }

  // the timeline line, drawn down to the newest card
  const lineX = x0 - u * 4.5;
  const step = (i: number) => at(c, 0.25 + i * 0.45, 0.6);
  let reached = 0;
  for (let i = 0; i < n; i++) if (step(i) > 0) reached = i + step(i);
  if (reached > 0) {
    const yTop = y0 + ch / 2;
    const yEnd = yTop + Math.max(0, reached - 1) * (ch + gap);
    g.save();
    g.strokeStyle = withAlpha(pal.fg, 0.14);
    g.lineWidth = Math.max(1, u * 0.35);
    g.beginPath();
    g.moveTo(lineX, yTop);
    g.lineTo(lineX, yTop + (n - 1) * (ch + gap));
    g.stroke();
    g.strokeStyle = pal.brand;
    g.lineWidth = Math.max(2, u * 0.5);
    g.beginPath();
    g.moveTo(lineX, yTop);
    g.lineTo(lineX, yEnd);
    g.stroke();
    g.restore();
  }

  s.cards.forEach((cd, i) => {
    const e = step(i);
    if (e <= 0) return;
    const y = y0 + i * (ch + gap);
    const dx = (1 - e) * u * 8;
    // the step's dot
    g.save();
    g.globalAlpha = e;
    g.beginPath();
    g.arc(lineX, y + ch / 2, u * 1.5, 0, Math.PI * 2);
    g.fillStyle = e > 0.6 ? pal.brand : pal.bg;
    g.fill();
    g.strokeStyle = pal.brand;
    g.lineWidth = Math.max(1, u * 0.4);
    g.stroke();
    g.restore();

    card(g, c, x0 + dx, y, cw, ch, e);
    g.save();
    g.globalAlpha = e;
    g.textBaseline = 'middle';
    const pad = u * 3.6;
    const ts = G.tall ? u * 4.4 : u * 3.9;
    const ss = G.tall ? u * 3.3 : u * 2.9;
    g.fillStyle = pal.fg;
    g.font = display(c, ts, 700);
    const tx = x0 + dx + pad;
    if (cd.subtitle) {
      g.fillText(caps(cd.title), tx, y + ch * 0.36);
      g.fillStyle = pal.muted;
      g.font = body(c, ss, 400);
      g.fillText(cd.subtitle, tx, y + ch * 0.68);
    } else g.fillText(caps(cd.title), tx, y + ch / 2);
    g.restore();
  });

  if (!hasStat) return;
  const start = 0.25 + n * 0.45;
  const k = at(c, start, 1.2);
  const appear = lin(c, start, 0.3);
  if (appear <= 0) return;
  const final = affixed(s.statPrefix, counting(s.stat.value, 1), s.statSuffix);
  const size = fitLine(g, final, G.title * (G.tall ? 1.5 : 1.6), statW, px => display(c, px, 800));
  g.save();
  g.globalAlpha = appear;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = display(c, size, 800);
  g.fillStyle = pal.brand;
  g.fillText(affixed(s.statPrefix, counting(s.stat.value, k), s.statSuffix), statX, statY);
  if (s.statLabel) {
    const ls = G.tall ? u * 4.2 : u * 3.6;
    g.font = body(c, ls, 500);
    g.fillStyle = pal.muted;
    const words = caps(s.statLabel);
    // the label may wrap onto two lines beside the cards
    const lines = wrap(g, words, statW);
    lines.forEach((ln, i) => g.fillText(ln, statX, statY + size * 0.7 + ls * (0.9 + i * 1.25)));
  }
  g.restore();
}

function wrap(g: Ctx2D, text: string, maxW: number): string[] {
  const out: string[] = [];
  let cur = '';
  for (const w of text.split(/\s+/)) {
    const next = cur ? `${cur} ${w}` : w;
    if (cur && g.measureText(next).width > maxW) {
      out.push(cur);
      cur = w;
    } else cur = next;
  }
  if (cur) out.push(cur);
  return out.slice(0, 2);
}
