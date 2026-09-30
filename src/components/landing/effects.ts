export type FxName =
  | 'fire'
  | 'lightning'
  | 'aura'
  | 'sparks'
  | 'neon'
  | 'trail'
  | 'rain'
  | 'underwater'
  | 'splash'
  | 'hit'
  | 'explosion'
  | 'pow'
  | 'glitch'
  | 'behind'
  | 'waterfall';

const PAL: Record<FxName, string[]> = {
  fire: ['#fff4cf', '#ffc640', '#ff6a1a', '#b3200e'],
  lightning: ['#f0fbff', '#9fe6ff', '#3d8bff', '#2a1a9e'],
  aura: ['#fbeaff', '#d98bff', '#8a2be2', '#3a0a6b'],
  sparks: ['#fff4cf', '#ffc640', '#ff6a1a', '#b3200e'],
  neon: ['#f4ffe0', '#b6ff4a', '#35c43a', '#0d5a2a'],
  trail: ['#fff4cf', '#ffc640', '#ff6a1a', '#b3200e'],
  rain: ['#f0fbff', '#cfe0ee', '#7f9bb3', '#2a3a4a'],
  underwater: ['#f0fbff', '#7fe0ff', '#1f7f95', '#0a2f40'],
  splash: ['#f0fbff', '#7fe0ff', '#2f7bff', '#2a1a9e'],
  hit: ['#ffffff', '#ffe9b0', '#ff9a3c', '#b3531e'],
  explosion: ['#fff4cf', '#ffc640', '#ff6a1a', '#b3200e'],
  pow: ['#fff4cf', '#ffc640', '#ff6a1a', '#b3200e'],
  glitch: ['#ffffff', '#ff2a55', '#2af0ff', '#1a1a1a'],
  behind: ['#fff4cf', '#ffc640', '#ff6a1a', '#b3200e'],
  waterfall: ['#f0fbff', '#cfeaf5', '#7fb6cc', '#2a4a5a'],
};

export const ACCENT: Record<string, string> = {
  fire: '#ff6a1a',
  lightning: '#5cc8ff',
  aura: '#b36bff',
  sparks: '#ffc640',
};

type Target = { x: number; y: number; vx: number; vy: number };
type Particle = {
  k: 'f' | 'e' | 's' | 'w';
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  s: number;
  seed: number;
  ox: number;
  oy: number;
  out: number;
  rise: number;
  len: number;
  wid: number;
};

// ---------- shared drawing helpers ----------
const cache: Record<string, HTMLCanvasElement> = {};
let DPR = 1;

const rgba = (h: string, a: number) => {
  const n = parseInt(h.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
};
function blob(col: string) {
  const k = 'b' + col;
  if (cache[k]) return cache[k];
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!,
    gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, rgba(col, 1));
  gr.addColorStop(0.35, rgba(col, 0.55));
  gr.addColorStop(1, rgba(col, 0));
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  return (cache[k] = c);
}
function tongue(col: string) {
  const k = 't' + col;
  if (cache[k]) return cache[k];
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 160;
  const g = c.getContext('2d')!;
  g.translate(32, 96);
  g.scale(1, 2.6);
  const gr = g.createRadialGradient(0, 7, 0, 0, 0, 25);
  gr.addColorStop(0, rgba(col, 1));
  gr.addColorStop(0.35, rgba(col, 0.6));
  gr.addColorStop(0.7, rgba(col, 0.18));
  gr.addColorStop(1, rgba(col, 0));
  g.fillStyle = gr;
  g.beginPath();
  g.arc(0, 0, 25, 0, 7);
  g.fill();
  return (cache[k] = c);
}
const noise = (t: number, s: number) =>
  Math.sin(t * 2.3 + s) * 0.5 + Math.sin(t * 5.7 + s * 1.7) * 0.3 + Math.sin(t * 11.1 + s * 2.9) * 0.2;
