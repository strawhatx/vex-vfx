import { describe, expect, it } from 'vitest';
import type { FxSettings } from '../effects/palettes';
import { parsePreset } from '../effects/presets';
import { encodeRle, paintRle, type ClipFrame, type Shape } from '../tracking/types';
import {
  hitFrame,
  impactSpeed,
  isPinned,
  nearestOther,
  newImpact,
  objectPasses,
  newTrack,
  assignRows,
  copiedInto,
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

describe('assignRows', () => {
  const auto = (ranges: { s: number; e: number }[]) =>
    assignRows(
      ranges,
      ranges.map(() => null),
    );
  it('puts effects that follow each other on one row', () => {
    expect(
      auto([
        { s: 0, e: 2 },
        { s: 2, e: 4 },
        { s: 5, e: 6 },
      ]),
    ).toEqual([0, 0, 0]);
  });
  it('stacks overlapping effects on new rows, reusing a row once it is free', () => {
    expect(
      auto([
        { s: 0, e: 3 },
        { s: 1, e: 2 },
        { s: 2.5, e: 4 },
        { s: 3, e: 5 },
      ]),
    ).toEqual([0, 1, 1, 0]);
  });
  it('goes by start time, not the order the effects were added', () => {
    expect(
      auto([
        { s: 4, e: 5 },
        { s: 0, e: 1 },
      ]),
    ).toEqual([0, 0]);
  });
  it('keeps each on the row it was put on, even with room above', () => {
    expect(
      assignRows(
        [
          { s: 0, e: 1 },
          { s: 2, e: 3 },
        ],
        [0, 1],
      ),
    ).toEqual([0, 1]);
  });
  it('one put on a taken row goes to the next free one below', () => {
    expect(
      assignRows(
        [
          { s: 0, e: 2 },
          { s: 1, e: 3 },
        ],
        [0, 0],
      ),
    ).toEqual([0, 1]);
  });
  it('empty rows close up; a new row on top comes first', () => {
    expect(
      assignRows(
        [
          { s: 0, e: 1 },
          { s: 0, e: 1 },
        ],
        [3, -1],
      ),
    ).toEqual([1, 0]);
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
  it('marks as weak a frame whose outline suddenly changes shape, and steadies the edge', () => {
    // a 10 x 40 outline; in frame 5 it's caught something else (40 x 10), and in frame 7 a piece of
    // it drops out for just that frame
    const W = 100;
    const outline = (on: (x: number, y: number) => boolean): Shape => {
      const m = new Uint8Array(W * 100);
      let x0 = W,
        y0 = 100,
        x1 = -1,
        y1 = -1;
      for (let y = 0; y < 100; y++)
        for (let x = 0; x < W; x++)
          if (on(x, y)) {
            m[y * W + x] = 1;
            [x0, y0, x1, y1] = [Math.min(x0, x), Math.min(y0, y), Math.max(x1, x), Math.max(y1, y)];
          }
      return {
        id: 0,
        cx: (x0 + x1) / 2,
        cy: (y0 + y1) / 2,
        w: x1 - x0 + 1,
        h: y1 - y0 + 1,
        mask: encodeRle(m, W, x0, y0, x1, y1),
      };
    };
    const tall = outline((x, y) => x >= 40 && x < 50 && y >= 20 && y < 60);
    const t = tracked(1, 10);
    t.shapes = t.shapes.map(() => tall);
    t.shapes[5] = outline((x, y) => x >= 25 && x < 65 && y >= 35 && y < 45);
    t.shapes[7] = outline((x, y) => x >= 40 && x < 50 && y >= 20 && y < 60 && !(y >= 40 && y < 46));
    refreshFrames(t, clip);
    const weak = toLane(t, clip, 0).spans.filter(s => s.weak);
    expect(weak.map(s => [+s.s.toFixed(2), +s.e.toFixed(2)])).toEqual([[0.5, 0.7]]);
    // (the frame after the odd one out jumps back, so it's weak too); frame 7's gap is filled in
    // from the frames either side
    const at7 = new Uint8Array(W * 100);
    paintRle(t.frames[7].shapes[0].mask!, at7, W, 100);
    expect(at7[43 * W + 45]).toBe(1);
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

describe('objectPasses', () => {
  it("keeps a body preset's passes, particle emitters too", () => {
    const preset = parsePreset({
      id: 'dust',
      name: 'Dust',
      group: 'body',
      length: 3,
      passes: [
        { engine: 'object', kind: 'edge' },
        { engine: 'object', kind: 'emitter' },
      ],
    });
    const t = { kind: 'effect', spot: false, fx: {} as FxSettings, body: { preset, values: {} } } as const;
    expect(objectPasses(t)?.map(p => `${p.engine}:${p.kind}`)).toEqual(['object:edge', 'object:emitter']);
  });
});

describe('copying the effects on a stretch of the video', () => {
  it('copies those on it, cut to it, numbered anew, with their tracking; not cutouts', () => {
    const a = tracked(1, 10, { s: 0.1, e: 0.5 }),
      b = tracked(2, 30, { s: 0.6, e: 0.9 }),
      hit = newImpact(3, clip, FX, 'punch', 3, 1),
      cut = { ...tracked(4, 50, { s: 0.2, e: 0.4 }), kind: 'cutout' as const };
    const copies = copiedInto([a, b, hit, cut], { s: 0.3, e: 0.7 }, 11);
    expect(copies.map(c => [c.from, c.track.id])).toEqual([
      [1, 11],
      [2, 12],
      [3, 13],
    ]);
    expect(copies.map(c => c.track.range)).toEqual([{ s: 0.3, e: 0.5 }, { s: 0.6, e: 0.7 }, hit.range]);
    expect(copies[0].track.shapes[4]).toMatchObject({ id: 11, cx: 10 });
    // (the originals are as they were)
    expect(a.range).toEqual({ s: 0.1, e: 0.5 });
    expect(a.shapes[4]?.id).toBe(0);
  });
});
