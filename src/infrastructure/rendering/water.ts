// The Water effect (see domain/effects/water): rain, or the scene underwater, over the whole frame
// or around the tracked object. Everything is worked out from the frame's time and the clip's
// seed (each drop, splash and bubble repeats on its own cycle), so any frame renders the same
// whether playing, scrubbing or exporting.
import type { FxSettings } from '@/domain/effects/palettes';
import { mulberry32 } from './rng';
import type { Target } from './sim';
import type { Ctx2D } from './sprites';

// rain falls at three depths: far drops short, faint and slow; near ones long and fast
const RAIN = [
  { n: 150, len: 14, w: 1, a: 0.16, v: 900 },
  { n: 80, len: 30, w: 1.4, a: 0.24, v: 1400 },
  { n: 26, len: 70, w: 2.2, a: 0.3, v: 2000 },
];
const WIND = 0.12; // radians off straight down
const DROP = '210,225,240';
const FOAM = '225,238,250';

// the caustics are worked out small and stretched over the frame
const CW_CAUSTIC = 120,
  CH_CAUSTIC = 68;

// a fixed generator for one thing (a drop, a splash's cycle…): the same numbers every frame
const hash = (seed: number, a: number, b = 0, c = 0) =>
  mulberry32(
    Math.imul(seed, 131) ^ Math.imul(a + 1, 7919) ^ Math.imul(b + 1, 104729) ^ Math.imul(c + 1, 15485863),
  );

export class WaterPainter {
  private tmp: OffscreenCanvas;
  private tg: OffscreenCanvasRenderingContext2D;
  private caustic = new OffscreenCanvas(CW_CAUSTIC, CH_CAUSTIC);
  private cg = this.caustic.getContext('2d') as OffscreenCanvasRenderingContext2D;
  private cImg = this.cg.createImageData(CW_CAUSTIC, CH_CAUSTIC);

  constructor(
    private CW: number,
    private CH: number,
  ) {
    this.tmp = new OffscreenCanvas(CW, CH);
    this.tg = this.tmp.getContext('2d') as OffscreenCanvasRenderingContext2D;
  }

