export type FxName = "fire" | "lightning" | "aura" | "sparks" | "neon" | "trail";

const PAL: Record<FxName, string[]> = {
  fire: ["#fff4cf", "#ffc640", "#ff6a1a", "#b3200e"],
  lightning: ["#f0fbff", "#9fe6ff", "#3d8bff", "#2a1a9e"],
  aura: ["#fbeaff", "#d98bff", "#8a2be2", "#3a0a6b"],
  sparks: ["#fff4cf", "#ffc640", "#ff6a1a", "#b3200e"],
  neon: ["#f4ffe0", "#b6ff4a", "#35c43a", "#0d5a2a"],
  trail: ["#fff4cf", "#ffc640", "#ff6a1a", "#b3200e"],
};

export const ACCENT: Record<string, string> = { fire: "#ff6a1a", lightning: "#5cc8ff", aura: "#b36bff" };

type Target = { x: number; y: number; vx: number; vy: number };
type Particle = {
  k: "f" | "e" | "s" | "w";
  x: number; y: number; vx: number; vy: number;
  life: number; max: number; s: number; seed: number;
  ox: number; oy: number; out: number; rise: number; len: number; wid: number;
};

// ---------- shared drawing helpers ----------
const cache: Record<string, HTMLCanvasElement> = {};
let DPR = 1;

const rgba = (h: string, a: number) => {
  const n = parseInt(h.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
};
function blob(col: string) {
  const k = "b" + col;
  if (cache[k]) return cache[k];
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!, gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, rgba(col, 1)); gr.addColorStop(0.35, rgba(col, 0.55)); gr.addColorStop(1, rgba(col, 0));
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return (cache[k] = c);
}
function tongue(col: string) {
  const k = "t" + col;
  if (cache[k]) return cache[k];
  const c = document.createElement("canvas");
  c.width = 64; c.height = 160;
  const g = c.getContext("2d")!;
  g.translate(32, 96); g.scale(1, 2.6);
  const gr = g.createRadialGradient(0, 7, 0, 0, 0, 25);
  gr.addColorStop(0, rgba(col, 1)); gr.addColorStop(0.35, rgba(col, 0.6)); gr.addColorStop(0.7, rgba(col, 0.18)); gr.addColorStop(1, rgba(col, 0));
  g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 25, 0, 7); g.fill();
  return (cache[k] = c);
}
const noise = (t: number, s: number) =>
  Math.sin(t * 2.3 + s) * 0.5 + Math.sin(t * 5.7 + s * 1.7) * 0.3 + Math.sin(t * 11.1 + s * 2.9) * 0.2;
function boltPts(x1: number, y1: number, x2: number, y2: number, d: number, depth: number, out: number[]) {
  if (!depth) { out.push(x2, y2); return; }
  const mx = (x1 + x2) / 2 + (Math.random() - 0.5) * d, my = (y1 + y2) / 2 + (Math.random() - 0.5) * d;
  boltPts(x1, y1, mx, my, d / 2, depth - 1, out); boltPts(mx, my, x2, y2, d / 2, depth - 1, out);
}
function drawTongue(ctx: CanvasRenderingContext2D, img: HTMLCanvasElement, x: number, y: number, vx: number, vy: number, w: number, h: number) {
  const sp = Math.hypot(vx, vy) || 1, s = vx / sp, c = -vy / sp;
  ctx.setTransform(c * DPR, s * DPR, -s * DPR, c * DPR, x * DPR, y * DPR);
  ctx.drawImage(img, -w / 2, -h * 0.6, w, h);
}

