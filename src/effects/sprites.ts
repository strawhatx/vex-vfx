// Cached soft textures the particle effects are drawn with.
export type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export function rgba(hex: string, a: number) { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; }
const make = (w: number, h: number) => { const c = new OffscreenCanvas(w, h); return [c, c.getContext('2d') as OffscreenCanvasRenderingContext2D] as const; };

const spriteCache: Record<string, OffscreenCanvas> = {};
const flameCache: Record<string, OffscreenCanvas> = {};
const ringCache: Record<string, OffscreenCanvas> = {};

export function sprite(col: string) {
  if (spriteCache[col]) return spriteCache[col];
  const [c, g] = make(64, 64), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, rgba(col, 1)); gr.addColorStop(0.35, rgba(col, 0.55)); gr.addColorStop(1, rgba(col, 0));
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return (spriteCache[col] = c);
}
export function flameSprite(col: string) {
  if (flameCache[col]) return flameCache[col];
  const [c, g] = make(64, 160);
  g.translate(32, 96); g.scale(1, 2.6);
  const gr = g.createRadialGradient(0, 7, 0, 0, 0, 25);
  gr.addColorStop(0, rgba(col, 1)); gr.addColorStop(0.35, rgba(col, 0.6)); gr.addColorStop(0.7, rgba(col, 0.18)); gr.addColorStop(1, rgba(col, 0));
  g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 25, 0, Math.PI * 2); g.fill();
  return (flameCache[col] = c);
}
export function ringSprite(col: string) {
  if (ringCache[col]) return ringCache[col];
  const [c, g] = make(160, 160), gr = g.createRadialGradient(80, 80, 0, 80, 80, 80);
  gr.addColorStop(0, rgba(col, 0)); gr.addColorStop(0.52, rgba(col, 0)); gr.addColorStop(0.68, rgba(col, 0.55));
  gr.addColorStop(0.76, rgba(col, 0.9)); gr.addColorStop(0.86, rgba(col, 0.35)); gr.addColorStop(1, rgba(col, 0));
  g.fillStyle = gr; g.fillRect(0, 0, 160, 160);
  return (ringCache[col] = c);
}
// draws a flame texture centered at (x,y), pointing along (vx,vy)
export function drawTongue(ctx: Ctx2D, img: OffscreenCanvas, x: number, y: number, vx: number, vy: number, w: number, h: number) {
  const sp = Math.hypot(vx, vy) || 1, s = vx / sp, c = -vy / sp;
  ctx.setTransform(c, s, -s, c, x, y);
  ctx.drawImage(img, -w / 2, -h * 0.6, w, h);
}
