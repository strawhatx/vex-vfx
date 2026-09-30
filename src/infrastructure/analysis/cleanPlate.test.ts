import { describe, expect, it } from 'vitest';
import { NO_MOVE } from '@/domain/effects/laser';
import { cleanPlate, pushPull, type PlateFrame } from './cleanPlate';

const W = 20,
  H = 10;

// a frame of one flat gray, with a square hole (the object) at x0..x0+3, y 3..6
function frame(gray: number, x0: number | null, cam = NO_MOVE): PlateFrame {
  const rgba = new Uint8ClampedArray(W * H * 4);
  for (let p = 0; p < W * H; p++) rgba.set([gray, gray, gray, 255], p * 4);
  let hole: Uint8Array | null = null;
  if (x0 !== null) {
    hole = new Uint8Array(W * H);
    for (let y = 3; y <= 6; y++)
      for (let x = x0; x <= x0 + 3; x++) {
        hole[y * W + x] = 1;
        rgba.set([255, 0, 0, 255], (y * W + x) * 4); // the object: red
      }
  }
  return { rgba, hole, cam };
}
const box = (x0: number) => ({ x0, y0: 3, x1: x0 + 3, y1: 6 });
const px = (p: ReturnType<typeof cleanPlate>, x: number, y: number) =>
  Array.from(p.rgba.slice(((y - p.y) * p.w + (x - p.x)) * 4, ((y - p.y) * p.w + (x - p.x)) * 4 + 4));

describe('the clean plate', () => {
  it('takes the background from a frame where the object has moved off', () => {
    const f = frame(100, 4);
    const moved = frame(100, 12);
    moved.rgba.set([50, 60, 70, 255], (4 * W + 5) * 4); // what's behind the object at (5, 4)
    const p = cleanPlate(f, box(4), [moved], W, H);
    expect(px(p, 5, 4)).toEqual([50, 60, 70, 255]);
    // no red left anywhere in the hole
    for (let y = 3; y <= 6; y++) for (let x = 4; x <= 7; x++) expect(px(p, x, y)[0]).toBeLessThan(200);
  });

  it('skips frames where the object still covers the spot, and frames that don’t know where it is', () => {
    const f = frame(100, 4);
    const still = frame(30, 4);
    const unknown = frame(30, null);
    const off = frame(100, 12);
    const p = cleanPlate(f, box(4), [still, unknown, off], W, H);
    expect(px(p, 5, 4)).toEqual([100, 100, 100, 255]);
  });

  it('lines the frames up with the camera', () => {
    const f = frame(100, 4);
    // the camera panned 2 px left: the scene sits 2 px further right in this frame... and the
    // object moved off
    const panned = frame(100, 14, { s: 1, tx: 2, ty: 0 });
    panned.rgba.set([10, 20, 30, 255], (4 * W + 7) * 4);
    const p = cleanPlate(f, box(4), [panned], W, H);
    expect(px(p, 5, 4)).toEqual([10, 20, 30, 255]);
  });

  it('fills what never shows from around it', () => {
    const p = cleanPlate(frame(100, 4), box(4), [], W, H);
    for (let y = 3; y <= 6; y++)
      for (let x = 4; x <= 7; x++) expect(px(p, x, y)).toEqual([100, 100, 100, 255]);
  });

  it('is solid over the hole and fades out past it', () => {
    const p = cleanPlate(frame(100, 4), box(4), [], W, H);
    expect(px(p, 5, 4)[3]).toBe(255);
    const edge = px(p, 9, 4)[3];
    expect(edge).toBeGreaterThan(0);
    expect(edge).toBeLessThan(255);
    expect(px(p, 10, 4)[3]).toBeLessThan(edge);
    // and stops FEATHER pixels past it
    expect(p.x + p.w - 1).toBe(10);
  });
});

describe('push-pull fill', () => {
  it('blends between known sides', () => {
    const w = 8,
      h = 1,
      rgba = new Uint8ClampedArray(w * 4),
      known = new Uint8Array(w);
    rgba.set([0, 0, 0, 255], 0);
    known[0] = 1;
    rgba.set([200, 200, 200, 255], 7 * 4);
    known[7] = 1;
    pushPull(rgba, known, w, h);
    const mid = rgba[3 * 4];
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(200);
    expect(rgba[0]).toBe(0);
    expect(rgba[7 * 4]).toBe(200);
  });
});
