import { describe, expect, it } from 'vitest';
import { describe as describeObject, similarity } from './appearance';
import { encodeRle } from './types';

const W = 40, H = 40;

// a frame with a filled rectangle: `top` color on its upper half, `bottom` color below
function scene(x0: number, y0: number, w: number, h: number, top: number[], bottom: number[]) {
  const rgba = new Uint8ClampedArray(W * H * 4).fill(40), mask = new Uint8Array(W * H);
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
    const c = y < y0 + h / 2 ? top : bottom, j = (y * W + x) * 4;
    rgba.set([...c, 255], j); mask[y * W + x] = 1;
  }
  return describeObject(rgba, W, H, encodeRle(mask, W, x0, y0, x0 + w - 1, y0 + h - 1))!;
}

const PINK = [230, 120, 170], GREEN = [60, 160, 70], GRAY = [128, 128, 128];

describe('similarity', () => {
  it('matches the same object when it moves and shrinks', () => {
    const near = scene(5, 5, 12, 24, PINK, GREEN), far = scene(25, 20, 6, 12, PINK, GREEN);
    expect(similarity(near, far)).toBeGreaterThan(0.7);
  });

  it('tells apart objects with the same colors the other way up', () => {
    const a = scene(5, 5, 12, 24, PINK, GREEN), flipped = scene(5, 5, 12, 24, GREEN, PINK);
    expect(similarity(a, flipped)).toBeLessThan(0.3);
  });

  it('scores a different-colored object low', () => {
    const a = scene(5, 5, 12, 24, PINK, GREEN), b = scene(5, 5, 12, 24, GRAY, GRAY);
    expect(similarity(a, b)).toBeLessThan(0.3);
  });
});
