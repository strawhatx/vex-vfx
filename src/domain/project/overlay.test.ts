import { describe, expect, it } from 'vitest';
import { NO_ANIM } from '../effects/animation';
import { STILL } from './cutout';
import {
  fitRect,
  frameAt,
  overlayAt,
  overlayTransform,
  placedBox,
  showingAt,
  trimSpan,
  upgradeOverlay,
  type Overlay,
} from './overlay';

// cut from 2..4 s of its video (frames every 0.5 s)
const o: Overlay = {
  ...STILL,
  id: 7,
  name: 'Cutout 7',
  color: '#fff',
  row: null,
  source: { reel: 1, track: 7 },
  aspect: 2,
  src: { s: 2, e: 4 },
  frames: [2, 2.5, 3, 3.5].map(t => ({ t, cx: 0.5, cy: 0.5, w: 0.2, h: 0.4 })),
  anim: NO_ANIM,
};

describe('a subject layer', () => {
  it('shows the frames it was cut from, by its video’s own time', () => {
    expect(showingAt(o, 1.9)).toBe(false);
    expect(showingAt(o, 2)).toBe(true);
    expect(frameAt(o, 1.9)).toBeNull();
    expect(frameAt(o, 2)?.t).toBe(2);
    expect(frameAt(o, 3.2)?.t).toBe(3);
    expect(frameAt(o, 4)).toBeNull();
  });

  it('sits in the picture as its video would, bars and all', () => {
    // a 2:1 video in a square picture: bars above and below
    expect(fitRect(2, 100, 100)).toEqual({ x: 0, y: 25, w: 100, h: 50 });
    const b = placedBox({ ...o, base: { ...o.base, x: 0.1 } }, 2, 100, 100)!;
    expect(b.pivot).toEqual({ x: 50, y: 50 });
    expect(b.at).toEqual({ x: 60, y: 50 });
    expect([b.w, b.h]).toEqual([20, 20]);
  });

  it('is found under a tap where it’s placed, scaled and turned', () => {
    const big = { ...o, base: { ...o.base, scale: 2 } };
    expect(overlayAt([big], 2, 50 + 15, 50, 100, 100)?.id).toBe(7);
    expect(overlayAt([o], 2, 50 + 15, 50, 100, 100)).toBeNull();
    expect(overlayAt([o], 5, 50, 50, 100, 100)).toBeNull();
  });

  it('trimmed, is cut from more or less of its video, within it, never too short', () => {
    expect(trimSpan(o.src, { s: 2.5 }, { s: 0, e: 8 })).toEqual({ s: 2.5, e: 4 });
    expect(trimSpan(o.src, { s: -1 }, { s: 0, e: 8 })).toEqual({ s: 0, e: 4 });
    expect(trimSpan(o.src, { e: 9 }, { s: 0, e: 8 })).toEqual({ s: 2, e: 8 });
    const short = trimSpan(o.src, { s: 3.99 }, { s: 0, e: 8 });
    expect(short.s).toBeCloseTo(3.9);
    expect(short.e).toBe(4);
  });

  it('keyframes are at times in its video, so trimming it leaves them where they are', () => {
    const keyed = { ...o, keys: [{ ...o.base, x: 0.2, t: 3 }] };
    expect(overlayTransform({ ...keyed, src: { s: 2.5, e: 4 } }, 3).x).toBe(0.2);
  });

  it('saved as it was, placed in the film, has its keyframes timed in its video', () => {
    const old = { ...o, at: 10, keys: [{ ...o.base, t: 1 }] };
    const now = upgradeOverlay(old);
    expect('at' in now).toBe(false);
    expect(now.keys[0].t).toBe(3);
    expect(upgradeOverlay(o)).toBe(o);
  });
});
