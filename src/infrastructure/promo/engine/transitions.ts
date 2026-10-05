// The four transitions, drawn from two finished layers (the scene going out, a; coming in, b) at
// progress k (0..1, the cut at 0.5): whip-pan, flash-cut, blur-dissolve, glitch.
import type { MoveId } from '@/domain/promo/moves';
import { hash01 } from '@/domain/promo/rng';
import { ctx2d, makeCanvas, type AnyCanvas, type Ctx2D } from '../canvas';
import { quadIn, quadOut } from './ease';
import type { Geometry } from './geometry';

let small: AnyCanvas | null = null;

export function drawCut(
  g: Ctx2D,
  a: AnyCanvas,
  b: AnyCanvas,
  move: MoveId,
  k: number,
  G: Geometry,
  frame: number,
  flash: string,
) {
  const { W, H } = G;
  const out = k < 0.5;
  const layer = out ? a : b;
  switch (move) {
    case 'whip-pan': {
      const u = out ? quadIn(k / 0.5) : 1 - quadOut((k - 0.5) / 0.5);
      const x = (out ? -1 : 1) * u * W * 0.7;
      // a motion-blur trail of fainter copies
      for (let i = 4; i >= 0; i--) {
        g.globalAlpha = i === 0 ? 1 : 0.18;
        g.drawImage(layer, x - (out ? -1 : 1) * i * u * W * 0.04, 0);
      }
      g.globalAlpha = 1;
      break;
    }
    case 'blur-dissolve': {
      const blur = Math.sin(k * Math.PI);
      const soft = (c: AnyCanvas, alpha: number) => {
        if (alpha <= 0) return;
        const d = 1 + blur * 14;
        const w = Math.max(8, Math.ceil(W / d)),
          h = Math.max(8, Math.ceil(H / d));
        if (!small || small.width !== w || small.height !== h) small = makeCanvas(w, h);
        const s = ctx2d(small);
        s.clearRect(0, 0, w, h);
        s.drawImage(c, 0, 0, w, h);
        g.globalAlpha = alpha;
        g.imageSmoothingEnabled = true;
        g.drawImage(small, 0, 0, W, H);
      };
      soft(a, 1 - k);
      soft(b, k);
      g.globalAlpha = 1;
      break;
    }
    case 'glitch': {
      const on = k > 0.15 && k < 0.85;
      if (!on) {
        g.drawImage(layer, 0, 0);
        break;
      }
      const amp = Math.sin(((k - 0.15) / 0.7) * Math.PI);
      const slices = 14;
      const sh = H / slices;
      for (let i = 0; i < slices; i++) {
        const r = hash01(frame * 31 + i);
        const dx = (r - 0.5) * W * 0.12 * amp * (r > 0.6 ? 1 : 0.2);
        g.drawImage(layer, 0, i * sh, W, sh, dx, i * sh, W, sh);
      }
      // a colour-split echo
      g.save();
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = 0.25 * amp;
      g.drawImage(layer, W * 0.012 * amp, 0);
      g.restore();
      break;
    }
    default: {
      // flash-cut
      g.drawImage(layer, 0, 0);
      const f = Math.max(0, 1 - Math.abs(k - 0.5) / 0.5) ** 2;
      g.fillStyle = flash;
      g.globalAlpha = f * 0.9;
      g.fillRect(0, 0, W, H);
      g.globalAlpha = 1;
    }
  }
}
