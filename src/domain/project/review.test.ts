import { describe, expect, it } from 'vitest';
import { encodeRle, type Shape } from '@/domain/tracking/types';
import { nextFlagged, reviewFlags, rleArea } from './review';

// a w x h block as an outline
function block(w: number, h: number, lost = false): Shape {
  const W = 100,
    mask = new Uint8Array(W * 100);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) mask[y * W + x] = 1;
  return { id: 1, cx: w / 2, cy: h / 2, w, h, mask: encodeRle(mask, W, 0, 0, w - 1, h - 1), lost };
}

describe('the frames of a cutout to check', () => {
  it('counts an outline’s pixels', () => {
    expect(rleArea(block(10, 4).mask!)).toBe(40);
  });

  it('flags frames with no outline, a lost object, or a sudden change of size', () => {
    const shapes = [null, block(10, 10), block(10, 11), block(10, 5), block(10, 5, true), null];
    expect(reviewFlags(shapes, 0, 6)).toEqual(['missing', 'ok', 'ok', 'jump', 'lost', 'missing']);
  });

  it('flags a piece coming back as well as going', () => {
    const shapes = [block(10, 10), block(10, 5), block(10, 10)];
    expect(reviewFlags(shapes, 0, 3)).toEqual(['ok', 'jump', 'jump']);
  });

  it('only looks at the frames asked for', () => {
    const shapes = [null, block(10, 10), block(10, 2)];
    expect(reviewFlags(shapes, 1, 2)).toEqual(['ok']);
  });

  it('flags an outline that changes shape though not size, but not one that just moves', () => {
    const W = 100;
    const shape = (on: (x: number, y: number) => boolean): Shape => {
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
        id: 1,
        cx: (x0 + x1) / 2,
        cy: (y0 + y1) / 2,
        w: x1 - x0 + 1,
        h: y1 - y0 + 1,
        mask: encodeRle(m, W, x0, y0, x1, y1),
      };
    };
    const tall = shape((x, y) => x >= 40 && x < 50 && y >= 20 && y < 60), // 10 x 40
      moved = shape((x, y) => x >= 60 && x < 70 && y >= 25 && y < 65),
      wide = shape((x, y) => x >= 30 && x < 70 && y >= 35 && y < 45); // 40 x 10: the same size
    expect(reviewFlags([tall, moved, wide], 0, 3)).toEqual(['ok', 'ok', 'jump']);
  });

  it('finds the next and previous doubtful frame', () => {
    const flags = reviewFlags([block(10, 10), null, block(10, 10), block(10, 10), null], 0, 5);
    expect(nextFlagged(flags, 0, 1)).toBe(1);
    expect(nextFlagged(flags, 1, 1)).toBe(4);
    expect(nextFlagged(flags, 4, -1)).toBe(1);
    expect(nextFlagged(flags, 4, 1)).toBe(-1);
  });
});
