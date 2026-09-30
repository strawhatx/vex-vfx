import { describe, expect, it } from 'vitest';
import { encodeRle, paintRle, type Shape } from '@/domain/tracking/types';
import { PLAIN_EDGE, clampEdge, withEdge, type EdgeSettings } from './edge';

const W = 100,
  H = 100;

// an outline with these pixels on
function outline(on: (x: number, y: number) => boolean): Shape {
  const m = new Uint8Array(W * H);
  let x0 = W,
    y0 = H,
    x1 = -1,
    y1 = -1;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      if (on(x, y)) {
        m[y * W + x] = 1;
        [x0, y0, x1, y1] = [Math.min(x0, x), Math.min(y0, y), Math.max(x1, x), Math.max(y1, y)];
      }
  return {
    id: 1,
    cx: (x0 + x1) / 2,
    cy: (y0 + y1) / 2,
    w: x1 - x0 + 1,
    h: y1 - y0 + 1,
    mask: encodeRle(m, W, x0, y0, x1, y1),
  };
}

const block = (x0: number, y0: number, x1: number, y1: number) =>
  outline((x, y) => x >= x0 && x <= x1 && y >= y0 && y <= y1);

function on(s: Shape | null) {
  const m = new Uint8Array(W * H);
  if (s?.mask) paintRle(s.mask, m, W, H);
  return (x: number, y: number) => m[y * W + x] === 1;
}

const edge = (p: Partial<EdgeSettings>) => ({ ...PLAIN_EDGE, ...p });
const only = (s: Shape) => () => s;

describe('a cutout’s edge settings', () => {
  it('without any, leave the outline as it is', () => {
    const s = block(20, 20, 60, 60);
    expect(withEdge(only(s), 0, PLAIN_EDGE)).toBe(s);
    expect(withEdge(only(s), 0, edge({ feather: 8 }))).toBe(s); // (feather only softens the cut)
  });

  it('grow moves the edge out, and below 0 in', () => {
    const s = block(20, 20, 60, 60);
    expect(withEdge(only(s), 0, edge({ grow: 3 }))).toMatchObject({ w: 47, h: 47 });
    expect(withEdge(only(s), 0, edge({ grow: -3 }))).toMatchObject({ w: 35, h: 35 });
  });

  it('smooth drops a spike and fills a notch', () => {
    const s = outline(
      (x, y) =>
        (x >= 20 && x <= 60 && y >= 20 && y <= 60 && !(x === 40 && y >= 20 && y <= 23)) || // a notch
        (y === 40 && x > 60 && x <= 66), // a spike
    );
    const is = on(withEdge(only(s), 0, edge({ smooth: 2 })));
    expect(is(40, 21)).toBe(true);
    expect(is(64, 40)).toBe(false);
    expect(is(40, 40)).toBe(true);
  });

  it('steady fills in a piece missing from one frame, lined up by where the object is', () => {
    // frames 0 and 2 have an arm; frame 1 (moved 5 px right) lost it
    const arm = (dx: number) =>
      outline(
        (x, y) =>
          (x >= 20 + dx && x <= 40 + dx && y >= 20 && y <= 60) ||
          (x > 40 + dx && x <= 55 + dx && y >= 30 && y <= 34),
      );
    const frames = [arm(0), block(25, 20, 45, 60), arm(10)];
    const s = withEdge(k => frames[k] ?? null, 1, edge({ steady: 1 }));
    // (weights 0.5, 1, 0.5: the arm is on in half of it, which is kept)
    expect(on(s)(52, 32)).toBe(true);
    expect(on(s)(35, 50)).toBe(true);
  });

  it('keeps the settings within their limits', () => {
    expect(clampEdge({ feather: 99, smooth: -1, grow: -20, steady: 1.5 })).toEqual({
      feather: 20,
      smooth: 0,
      grow: -6,
      steady: 1.5,
    });
  });
});