  // frame: the output as drawn so far; box: the tracked object, or null for the whole frame
  draw(ctx: Ctx2D, frame: CanvasImageSource, box: Target | null, s: FxSettings, t: number, seed: number) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (s.water === 'underwater') this.underwater(ctx, frame, box, s, t, seed);
    else this.rain(ctx, box, s, t, seed);
    ctx.restore();
  }

  // ---------- rain ----------

  private rain(ctx: Ctx2D, box: Target | null, s: FxSettings, t: number, seed: number) {
    const { CW, CH } = this;
    const k = CW / 960;
    const I = s.intensity;

    // a darker, cooler day
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = `rgba(12,20,32,${0.22 * Math.min(1.5, I)})`;
    ctx.fillRect(0, 0, CW, CH);

    // the drops: each falls on its own loop from above the frame to below it
    ctx.lineCap = 'round';
    const sx = Math.sin(WIND),
      sy = Math.cos(WIND);
    RAIN.forEach((L, li) => {
      const len = L.len * k * s.size;
      const span = CH + len * 2;
      ctx.strokeStyle = `rgba(${DROP},${L.a})`;
      ctx.lineWidth = Math.max(1, L.w * k);
      ctx.beginPath();
      for (let d = 0, n = Math.round(L.n * I); d < n; d++) {
        const r = hash(seed, li, d);
        const x0 = r() * CW * 1.2 - CW * 0.1;
        const v = L.v * k * (0.85 + 0.3 * r());
        const y = ((r() * span + t * v) % span) - len;
        const x = x0 + y * (sx / sy);
        ctx.moveTo(x, y);
        ctx.lineTo(x - sx * len, y - sy * len);
      }
      ctx.stroke();
    });

    // splashes on the ground (the lower part of the frame; nearer the bottom, bigger)
    for (let j = 0, n = Math.round(36 * I); j < n; j++) {
      const r = hash(seed, 50, j);
      const period = 0.45 + 0.5 * r();
      const phase = (t + r() * period) / period;
      const cycle = Math.floor(phase);
      const q = (phase - cycle) / 0.4;
      if (q >= 1) continue;
      const at = hash(seed, 51, j, cycle);
      const y = CH * (0.62 + 0.38 * at());
      const x = at() * CW;
      const near = (y / CH - 0.62) / 0.38;
      splash(ctx, x, y, (3 + 9 * near) * k * s.size, q, k, 0.28);
    }

    // drops bouncing off the top of the object
    if (box) {
      for (let j = 0, n = Math.round(16 * I); j < n; j++) {
        const r = hash(seed, 60, j);
        const period = 0.35 + 0.4 * r();
        const phase = (t + r() * period) / period;
        const cycle = Math.floor(phase);
        const q = (phase - cycle) / 0.45;
        if (q >= 1) continue;
        const u = (hash(seed, 61, j, cycle)() * 2 - 1) * 0.85;
        const x = box.x + u * box.rx;
        const y = box.y - box.ry * Math.sqrt(1 - u * u);
        splash(ctx, x, y, 7 * k * s.size, q, k, 0.5);
      }
    }
  }

  // ---------- underwater ----------

  private underwater(
    ctx: Ctx2D,
    frame: CanvasImageSource,
    box: Target | null,
    s: FxSettings,
    t: number,
    seed: number,
  ) {
    const { CW, CH } = this;
    const k = CW / 960;
    const I = s.intensity;

    // the picture wobbles: bands of it slid sideways on a slow wave
    const g = this.tg;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'copy';
    g.drawImage(frame, 0, 0, CW, CH);
    const band = Math.max(3, Math.round(6 * k));
    ctx.globalCompositeOperation = 'source-over';
    for (let y = 0; y < CH; y += band) {
      const dx = Math.sin(y * (0.025 / k) + t * 2.2) * CW * 0.004 * I * s.size;
      ctx.drawImage(this.tmp, 0, y, CW, band, dx, y, CW, band);
    }

    // blue-green water, murkier with depth
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = `rgba(40,150,170,${Math.min(0.85, 0.6 * I)})`;
    ctx.fillRect(0, 0, CW, CH);
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = 'rgba(0,70,100,0.25)';
    ctx.fillRect(0, 0, CW, CH);
    ctx.globalCompositeOperation = 'source-over';
    const deep = ctx.createLinearGradient(0, 0, 0, CH);
    deep.addColorStop(0, 'rgba(0,20,40,0)');
    deep.addColorStop(1, `rgba(0,20,40,${Math.min(0.6, 0.4 * I)})`);
    ctx.fillStyle = deep;
    ctx.fillRect(0, 0, CW, CH);

    // light from the surface: shafts swaying down, and moving patches
    ctx.globalCompositeOperation = 'screen';
    for (let b = 0; b < 5; b++) {
      const cx = CW * (0.1 + 0.2 * b) + Math.sin(t * 0.25 + b) * CW * 0.04;
      const angle = 0.25 + Math.sin(t * 0.2 + b * 1.7) * 0.06;
      const w = CW * (0.05 + 0.03 * Math.abs(Math.sin(b * 3)));
      const len = CH * 1.3;
      ctx.save();
      ctx.translate(cx, -10);
      ctx.rotate(angle);
      const shaft = ctx.createLinearGradient(0, 0, 0, len);
      shaft.addColorStop(0, `rgba(200,240,255,${0.16 * I})`);
      shaft.addColorStop(1, 'rgba(200,240,255,0)');
      ctx.fillStyle = shaft;
      ctx.fillRect(-w / 2, 0, w, len);
      ctx.restore();
    }
    this.caustics(t);
    ctx.globalAlpha = Math.min(1, 0.22 * I);
    ctx.drawImage(this.caustic, 0, 0, CW, CH);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    // specks drifting
    ctx.fillStyle = 'rgba(210,240,250,0.25)';
    for (let j = 0; j < 50; j++) {
      const r = hash(seed, 70, j);
      const x = (((r() * CW + t * (r() - 0.5) * 20 * k) % CW) + CW) % CW;
      const y = (((r() * CH + t * (r() - 0.6) * 12 * k) % CH) + CH) % CH;
      ctx.fillRect(x, y, Math.max(1, 1.5 * k), Math.max(1, 1.5 * k));
    }

    // bubbles rising from below
    for (let j = 0, n = Math.round(30 * I); j < n; j++) {
      const r = hash(seed, 80, j);
      const span = CH + 40 * k;
      const speed = (40 + 70 * r()) * k;
      const y = CH + 20 * k - ((r() * span + t * speed) % span);
      const x = r() * CW + Math.sin(t * 2 + j) * 6 * k;
      bubble(ctx, x, y, (2 + 5 * r()) * k * s.size, 1);
    }
    // and from the object, the way breath would
    if (box) {
      for (let j = 0; j < 26; j++) {
        const r = hash(seed, 90, j);
        const period = 1.6 + r();
        const phase = (t + r() * period) / period;
        const cycle = Math.floor(phase);
        const q = phase - cycle;
        const at = hash(seed, 91, j, cycle);
        const x0 = box.x + (at() - 0.5) * box.rx * 0.8;
        const y = box.y - box.ry * 0.7 - q * (120 + 80 * at()) * k;
        const x = x0 + Math.sin(q * 9 + j) * 5 * k;
        bubble(ctx, x, y, (2 + 4 * at()) * k * s.size * (0.8 + 0.4 * q), 1 - q * q);
      }
    }
  }

  // light patches: bright where a few waves cancel out, shifting as they move
  private caustics(t: number) {
    const d = this.cImg.data;
    for (let y = 0; y < CH_CAUSTIC; y++) {
      for (let x = 0; x < CW_CAUSTIC; x++) {
        const v =
          Math.sin(x * 0.21 + t * 1.3) +
          Math.sin(y * 0.27 - t * 1.1) +
          Math.sin((x * 0.13 + y * 0.17) * 1.3 + t * 0.9) +
          Math.sin((x * 0.09 - y * 0.23) * 1.1 - t * 0.7);
        const b = Math.max(0, 1 - Math.abs(v) * 1.6) ** 3;
        const top = 1 - (y / CH_CAUSTIC) * 0.6;
        const i = (y * CW_CAUSTIC + x) * 4;
        d[i] = 200;
        d[i + 1] = 245;
        d[i + 2] = 255;
        d[i + 3] = Math.round(255 * b * top);
      }
    }
    this.cg.putImageData(this.cImg, 0, 0);
  }
}

