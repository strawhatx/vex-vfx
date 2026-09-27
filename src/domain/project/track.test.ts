import { describe, expect, it } from 'vitest';
import { DEFAULT_STRAND } from '../effects/strands';
import type { ClipFrame, Shape } from '../tracking/types';
import {
  hitFrame,
  impactSpeed,
  isPinned,
  nearestOther,
  newImpact,
  newTrack,
  packRows,
  rangeFrames,
  refreshFrames,
  setHit,
  setRange,
  swapFrom,
  toLane,
  trackAt,
  trackSpan,
} from './track';

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
  strand: DEFAULT_STRAND,
} as const;
// 10 frames at 10 fps
const clip: ClipFrame[] = Array.from({ length: 10 }, (_, i) => ({ t: i / 10, dur: 0.1 }));
const shape = (cx: number, lost = false): Shape => ({
  id: 0,
  cx,
  cy: 50,
  w: 20,
  h: 20,
  lost: lost || undefined,
});

function tracked(id: number, cx: number, range = { s: 0, e: 1 }) {
  const t = newTrack(id, clip, FX, range);
  t.shapes = clip.map(() => shape(cx));
  refreshFrames(t, clip);
  return t;
}

describe('effect range', () => {
  it('covers the frames that start inside it', () => {
    expect(rangeFrames(tracked(1, 10, { s: 0.3, e: 0.6 }), clip)).toEqual({ s: 3, e: 6 });
    expect(rangeFrames(tracked(1, 10, { s: 0.25, e: 0.65 }), clip)).toEqual({ s: 3, e: 7 });
  });
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

describe('packRows', () => {
  it('puts effects that follow each other on one row', () => {
    expect(
      packRows([
        { s: 0, e: 2 },
        { s: 2, e: 4 },
        { s: 5, e: 6 },
      ]),
    ).toEqual([0, 0, 0]);
  });
  it('stacks overlapping effects on new rows, reusing a row once it is free', () => {
    expect(
      packRows([
        { s: 0, e: 3 },
        { s: 1, e: 2 },
        { s: 2.5, e: 4 },
        { s: 3, e: 5 },
      ]),
    ).toEqual([0, 1, 1, 0]);
  });
  it('goes by start time, not the order the effects were added', () => {
    expect(
      packRows([
        { s: 4, e: 5 },
        { s: 0, e: 1 },
      ]),
    ).toEqual([0, 0]);
  });
});

describe('swapFrom', () => {
  it('swaps shapes and keyframes from the frame on, and keeps each effect id', () => {
    const a = tracked(1, 10),
      b = tracked(2, 90);
    a.keys = [
      { i: 1, x: 10, y: 50 },
      { i: 8, x: 10, y: 50 },
    ];
    b.keys = [{ i: 6, x: 90, y: 50 }];
    swapFrom(a, b, 5, clip);
    expect(a.shapes.map(s => s!.cx)).toEqual([10, 10, 10, 10, 10, 90, 90, 90, 90, 90]);
    expect(b.shapes.map(s => s!.cx)).toEqual([90, 90, 90, 90, 90, 10, 10, 10, 10, 10]);
    expect(a.shapes[7]!.id).toBe(1);
    expect(a.keys.map(k => k.i)).toEqual([1, 6]);
    expect(b.keys.map(k => k.i)).toEqual([8]);
  });
});

describe('finding effects', () => {
  it('nearestOther picks the closest object at that frame, among effects there', () => {
    const a = tracked(1, 10),
      near = tracked(2, 30, { s: 0.6, e: 1 }),
      far = tracked(3, 90);
    expect(nearestOther([a, far, near], a, 4)).toBe(far); // `near` hasn't started yet
    expect(nearestOther([a, far, near], a, 7)).toBe(near);
  });
  it('trackAt hits an object inside its box, only while its effect lasts', () => {
    const a = tracked(1, 10),
      b = tracked(2, 90, { s: 0, e: 0.5 });
    expect(trackAt([a, b], clip, 2, 92, 55)).toBe(b);
    expect(trackAt([a, b], clip, 7, 92, 55)).toBeNull();
    expect(trackAt([a, b], clip, 2, 50, 50)).toBeNull();
  });
});

describe('toLane', () => {
  it('groups frames into found and weak stretches, bridging a single missing frame', () => {
    const t = tracked(1, 10);
    t.shapes[4] = shape(10, true);
    t.shapes[5] = shape(10, true);
    t.shapes[2] = null;
    t.shapes[7] = null;
    t.shapes[8] = null;
    refreshFrames(t, clip);
    const spans = toLane(t, clip, 0).spans.map(s => [+s.s.toFixed(2), +s.e.toFixed(2), s.weak]);
    expect(spans).toEqual([
      [0, 0.4, false],
      [0.4, 0.6, true],
      [0.6, 0.7, false],
      [0.9, 1, false],
    ]);
  });
  it('shows only what is inside the range', () => {
    const t = tracked(1, 10, { s: 0.2, e: 0.5 });
    t.keys = [
      { i: 1, x: 0, y: 0 },
      { i: 3, x: 0, y: 0 },
    ];
    const lane = toLane(t, clip, 2);
    expect(lane.spans.map(s => [+s.s.toFixed(2), +s.e.toFixed(2)])).toEqual([[0.2, 0.5]]);
    expect(lane.keys).toEqual([0.3]);
    expect(lane.row).toBe(2);
  });
});

describe('impacts', () => {
  it('hit at the tapped frame and last as long as their style', () => {
    const t = newImpact(1, clip, FX, 'punch', 4, 1);
    expect(t.kind).toBe('impact');
    expect(t.range.s).toBe(0.4);
    expect(t.range.e).toBeCloseTo(0.85);
    expect(hitFrame(t, clip)).toBe(4);
  });
  it('move to a new moment, keeping their length', () => {
    const t = newImpact(1, clip, FX, 'punch', 2, 1);
    setHit(t, clip, 1, 7);
    expect(t.range.s).toBe(0.7);
    expect(trackSpan(t, clip)).toEqual({ s: 7, e: 10 });
  });
  it('a new style changes how long it lasts, not when it hits', () => {
    const t = newImpact(1, clip, FX, 'punch', 2, 1);
    setHit(t, clip, 1, undefined, 'blast');
    expect(t.impact).toBe('blast');
    expect(t.range.s).toBe(0.2);
    expect(t.range.e).toBe(1);
  });
  it('stretching plays the burst slower, squeezing faster, within limits', () => {
    const t = newImpact(1, clip, FX, 'punch', 1, 1); // 0.45 s at 0.1
    expect(impactSpeed(t)).toBeCloseTo(1);
    expect(setRange(t, { e: 1 }, 1, clip)).toBe(true); // 0.9 s: half speed
    expect(impactSpeed(t)).toBeCloseTo(0.5);
    expect(setRange(t, { e: 0.15 }, 1, clip)).toBe(false); // 0.05 s would be 9x faster
    expect(impactSpeed(t)).toBeCloseTo(0.5);
  });
  it('moving the start moves the hit', () => {
    const t = newImpact(1, clip, FX, 'punch', 1, 1);
    setRange(t, { s: 0.3 }, 1, clip);
    expect(hitFrame(t, clip)).toBe(3);
  });
  it('a stretched impact keeps its length through a move or a new style', () => {
    const t = newImpact(1, clip, FX, 'punch', 1, 2);
    setRange(t, { e: 1.0 }, 2, clip); // 0.9 s
    setHit(t, clip, 2, 5, 'blast');
    expect(t.range.s).toBe(0.5);
    expect(t.range.e).toBeCloseTo(1.4);
  });
});

describe('impact families', () => {
  it('are all pinned to the scene, named by what they are', () => {
    const boom = newImpact(3, clip, FX, 'grenade', 5, 3);
    expect(boom.name).toBe('Explosion 3');
    expect(isPinned(boom)).toBe(true);
    const hit = newImpact(4, clip, FX, 'punch', 5, 3);
    expect(hit.name).toBe('Impact 4');
    expect(isPinned(hit)).toBe(true);
    expect(isPinned(newTrack(6, clip, FX, { s: 0, e: 1 }))).toBe(false);
    const wave = newImpact(5, clip, FX, 'ground', 5, 3);
    expect(wave.name).toBe('Shockwave 5');
    expect(isPinned(wave)).toBe(true);
  });
});