function boltPts(x1: number, y1: number, x2: number, y2: number, d: number, depth: number, out: number[]) {
  if (!depth) {
    out.push(x2, y2);
    return;
  }
  const mx = (x1 + x2) / 2 + (Math.random() - 0.5) * d,
    my = (y1 + y2) / 2 + (Math.random() - 0.5) * d;
  boltPts(x1, y1, mx, my, d / 2, depth - 1, out);
  boltPts(mx, my, x2, y2, d / 2, depth - 1, out);
}
function drawTongue(
  ctx: CanvasRenderingContext2D,
  img: HTMLCanvasElement,
  x: number,
  y: number,
  vx: number,
  vy: number,
  w: number,
  h: number,
) {
  const sp = Math.hypot(vx, vy) || 1,
    s = vx / sp,
    c = -vy / sp;
  ctx.setTransform(c * DPR, s * DPR, -s * DPR, c * DPR, x * DPR, y * DPR);
  ctx.drawImage(img, -w / 2, -h * 0.6, w, h);
}

// a fixed random number for (a, b): the same every frame, so things loop smoothly
const hsh = (a: number, b: number) => {
  const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return x - Math.floor(x);
};
const backOut = (q: number) => 1 + 2.7 * (q - 1) ** 3 + 1.7 * (q - 1) ** 2;
let displayFont = '';
const display = () =>
  (displayFont ||=
    (getComputedStyle(document.documentElement).getPropertyValue('--font-anton').trim() || 'Impact') +
    ', Impact, sans-serif');

// a person, roughly: head and body, centered on (x, y)
function figure(ctx: CanvasRenderingContext2D, x: number, y: number, u: number) {
  ctx.beginPath();
  ctx.arc(x, y - u * 4.2, u * 1.5, 0, 7);
  ctx.fill();
  ctx.beginPath();
  ctx.roundRect(x - u * 2.1, y - u * 2.4, u * 4.2, u * 6.4, u * 1.4);
  ctx.fill();
}

// the effects that aren't particles on the point: drawn from the time, on a card w x h (CSS pixels)
const SCENES = new Set<FxName>([
  'rain',
  'underwater',
  'splash',
  'hit',
  'explosion',
  'pow',
  'glitch',
  'behind',
  'waterfall',
]);
// the impacts: each goes off every `period` seconds where the point is then
const PERIOD: Partial<Record<FxName, number>> = { splash: 1.6, hit: 1.1, explosion: 2, pow: 1.5 };

