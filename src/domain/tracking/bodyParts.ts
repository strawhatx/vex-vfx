// Body parts an effect can sit on, and how to find each one from body landmarks: the points a
// pose model puts on a person (joints, eyes, ears), a hand model (21 per hand) and a face model
// (468 per face). All in work pixels. Pure geometry, so it can be tested without the models.
import { encodeRle, type Rle, type Shape } from './types';

export type BodyPart = 'body' | 'head' | 'eyes' | 'handL' | 'handR' | 'footL' | 'footR';
// "left" and "right" are as seen on screen when the part is picked
export const BODY_PARTS: { id: BodyPart; label: string }[] = [
  { id: 'body', label: 'Whole body' }, { id: 'head', label: 'Head' }, { id: 'eyes', label: 'Eyes' },
  { id: 'handL', label: 'Left hand' }, { id: 'handR', label: 'Right hand' },
  { id: 'footL', label: 'Left foot' }, { id: 'footR', label: 'Right foot' },
];
export const partLabel = (p: BodyPart) => BODY_PARTS.find(b => b.id === p)!.label;

export type Pt = { x: number; y: number };

// pose landmarks (MediaPipe's 33): the person's own left side first
export const POSE = {
  nose: 0, eyeL: 2, eyeR: 5, earL: 7, earR: 8, shoulderL: 11, shoulderR: 12,
  wrist: [15, 16], pinky: [17, 18], index: [19, 20], thumb: [21, 22],
  hipL: 23, hipR: 24, ankle: [27, 28], heel: [29, 30], toe: [31, 32],
} as const;
// face landmarks (MediaPipe's face mesh): the outline of the face, and of each eye
export const FACE_OVAL = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109];
export const FACE_EYES = [
  [33, 7, 163, 144, 145, 153, 154, 155, 133, 246, 161, 160, 159, 158, 157, 173],
  [263, 249, 390, 373, 374, 380, 381, 382, 362, 466, 388, 387, 386, 385, 384, 398],
];

// ---------- people ----------
export interface Person { points: Pt[]; center: Pt; size: number } // center and size of the torso and head

export function person(points: Pt[]): Person {
  const torso = [POSE.shoulderL, POSE.shoulderR, POSE.hipL, POSE.hipR].map(i => points[i]);
  const center = { x: avg(torso.map(p => p.x)), y: avg(torso.map(p => p.y)) };
  const size = Math.max(8, Math.hypot(points[POSE.shoulderL].x - points[POSE.hipR].x, points[POSE.shoulderL].y - points[POSE.hipR].y));
  return { points, center, size };
}

// the person tapped at (x, y): the one with a landmark nearest the tap, if it's close enough to
// count as tapping them
export function personAt(people: Person[], at: Pt): Person | null {
  let best: Person | null = null, bd = Infinity;
  for (const p of people) {
    const d = Math.min(...p.points.map(q => dist(q, at))) / p.size;
    if (d < bd) { bd = d; best = p; }
  }
  return best && bd < 0.6 ? best : null;
}

// the same person in the next frame: the nearest torso, unless everyone has moved too far
export function samePerson(people: Person[], prev: Person): Person | null {
  let best: Person | null = null, bd = Infinity;
  for (const p of people) { const d = dist(p.center, prev.center); if (d < bd) { bd = d; best = p; } }
  return best && bd < prev.size * 1.2 ? best : null;
}

// the part nearest the tap: an eye if tapped right on one, otherwise the head, a hand or a foot if
// the tap is close to it, otherwise the whole body
export function partNearest(p: Person, at: Pt): BodyPart {
  const q = p.points, eyeGap = Math.max(4, dist(q[POSE.eyeL], q[POSE.eyeR]));
  if (Math.min(dist(q[POSE.eyeL], at), dist(q[POSE.eyeR], at)) < eyeGap * 0.45) return 'eyes';
  const [a, b] = screenSides(p, POSE.wrist), [fa, fb] = screenSides(p, POSE.ankle);
  const spots: [BodyPart, Pt][] = [
    ['head', q[POSE.nose]], ['handL', handCenter(p, a)], ['handR', handCenter(p, b)],
    ['footL', footCenter(p, fa)], ['footR', footCenter(p, fb)],
  ];
  let best: BodyPart = 'body', bd = p.size * 0.35;
  for (const [part, c] of spots) { const d = dist(c, at); if (d < bd) { bd = d; best = part; } }
  return best;
}

// which side of the person (0 = their left, 1 = their right) is on the screen's left, for a pair
// of landmarks like the wrists
export function screenSides(p: Person, pair: readonly [number, number]): [0 | 1, 0 | 1] {
  return p.points[pair[0]].x <= p.points[pair[1]].x ? [0, 1] : [1, 0];
}

// the person's side a part is on, decided once when it's picked
export const sideFor = (p: Person, part: BodyPart): 0 | 1 =>
  part === 'handL' ? screenSides(p, POSE.wrist)[0] : part === 'handR' ? screenSides(p, POSE.wrist)[1]
    : part === 'footL' ? screenSides(p, POSE.ankle)[0] : screenSides(p, POSE.ankle)[1];

export const handCenter = (p: Person, side: 0 | 1) => mid([POSE.wrist[side], POSE.index[side], POSE.pinky[side]].map(i => p.points[i]));
const footCenter = (p: Person, side: 0 | 1) => mid([POSE.ankle[side], POSE.heel[side], POSE.toe[side]].map(i => p.points[i]));

// the hand (from a hand model's 21 points each) belonging to the person's wrist, if any
export function handFor(hands: Pt[][], p: Person, side: 0 | 1): Pt[] | null {
  const wrist = p.points[POSE.wrist[side]];
  let best: Pt[] | null = null, bd = Infinity;
  for (const h of hands) { const d = dist(h[0], wrist); if (d < bd) { bd = d; best = h; } }
  return best && bd < p.size * 0.35 ? best : null;
}

