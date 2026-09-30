import { describe, expect, it } from 'vitest';
import { encodeRle, type ClipFrame, type Shape } from '../tracking/types';
import { newTrack, type Track } from './track';
import { onShape, reuseTraced, tracedAt } from './sources';

const FX = {
  effect: 'fire',
  pal: 0,
  size: 1,
  intensity: 1,
  volume: 1,
  outline: 'neon',
  glitch: 'chaos',
  text: 'HI',
  textStyle: 'behind',
  font: 'anton',
  water: 'rain',
} as const;
// 10 frames at 10 fps
const clip: ClipFrame[] = Array.from({ length: 10 }, (_, i) => ({ t: i / 10, dur: 0.1 }));
const box = (cx: number): Shape => ({ id: 0, cx, cy: 50, w: 20, h: 20 });

// traced on frames [s, e) at x = cx
function traced(cx: number, s: number, e: number, part: Track['part'] = null) {
  const t = newTrack(1, clip, FX, { s: s / 10, e: e / 10 }, part);
  t.shapes = clip.map((_, i) => (i >= s && i < e ? box(cx) : null));
  t.keys = [{ i: s, x: cx, y: 50 }];
  return t;
}

describe('a tap on a traced object', () => {
  it('is on it inside its outline, not just its box', () => {
    // (an L: the left column and the bottom row of a 10 x 10 box at 45..54)
    const W = 100,
      m = new Uint8Array(W * W);
    for (let k = 45; k < 55; k++) m[k * W + 45] = m[54 * W + k] = 1;
    const sh: Shape = { ...box(50), mask: encodeRle(m, W, 45, 45, 54, 54) };
    expect(onShape(sh, 45.5, 47)).toBe(true);
    expect(onShape(sh, 50, 54.2)).toBe(true);
    expect(onShape(sh, 50, 50)).toBe(false);
    expect(onShape(box(50), 50, 50)).toBe(true);
    expect(onShape(box(50), 70, 50)).toBe(false);
  });

  it('finds the object, for the same body part, with the frames it was traced in around the tap', () => {
    const a = traced(20, 2, 7),
      b = traced(80, 0, 10, 'head');
    expect(tracedAt([a, b], 10, 4, { x: 22, y: 50 }, null)?.span).toEqual({ s: 2, e: 7 });
    expect(tracedAt([a, b], 10, 4, { x: 80, y: 50 }, null)).toBeNull();
    expect(tracedAt([a, b], 10, 4, { x: 80, y: 50 }, 'head')?.span).toEqual({ s: 0, e: 10 });
    // (not where it wasn't found, or was lost, or in a video of another length)
    expect(tracedAt([a], 10, 8, { x: 20, y: 50 }, null)).toBeNull();
    a.shapes[4] = { ...box(20), lost: true };
    expect(tracedAt([a], 10, 4, { x: 20, y: 50 }, null)).toBeNull();
    expect(tracedAt([b], 12, 4, { x: 80, y: 50 }, 'head')).toBeNull();
    // (nor a cutout's outline: that's the whole person)
    expect(tracedAt([{ ...traced(20, 2, 7), kind: 'cutout' }], 10, 4, { x: 20, y: 50 }, null)).toBeNull();
  });

  it('makes a new effect from it, lasting no longer than it was traced', () => {
    const found = tracedAt([traced(20, 2, 7)], 10, 4, { x: 20, y: 50 }, null)!;
    const t = newTrack(9, clip, FX, { s: 0.4, e: 3 });
    expect(reuseTraced(t, found, { i: 4, x: 20, y: 50 }, clip)).toBe(true);
    expect(t.range.s).toBe(0.4);
    expect(t.range.e).toBeCloseTo(0.7);
    expect(t.shapes[5]).toMatchObject({ id: 9, cx: 20 });
    expect(t.keys.map(k => k.i)).toEqual([2, 4]);
  });

  it('is tracked afresh when the object was traced for too short a time from there', () => {
    const found = tracedAt([traced(20, 2, 7)], 10, 6, { x: 20, y: 50 }, null)!;
    const t = newTrack(9, clip, FX, { s: 0.65, e: 3 });
    expect(reuseTraced(t, found, { i: 6, x: 20, y: 50 }, clip)).toBe(false);
    expect(t.shapes.every(sh => sh === null)).toBe(true);
  });
});