function scene(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  fx: FxName,
  t: Target,
  at: Target,
  age: number,
  time: number,
  u: number,
) {
  const w = canvas.clientWidth,
    h = canvas.clientHeight,
    pal = PAL[fx];
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (fx === 'rain') {
    [
      [40, 10, 1, 0.22, 380],
      [24, 22, 1.4, 0.3, 560],
      [10, 44, 2, 0.4, 800],
    ].forEach(([n, len, lw, a, v], L) => {
      ctx.strokeStyle = `rgba(210,225,240,${a})`;
      ctx.lineWidth = lw;
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const span = h + len * 2,
          y = ((hsh(L, i) * span + time * v * (0.85 + 0.3 * hsh(i, L))) % span) - len,
          x = hsh(i, L + 9) * w * 1.2 - w * 0.1 + y * 0.12;
        ctx.moveTo(x, y);
        ctx.lineTo(x - len * 0.12, y - len);
      }
      ctx.stroke();
    });
    for (let j = 0; j < 12; j++) {
      const P = 0.5 + 0.5 * hsh(j, 3),
        ph = (time + hsh(j, 4) * P) / P,
        c = Math.floor(ph),
        q = (ph - c) / 0.4;
      if (q >= 1) continue;
      const x = hsh(j, c) * w,
        y = h * (0.72 + 0.26 * hsh(c, j)),
        r = (3 + 8 * q) * (0.6 + (y / h - 0.72) * 2);
      ctx.strokeStyle = `rgba(225,238,250,${0.5 * (1 - q)})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(x, y, r, r * 0.28, 0, 0, 7);
      ctx.stroke();
    }
  } else if (fx === 'underwater') {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#1f7f95');
    g.addColorStop(1, '#06202c');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'screen';
    for (let b = 0; b < 4; b++) {
      ctx.save();
      ctx.translate(w * (0.15 + 0.25 * b) + Math.sin(time * 0.4 + b) * w * 0.04, -5);
      ctx.rotate(0.3 + Math.sin(time * 0.3 + b * 2) * 0.05);
      const sg = ctx.createLinearGradient(0, 0, 0, h * 1.3);
      sg.addColorStop(0, 'rgba(200,240,255,.22)');
      sg.addColorStop(1, 'rgba(200,240,255,0)');
      ctx.fillStyle = sg;
      ctx.fillRect(-w * 0.04, 0, w * 0.08, h * 1.3);
      ctx.restore();
    }
    ctx.globalCompositeOperation = 'source-over';
    const bub = (x: number, y: number, r: number, a: number) => {
      ctx.strokeStyle = `rgba(220,245,255,${0.65 * a})`;
      ctx.fillStyle = `rgba(180,230,255,${0.12 * a})`;
      ctx.lineWidth = Math.max(1, r * 0.18);
      ctx.beginPath();
      ctx.arc(x, y, r, 0, 7);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = `rgba(255,255,255,${0.85 * a})`;
      ctx.beginPath();
      ctx.arc(x - r * 0.35, y - r * 0.35, r * 0.22, 0, 7);
      ctx.fill();
    };
    for (let j = 0; j < 22; j++) {
      const span = h + 30,
        y = h + 15 - ((hsh(j, 1) * span + time * (25 + 40 * hsh(j, 2))) % span);
      bub(hsh(j, 3) * w + Math.sin(time * 2 + j) * 4, y, 2 + 4 * hsh(j, 4), 1);
    }
    for (let j = 0; j < 14; j++) {
      const q = (time * 0.6 + j / 14) % 1;
      bub(
        t.x + Math.sin(q * 9 + j) * 5 + (hsh(j, 5) - 0.5) * u * 2,
        t.y - q * h * 0.7,
        (2 + 3 * hsh(j, 6)) * (0.8 + 0.4 * q),
        1 - q * q,
      );
    }
  } else if (fx === 'glitch') {
    const k = Math.floor(time * 8),
      on = hsh(k, 7) < 0.45,
      d = on ? u * (0.6 + 1.6 * hsh(k, 8)) : u * 0.2;
    ctx.globalCompositeOperation = 'lighter';
    (
      [
        ['#ff0033', -d],
        ['#00ff66', 0],
        ['#0066ff', d],
      ] as const
    ).forEach(([c, dx]) => {
      ctx.fillStyle = c;
      figure(ctx, t.x + dx, t.y + u * 2, u * 1.8);
    });
    if (on) {
      ctx.globalCompositeOperation = 'source-over';
      for (let i = 0; i < 4; i++) {
        const y = t.y + (hsh(k, i) - 0.6) * u * 12,
          hh = u * (0.4 + hsh(i, k) * 1.4),
          dx = (hsh(k + i, 3) - 0.5) * u * 6;
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.drawImage(canvas, 0, y * DPR, canvas.width, hh * DPR, dx * DPR, y * DPR, canvas.width, hh * DPR);
        ctx.restore();
      }
    }
  } else if (fx === 'behind') {
    ctx.font = `${Math.round(h * 0.34)}px ${display()}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = pal[1];
    ctx.fillText('LEGEND', w * 0.5, h * 0.3);
    // the person in front of the word, lit from behind
    const fx0 = w * 0.5 + (t.x - w * 0.62) * 0.8,
      fy = h * 0.42 + (t.y - h * 0.42) * 0.3,
      fu = u * 2;
    ctx.fillStyle = '#1a1416';
    figure(ctx, fx0, fy, fu);
    ctx.strokeStyle = 'rgba(255,198,64,.55)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(fx0, fy - fu * 4.2, fu * 1.5, 0, 7);
    ctx.stroke();
  } else if (fx === 'waterfall') {
    const x0 = w * 0.3,
      x1 = w * 0.7;
    ctx.strokeStyle = 'rgba(220,240,250,.35)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < 60; i++) {
      const x = x0 + hsh(i, 1) * (x1 - x0),
        len = 14 + 20 * hsh(i, 2),
        y = ((hsh(i, 3) * (h + len) + time * (220 + 120 * hsh(i, 4))) % (h + len)) - len;
      ctx.moveTo(x, y);
      ctx.lineTo(x, y + len);
    }
    ctx.stroke();
    for (let i = 0; i < 8; i++) {
      const q = (time * 0.5 + i / 8) % 1,
        r = 8 + 30 * q,
        x = x0 + hsh(i, 5) * (x1 - x0),
        y = h - 8 - q * 18;
      ctx.globalAlpha = 0.25 * (1 - q);
      ctx.drawImage(blob('#e6f4fa'), x - r, y - r, r * 2, r * 2);
    }
  } else {
    // the impacts, going off where the point was when they started
    const T = PERIOD[fx]!,
      q = age / T,
      x = at.x,
      y = at.y;
    if (fx === 'splash') u *= 1.7;
    if (fx === 'hit') {
      if (age < 0.25) {
        const r = u * (3 + age * 30);
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 1 - age / 0.25;
        ctx.drawImage(blob(pal[0]), x - r, y - r, r * 2, r * 2);
        ctx.drawImage(blob(pal[2]), x - r * 1.6, y - r * 1.6, r * 3.2, r * 3.2);
      }
      for (let k = 0; k < 2; k++) {
        const a = (age - k * 0.08) / 0.6;
        if (a < 0 || a >= 1) continue;
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 1 - a;
        ctx.strokeStyle = pal[1];
        ctx.lineWidth = u * 0.4 * (1 - a);
        ctx.beginPath();
        ctx.arc(x, y, u * (2 + a * 12), 0, 7);
        ctx.stroke();
      }
    } else if (fx === 'explosion') {
      ctx.globalCompositeOperation = 'source-over';
      for (let k = 0; k < 8; k++) {
        const a = Math.max(0, age - 0.25) / (T - 0.25),
          r = u * (2 + 5 * a) * (0.7 + 0.5 * hsh(k, 1));
        if (age < 0.25 || a >= 1) continue;
        ctx.globalAlpha = 0.5 * (1 - a);
        ctx.drawImage(
          blob('#2a2524'),
          x + (hsh(k, 2) - 0.5) * u * 6 - r,
          y - u * 3 * a - u * 2 * hsh(k, 3) - r,
          r * 2,
          r * 2,
        );
      }
      ctx.globalCompositeOperation = 'lighter';
      for (let k = 0; k < 10; k++) {
        const life = T * 0.4 * (0.6 + 0.6 * hsh(k, 4));
        if (age > life) continue;
        const a = age / life,
          r = u * (1.5 + 4 * (1 - Math.exp(-age * 12))) * (0.6 + 0.5 * hsh(k, 5));
        ctx.globalAlpha = 1 - a;
        ctx.drawImage(
          blob(a < 0.3 ? pal[0] : a < 0.6 ? pal[1] : pal[2]),
          x + (hsh(k, 6) - 0.5) * u * 4 - r,
          y + (hsh(k, 7) - 0.5) * u * 3 - u * 2 * a - r,
          r * 2,
          r * 2,
        );
      }
    } else if (fx === 'pow') {
      if (q < 1) {
        const tail = Math.max(0, (q - 0.7) / 0.3),
          sc = (age < 0.14 ? backOut(age / 0.14) : 1) * (1 + 0.25 * tail);
        ctx.save();
        ctx.globalAlpha = 1 - tail;
        ctx.translate(x, y);
        ctx.rotate(-0.15);
        ctx.scale(sc, sc);
        ctx.beginPath();
        for (let k = 0; k < 24; k++) {
          const a = (k / 24) * Math.PI * 2,
            o = k % 2 ? 0.72 : 1 + 0.15 * hsh(k, 1);
          ctx.lineTo(Math.cos(a) * u * 6 * o, Math.sin(a) * u * 4 * o);
        }
        ctx.closePath();
        ctx.fillStyle = pal[1];
        ctx.fill();
        ctx.strokeStyle = '#111';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.font = `${Math.round(u * 3.6)}px ${display()}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineWidth = u * 0.7;
        ctx.strokeText('POW!', 0, 0);
        ctx.fillStyle = pal[3];
        ctx.fillText('POW!', 0, 0);
        ctx.restore();
      }
    } else if (fx === 'splash') {
      for (let k = 0; k < 3; k++) {
        const a = (age - k * 0.12) / (T * 0.9);
        if (a < 0 || a >= 1) continue;
        ctx.strokeStyle = `rgba(240,251,255,${0.5 * (1 - a)})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.ellipse(x, y, u * (1.5 + 8 * a), u * (1.5 + 8 * a) * 0.28, 0, 0, 7);
        ctx.stroke();
      }
      const rise = Math.sin(Math.PI * Math.min(1, age / (T * 0.55)));
      for (let k = 0; k < 18; k++) {
        const a = (k / 18) * Math.PI * 2,
          bx = x + Math.cos(a) * u * 1.4,
          by = y + Math.sin(a) * u * 0.4,
          tx = bx + Math.cos(a) * u * q,
          ty = by - u * 5 * rise * (0.6 + 0.4 * hsh(k, 1));
        ctx.globalAlpha = (1 - q) * (Math.sin(a) < 0 ? 0.35 : 0.7);
        ctx.strokeStyle = pal[1];
        ctx.lineWidth = u * 0.3;
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.quadraticCurveTo(bx, (by + ty) / 2, tx, ty);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      for (let k = 0; k < 30; k++) {
        const a = hsh(k, 2) * Math.PI * 2,
          out = u * (4 + 6 * hsh(k, 3)),
          up = u * (10 + 8 * hsh(k, 4)),
          g = u * 36,
          px = x + Math.cos(a) * (u + out * age),
          py = y - up * age + 0.5 * g * age * age;
        if (py > y + u) continue;
        ctx.fillStyle = `rgba(240,251,255,${0.85 * (1 - q)})`;
        ctx.beginPath();
        ctx.arc(px, py, Math.max(1, u * 0.2), 0, 7);
        ctx.fill();
      }
    }
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}

// An emitter: a moving point that effects attach to
function makeFx(
  canvas: HTMLCanvasElement,
  getTarget: (time: number) => Target,
  opts: { effect: FxName; scale: number },
) {
  const ctx = canvas.getContext('2d')!;
  const parts: Particle[] = [];
  let acc = 0,
    time = 0,
    bolts: number[][] = [],
    boltT = 0,
    burst = -1;
  const at: Target = { x: 0, y: 0, vx: 0, vy: 0 };
  const s = { effect: opts.effect, scale: opts.scale, trail: [] as { x: number; y: number }[] };
  const P = (p: Partial<Particle>) =>
    ({
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      life: 0,
      max: 1,
      s: 0,
      seed: 0,
      ox: 0,
      oy: 0,
      out: 0,
      rise: 0,
      len: 0,
      wid: 0,
      ...p,
    }) as Particle;
  function emit(n: number, mk: () => Particle) {
    acc += n;
    while (acc >= 1) {
      acc--;
      if (parts.length < 1500) parts.push(mk());
    }
  }
  function step(dt: number) {
    time += dt;
    const t = getTarget(time),
      u = 9 * s.scale,
      fx = s.effect;
    const R = u * 3.2;
    if (fx === 'fire') {
      emit(dt * 260, () => {
        const a = Math.random() * 6.28,
          r = Math.sqrt(Math.random()) * R;
        return P({
          k: 'f',
          x: t.x + Math.cos(a) * r,
          y: t.y + Math.sin(a) * r * 0.7,
          vx: (Math.random() - 0.5) * u * 5 - t.vx * 0.12,
          vy: -(u * 9 + Math.random() * u * 12) - t.vy * 0.12,
          max: 0.45 + Math.random() * 0.5,
          s: u * (1.8 + Math.random() * 2),
          seed: Math.random() * 99,
        });
      });
      emit(dt * 30, () =>
        P({
          k: 'e',
          x: t.x + (Math.random() - 0.5) * R * 2,
          y: t.y - R * 0.5,
          vx: (Math.random() - 0.5) * u * 6,
          vy: -(u * 14 + Math.random() * u * 18),
          max: 0.9 + Math.random() * 0.9,
          s: u * (0.12 + Math.random() * 0.12),
          seed: Math.random() * 99,
        }),
      );
    } else if (fx === 'sparks' || fx === 'lightning') {
      emit(dt * (fx === 'sparks' ? 110 : 30), () => {
        const a = Math.random() * 6.28,
          sp = u * (25 + Math.random() * 50);
        return P({
          k: 's',
          x: t.x,
          y: t.y,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp - u * 12,
          max: 0.3 + Math.random() * 0.5,
        });
      });
    } else if (fx === 'aura') {
      emit(dt * 90, () => {
        const a = -Math.PI / 2 + (Math.random() + Math.random() - 1) * 2.4,
          r = R * (1 + Math.random() * 0.3);
        return P({
          k: 'w',
          ox: Math.cos(a) * r,
          oy: Math.sin(a) * r * 1.2,
          out: Math.cos(a),
          rise: u * (9 + Math.random() * 10),
          max: 0.4 + Math.random() * 0.45,
          len: u * (3 + Math.random() * 3),
          wid: u * (0.9 + Math.random() * 0.9),
          seed: Math.random() * 99,
        });
      });
    }
    if (fx === 'lightning') {
      boltT -= dt;
      if (boltT <= 0) {
        boltT = 0.05 + Math.random() * 0.08;
        bolts = [];
        const n = 2 + ((Math.random() * 3) | 0);
        for (let i = 0; i < n; i++) {
          const a = Math.random() * 6.28,
            len = u * (8 + Math.random() * 12),
            pts = [t.x, t.y];
          boltPts(t.x, t.y, t.x + Math.cos(a) * len, t.y + Math.sin(a) * len, len * 0.45, 5, pts);
          bolts.push(pts);
        }
      }
    }
    const period = PERIOD[fx];
    if (period && Math.floor(time / period) !== burst) {
      burst = Math.floor(time / period);
      at.x = t.x;
      at.y = t.y;
      if (fx === 'hit' || fx === 'explosion')
        for (let i = 0; i < (fx === 'hit' ? 26 : 40); i++) {
          const a = Math.random() * 6.28,
            sp = u * (20 + Math.random() * 45);
          parts.push(
            P({
              k: 's',
              x: t.x,
              y: t.y,
              vx: Math.cos(a) * sp,
              vy: Math.sin(a) * sp - u * 12,
              max: 0.4 + Math.random() * 0.5,
            }),
          );
        }
    }
    if (fx === 'trail' || fx === 'neon') {
      s.trail.push({ x: t.x, y: t.y });
      if (s.trail.length > 26) s.trail.shift();
    }
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.life += dt;
      if (p.life >= p.max) {
        parts[i] = parts[parts.length - 1];
        parts.pop();
        continue;
      }
      if (p.k === 'f') {
        p.vx += (noise(time * 2 + p.life * 3, p.seed) * u * 28 + (t.x - p.x) * 0.6) * dt;
        p.vx *= 0.97;
        p.vy -= u * 14 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      } else if (p.k === 'e') {
        p.vx += noise(time * 3, p.seed) * u * 40 * dt;
        p.vx *= 0.98;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      } else if (p.k === 's') {
        p.vy += u * 60 * dt;
        p.vx *= 0.985;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      } else if (p.k === 'w') {
        p.oy -= p.rise * dt;
        p.ox += (p.out * u * 3 + noise(time * 3, p.seed) * u * 6) * dt;
      }
    }
    // draw
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    if (SCENES.has(fx)) scene(ctx, canvas, fx, t, at, period ? time % period : 0, time, u);
    ctx.globalCompositeOperation = 'lighter';
    const pal = PAL[fx];
    if (fx === 'fire') {
      const g = R * 3.2;
      ctx.globalAlpha = 0.28;
      ctx.drawImage(blob(pal[2]), t.x - g, t.y - g, g * 2, g * 2);
      for (const p of parts)
        if (p.k === 'f') {
          const f = p.life / p.max,
            gr = f < 0.25 ? 0.55 + f * 1.8 : 1 - (f - 0.25) * 0.9,
            w = p.s * gr;
          const col = f < 0.12 ? pal[0] : f < 0.35 ? pal[1] : f < 0.65 ? pal[2] : pal[3];
          ctx.globalAlpha = Math.pow(1 - f, 1.3) * 0.6;
          drawTongue(
            ctx,
            tongue(col),
            p.x,
            p.y,
            p.vx,
            p.vy,
            w,
            w * (2.2 + Math.min(1.5, Math.hypot(p.vx, p.vy) / (u * 25))),
          );
        }
      for (const p of parts)
        if (p.k === 'f' && p.life / p.max < 0.35) {
          const f = p.life / p.max,
            w = p.s * 0.45;
          ctx.globalAlpha = (1 - f / 0.35) * 0.5;
          drawTongue(ctx, tongue(pal[0]), p.x, p.y, p.vx, p.vy, w, w * 2.4);
        }
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      for (const p of parts)
        if (p.k === 'e') {
          const f = p.life / p.max,
            z = p.s * 3;
          ctx.globalAlpha = (1 - f) * (0.55 + 0.45 * Math.sin(time * 25 + p.seed));
          ctx.drawImage(blob(pal[1]), p.x - z, p.y - z, z * 2, z * 2);
        }
    } else if (fx === 'aura') {
      const pulse = 1 + 0.06 * Math.sin(time * 5),
        rx = R * 1.15 * pulse,
        ry = R * 1.5 * pulse;
      ctx.globalAlpha = 0.55;
      ctx.drawImage(blob(pal[2]), t.x - rx * 2.2, t.y - ry * 2.2, rx * 4.4, ry * 4.4);
      ctx.globalAlpha = 0.9;
      ctx.strokeStyle = pal[1];
      ctx.lineWidth = u * 0.45;
      ctx.shadowBlur = u * 2.5;
      ctx.shadowColor = pal[2];
      ctx.beginPath();
      ctx.ellipse(t.x, t.y, rx, ry, 0, 0, 7);
      ctx.stroke();
      ctx.shadowBlur = 0;
      for (const p of parts)
        if (p.k === 'w') {
          const f = p.life / p.max;
          ctx.globalAlpha = Math.sin(f * Math.PI) * 0.75;
          drawTongue(
            ctx,
            tongue(f < 0.3 ? pal[0] : f < 0.65 ? pal[1] : pal[2]),
            t.x + p.ox,
            t.y + p.oy,
            noise(time * 3, p.seed) * 0.35 + p.out * 0.25,
            -1,
            p.wid,
            p.len * (0.7 + f * 0.9),
          );
        }
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    } else if (fx === 'lightning') {
      const g = R * 3;
      ctx.globalAlpha = 0.2 + Math.random() * 0.3;
      ctx.drawImage(blob(pal[2]), t.x - g, t.y - g, g * 2, g * 2);
      ctx.globalAlpha = 1;
      ctx.lineJoin = ctx.lineCap = 'round';
      for (const pts of bolts) {
        ctx.beginPath();
        ctx.moveTo(pts[0], pts[1]);
        for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
        ctx.shadowBlur = u * 2;
        ctx.shadowColor = pal[2];
        ctx.strokeStyle = rgba(pal[1], 0.9);
        ctx.lineWidth = Math.max(1.5, u * 0.45);
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = pal[0];
        ctx.lineWidth = Math.max(1, u * 0.15);
        ctx.stroke();
      }
    } else if (fx === 'trail' || fx === 'neon') {
      const tr = s.trail;
      if (fx === 'neon') {
        ctx.globalAlpha = 1;
        ctx.strokeStyle = pal[1];
        ctx.lineWidth = u * 0.5;
        ctx.shadowBlur = u * 2.5;
        ctx.shadowColor = pal[2];
        ctx.beginPath();
        ctx.roundRect(t.x - R * 1.4, t.y - R * 1.4, R * 2.8, R * 2.8, R * 0.8);
        ctx.stroke();
        ctx.shadowBlur = 0;
      } else
        for (let i = 0; i < tr.length; i++) {
          const f = i / tr.length,
            z = u * 3.4 * (0.3 + f);
          ctx.globalAlpha = Math.min(1, f * 1.2);
          ctx.drawImage(blob(pal[i === tr.length - 1 ? 0 : 2]), tr[i].x - z, tr[i].y - z, z * 2, z * 2);
        }
    }
    if (fx === 'sparks' || fx === 'lightning' || fx === 'hit' || fx === 'explosion')
      for (const p of parts)
        if (p.k === 's') {
          const f = p.life / p.max;
          ctx.globalAlpha = 1 - f;
          ctx.strokeStyle = f < 0.4 ? pal[0] : pal[1];
          ctx.lineWidth = Math.max(1, u * 0.28);
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x - p.vx * 0.035, p.y - p.vy * 0.035);
          ctx.stroke();
        }
  }
  return {
    step,
    s,
    reset() {
      parts.length = 0;
      bolts = [];
      s.trail = [];
      burst = -1;
    },
  };
}

