// Cropping the film's frame: which part of it shows, and turned how far. The crop is a box in the
// frame (x, y, w, h: fractions of it) and a turn (degrees, clockwise) about the box's middle. What
// shows is the frame turned about that middle and zoomed in just enough that the box has no empty
// corners, cut to the box. Everything on the frame (the videos, their effects, overlays) is
// cropped together, so it all stays lined up; the export is the cropped frame.

export interface Crop {
  x: number;
  y: number;
  w: number;
  h: number;
  rot: number;
}

export const FULL: Crop = { x: 0, y: 0, w: 1, h: 1, rot: 0 };
export const MAX_ROT = 45,
  // the smallest a side can be cropped to (a fraction of the frame's)
  MIN_SIDE = 0.1;

// the aspect ratios the box can be held to (width / height; custom: any)
export const RATIOS = [
  { id: 'custom', label: 'Custom', ratio: null },
  { id: '9:16', label: '9:16', ratio: 9 / 16 },
  { id: '16:9', label: '16:9', ratio: 16 / 9 },
  { id: '1:1', label: '1:1', ratio: 1 },
  { id: '4:5', label: '4:5', ratio: 4 / 5 },
  { id: '4:3', label: '4:3', ratio: 4 / 3 },
  { id: '2:1', label: '2:1', ratio: 2 },
] as const;
export type RatioId = (typeof RATIOS)[number]['id'];

export const isFull = (c: Crop) => c.x <= 1e-6 && c.y <= 1e-6 && c.w >= 1 - 1e-6 && c.h >= 1 - 1e-6 && !c.rot;

// the box as big as fits in the W x H frame at `ratio` (px width / px height), about where it is
export function withRatio(c: Crop, ratio: number | null, W: number, H: number): Crop {
  if (!ratio) return c;
  // as big as the frame allows, at that ratio
  let w = 1,
    h = W / ratio / H;
  if (h > 1) {
    h = 1;
    w = (H * ratio) / W;
  }
  const cx = c.x + c.w / 2,
    cy = c.y + c.h / 2;
  return clampBox({ ...c, x: cx - w / 2, y: cy - h / 2, w, h });
}

type Corner = 'nw' | 'ne' | 'sw' | 'se';

// the box with one corner dragged to (px, py) (fractions of the frame), the opposite corner held;
// with a ratio, the box keeps it (sized by the drag's larger side)
export function dragCorner(
  c: Crop,
  corner: Corner,
  px: number,
  py: number,
  ratio: number | null,
  W: number,
  H: number,
): Crop {
  const west = corner === 'nw' || corner === 'sw',
    north = corner === 'nw' || corner === 'ne';
  // the corner held still
  const ax = west ? c.x + c.w : c.x,
    ay = north ? c.y + c.h : c.y;
  const bx = Math.max(0, Math.min(1, px)),
    by = Math.max(0, Math.min(1, py));
  let w = Math.max(MIN_SIDE, west ? ax - bx : bx - ax),
    h = Math.max(MIN_SIDE, north ? ay - by : by - ay);
  if (ratio) {
    // in pixels, the side dragged furthest sets the other
    const wp = w * W,
      hp = h * H;
    if (wp / hp > ratio) h = wp / ratio / H;
    else w = (hp * ratio) / W;
    // kept inside the frame from the held corner
    const roomW = west ? ax : 1 - ax,
      roomH = north ? ay : 1 - ay;
    const k = Math.min(1, roomW / w, roomH / h);
    w *= k;
    h *= k;
  } else {
    w = Math.min(w, west ? ax : 1 - ax);
    h = Math.min(h, north ? ay : 1 - ay);
  }
  return { ...c, x: west ? ax - w : ax, y: north ? ay - h : ay, w, h };
}

// the box moved by (dx, dy) (fractions of the frame), kept inside it
export const moveBox = (c: Crop, dx: number, dy: number): Crop =>
  clampBox({ ...c, x: c.x + dx, y: c.y + dy });

function clampBox(c: Crop): Crop {
  const w = Math.min(1, c.w),
    h = Math.min(1, c.h);
  return { ...c, w, h, x: Math.max(0, Math.min(1 - w, c.x)), y: Math.max(0, Math.min(1 - h, c.y)) };
}

// how much the turned frame is zoomed in so the box (in a W x H frame) has no empty corners
export function coverZoom(c: Crop, W: number, H: number) {
  const a = (c.rot * Math.PI) / 180,
    cos = Math.cos(a),
    sin = Math.sin(a);
  const cx = (c.x + c.w / 2) * W,
    cy = (c.y + c.h / 2) * H,
    hw = (c.w * W) / 2,
    hh = (c.h * H) / 2;
  let k = 1;
  // each corner of the box, turned back into the frame, must land inside it
  for (const [ox, oy] of [
    [-hw, -hh],
    [hw, -hh],
    [hw, hh],
    [-hw, hh],
  ]) {
    const dx = ox * cos + oy * sin,
      dy = -ox * sin + oy * cos;
    if (dx > 0) k = Math.max(k, dx / Math.max(1e-6, W - cx));
    if (dx < 0) k = Math.max(k, -dx / Math.max(1e-6, cx));
    if (dy > 0) k = Math.max(k, dy / Math.max(1e-6, H - cy));
    if (dy < 0) k = Math.max(k, -dy / Math.max(1e-6, cy));
  }
  return k;
}

// Where things go: a point of the W x H frame (px) shown in the cropped picture (px from its top
// left, the box's own size in frame px), and back.
export function toCropped(c: Crop, W: number, H: number, x: number, y: number) {
  const a = (c.rot * Math.PI) / 180,
    k = coverZoom(c, W, H),
    cx = (c.x + c.w / 2) * W,
    cy = (c.y + c.h / 2) * H;
  const dx = (x - cx) * k,
    dy = (y - cy) * k;
  return {
    x: dx * Math.cos(a) - dy * Math.sin(a) + (c.w * W) / 2,
    y: dx * Math.sin(a) + dy * Math.cos(a) + (c.h * H) / 2,
  };
}

export function fromCropped(c: Crop, W: number, H: number, x: number, y: number) {
  const a = (c.rot * Math.PI) / 180,
    k = coverZoom(c, W, H),
    cx = (c.x + c.w / 2) * W,
    cy = (c.y + c.h / 2) * H;
  const ox = x - (c.w * W) / 2,
    oy = y - (c.h * H) / 2;
  return {
    x: cx + (ox * Math.cos(a) + oy * Math.sin(a)) / k,
    y: cy + (-ox * Math.sin(a) + oy * Math.cos(a)) / k,
  };
}
