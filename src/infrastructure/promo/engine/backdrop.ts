// What's behind everything (each aesthetic's stage) and what's laid over everything (its texture:
// grain, glow or scanlines). Random-looking details come from fixed seeds, so every frame repeats.
import type { Recipe } from '@/domain/promo/recipe';
import { hash01, rng } from '@/domain/promo/rng';
import { ctx2d, makeCanvas, type AnyCanvas, type Ctx2D } from '../canvas';
import type { Geometry } from './geometry';

const withAlpha = (hex: string, a: number) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

export function drawBackdrop(g: Ctx2D, r: Recipe, G: Geometry, brand: string, t: number) {
  const { W, H, min } = G;
  g.save();
  g.fillStyle = r.palette.bg;
  g.fillRect(0, 0, W, H);
  switch (r.slug) {
    case 'clean-apple': {
      const top = g.createRadialGradient(W / 2, -H * 0.1, 0, W / 2, -H * 0.1, H * 0.9);
      top.addColorStop(0, 'rgba(255,255,255,0.95)');
      top.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = top;
      g.fillRect(0, 0, W, H);
      radial(g, G.screen.cx, G.screen.cy, min * 0.7, withAlpha(brand, 0.12));
      break;
    }
    case 'y2k-chrome': {
      radial(g, W * 0.15, H * 0.12, min * 0.9, withAlpha(r.palette.accent, 0.22));
      radial(g, W * 0.9, H * 0.85, min * 0.9, withAlpha(brand, 0.24));
      // a perspective grid floor
      const horizon = H * 0.74;
      g.strokeStyle = withAlpha(r.palette.accent, 0.16);
      g.lineWidth = Math.max(1, min * 0.002);
      g.beginPath();
      for (let i = -10; i <= 10; i++) {
        g.moveTo(W / 2 + i * W * 0.02, horizon);
        g.lineTo(W / 2 + i * W * 0.22, H);
      }
      const scroll = (t * 0.35) % 1;
      for (let j = 0; j < 8; j++) {
        const y = horizon + (H - horizon) * ((j + scroll) / 8) ** 2;
        g.moveTo(0, y);
        g.lineTo(W, y);
      }
      g.stroke();
      // a few twinkling stars
      const R = rng(11);
      for (let i = 0; i < 36; i++) {
        const x = R() * W,
          y = R() * horizon,
          s = (0.5 + R()) * min * 0.003;
        g.globalAlpha = 0.25 + 0.5 * (0.5 + 0.5 * Math.sin(t * 2.3 + i * 1.7));
        g.fillStyle = '#ffffff';
        g.fillRect(x, y, s, s);
      }
      break;
    }
    case 'swiss-minimal': {
      const cols = W > H ? 12 : 6;
      g.strokeStyle = withAlpha(r.palette.fg, 0.07);
      g.lineWidth = Math.max(1, min * 0.0015);
      g.beginPath();
      for (let i = 1; i < cols; i++) {
        g.moveTo((W / cols) * i, 0);
        g.lineTo((W / cols) * i, H);
      }
      g.stroke();
      g.fillStyle = r.palette.accent;
      g.fillRect(min * 0.06, min * 0.06, min * 0.05, min * 0.05);
      break;
    }
    case 'brutalist': {
      const inset = min * 0.035,
        lw = min * 0.012;
      g.strokeStyle = r.palette.fg;
      g.lineWidth = lw;
      g.strokeRect(inset, inset, W - inset * 2, H - inset * 2);
      g.fillStyle = r.palette.accent;
      g.fillRect(inset, inset, W - inset * 2, min * 0.03);
      break;
    }
    case 'retro-terminal':
      radial(g, W / 2, H / 2, Math.max(W, H) * 0.7, withAlpha(r.palette.accent, 0.07));
      break;
    default:
      break;
  }
  g.restore();
}

function radial(g: Ctx2D, x: number, y: number, rad: number, color: string) {
  const gr = g.createRadialGradient(x, y, 0, x, y, rad);
  gr.addColorStop(0, color);
  gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr;
  g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
}

// --- textures, over the whole frame ---------------------------------------------------------

let noise: AnyCanvas | null = null;
let bloom: AnyCanvas | null = null;

function noiseTile(): AnyCanvas {
  if (noise) return noise;
  const S = 256;
  noise = makeCanvas(S, S);
  const c = ctx2d(noise);
  const img = c.createImageData(S, S);
  const R = rng(7);
  for (let i = 0; i < S * S; i++) {
    const v = Math.floor(R() * 255);
    img.data.set([v, v, v, 255], i * 4);
  }
  c.putImageData(img, 0, 0);
  return noise;
}

// film grain: the noise tile at a new offset each frame
export function grain(g: Ctx2D, G: Geometry, frame: number, strength: number) {
  const tile = noiseTile();
  const scale = Math.max(1, G.min / 540);
  const ox = hash01(frame * 2 + 1) * 256,
    oy = hash01(frame * 2 + 2) * 256;
  g.save();
  g.globalAlpha = strength;
  g.globalCompositeOperation = 'overlay';
  g.translate(-ox * scale, -oy * scale);
  g.scale(scale, scale);
  for (let x = 0; x < G.W / scale + 512; x += 256)
    for (let y = 0; y < G.H / scale + 512; y += 256) g.drawImage(tile, x, y);
  g.restore();
}

export function drawTexture(g: Ctx2D, canvas: AnyCanvas, r: Recipe, G: Geometry, frame: number) {
  switch (r.texture) {
    case 'grain':
      grain(g, G, frame, 0.12);
      break;
    case 'glow': {
      // bloom: a quarter-size copy blurred by scaling back up, added on top
      const w = Math.ceil(G.W / 6),
        h = Math.ceil(G.H / 6);
      if (!bloom || bloom.width !== w || bloom.height !== h) bloom = makeCanvas(w, h);
      const b = ctx2d(bloom);
      b.clearRect(0, 0, w, h);
      b.drawImage(canvas, 0, 0, w, h);
      g.save();
      // (screen, lightly: adds glow to the dark stage without washing out the screenshot)
      g.globalCompositeOperation = 'screen';
      g.globalAlpha = 0.22;
      g.imageSmoothingEnabled = true;
      g.drawImage(bloom, 0, 0, G.W, G.H);
      g.restore();
      break;
    }
    case 'scanlines': {
      const step = Math.max(3, Math.round(G.H / 360));
      g.save();
      g.fillStyle = 'rgba(0,0,0,0.28)';
      for (let y = 0; y < G.H; y += step) g.fillRect(0, y, G.W, Math.max(1, step / 3));
      const v = g.createRadialGradient(
        G.W / 2,
        G.H / 2,
        G.min * 0.3,
        G.W / 2,
        G.H / 2,
        Math.max(G.W, G.H) * 0.75,
      );
      v.addColorStop(0, 'rgba(0,0,0,0)');
      v.addColorStop(1, 'rgba(0,0,0,0.55)');
      g.fillStyle = v;
      g.fillRect(0, 0, G.W, G.H);
      g.restore();
      break;
    }
    default:
      break;
  }
}