/** Runs the hero pointer-follow effect and the effect cards. Returns a cleanup function. */
export function startEffects(
  hero: HTMLElement,
  heroCanvas: HTMLCanvasElement,
  cardCanvases: HTMLCanvasElement[],
) {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const cleanups: (() => void)[] = [];
  const on = <K extends keyof HTMLElementEventMap>(
    el: HTMLElement | Window,
    ev: K,
    fn: (e: HTMLElementEventMap[K]) => void,
  ) => {
    el.addEventListener(ev, fn as EventListener);
    cleanups.push(() => el.removeEventListener(ev, fn as EventListener));
  };

  // ---------- hero: effect follows the pointer ----------
  let W = 0,
    H = 0;
  function size() {
    DPR = Math.min(2, devicePixelRatio || 1);
    W = hero.clientWidth;
    H = hero.clientHeight;
    heroCanvas.width = W * DPR;
    heroCanvas.height = H * DPR;
  }
  size();
  on(window, 'resize', size);
  const ptr = { x: 0, y: 0, active: false, last: -10 };
  const tgt: Target = { x: 0, y: 0, vx: 0, vy: 0 };
  function onMove(e: PointerEvent) {
    const r = hero.getBoundingClientRect();
    ptr.x = e.clientX - r.left;
    ptr.y = e.clientY - r.top;
    ptr.active = true;
    ptr.last = performance.now() / 1000;
  }
  on(hero, 'pointermove', onMove);
  on(hero, 'pointerdown', onMove);
  on(hero, 'pointerleave', () => {
    ptr.active = false;
  });
  let heroTime = 0;
  const heroFx = makeFx(heroCanvas, () => tgt, {
    effect: 'fire',
    scale: Math.max(0.9, Math.min(1.6, innerWidth / 900)),
  });
  const idlePos = (t: number) => ({
    x: W * (0.62 + 0.2 * Math.sin(t * 0.7)),
    y: H * (0.38 + 0.14 * Math.sin(t * 1.3)),
  });
  tgt.x = idlePos(0).x;
  tgt.y = idlePos(0).y;

  // ---------- effect cards ----------
  const cards = cardCanvases.map((c, i) => {
    const st: Target = { x: 0, y: 0, vx: 0, vy: 0 };
    const fx = makeFx(
      c,
      t => {
        const w = c.clientWidth,
          h = c.clientHeight,
          a = t * 1.1 + i;
        const nx = w * (0.62 + 0.18 * Math.cos(a)),
          ny = h * (0.42 + 0.16 * Math.sin(a * 1.6));
        st.vx = (nx - st.x) * 30;
        st.vy = (ny - st.y) * 30;
        st.x = nx;
        st.y = ny;
        return st;
      },
      { effect: c.dataset.card as FxName, scale: 0.75 },
    );
    return { c, fx, visible: false };
  });
  function sizeCards() {
    for (const k of cards) {
      k.c.width = k.c.clientWidth * DPR;
      k.c.height = k.c.clientHeight * DPR;
    }
  }
  sizeCards();
  on(window, 'resize', sizeCards);
  const io = new IntersectionObserver(es =>
    es.forEach(e => {
      const k = cards.find(k => k.c === e.target);
      if (k) k.visible = e.isIntersecting;
    }),
  );
  cards.forEach(k => io.observe(k.c));
  let heroVisible = true;
  const heroIo = new IntersectionObserver(es => {
    heroVisible = es[0].isIntersecting;
  });
  heroIo.observe(hero);
  cleanups.push(() => {
    io.disconnect();
    heroIo.disconnect();
  });

  let last = performance.now(),
    raf = 0;
  function loop(now: number) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    heroTime += dt;
    if (heroVisible) {
      const idle = !ptr.active || now / 1000 - ptr.last > 2.5;
      const goal = idle ? idlePos(heroTime) : ptr;
      const px = tgt.x,
        py = tgt.y,
        k = 1 - Math.pow(0.0005, dt);
      tgt.x += (goal.x - tgt.x) * k;
      tgt.y += (goal.y - tgt.y) * k;
      tgt.vx = (tgt.x - px) / dt;
      tgt.vy = (tgt.y - py) / dt;
      heroFx.step(dt);
    }
    for (const k of cards) if (k.visible) k.fx.step(dt);
    raf = requestAnimationFrame(loop);
  }
  if (reduce) {
    for (let i = 0; i < 40; i++) heroFx.step(1 / 30);
    cards.forEach(k => {
      for (let i = 0; i < 30; i++) k.fx.step(1 / 30);
    });
  } else raf = requestAnimationFrame(loop);
  cleanups.push(() => cancelAnimationFrame(raf));

  return {
    setEffect(fx: FxName) {
      heroFx.s.effect = fx;
      heroFx.reset();
    },
    stop() {
      cleanups.forEach(fn => fn());
    },
  };
}
