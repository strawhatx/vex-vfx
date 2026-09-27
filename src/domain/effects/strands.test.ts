import { describe, expect, it } from 'vitest';
import {
  DEFAULT_STRAND,
  SEGMENTS,
  resample,
  simulate,
  type StrandInput,
  type StrandSettings,
} from './strands';

const unit = 100; // a 100 px tall frame
// frames at 30 fps with the anchor at `at(k)`
const frames = (count: number, at: (k: number) => { x: number; y: number } | null, end = null) =>
  Array.from({ length: count }, (_, k): StrandInput => ({
    at: at(k),
    end,
    t: k / 30,
    dt: 1 / 30,
    u: k / (count - 1),
    restart: k === 0,
  }));
const settings = (p: Partial<StrandSettings>): StrandSettings => ({ ...DEFAULT_STRAND, ...p });
const len = (pts: { x: number; y: number }[]) =>
  pts.slice(1).reduce((d, q, k) => d + Math.hypot(q.x - pts[k].x, q.y - pts[k].y), 0);

describe('a path’s strand', () => {
  it('starts at rest, pointing its way from the anchor, as long as asked', () => {
    const [f] = simulate(
      frames(1, () => ({ x: 10, y: 10 })),
      settings({ length: 0.5, dir: 0 }),
      null,
      unit,
    );
    expect(f!.pts).toHaveLength(SEGMENTS + 1);
    expect(f!.pts[0]).toEqual({ x: 10, y: 10 });
    expect(f!.pts[SEGMENTS].x).toBeCloseTo(60, 0);
    expect(f!.pts[SEGMENTS].y).toBeCloseTo(10, 0);
  });

  it('a rope hangs down under its weight, keeping its length', () => {
    const out = simulate(
      frames(120, () => ({ x: 50, y: 0 })),
      settings({ form: 'rope', length: 0.5 }),
      null,
      unit,
    );
    const last = out.at(-1)!.pts;
    expect(last[SEGMENTS].y).toBeGreaterThan(35);
    expect(Math.abs(last[SEGMENTS].x - 50)).toBeLessThan(15);
    expect(len(last)).toBeCloseTo(50, -1);
  });

  it('a whip lags behind its handle, then snaps: its tip goes faster than the hand', () => {
    // the hand swings up and stops
    const at = (k: number) => ({ x: 20, y: 80 - Math.min(k, 10) * 6 });
    const out = simulate(frames(40, at), settings({ form: 'whip', length: 0.6 }), null, unit);
    const handSpeed = (6 * 30) / unit;
    expect(Math.max(...out.map(f => f!.tip))).toBeGreaterThan(handSpeed);
    // it follows the hand
    expect(out.at(-1)!.pts[0]).toEqual(at(39));
  });

  it('is hidden (but held) where its anchor is lost', () => {
    const out = simulate(
      frames(3, k => (k === 1 ? null : { x: 0, y: 0 })),
      settings({ form: 'rope' }),
      null,
      unit,
    );
    expect(out[1]).toBeNull();
    expect(out[2]).not.toBeNull();
  });

  it('comes out the same every time', () => {
    const run = () =>
      simulate(
        frames(30, k => ({ x: k, y: 50 })),
        settings({ form: 'tentacle' }),
        null,
        unit,
      );
    expect(run()).toEqual(run());
  });

  it('holds a far end where it’s attached', () => {
    const end = { x: 90, y: 0 };
    const input = frames(30, () => ({ x: 0, y: 0 })).map(f => ({ ...f, end }));
    const out = simulate(input, settings({ form: 'rope', length: 1.2 }), null, unit);
    expect(out.at(-1)!.pts[SEGMENTS]).toEqual(end);
    // longer than the gap, so it sags
    expect(Math.max(...out.at(-1)!.pts.map(p => p.y))).toBeGreaterThan(10);
  });

  it('keeps a drawn shape', () => {
    const drawn = [
      { x: 0, y: 0 },
      { x: 40, y: 0 },
      { x: 40, y: 40 },
    ];
    const [f] = simulate(
      frames(1, () => ({ x: 5, y: 5 })),
      settings({ form: 'tentacle' }),
      drawn,
      unit,
    );
    expect(f!.pts[SEGMENTS].x).toBeCloseTo(45, 0);
    expect(f!.pts[SEGMENTS].y).toBeCloseTo(45, 0);
  });

  it('a trail is where the anchor has been, newest first', () => {
    const out = simulate(
      frames(30, k => ({ x: k * 2, y: 0 })),
      settings({ form: 'trail', length: 0.5 }),
      null,
      unit,
    );
    const pts = out.at(-1)!.pts;
    expect(pts[0].x).toBeCloseTo(58);
    // half a second back
    expect(pts.at(-1)!.x).toBeCloseTo(58 - 30, -1);
  });

  it('a trail along a drawn line travels it over the clip', () => {
    const drawn = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ];
    const out = simulate(
      frames(11, () => ({ x: 0, y: 0 })),
      settings({ form: 'trail', length: 0.4 }),
      drawn,
      unit,
    );
    const heads = out.filter(Boolean).map(f => f!.pts[0].x);
    expect(heads.at(-1)).toBeCloseTo(100);
    for (let k = 1; k < heads.length; k++) expect(heads[k]).toBeGreaterThanOrEqual(heads[k - 1]);
  });

  it('a beam is straight and rigid', () => {
    const [f] = simulate(
      frames(1, () => ({ x: 0, y: 0 })),
      settings({ form: 'beam', length: 1, dir: 90 }),
      null,
      unit,
    );
    expect(f!.pts[SEGMENTS].x).toBeCloseTo(0);
    expect(f!.pts[SEGMENTS].y).toBeCloseTo(100);
  });
});

describe('resample', () => {
  it('spaces points evenly along the line', () => {
    const r = resample(
      [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
      ],
      4,
    );
    expect(r.map(p => [Math.round(p.x), Math.round(p.y)])).toEqual([
      [0, 0],
      [5, 0],
      [10, 0],
      [10, 5],
      [10, 10],
    ]);
  });
});

describe('held at both ends', () => {
  it('a rope shorter than the gap is lengthened enough to sag', () => {
    const end = { x: 90, y: 0 };
    const input = frames(60, () => ({ x: 0, y: 0 })).map(f => ({ ...f, end }));
    const out = simulate(input, settings({ form: 'rope', length: 0.3 }), null, unit);
    expect(Math.max(...out.at(-1)!.pts.map(p => p.y))).toBeGreaterThan(15);
  });
});
