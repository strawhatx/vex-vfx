// A screenshot on screen: drawn into a "card" (its device frame or window, cropped to its zoom, with
// any light sweep), then placed in the frame by its screen move. 3D turns are drawn as thin vertical
// strips in perspective, which canvas 2D can't do on its own.
import type { MoveId } from '@/domain/promo/moves';
import type { Scene } from '@/domain/promo/plan';
import type { Recipe } from '@/domain/promo/recipe';
import { ctx2d, makeCanvas, type AnyCanvas, type Ctx2D } from '../canvas';
import type { ShotImage } from '../shots';
import { inOut, reel } from './ease';
import { fit, type Geometry } from './geometry';
import type { PartState } from './timeline';

const clamp01 = (u: number) => Math.max(0, Math.min(1, u));
const lerp = (a: number, b: number, u: number) => a + (b - a) * u;
const DEG = Math.PI / 180;

export interface Pose {
  dx: number;
  dy: number;
  scale: number;
  alpha: number;
  // turn about the vertical axis, and about the view axis (radians)
  yaw: number;
  roll: number;
  // 0..1: how far in to the zoom target; 0..1: how far a tall page has scrolled
  zoom: number;
  scroll: number;
}

// where the move puts the screen at this point of its scene
export function pose(move: MoveId, s: PartState, G: Geometry, zoomScale: number): Pose {
  const e = s.enter,
    life = s.life,
    H = G.H;
  const lateZoom = zoomScale > 1 ? inOut(clamp01((life - 0.45) / 0.45)) : 0;
  const base: Pose = { dx: 0, dy: 0, scale: 1, alpha: 1, yaw: 0, roll: 0, zoom: lateZoom, scroll: 0 };
  switch (move) {
    case 'slide-in':
      return { ...base, dy: (1 - e) * H * 0.3 - (life - 0.5) * H * 0.02, alpha: clamp01(e * 1.6) };
    case 'tilt-float':
      return {
        ...base,
        yaw: lerp(-26, -9, e) * DEG * (1 - life * 0.7),
        dy: (1 - e) * H * 0.12 + Math.sin(life * Math.PI * 2) * H * 0.006,
        scale: 0.9 + 0.1 * e,
        alpha: clamp01(e * 1.4),
      };
    case 'zoom-detail':
      return {
        ...base,
        scale: 0.95 + 0.05 * e,
        alpha: clamp01(e * 2),
        zoom: inOut(clamp01((life - 0.2) / 0.6)),
      };
    case 'parallax-scroll':
      return {
        ...base,
        dy: (0.5 - life) * H * 0.05 + (1 - e) * H * 0.12,
        alpha: clamp01(e * 1.6),
        scroll: inOut(life),
      };
    case 'device-frame-spin':
      return {
        ...base,
        yaw: (1 - e) * -86 * DEG,
        roll: (1 - e) * -0.1,
        scale: 0.82 + 0.18 * e,
        alpha: clamp01(e * 3),
      };
    default:
      return { ...base, alpha: clamp01(e * 2) };
  }
}

export interface ScreenStyle {
  recipe: Recipe;
  brand: string;
}

// reused between frames: one card canvas per slot (a transition shows two scenes at once)
const cards: AnyCanvas[] = [];
const cardFor = (slot: number, w: number, h: number) => {
  let c = cards[slot];
  if (!c || c.width !== Math.ceil(w) || c.height !== Math.ceil(h)) cards[slot] = c = makeCanvas(w, h);
  return c;
};

