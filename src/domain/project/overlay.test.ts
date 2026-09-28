import { describe, expect, it } from 'vitest';
import { STILL } from './cutout';
import { fitRect, frameAt, overlayAt, placedBox, shownRange, trimmed, type Overlay } from './overlay';

// cut from 2..4 s of its video (frames every 0.5 s), placed at 10 s in the film
const o: Overlay = {
  ...STILL,
  id: 7,
  name: 'Cutout 7',
  color: '#fff',
  row: null,
  source: { reel: 1, track: 7 },
  aspect: 2,
  at: 10,
  src: { s: 2, e: 4 },
  frames: [2, 2.5, 3, 3.5].map(t => ({ t, cx: 0.5, cy: 0.5, w: 0.2, h: 0.4 })),
};

describe('an overlay', () => {
  it('shows the stretch it was cut from, from where it’s placed', () => {
    expect(shownRange(o)).toEqual({ s: 10, e: 12 });
    expect(frameAt(o, 9.9)).toBeNull();
    expect(frameAt(o, 10)?.t).toBe(2);
    expect(frameAt(o, 11.2)?.t).toBe(3);
    expect(frameAt(o, 12)).toBeNull();
  });

  it('sits in the picture as its video would, bars and all', () => {
    // a 2:1 video in a square picture: bars above and below
    expect(fitRect(2, 100, 100)).toEqual({ x: 0, y: 25, w: 100, h: 50 });
    const b = placedBox({ ...o, base: { ...o.base, x: 0.1 } }, 10, 100, 100)!;
    expect(b.pivot).toEqual({ x: 50, y: 50 });
    expect(b.at).toEqual({ x: 60, y: 50 });
    expect([b.w, b.h]).toEqual([20, 20]);
  });

  it('is found under a tap where it’s placed, scaled and turned', () => {
    const big = { ...o, base: { ...o.base, scale: 2 } };
    expect(overlayAt([big], 10, 50 + 15, 50, 100, 100)?.id).toBe(7);
    expect(overlayAt([o], 10, 50 + 15, 50, 100, 100)).toBeNull();
    expect(overlayAt([o], 13, 50, 50, 100, 100)).toBeNull();
  });

  it('trimmed, keeps what shows where it is, within what was cut', () => {
    // its start 0.5 s later: plays from 2.5 s of its video
    expect(trimmed(o, { s: 10.5 }, { s: 2, e: 4 })).toMatchObject({ at: 10.5, src: { s: 2.5, e: 4 } });
    // not before the first frame cut
    expect(trimmed(o, { s: 9 }, { s: 2, e: 4 })).toMatchObject({ at: 10, src: { s: 2, e: 4 } });
    // its end earlier
    expect(trimmed(o, { e: 11 }, { s: 2, e: 4 })).toMatchObject({ at: 10, src: { s: 2, e: 3 } });
    // with more of its video to cut from, it can grow
    expect(trimmed(o, { e: 13 }, { s: 0, e: 8 }).src).toEqual({ s: 2, e: 5 });
  });

  it('keyframes stay where they are in the film when its start moves', () => {
    const keyed = { ...o, keys: [{ ...o.base, t: 1 }] };
    expect(trimmed(keyed, { s: 10.5 }, { s: 2, e: 4 }).keys[0].t).toBe(0.5);
  });
});
