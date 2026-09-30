// Drawing an impact word (POW, BOOM…): comic letters on a spiky burst, tilted, popping up with an
// overshoot, then swelling and fading. A function of its age and seed only, like the other impacts.
import type { WordLook } from '@/domain/effects/impacts';
import { backOut, fontFor, type Fonts } from './fonts';
import type { Hit } from './impacts';
import { mulberry32 } from './rng';
import type { Ctx2D } from './sprites';

const POP_S = 0.14;
const INK = '#111';

// h.size: the letters' height
export function drawWord(ctx: Ctx2D, h: Hit, w: WordLook, fonts: Fonts) {
  const { age, x, y, size, colors } = h;
  const T = h.look.duration;
  if (age >= T) return;
  const tail = Math.max(0, (age - T * 0.7) / (T * 0.3));
  const scale = (age < POP_S ? backOut(age / POP_S) : 1) * (1 + 0.25 * tail);
  const wobble = 0.05 * Math.sin(age * 40) * Math.max(0, 1 - age / 0.3);

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1 - tail;
  ctx.translate(x, y);
  ctx.rotate(w.tilt + wobble);
  ctx.scale(scale, scale);
  ctx.font = fontFor(fonts, 'bangers', size);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  const tw = ctx.measureText(w.text).width;

  // the burst: spikes of uneven length round an ellipse a little bigger than the word
  const r = mulberry32(h.seed);
  const rx = Math.max(tw * 0.68, size * 0.9);
  const ry = Math.max(size * 1.05, rx * 0.62);
  ctx.beginPath();
  for (let k = 0; k < w.spikes * 2; k++) {
    const a = (k / (w.spikes * 2)) * Math.PI * 2;
    const out = k % 2 ? 0.74 + 0.08 * r() : 1 + 0.18 * r();
    const px = Math.cos(a) * rx * out;
    const py = Math.sin(a) * ry * out;
    if (k) ctx.lineTo(px, py);
    else ctx.moveTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = colors[1];
  ctx.fill();
  ctx.lineWidth = Math.max(2, size * 0.07);
  ctx.strokeStyle = INK;
  ctx.stroke();

  // the letters: a thick ink outline, a drop shadow of it, then the color
  ctx.lineWidth = Math.max(3, size * 0.22);
  ctx.strokeText(w.text, size * 0.06, size * 0.1);
  ctx.strokeText(w.text, 0, 0);
  ctx.fillStyle = colors[3];
  ctx.fillText(w.text, 0, 0);
  ctx.restore();
}