// draws a scene's screenshot onto g in its pose; slot keeps two scenes' cards apart
export function drawScreen(
  g: Ctx2D,
  img: ShotImage,
  scene: Scene,
  s: PartState,
  G: Geometry,
  st: ScreenStyle,
  slot: number,
) {
  const { recipe } = st;
  const layout = recipe.layout;
  const zoomScale = scene.move === 'zoom-detail' && scene.zoom.scale <= 1 ? 1.5 : scene.zoom.scale;
  const P = pose(scene.move, s, G, zoomScale);

  // the card: the image's size in the box, or a window of a tall page when it scrolls
  const tallPage =
    scene.move === 'parallax-scroll' && img.height / img.width > (G.screen.h / G.screen.w) * 1.05;
  const viewH = tallPage ? img.width * (G.screen.h / G.screen.w) : img.height;
  const inner = fit(img.width, viewH, G.screen.w, G.screen.h);
  const frame = frameOf(layout, inner.w, inner.h, G.min);
  const cw = inner.w + frame.pad * 2,
    ch = inner.h + frame.pad * 2 + frame.bar;
  const card = cardFor(slot, cw, ch);
  const c = ctx2d(card);
  c.clearRect(0, 0, card.width, card.height);

  // the device or window
  c.save();
  roundRect(c, 0, 0, cw, ch, frame.outer);
  c.fillStyle = frame.fill(c, cw, ch, recipe);
  c.fill();
  if (frame.bar) {
    // a terminal window's title bar with its three dots
    c.fillStyle = recipe.palette.muted;
    for (let i = 0; i < 3; i++) {
      c.beginPath();
      c.arc(
        frame.pad + frame.bar * (0.5 + i * 0.7),
        frame.bar / 2 + frame.pad / 2,
        frame.bar * 0.2,
        0,
        Math.PI * 2,
      );
      c.fill();
    }
  }
  // the screenshot, cropped to its zoom (and scrolled, for a tall page)
  const z = lerp(1, zoomScale, P.zoom);
  const sw = img.width / z,
    sh = viewH / z;
  const fx = scene.zoom.x * img.width,
    fy = tallPage ? lerp(viewH / 2, img.height - viewH / 2, P.scroll) : scene.zoom.y * img.height;
  const sx = Math.max(0, Math.min(img.width - sw, lerp(img.width / 2, fx, P.zoom) - sw / 2));
  const syCentre = tallPage ? fy + (scene.zoom.y - 0.5) * viewH * P.zoom : lerp(viewH / 2, fy, P.zoom);
  const sy = Math.max(0, Math.min(img.height - sh, syCentre - sh / 2));
  const ix = frame.pad,
    iy = frame.pad + frame.bar;
  c.save();
  roundRect(c, ix, iy, inner.w, inner.h, frame.inner);
  c.clip();
  c.drawImage(img, sx, sy, sw, sh, ix, iy, inner.w, inner.h);
  c.restore();
  if (scene.extra === 'light-sweep') lightSweep(c, cw, ch, s.life);
  if (frame.border) {
    c.lineWidth = frame.border;
    c.strokeStyle = recipe.layout === 'terminal' ? recipe.palette.accent : recipe.palette.fg;
    roundRect(c, frame.border / 2, frame.border / 2, cw - frame.border, ch - frame.border, frame.outer);
    c.stroke();
  }
  c.restore();

  // placing it: shadow or glow behind, then the card, flat or in perspective
  const cx = G.screen.cx + P.dx,
    cy = G.screen.cy + P.dy;
  const w = cw * P.scale,
    h = ch * P.scale;
  g.save();
  g.globalAlpha = P.alpha;
  g.translate(cx, cy);
  g.rotate(P.roll);
  const glow = scene.extra === 'glow-pulse';
  backing(
    g,
    w * Math.cos(P.yaw),
    h,
    frame.outer * P.scale,
    G,
    st,
    glow ? 0.5 + 0.5 * Math.sin(s.life * Math.PI * 4) : -1,
  );
  if (Math.abs(P.yaw) < 0.002) g.drawImage(card, 0, 0, cw, ch, -w / 2, -h / 2, w, h);
  else drawTurned(g, card, cw, ch, w, h, P.yaw);
  g.restore();
}

interface Frame {
  pad: number;
  bar: number;
  outer: number;
  inner: number;
  border: number;
  fill: (c: Ctx2D, w: number, h: number, r: Recipe) => string | CanvasGradient;
}

