// Text in the video: laid out in lines of words, then drawn by a text move at its progress p (0..1).
// A word wrapped in *asterisks* is a key word, drawn in the brand colour. The moves: word-slam,
// word-pop, mask-reveal, letter-stagger, typewriter, highlight-swipe.
import type { TextMove } from '@/domain/video/moves';
import type { Ctx2D } from '../canvas';
import { backOut, expoOut, reel } from './ease';

export interface TextStyle {
  font: string;
  size: number;
  color: string;
  // key words
  hi: string;
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
  hi: boolean;
}
interface Line {
  words: Word[];
  w: number;
  y: number;
}
export interface TextLayout {
  lines: Line[];
  height: number;
  width: number;
  chars: number;
  words: number;
}

const clamp01 = (u: number) => Math.max(0, Math.min(1, u));

// the words of a text with their key-word flag (*key words* may span several words)
export function tokens(text: string): { text: string; hi: boolean }[] {
  const out: { text: string; hi: boolean }[] = [];
  let hi = false;
  for (const raw of text.split(/\s+/).filter(Boolean)) {
    let w = raw;
    const opens = w.startsWith('*');
    if (opens) w = w.slice(1);
    const closes = /\*[^\w]*$/.test(w);
    w = w.replace(/\*/g, '');
    if (opens) hi = true;
    if (w) out.push({ text: w, hi });
    if (closes) hi = false;
  }
  return out;
}

// the text without its key-word marks
export const plainText = (text: string) => text.replace(/\*/g, '');

// words wrapped to maxW; line y's are relative to the block's centre
export function layoutText(g: Ctx2D, text: string, s: TextStyle, maxW: number, maxLines = 3): TextLayout {
  g.font = s.font;
  const space = g.measureText(' ').width;
  const lines: Line[] = [];
  let cur: Word[] = [],
    x = 0;
  for (const tk of tokens(s.caps ? text.toUpperCase() : text)) {
    const w = g.measureText(tk.text).width;
    if (cur.length && x + w > maxW) {
      lines.push({ words: cur, w: x - space, y: 0 });
      cur = [];
      x = 0;
    }
    cur.push({ text: tk.text, x, w, hi: tk.hi });
    x += w + space;
  }
  if (cur.length) lines.push({ words: cur, w: x - space, y: 0 });
  lines.splice(maxLines);
  const lh = s.size * (s.lineHeight ?? 1.08);
  lines.forEach((l, i) => (l.y = (i - (lines.length - 1) / 2) * lh));
  const words = lines.reduce((n, l) => n + l.words.length, 0);
  const chars = lines.reduce((n, l) => n + l.words.reduce((m, w) => m + w.text.length, 0), 0);
  return { lines, height: lines.length * lh, width: Math.max(0, ...lines.map(l => l.w)), chars, words };
}

// the largest size (≤ size) at which text fits maxW in maxLines
export function fitSize(
  g: Ctx2D,
  text: string,
  s: TextStyle,
  maxW: number,
  maxLines: number,
  font: (px: number) => string,
) {
  let size = s.size;
  for (let i = 0; i < 12; i++) {
    const L = layoutText(g, text, { ...s, size, font: font(size) }, maxW, 99);
    const longest = Math.max(
      ...tokens(text).map(t => g.measureText(s.caps ? t.text.toUpperCase() : t.text).width),
    );
    if (L.lines.length <= maxLines && longest <= maxW) break;
    size *= 0.9;
  }
  return size;
}

// how long a text move takes to play out, in seconds
export const textSeconds = (move: TextMove, L: TextLayout) =>
  move === 'typewriter'
    ? Math.min(1.6, 0.25 + L.chars * 0.04)
    : move === 'letter-stagger'
      ? Math.min(1.4, 0.4 + L.chars * 0.025)
      : move === 'word-slam'
        ? Math.min(1.4, 0.35 + L.words * 0.18)
        : move === 'mask-reveal'
          ? 0.6 + L.lines.length * 0.15
          : Math.min(1.2, 0.4 + L.words * 0.1);

// draws laid-out text centred (or left-aligned) on x, its block centred on y
export function drawText(
  g: Ctx2D,
  L: TextLayout,
  s: TextStyle,
  move: TextMove,
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
  const colour = (w: Word) => (w.hi ? s.hi : s.color);
  const lh = s.size * (s.lineHeight ?? 1.08);

  if (move === 'typewriter') {
    let shown = Math.floor(p * L.chars + 1e-6);
    let caretX = left(L.lines[0] ?? { w: 0, words: [], y: 0 }),
      caretY = y + (L.lines[0]?.y ?? 0);
    for (const l of L.lines) {
      const lx = left(l);
      for (const w of l.words) {
        if (shown <= 0) break;
        const part = w.text.slice(0, shown);
        shown -= w.text.length;
        g.fillStyle = colour(w);
        g.fillText(part, lx + w.x, y + l.y);
        caretX = lx + w.x + g.measureText(part).width;
        caretY = y + l.y;
      }
    }
    // the cursor blinks twice a second once typing is done
    if (p < 1 || Math.floor(t * 2) % 2 === 0) {
      g.fillStyle = s.color;
      g.fillRect(caretX + s.size * 0.08, caretY - s.size * 0.42, s.size * 0.5, s.size * 0.84);
    }
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
      // text past the bar's edge in its own colour, behind it in the colour that reads on the bar
      g.save();
      g.beginPath();
      g.rect(lx - pad + barW, top - pad, l.w + pad * 3, bh + pad * 2);
      g.clip();
      for (const w of l.words) {
        g.fillStyle = colour(w);
        g.fillText(w.text, lx + w.x, ly);
      }
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

  if (move === 'mask-reveal') {
    // each line rises from below an edge just under it
    L.lines.forEach((l, i) => {
      const lp = reel(clamp01(p * (1 + (L.lines.length - 1) * 0.3) - i * 0.3));
      if (lp <= 0) return;
      const lx = left(l),
        ly = y + l.y;
      g.save();
      g.beginPath();
      g.rect(lx - s.size, ly - lh * 0.62, l.w + s.size * 2, lh * 1.24);
      g.clip();
      for (const w of l.words) {
        g.fillStyle = colour(w);
        g.fillText(w.text, lx + w.x, ly + (1 - lp) * lh * 1.1);
      }
      g.restore();
    });
    g.restore();
    return;
  }

  if (move === 'letter-stagger') {
    const step = 1 / Math.max(1, L.chars);
    let k = 0;
    for (const l of L.lines) {
      const lx = left(l);
      for (const w of l.words) {
        let cx = lx + w.x;
        for (const ch of w.text) {
          const local = clamp01((p * (1 + L.chars * step * 0.6) - k * step * 0.6) / 0.4);
          k++;
          const cw = g.measureText(ch).width;
          if (local > 0) {
            g.globalAlpha = local;
            g.fillStyle = colour(w);
            g.fillText(ch, cx, y + l.y + (1 - reel(local)) * s.size * 0.35);
          }
          cx += cw;
        }
      }
    }
    g.restore();
    return;
  }

  // word-pop and word-slam: each word arrives in turn
  const slam = move === 'word-slam';
  const step = slam ? 0.55 : 0.35;
  const span = L.words > 1 ? 1 + (L.words - 1) * step : 1;
  let i = 0;
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
      g.fillStyle = colour(w);
      g.fillText(w.text, -w.w / 2, 0);
      g.restore();
    }
  }
  g.restore();
}
