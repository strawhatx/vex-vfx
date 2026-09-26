import { describe, expect, it } from 'vitest';
import { makeShots, shotIndex, shotSearchFrame } from './shots';

describe('makeShots', () => {
  it('splits the clip at each cut', () => {
    const { shots, start } = makeShots(10, [4, 7]);
    expect(shots).toEqual([{ s: 0, e: 4 }, { s: 4, e: 7 }, { s: 7, e: 10 }]);
    expect(Array.from(start)).toEqual([0, 0, 0, 0, 4, 4, 4, 7, 7, 7]);
  });

  it('is one shot when there are no cuts', () => {
    expect(makeShots(5, []).shots).toEqual([{ s: 0, e: 5 }]);
  });

  it('ignores cuts at the edges or out of range', () => {
    expect(makeShots(5, [0, 5, 9]).shots).toEqual([{ s: 0, e: 5 }]);
  });
});

describe('shot lookups', () => {
  const { shots } = makeShots(10, [4, 7]);
  it('finds the shot a frame is in', () => {
    expect(shotIndex(shots, 3)).toBe(0);
    expect(shotIndex(shots, 4)).toBe(1);
    expect(shotIndex(shots, 10)).toBe(-1);
  });
  it('searches a couple of frames in, but never past the shot', () => {
    expect(shotSearchFrame({ s: 20, e: 40 })).toBe(22);
    expect(shotSearchFrame({ s: 20, e: 21 })).toBe(20);
  });
});
