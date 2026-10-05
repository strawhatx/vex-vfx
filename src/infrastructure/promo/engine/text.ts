// Captions, hooks and titles: text laid out in lines of words, then drawn by a text move at its
// progress p (0..1). The moves: word-pop, typewriter, word-slam, highlight-swipe.
import type { MoveId } from '@/domain/promo/moves';
import type { Ctx2D } from '../canvas';
import { backOut, expoOut, reel } from './ease';

export interface TextStyle {
  font: string;
  size: number;
  color: string;
  // highlight-swipe: the bar's colour and the text's colour on it
  bar: string;
  onBar: string;
  caps: boolean;
  align: 'center' | 'left';
  lineHeight?: number;
}

interface Word {
  text: string;
  x: number;
  w: number;
}
interface Line {
  words: Word[];
  w: number;
  y: number;
}
export interface TextLayout {
  lines: Line[];
  height: number;
  chars: number;
}

const clamp01 = (u: number) => Math.max(0, Math.min(1, u));

// words wrapped to maxW; line y's are relative to the block's centre
export function layoutText(g: Ctx2D, text: string, s: TextStyle, maxW: number, maxLines = 3): TextLayout {
  const t = s.caps ? text.toUpperCase() : text;
  g.font = s.font;
  const space = g.measureText(' ').width;
  const lines: Line[] = [];
  let cur: Word[] = [],
    x = 0;
  for (const word of t.split(/\s+/).filter(Boolean)) {
    const w = g.measureText(word).width;
    if (cur.length && x + w > maxW) {
      lines.push({ words: cur, w: x - space, y: 0 });
      cur = [];
      x = 0;
    }
    cur.push({ text: word, x, w });
    x += w + space;
  }
  if (cur.length) lines.push({ words: cur, w: x - space, y: 0 });
  lines.splice(maxLines);
  const lh = s.size * (s.lineHeight ?? 1.08);
  lines.forEach((l, i) => (l.y = (i - (lines.length - 1) / 2) * lh));
  return { lines, height: lines.length * lh, chars: t.replace(/\s+/g, '').length };
}

// draws laid-out text centred (or left-aligned) on x, its block centred on y
export function drawText(
  g: Ctx2D,
  L: TextLayout,
  s: TextStyle,
  move: MoveId,
  p: number,
  x: number,
  y: number,
  t: number,
) {
  g.save();
  g.font = s.font;
  g.textBaseline = 'middle';
  g.textAlign = 'left';
  const left = (l: Line) => (s.align === 'center' ? x - l.w / 2 : x);
  const nWords = L.lines.reduce((n, l) => n + l.words.length, 0);

  if (move === 'typewriter') {
    let shown = Math.floor(p * L.chars + 1e-6);
    let caretX = 0,
      caretY = y + (L.lines[0]?.y ?? 0);
    g.fillStyle = s.color;
    for (const l of L.lines) {
      const lx = left(l);
      for (const w of l.words) {
        if (shown <= 0) break;
        const part = w.text.slice(0, shown);
        shown -= w.text.length;
        g.fillText(part, lx + w.x, y + l.y);
        caretX = lx + w.x + g.measureText(part).width;
        caretY = y + l.y;
      }
    }
    // the cursor blinks twice a second once typing is done
    if (p < 1 || Math.floor(t * 2) % 2 === 0)
      g.fillRect(caretX + s.size * 0.08, caretY - s.size * 0.42, s.size * 0.5, s.size * 0.84);
    g.restore();
    return;
  }

  if (move === 'highlight-swipe') {
    const pad = s.size * 0.18;
    L.lines.forEach((l, i) => {
      const lp = reel(clamp01(p * 1.4 - i * 0.25));
      const lx = left(l),
        ly = y + l.y;
      const top = ly - s.size * 0.58,
        bh = s.size * 1.16;
      const barW = (l.w + pad * 2) * lp;
      g.globalAlpha = clamp01(p * 4);
      // text before the bar's edge in its own colour, behind it in the colour that reads on the bar
      g.save();
      g.beginPath();
      g.rect(lx - pad + barW, top - pad, l.w + pad * 3, bh + pad * 2);
      g.clip();
      g.fillStyle = s.color;
      for (const w of l.words) g.fillText(w.text, lx + w.x, ly);
      g.restore();
      g.fillStyle = s.bar;
      g.fillRect(lx - pad, top, barW, bh);
      g.save();
      g.beginPath();
      g.rect(lx - pad, top - pad, barW, bh + pad * 2);
      g.clip();
      g.fillStyle = s.onBar;
      for (const w of l.words) g.fillText(w.text, lx + w.x, ly);
      g.restore();
    });
    g.restore();
    return;
  }

  // word-pop and word-slam: each word arrives in turn
  const slam = move === 'word-slam';
  const step = slam ? 0.55 : 0.35;
  const span = nWords > 1 ? 1 + (nWords - 1) * step : 1;
  let i = 0;
  g.fillStyle = s.color;
  for (const l of L.lines) {
    const lx = left(l);
    for (const w of l.words) {
      const local = clamp01(p * span - i * step);
      i++;
      if (local <= 0) continue;
      const k = slam ? 1 + 1.6 * (1 - expoOut(local)) : 0.35 + 0.65 * backOut(local);
      const cx = lx + w.x + w.w / 2,
        cy = y + l.y;
      g.save();
      g.globalAlpha = clamp01(local * (slam ? 3 : 2.5));
      g.translate(cx, cy + (slam ? 0 : (1 - local) * s.size * 0.35));
      g.scale(k, k);
      g.fillText(w.text, -w.w / 2, 0);
      g.restore();
    }
  }
  g.restore();
}
