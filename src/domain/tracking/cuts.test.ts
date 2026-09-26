import { describe, expect, it } from 'vitest';
import { findCuts, frameDelta, toHsv } from './cuts';

describe('findCuts', () => {
  it('finds a sudden big change', () => {
    const d = [0, 2, 3, 2, 60, 3, 2, 2];
    expect(findCuts(d, 2)).toEqual([4]);
  });

  it('ignores steady fast motion (big changes every frame)', () => {
    const d = [0, 30, 32, 31, 33, 30, 34, 31];
    expect(findCuts(d, 2)).toEqual([]);
  });

  it('does not cut again before the shot is long enough', () => {
    const d = [0, 2, 2, 2, 2, 60, 2, 60, 2, 2, 2, 2, 2, 2, 2, 60];
    expect(findCuts(d, 4)).toEqual([5, 15]);
  });

  it('does not cut before the first shot is long enough', () => {
    expect(findCuts([0, 2, 60, 2, 2, 2], 4)).toEqual([]);
  });
});

describe('frameDelta', () => {
  it('is zero for identical frames and large for different ones', () => {
    const red = new Uint8ClampedArray([255, 0, 0, 255, 255, 0, 0, 255]);
    const blue = new Uint8ClampedArray([0, 0, 255, 255, 0, 0, 255, 255]);
    const a = new Uint8Array(6), b = new Uint8Array(6);
    toHsv(red, a); toHsv(blue, b);
    expect(frameDelta(a, a)).toBe(0);
    expect(frameDelta(a, b)).toBeGreaterThan(27);
  });
});
