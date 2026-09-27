import { describe, expect, it } from 'vitest';
import {
  IDENTITY,
  clampAt,
  newCutout,
  placedRange,
  resetTransform,
  setTransformAt,
  sourceTime,
  toggleKey,
  transformAt,
} from './cutout';

describe('a cutout’s transform', () => {
  it('starts where it was cut from, unchanged', () => {
    expect(transformAt(newCutout(1, 'keep'), 0.5)).toEqual(IDENTITY);
  });

  it('without keyframes, a change moves the whole layer', () => {
    const c = setTransformAt(newCutout(1, 'keep'), 0.5, { x: 20, scale: 2 });
    expect(c.keys).toEqual([]);
    expect(transformAt(c, 0)).toMatchObject({ x: 20, scale: 2 });
    expect(transformAt(c, 2)).toMatchObject({ x: 20, scale: 2 });
  });

  it('keeps scale and opacity sensible', () => {
    const c = setTransformAt(newCutout(0, 'keep'), 0, { scale: 99, opacity: -1 });
    expect(c.base.scale).toBe(4);
    expect(c.base.opacity).toBe(0);
  });

  it('with keyframes, each change sets the keyframe at the playhead, easing between them', () => {
    let c = toggleKey(newCutout(0, 'keep'), 0); // holds x 0 at 0s
    c = setTransformAt(c, 1, { x: -100 }); // a second key, at 1s
    expect(c.keys.map(k => k.t)).toEqual([0, 1]);
    expect(transformAt(c, 0).x).toBe(0);
    expect(transformAt(c, 1).x).toBe(-100);
    expect(transformAt(c, 0.5).x).toBeCloseTo(-50);
    // eased: slow at the start
    expect(transformAt(c, 0.1).x).toBeGreaterThan(-10);
    // held after the last key
    expect(transformAt(c, 3).x).toBe(-100);
  });

  it('removing the last keyframe keeps its transform for the whole layer', () => {
    let c = toggleKey(setTransformAt(newCutout(0, 'keep'), 0, { rot: 30 }), 0.5);
    c = setTransformAt(c, 0.5, { rot: 45 });
    c = toggleKey(c, 0.5);
    expect(c.keys).toEqual([]);
    expect(transformAt(c, 0).rot).toBe(45);
  });

  it('reset puts it back where it was cut from', () => {
    const c = resetTransform(toggleKey(setTransformAt(newCutout(0, 'clean'), 0, { x: 5 }), 0));
    expect(c).toMatchObject({ base: IDENTITY, keys: [], bg: 'clean' });
  });
});

describe('a cutout’s timing', () => {
  it('plays the frames it was cut from, from wherever it’s placed', () => {
    const range = { s: 1, e: 3 },
      c = newCutout(4, 'keep');
    expect(placedRange(range, c)).toEqual({ s: 4, e: 6 });
    expect(sourceTime(range, c, 4.5)).toBe(1.5);
  });

  it('stays inside the clip', () => {
    expect(clampAt(5, 2, 6)).toBe(4);
    expect(clampAt(-1, 2, 6)).toBe(0);
  });
});