function frameOf(layout: Recipe['layout'], w: number, h: number, min: number): Frame {
  const phone = h > w;
  const r = Math.min(w, h);
  switch (layout) {
    case 'floating-device': {
      const pad = r * (phone ? 0.035 : 0.018);
      return {
        pad,
        bar: 0,
        outer: r * (phone ? 0.11 : 0.035),
        inner: r * (phone ? 0.085 : 0.02),
        border: 0,
        fill: (c, cw, ch, rec) => {
          if (rec.texture !== 'glow') return '#111113';
          // chrome: a metal gradient for the Y2K look
          const gr = c.createLinearGradient(0, 0, cw, ch);
          gr.addColorStop(0, '#F5F7FA');
          gr.addColorStop(0.35, '#9AA6B8');
          gr.addColorStop(0.55, '#EEF2F8');
          gr.addColorStop(1, '#3B4458');
          return gr;
        },
      };
    }
    case 'terminal': {
      const pad = min * 0.008;
      return {
        pad,
        bar: min * 0.05,
        outer: min * 0.012,
        inner: 0,
        border: Math.max(2, min * 0.003),
        fill: (_c, _w, _h, rec) => rec.palette.bg,
      };
    }
    case 'full-bleed':
      return {
        pad: 0,
        bar: 0,
        outer: 0,
        inner: 0,
        border: Math.max(3, min * 0.009),
        fill: (_c, _w, _h, rec) => rec.palette.fg,
      };
    case 'grid':
      return {
        pad: 0,
        bar: 0,
        outer: 0,
        inner: 0,
        border: Math.max(1, min * 0.0022),
        fill: (_c, _w, _h, rec) => rec.palette.bg,
      };
    default:
      return { pad: 0, bar: 0, outer: r * 0.03, inner: r * 0.03, border: 0, fill: () => '#ffffff' };
  }
}

// a soft shadow (or, with glow-pulse, a glow in the brand colour) behind the card
function backing(g: Ctx2D, w: number, h: number, radius: number, G: Geometry, st: ScreenStyle, glow: number) {
  g.save();
  const { recipe } = st;
  if (recipe.layout === 'full-bleed') {
    // brutalist: a hard block offset behind, no blur
    const o = G.min * 0.022;
    g.fillStyle = recipe.palette.accent;
    g.fillRect(-w / 2 + o, -h / 2 + o, w, h);
    g.restore();
    return;
  }
  const dark = recipe.texture === 'glow' || recipe.layout === 'terminal';
  g.shadowColor = glow >= 0 ? st.brand : dark ? 'rgba(0,0,0,0.6)' : 'rgba(20,20,40,0.28)';
  g.shadowBlur = G.min * (glow >= 0 ? 0.06 + 0.05 * glow : 0.06);
  g.shadowOffsetY = glow >= 0 ? 0 : G.min * 0.025;
  g.fillStyle = glow >= 0 ? st.brand : recipe.palette.bg;
  roundRect(g, -w / 2, -h / 2, w, h, radius);
  g.fill();
  g.restore();
}

// the card turned by yaw about its vertical axis, in perspective, as vertical strips
function drawTurned(g: Ctx2D, card: AnyCanvas, cw: number, ch: number, w: number, h: number, yaw: number) {
  const N = 40;
  const D = w * 2.4;
  const cos = Math.cos(yaw),
    sin = Math.sin(yaw);
  const project = (u: number) => {
    const x = (u - 0.5) * w;
    const z = x * sin;
    const k = D / (D + z);
    return { x: x * cos * k, h: h * k };
  };
  let prev = project(0);
  for (let i = 0; i < N; i++) {
    const next = project((i + 1) / N);
    const x0 = prev.x,
      x1 = next.x;
    const hh = (prev.h + next.h) / 2;
    const sx = (i / N) * cw,
      sw = cw / N;
    // (strips overlap by half a pixel so no seams show)
    g.drawImage(card, sx, 0, sw, ch, Math.min(x0, x1) - 0.25, -hh / 2, Math.abs(x1 - x0) + 0.5, hh);
    prev = next;
  }
}

// a diagonal band of light that crosses the card once, kept to the card's pixels
function lightSweep(c: Ctx2D, w: number, h: number, life: number) {
  const u = reel(Math.max(0, Math.min(1, (life - 0.15) / 0.55)));
  if (u <= 0 || u >= 1) return;
  const x = lerp(-w * 0.6, w * 1.6, u);
  const gr = c.createLinearGradient(x - w * 0.25, 0, x + w * 0.25, h * 0.4);
  gr.addColorStop(0, 'rgba(255,255,255,0)');
  gr.addColorStop(0.5, 'rgba(255,255,255,0.45)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  c.save();
  c.globalCompositeOperation = 'source-atop';
  c.fillStyle = gr;
  c.fillRect(0, 0, w, h);
  c.restore();
}

export function roundRect(c: Ctx2D, x: number, y: number, w: number, h: number, r: number) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}