// a drop landing: a ripple spreading on the surface and a little crown of droplets jumping up.
// q: 0..1 through it; flat: how squashed the ripple is (seen from the side)
function splash(ctx: Ctx2D, x: number, y: number, size: number, q: number, k: number, flat: number) {
  const fade = 1 - q;
  const R = size * (0.4 + 1.6 * q);
  ctx.globalCompositeOperation = 'source-over';
  ctx.strokeStyle = `rgba(${FOAM},${0.45 * fade})`;
  ctx.lineWidth = Math.max(1, k);
  ctx.beginPath();
  ctx.ellipse(x, y, R, R * flat, 0, 0, Math.PI * 2);
  ctx.stroke();
  if (q < 0.6) {
    const up = Math.sin((Math.PI * q) / 0.6);
    ctx.fillStyle = `rgba(${FOAM},${0.7 * fade})`;
    for (let c = 0; c < 4; c++) {
      const a = -Math.PI / 2 + (c - 1.5) * 0.55;
      const px = x + Math.cos(a) * size * 1.2 * (q / 0.6);
      const py = y - size * 1.6 * up + Math.sin(a) * size * 0.2;
      ctx.beginPath();
      ctx.arc(px, py, Math.max(0.8, 1.2 * k), 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

// a bubble: a thin bright rim, a faint fill and a glint at the top left
function bubble(ctx: Ctx2D, x: number, y: number, rad: number, alpha: number) {
  if (alpha <= 0) return;
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = `rgba(180,230,255,${0.12 * alpha})`;
  ctx.strokeStyle = `rgba(220,245,255,${0.6 * alpha})`;
  ctx.lineWidth = Math.max(1, rad * 0.18);
  ctx.beginPath();
  ctx.arc(x, y, rad, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = `rgba(255,255,255,${0.8 * alpha})`;
  ctx.beginPath();
  ctx.arc(x - rad * 0.35, y - rad * 0.35, Math.max(0.6, rad * 0.22), 0, Math.PI * 2);
  ctx.fill();
}