// An emitter: a moving point that effects attach to
function makeFx(canvas: HTMLCanvasElement, getTarget: (time: number) => Target, opts: { effect: FxName; scale: number }) {
  const ctx = canvas.getContext("2d")!;
  const parts: Particle[] = [];
  let acc = 0, time = 0, bolts: number[][] = [], boltT = 0;
  const s = { effect: opts.effect, scale: opts.scale, trail: [] as { x: number; y: number }[] };
  const P = (p: Partial<Particle>) => ({ x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, s: 0, seed: 0, ox: 0, oy: 0, out: 0, rise: 0, len: 0, wid: 0, ...p }) as Particle;
  function emit(n: number, mk: () => Particle) { acc += n; while (acc >= 1) { acc--; if (parts.length < 1500) parts.push(mk()); } }
  function step(dt: number) {
    time += dt;
    const t = getTarget(time), u = 9 * s.scale, fx = s.effect;
    const R = u * 3.2;
    if (fx === "fire") {
      emit(dt * 260, () => { const a = Math.random() * 6.28, r = Math.sqrt(Math.random()) * R;
        return P({ k: "f", x: t.x + Math.cos(a) * r, y: t.y + Math.sin(a) * r * 0.7, vx: (Math.random() - 0.5) * u * 5 - t.vx * 0.12,
          vy: -(u * 9 + Math.random() * u * 12) - t.vy * 0.12, max: 0.45 + Math.random() * 0.5, s: u * (1.8 + Math.random() * 2), seed: Math.random() * 99 }); });
      emit(dt * 30, () => P({ k: "e", x: t.x + (Math.random() - 0.5) * R * 2, y: t.y - R * 0.5, vx: (Math.random() - 0.5) * u * 6, vy: -(u * 14 + Math.random() * u * 18), max: 0.9 + Math.random() * 0.9, s: u * (0.12 + Math.random() * 0.12), seed: Math.random() * 99 }));
    } else if (fx === "sparks" || fx === "lightning") {
      emit(dt * (fx === "sparks" ? 110 : 30), () => { const a = Math.random() * 6.28, sp = u * (25 + Math.random() * 50);
        return P({ k: "s", x: t.x, y: t.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - u * 12, max: 0.3 + Math.random() * 0.5 }); });
    } else if (fx === "aura") {
      emit(dt * 90, () => { const a = -Math.PI / 2 + (Math.random() + Math.random() - 1) * 2.4, r = R * (1 + Math.random() * 0.3);
        return P({ k: "w", ox: Math.cos(a) * r, oy: Math.sin(a) * r * 1.2, out: Math.cos(a), rise: u * (9 + Math.random() * 10), max: 0.4 + Math.random() * 0.45, len: u * (3 + Math.random() * 3), wid: u * (0.9 + Math.random() * 0.9), seed: Math.random() * 99 }); });
    }
    if (fx === "lightning") {
      boltT -= dt;
      if (boltT <= 0) { boltT = 0.05 + Math.random() * 0.08; bolts = [];
        const n = 2 + ((Math.random() * 3) | 0);
        for (let i = 0; i < n; i++) { const a = Math.random() * 6.28, len = u * (8 + Math.random() * 12), pts = [t.x, t.y];
          boltPts(t.x, t.y, t.x + Math.cos(a) * len, t.y + Math.sin(a) * len, len * 0.45, 5, pts); bolts.push(pts); } }
    }
    if (fx === "trail" || fx === "neon") { s.trail.push({ x: t.x, y: t.y }); if (s.trail.length > 26) s.trail.shift(); }
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i]; p.life += dt;
      if (p.life >= p.max) { parts[i] = parts[parts.length - 1]; parts.pop(); continue; }
      if (p.k === "f") { p.vx += (noise(time * 2 + p.life * 3, p.seed) * u * 28 + (t.x - p.x) * 0.6) * dt; p.vx *= 0.97; p.vy -= u * 14 * dt; p.x += p.vx * dt; p.y += p.vy * dt; }
      else if (p.k === "e") { p.vx += noise(time * 3, p.seed) * u * 40 * dt; p.vx *= 0.98; p.x += p.vx * dt; p.y += p.vy * dt; }
      else if (p.k === "s") { p.vy += u * 60 * dt; p.vx *= 0.985; p.x += p.vx * dt; p.y += p.vy * dt; }
      else if (p.k === "w") { p.oy -= p.rise * dt; p.ox += (p.out * u * 3 + noise(time * 3, p.seed) * u * 6) * dt; }
    }
    // draw
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.globalCompositeOperation = "lighter";
    const pal = PAL[fx];
    if (fx === "fire") {
      const g = R * 3.2; ctx.globalAlpha = 0.28; ctx.drawImage(blob(pal[2]), t.x - g, t.y - g, g * 2, g * 2);
      for (const p of parts) if (p.k === "f") { const f = p.life / p.max, gr = f < 0.25 ? 0.55 + f * 1.8 : 1 - (f - 0.25) * 0.9, w = p.s * gr;
        const col = f < 0.12 ? pal[0] : f < 0.35 ? pal[1] : f < 0.65 ? pal[2] : pal[3];
        ctx.globalAlpha = Math.pow(1 - f, 1.3) * 0.6; drawTongue(ctx, tongue(col), p.x, p.y, p.vx, p.vy, w, w * (2.2 + Math.min(1.5, Math.hypot(p.vx, p.vy) / (u * 25)))); }
      for (const p of parts) if (p.k === "f" && p.life / p.max < 0.35) { const f = p.life / p.max, w = p.s * 0.45;
        ctx.globalAlpha = (1 - f / 0.35) * 0.5; drawTongue(ctx, tongue(pal[0]), p.x, p.y, p.vx, p.vy, w, w * 2.4); }
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      for (const p of parts) if (p.k === "e") { const f = p.life / p.max, z = p.s * 3; ctx.globalAlpha = (1 - f) * (0.55 + 0.45 * Math.sin(time * 25 + p.seed)); ctx.drawImage(blob(pal[1]), p.x - z, p.y - z, z * 2, z * 2); }
    } else if (fx === "aura") {
      const pulse = 1 + 0.06 * Math.sin(time * 5), rx = R * 1.15 * pulse, ry = R * 1.5 * pulse;
      ctx.globalAlpha = 0.55; ctx.drawImage(blob(pal[2]), t.x - rx * 2.2, t.y - ry * 2.2, rx * 4.4, ry * 4.4);
      ctx.globalAlpha = 0.9; ctx.strokeStyle = pal[1]; ctx.lineWidth = u * 0.45; ctx.shadowBlur = u * 2.5; ctx.shadowColor = pal[2];
      ctx.beginPath(); ctx.ellipse(t.x, t.y, rx, ry, 0, 0, 7); ctx.stroke(); ctx.shadowBlur = 0;
      for (const p of parts) if (p.k === "w") { const f = p.life / p.max; ctx.globalAlpha = Math.sin(f * Math.PI) * 0.75;
        drawTongue(ctx, tongue(f < 0.3 ? pal[0] : f < 0.65 ? pal[1] : pal[2]), t.x + p.ox, t.y + p.oy, noise(time * 3, p.seed) * 0.35 + p.out * 0.25, -1, p.wid, p.len * (0.7 + f * 0.9)); }
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    } else if (fx === "lightning") {
      const g = R * 3; ctx.globalAlpha = 0.2 + Math.random() * 0.3; ctx.drawImage(blob(pal[2]), t.x - g, t.y - g, g * 2, g * 2);
      ctx.globalAlpha = 1; ctx.lineJoin = ctx.lineCap = "round";
      for (const pts of bolts) { ctx.beginPath(); ctx.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
        ctx.shadowBlur = u * 2; ctx.shadowColor = pal[2]; ctx.strokeStyle = rgba(pal[1], 0.9); ctx.lineWidth = Math.max(1.5, u * 0.45); ctx.stroke();
        ctx.shadowBlur = 0; ctx.strokeStyle = pal[0]; ctx.lineWidth = Math.max(1, u * 0.15); ctx.stroke(); }
    } else if (fx === "trail" || fx === "neon") {
      const tr = s.trail;
      if (fx === "neon") { ctx.globalAlpha = 1; ctx.strokeStyle = pal[1]; ctx.lineWidth = u * 0.5; ctx.shadowBlur = u * 2.5; ctx.shadowColor = pal[2];
        ctx.beginPath(); ctx.roundRect(t.x - R * 1.4, t.y - R * 1.4, R * 2.8, R * 2.8, R * 0.8); ctx.stroke(); ctx.shadowBlur = 0; }
      else for (let i = 0; i < tr.length; i++) { const f = i / tr.length, z = u * 3.4 * (0.3 + f); ctx.globalAlpha = Math.min(1, f * 1.2); ctx.drawImage(blob(pal[i === tr.length - 1 ? 0 : 2]), tr[i].x - z, tr[i].y - z, z * 2, z * 2); }
    }
    if (fx === "sparks" || fx === "lightning") for (const p of parts) if (p.k === "s") { const f = p.life / p.max;
      ctx.globalAlpha = 1 - f; ctx.strokeStyle = f < 0.4 ? pal[0] : pal[1]; ctx.lineWidth = Math.max(1, u * 0.28);
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.035, p.y - p.vy * 0.035); ctx.stroke(); }
  }
  return { step, s, reset() { parts.length = 0; bolts = []; s.trail = []; } };
}

