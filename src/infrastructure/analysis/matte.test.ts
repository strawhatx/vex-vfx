import { describe, expect, it } from 'vitest';
import { featherMatte, refineMatte } from './matte';

// a 40 x 20 picture: red on the left of column `edge`, blue from it on
function picture(edge: number, w = 40, h = 20) {
  const rgba = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const k = (y * w + x) * 4;
      rgba.set(x < edge ? [220, 30, 30, 255] : [30, 40, 210, 255], k);
    }
  return rgba;
}

// a rough matte: 1 left of `edge`, blurred over `soft` px either side
function rough(edge: number, soft: number, w = 40, h = 20) {
  const a = new Float32Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) a[y * w + x] = Math.max(0, Math.min(1, 0.5 - (x + 0.5 - edge) / (2 * soft)));
  return a;
}

describe('refining a cutout’s edge', () => {
  it('snaps a rough, misplaced edge to the object’s real one', () => {
    // the object (red) really ends at 20; the rough matte ends at 17, blurred over 3 px
    const out = refineMatte(picture(20), rough(17, 3), 40, 20);
    const row = 10 * 40;
    // well inside and well outside stay as they were
    expect(out[row + 5]).toBeGreaterThan(0.95);
    expect(out[row + 35]).toBeLessThan(0.05);
    // it ends right at the real edge, not where the rough matte faded out
    expect(out[row + 20]).toBe(0);
    expect(out[row + 19]).toBeGreaterThan(0.3);
    // where the rough matte was half in, but the picture is all object, it's in
    expect(out[row + 17]).toBeGreaterThan(0.7);
    expect(out[row + 14]).toBe(1);
  });

  it('keeps the matte as it was where the picture is flat', () => {
    const flat = new Uint8ClampedArray(40 * 20 * 4).fill(128);
    const a = rough(20, 3);
    const out = refineMatte(flat, a, 40, 20);
    expect(out[10 * 40 + 5]).toBeCloseTo(1, 1);
    expect(out[10 * 40 + 35]).toBeCloseTo(0, 1);
  });

  it('feathered, fades out across the edge rather than stopping at it', () => {
    const hard = rough(20, 0.01);
    const soft = featherMatte(hard, 40, 20, 8);
    const row = 10 * 40;
    expect(soft[row + 2]).toBeGreaterThan(0.99);
    expect(soft[row + 17]).toBeGreaterThan(0.5);
    expect(soft[row + 17]).toBeLessThan(1);
    expect(soft[row + 22]).toBeGreaterThan(0);
    expect(soft[row + 22]).toBeLessThan(0.5);
  });
});