// the face (from a face model's points each) belonging to the person, if any
export function faceFor(faces: Pt[][], p: Person): Pt[] | null {
  const nose = p.points[POSE.nose];
  let best: Pt[] | null = null, bd = Infinity;
  for (const f of faces) { const d = dist(f[1], nose); if (d < bd) { bd = d; best = f; } }
  return best && bd < p.size * 0.35 ? best : null;
}

// ---------- the part's shape ----------
// the outlines that make up the part this frame: from the hand or face model when it found one,
// otherwise from the pose's own points
export function partOutlines(part: BodyPart, p: Person, side: 0 | 1, hand: Pt[] | null, face: Pt[] | null): Pt[][] {
  const q = p.points;
  if (part === 'handL' || part === 'handR') {
    return [hand ? grow(hull(hand), 0.18, 3) : grow(hull([POSE.wrist, POSE.pinky, POSE.index, POSE.thumb].map(pair => q[pair[side]])), 0.6, p.size * 0.08)];
  }
  if (part === 'footL' || part === 'footR') return [grow(hull([POSE.ankle, POSE.heel, POSE.toe].map(pair => q[pair[side]])), 0.35, p.size * 0.06)];
  if (part === 'head') {
    if (face) return [grow(hull(FACE_OVAL.map(i => face[i])), 0.08, 2)];
    const r = dist(q[POSE.earL], q[POSE.earR]) * 0.6;
    return [circle(q[POSE.nose], Math.max(4, r))];
  }
  // eyes: each eye's outline, a little bigger; or a small circle on each of the pose's eyes
  if (face) return FACE_EYES.map(ix => grow(hull(ix.map(i => face[i])), 0.45, 1.5));
  const r = Math.max(2, dist(q[POSE.eyeL], q[POSE.eyeR]) * 0.3);
  return [circle(q[POSE.eyeL], r), circle(q[POSE.eyeR], r)];
}

// a track shape from outlines: their filled mask and the box around them. mask is W x H scratch space
export function shapeFrom(outlines: Pt[][], W: number, H: number, mask: Uint8Array): Shape | null {
  mask.fill(0);
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (const poly of outlines) {
    const b = fillPolygon(poly, W, H, mask);
    if (!b) continue;
    x0 = Math.min(x0, b.x0); y0 = Math.min(y0, b.y0); x1 = Math.max(x1, b.x1); y1 = Math.max(y1, b.y1);
  }
  if (x1 < x0 || y1 < y0) return null;
  const rle: Rle = encodeRle(mask, W, x0, y0, x1, y1);
  return { id: 1, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, w: x1 - x0 + 1, h: y1 - y0 + 1, mask: rle };
}

// ---------- geometry ----------
const avg = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;
const mid = (pts: Pt[]): Pt => ({ x: avg(pts.map(p => p.x)), y: avg(pts.map(p => p.y)) });
export const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

// convex hull (monotone chain), counter-clockwise
export function hull(pts: Pt[]): Pt[] {
  const s = [...pts].sort((a, b) => a.x - b.x || a.y - b.y);
  if (s.length < 3) return s;
  const cross = (o: Pt, a: Pt, b: Pt) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: Pt[] = [], upper: Pt[] = [];
  for (const p of s) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop(); lower.push(p); }
  for (const p of [...s].reverse()) { while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop(); upper.push(p); }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

// pushes each point away from the middle: by `frac` of its distance, plus `px` pixels
export function grow(poly: Pt[], frac: number, px: number): Pt[] {
  const c = mid(poly);
  return poly.map(p => {
    const d = dist(p, c) || 1, k = (d * (1 + frac) + px) / d;
    return { x: c.x + (p.x - c.x) * k, y: c.y + (p.y - c.y) * k };
  });
}

export const circle = (c: Pt, r: number, n = 16): Pt[] =>
  Array.from({ length: n }, (_, k) => ({ x: c.x + Math.cos(k / n * 2 * Math.PI) * r, y: c.y + Math.sin(k / n * 2 * Math.PI) * r }));

// fills a polygon into mask (scanline, even-odd); returns the box it covered, if any
export function fillPolygon(poly: Pt[], W: number, H: number, mask: Uint8Array) {
  if (poly.length < 3) return null;
  let bx0 = W, by0 = H, bx1 = -1, by1 = -1;
  const ys = poly.map(p => p.y), top = Math.max(0, Math.floor(Math.min(...ys))), bottom = Math.min(H - 1, Math.ceil(Math.max(...ys)));
  const xs: number[] = [];
  for (let y = top; y <= bottom; y++) {
    const cy = y + 0.5;
    xs.length = 0;
    for (let k = 0, j = poly.length - 1; k < poly.length; j = k++) {
      const a = poly[k], b = poly[j];
      if ((a.y > cy) !== (b.y > cy)) xs.push(a.x + (cy - a.y) / (b.y - a.y) * (b.x - a.x));
    }
    xs.sort((m, n) => m - n);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const from = Math.max(0, Math.ceil(xs[k] - 0.5)), to = Math.min(W - 1, Math.floor(xs[k + 1] - 0.5));
      if (to < from) continue;
      mask.fill(1, y * W + from, y * W + to + 1);
      bx0 = Math.min(bx0, from); bx1 = Math.max(bx1, to); by0 = Math.min(by0, y); by1 = Math.max(by1, y);
    }
  }
  return bx1 < 0 ? null : { x0: bx0, y0: by0, x1: bx1, y1: by1 };
}
