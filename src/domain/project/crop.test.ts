import { describe, expect, it } from 'vitest';
import { FULL, coverZoom, dragCorner, fromCropped, isFull, moveBox, toCropped, withRatio } from './crop';

// a 1920 x 1080 frame
const W = 1920,
  H = 1080;

describe('cropping the frame', () => {
  it('fits an aspect ratio as big as the frame allows', () => {
    const c = withRatio(FULL, 9 / 16, W, H);
    // 9:16 in a 16:9 frame: full height, 607.5 px wide, in the middle
    expect(c.h).toBe(1);
    expect(c.w * W).toBeCloseTo(607.5, 3);
    expect(c.x + c.w / 2).toBeCloseTo(0.5, 6);
    expect(isFull(c)).toBe(false);
    expect(isFull(FULL)).toBe(true);
  });

  it('drags a corner, holding the opposite one, keeping a ratio if there is one', () => {
    const c = dragCorner(FULL, 'se', 0.5, 0.5, null, W, H);
    expect(c).toMatchObject({ x: 0, y: 0, w: 0.5, h: 0.5 });
    const sq = dragCorner(FULL, 'se', 0.5, 0.9, 1, W, H);
    expect(sq.w * W).toBeCloseTo(sq.h * H, 6);
    expect(sq.h).toBeCloseTo(0.9, 6);
  });

  it('moves the box, keeping it inside the frame', () => {
    const c = moveBox({ ...FULL, w: 0.5, h: 0.5 }, 0.8, -0.2);
    expect(c).toMatchObject({ x: 0.5, y: 0 });
  });

  it('turned, zooms in just enough that no corner is empty', () => {
    expect(coverZoom(FULL, W, H)).toBe(1);
    const c = { ...withRatio(FULL, 9 / 16, W, H), rot: 10 };
    const k = coverZoom(c, W, H);
    expect(k).toBeGreaterThan(1);
    // each corner of the box comes from inside the frame
    for (const [x, y] of [
      [0, 0],
      [c.w * W, 0],
      [c.w * W, c.h * H],
      [0, c.h * H],
    ]) {
      const q = fromCropped(c, W, H, x, y);
      expect(q.x).toBeGreaterThanOrEqual(-1e-6);
      expect(q.y).toBeGreaterThanOrEqual(-1e-6);
      expect(q.x).toBeLessThanOrEqual(W + 1e-6);
      expect(q.y).toBeLessThanOrEqual(H + 1e-6);
    }
  });

  it('maps points into the cropped picture and back', () => {
    const c = { x: 0.2, y: 0.1, w: 0.5, h: 0.6, rot: -12 };
    const p = toCropped(c, W, H, 700, 400);
    const q = fromCropped(c, W, H, p.x, p.y);
    expect(q.x).toBeCloseTo(700, 6);
    expect(q.y).toBeCloseTo(400, 6);
    // not turned: just the box's corner taken off
    expect(toCropped({ ...c, rot: 0 }, W, H, 0.2 * W + 10, 0.1 * H + 5)).toEqual({ x: 10, y: 5 });
  });
});