/** Runs the hero pointer-follow effect and the effect cards. Returns a cleanup function. */
export function startEffects(hero: HTMLElement, heroCanvas: HTMLCanvasElement, cardCanvases: HTMLCanvasElement[]) {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const cleanups: (() => void)[] = [];
  const on = <K extends keyof HTMLElementEventMap>(el: HTMLElement | Window, ev: K, fn: (e: HTMLElementEventMap[K]) => void) => {
    el.addEventListener(ev, fn as EventListener);
    cleanups.push(() => el.removeEventListener(ev, fn as EventListener));
  };

  // ---------- hero: effect follows the pointer ----------
  let W = 0, H = 0;
  function size() { DPR = Math.min(2, devicePixelRatio || 1); W = hero.clientWidth; H = hero.clientHeight; heroCanvas.width = W * DPR; heroCanvas.height = H * DPR; }
  size(); on(window, "resize", size);
  const ptr = { x: 0, y: 0, active: false, last: -10 };
  const tgt: Target = { x: 0, y: 0, vx: 0, vy: 0 };
  function onMove(e: PointerEvent) { const r = hero.getBoundingClientRect(); ptr.x = e.clientX - r.left; ptr.y = e.clientY - r.top; ptr.active = true; ptr.last = performance.now() / 1000; }
  on(hero, "pointermove", onMove);
  on(hero, "pointerdown", onMove);
  on(hero, "pointerleave", () => { ptr.active = false; });
  let heroTime = 0;
  const heroFx = makeFx(heroCanvas, () => tgt, { effect: "fire", scale: Math.max(0.9, Math.min(1.6, innerWidth / 900)) });
  const idlePos = (t: number) => ({ x: W * (0.62 + 0.2 * Math.sin(t * 0.7)), y: H * (0.38 + 0.14 * Math.sin(t * 1.3)) });
  tgt.x = idlePos(0).x; tgt.y = idlePos(0).y;

  // ---------- effect cards ----------
  const cards = cardCanvases.map((c, i) => {
    const st: Target = { x: 0, y: 0, vx: 0, vy: 0 };
    const fx = makeFx(c, (t) => {
      const w = c.clientWidth, h = c.clientHeight, a = t * 1.1 + i;
      const nx = w * (0.62 + 0.18 * Math.cos(a)), ny = h * (0.42 + 0.16 * Math.sin(a * 1.6));
      st.vx = (nx - st.x) * 30; st.vy = (ny - st.y) * 30; st.x = nx; st.y = ny; return st;
    }, { effect: c.dataset.card as FxName, scale: 0.75 });
    return { c, fx, visible: false };
  });
  function sizeCards() { for (const k of cards) { k.c.width = k.c.clientWidth * DPR; k.c.height = k.c.clientHeight * DPR; } }
  sizeCards(); on(window, "resize", sizeCards);
  const io = new IntersectionObserver((es) => es.forEach((e) => { const k = cards.find((k) => k.c === e.target); if (k) k.visible = e.isIntersecting; }));
  cards.forEach((k) => io.observe(k.c));
  let heroVisible = true;
  const heroIo = new IntersectionObserver((es) => { heroVisible = es[0].isIntersecting; });
  heroIo.observe(hero);
  cleanups.push(() => { io.disconnect(); heroIo.disconnect(); });

  let last = performance.now(), raf = 0;
  function loop(now: number) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now; heroTime += dt;
    if (heroVisible) {
      const idle = !ptr.active || now / 1000 - ptr.last > 2.5;
      const goal = idle ? idlePos(heroTime) : ptr;
      const px = tgt.x, py = tgt.y, k = 1 - Math.pow(0.0005, dt);
      tgt.x += (goal.x - tgt.x) * k; tgt.y += (goal.y - tgt.y) * k;
      tgt.vx = (tgt.x - px) / dt; tgt.vy = (tgt.y - py) / dt;
      heroFx.step(dt);
    }
    for (const k of cards) if (k.visible) k.fx.step(dt);
    raf = requestAnimationFrame(loop);
  }
  if (reduce) { for (let i = 0; i < 40; i++) heroFx.step(1 / 30); cards.forEach((k) => { for (let i = 0; i < 30; i++) k.fx.step(1 / 30); }); }
  else raf = requestAnimationFrame(loop);
  cleanups.push(() => cancelAnimationFrame(raf));

  return {
    setEffect(fx: FxName) { heroFx.s.effect = fx; heroFx.reset(); },
    stop() { cleanups.forEach((fn) => fn()); },
  };
}
