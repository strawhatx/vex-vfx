import { describe, expect, it } from 'vitest';
import type { ClipFrame, Shape } from '../tracking/types';
import { makeShots } from './shots';
import { nearestOther, newTrack, refreshFrames, setRange, swapFrom, toLane, trackAt } from './track';

const FX = { effect: 'fire', pal: 0, size: 1, intensity: 1 } as const;
// 10 frames at 10 fps
const clip: ClipFrame[] = Array.from({ length: 10 }, (_, i) => ({ t: i / 10, dur: 0.1 }));
const shape = (cx: number, lost = false): Shape => ({ id: 0, cx, cy: 50, w: 20, h: 20, lost: lost || undefined });

function tracked(id: number, cx: number) {
  const t = newTrack(id, clip, FX, 1);
  t.shapes = clip.map(() => shape(cx));
  refreshFrames(t, clip);
  return t;
}

describe('effect range', () => {
  it('only draws the shapes inside the range', () => {
    const t = tracked(1, 10);
    expect(setRange(t, { s: 0.3, e: 0.6 }, 1, clip)).toBe(true);
    expect(t.frames.map(f => f.shapes.length)).toEqual([0, 0, 0, 1, 1, 1, 0, 0, 0, 0]);
  });
  it('is kept inside the clip and never shorter than the minimum', () => {
    const t = tracked(1, 10);
    setRange(t, { s: -5, e: 99 }, 1, clip);
    expect(t.range).toEqual({ s: 0, e: 1 });
    expect(setRange(t, { s: 0.5, e: 0.55 }, 1, clip)).toBe(false);
    expect(t.range).toEqual({ s: 0, e: 1 });
  });
});

describe('swapFrom', () => {
  it('swaps shapes and keyframes from the frame on, and keeps each track id', () => {
    const a = tracked(1, 10), b = tracked(2, 90);
    a.keys = [{ i: 1, x: 10, y: 50, auto: false }, { i: 8, x: 10, y: 50, auto: false }];
    b.keys = [{ i: 6, x: 90, y: 50, auto: true }];
    swapFrom(a, b, 5, clip);
    expect(a.shapes.map(s => s!.cx)).toEqual([10, 10, 10, 10, 10, 90, 90, 90, 90, 90]);
    expect(b.shapes.map(s => s!.cx)).toEqual([90, 90, 90, 90, 90, 10, 10, 10, 10, 10]);
    expect(a.shapes[7]!.id).toBe(1);
    expect(a.keys.map(k => k.i)).toEqual([1, 6]);
    expect(b.keys.map(k => k.i)).toEqual([8]);
  });
});

describe('finding tracks', () => {
  it('nearestOther picks the closest object at that frame', () => {
    const a = tracked(1, 10), near = tracked(2, 30), far = tracked(3, 90);
    expect(nearestOther([a, far, near], a, 4)).toBe(near);
  });
  it('trackAt hits an object inside its box', () => {
    const a = tracked(1, 10), b = tracked(2, 90);
    expect(trackAt([a, b], 2, 92, 55)).toBe(b);
    expect(trackAt([a, b], 2, 50, 50)).toBeNull();
  });
});

describe('toLane', () => {
  it('groups frames into found and weak stretches, bridging a single missing frame', () => {
    const t = tracked(1, 10);
    t.shapes[4] = shape(10, true); t.shapes[5] = shape(10, true); t.shapes[2] = null; t.shapes[7] = null; t.shapes[8] = null;
    const spans = toLane(t, clip, makeShots(10, []).shots).spans.map(s => [+s.s.toFixed(2), +s.e.toFixed(2), s.weak]);
    expect(spans).toEqual([[0, 0.4, false], [0.4, 0.6, true], [0.6, 0.7, false], [0.9, 1, false]]);
  });
  it('lists shots it was looked for in and not found', () => {
    const { shots } = makeShots(10, [5]);
    const t = tracked(1, 10);
    t.keys = [{ i: 1, x: 0, y: 0, auto: false }];
    t.searched = new Set([0, 1]);
    expect(toLane(t, clip, shots).missing).toEqual([{ shot: 1, s: 0.5, e: 1 }]);
  });
});
