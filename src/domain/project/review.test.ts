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

  it('finds the next and previous doubtful frame', () => {
    const flags = reviewFlags([block(10, 10), null, block(10, 10), block(10, 10), null], 0, 5);
    expect(nextFlagged(flags, 0, 1)).toBe(1);
    expect(nextFlagged(flags, 1, 1)).toBe(4);
    expect(nextFlagged(flags, 4, -1)).toBe(1);
    expect(nextFlagged(flags, 4, 1)).toBe(-1);
  });
});
