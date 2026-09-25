// Filled silhouettes drawn from MediaPipe landmarks. The effects work from a mask and an
// outline, so each hand, body or face is painted as a solid white shape.
import type { NormalizedLandmark } from '@mediapipe/tasks-vision';
import type { BodyPart } from './types';

export type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
type Pt = [number, number];
type Draw = (ctx: Ctx2D, lm: NormalizedLandmark[], w: number, h: number) => void;

const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);
function line(ctx: Ctx2D, a: Pt, b: Pt, width: number) {
  ctx.lineWidth = width; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
}
function poly(ctx: Ctx2D, pts: Pt[], edge: number) {
  ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.closePath();
  ctx.fill(); ctx.lineWidth = edge; ctx.stroke();
}

const PALM = [0, 1, 2, 5, 9, 13, 17];
const FINGERS = [[1, 2, 3, 4], [5, 6, 7, 8], [9, 10, 11, 12], [13, 14, 15, 16], [17, 18, 19, 20]];
const drawHand: Draw = (ctx, lm, w, h) => {
  const P = lm.map(p => [p.x * w, p.y * h] as Pt);
  const s = dist(P[0], P[9]); // wrist to middle knuckle
  poly(ctx, PALM.map(i => P[i]), s * 0.2);
  for (const f of FINGERS) for (let i = 0; i < f.length - 1; i++) line(ctx, P[f[i]], P[f[i + 1]], s * (0.24 - i * 0.025));
};

// [from, to, width as a fraction of shoulder width]
const LIMBS: [number, number, number][] = [
  [11, 13, 0.3], [13, 15, 0.24], [12, 14, 0.3], [14, 16, 0.24], [15, 19, 0.18], [16, 20, 0.18],
  [23, 25, 0.42], [25, 27, 0.3], [24, 26, 0.42], [26, 28, 0.3], [27, 31, 0.2], [28, 32, 0.2],
];
const drawBody: Draw = (ctx, lm, w, h) => {
  const P = lm.map(p => [p.x * w, p.y * h] as Pt);
  const vis = (...ids: number[]) => ids.every(i => lm[i].visibility > 0.5);
  const sw = vis(11, 12) ? dist(P[11], P[12]) : vis(23, 24) ? dist(P[23], P[24]) * 1.4 : 0;
  if (!sw) return;
  if (vis(11, 12, 24, 23)) poly(ctx, [P[11], P[12], P[24], P[23]], sw * 0.25);
  for (const [a, b, k] of LIMBS) if (vis(a, b)) line(ctx, P[a], P[b], sw * k);
  if (vis(11, 12, 0)) line(ctx, [(P[11][0] + P[12][0]) / 2, (P[11][1] + P[12][1]) / 2], P[0], sw * 0.3);
  if (vis(0)) {
    const ears = vis(7, 8), r = Math.max(ears ? dist(P[7], P[8]) * 0.62 : 0, sw * 0.22);
    const c: Pt = ears ? [(P[7][0] + P[8][0]) / 2, (P[7][1] + P[8][1]) / 2 - r * 0.15] : P[0];
    ctx.beginPath(); ctx.arc(c[0], c[1], r, 0, Math.PI * 2); ctx.fill();
  }
};

// the face landmarks cover the whole face, so their convex hull is the outline
function hull(pts: Pt[]) {
  pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: Pt, a: Pt, b: Pt) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: Pt[] = [], upper: Pt[] = [];
  for (const p of pts) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop(); lower.push(p); }
  for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop(); upper.push(p); }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}
const drawFace: Draw = (ctx, lm, w, h) => poly(ctx, hull(lm.map(p => [p.x * w, p.y * h] as Pt)), 2);

export const DRAW: Record<BodyPart, Draw> = { hand: drawHand, body: drawBody, face: drawFace };

// bounding box of the landmarks (only confident ones for bodies), in w x h pixels, padded to
// cover the painted limbs and head
export function landmarkBounds(part: BodyPart, lm: NormalizedLandmark[], w: number, h: number) {
  const pts = part === 'body' && lm.some(p => p.visibility >= 0.5) ? lm.filter(p => p.visibility >= 0.5) : lm;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) { x0 = Math.min(x0, p.x * w); x1 = Math.max(x1, p.x * w); y0 = Math.min(y0, p.y * h); y1 = Math.max(y1, p.y * h); }
  const pad = Math.max(x1 - x0, y1 - y0) * (part === 'face' ? 0.02 : 0.3);
  return { x0: x0 - pad, y0: y0 - pad, x1: x1 + pad, y1: y1 + pad };
}
