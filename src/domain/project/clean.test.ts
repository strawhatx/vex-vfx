import { describe, expect, it } from 'vitest';
import { encodeRle, paintRle, type Shape } from '@/domain/tracking/types';
import { cleanShape } from './clean';

const W = 200,
  H = 200;

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

function on(s: Shape) {
  const m = new Uint8Array(W * H);
  paintRle(s.mask!, m, W, H);
  return (x: number, y: number) => m[y * W + x] === 1;
}

const body = (x: number, y: number) => x >= 40 && x < 120 && y >= 30 && y < 170;

describe('cleaning up an outline', () => {
  it('leaves a clean one as it is', () => {
    const s = outline(body);
    expect(cleanShape(s)).toBe(s);
  });

  it('drops specks and fills small holes', () => {
    const s = cleanShape(
      outline(
        (x, y) =>
          (body(x, y) && !(x >= 70 && x < 75 && y >= 80 && y < 85)) || // a 5 x 5 hole
          (x >= 150 && x < 153 && y >= 20 && y < 23), // a 3 x 3 speck
      ),
    );
    expect(on(s)(72, 82)).toBe(true);
    expect(on(s)(151, 21)).toBe(false);
    expect(s).toMatchObject({ w: 80, h: 140 });
  });

  it('keeps big pieces apart from it, and big gaps in it', () => {
    const s = cleanShape(
      outline(
        (x, y) =>
          (body(x, y) && !(x >= 60 && x < 100 && y >= 60 && y < 100)) || // a 40 x 40 gap
          (x >= 140 && x < 160 && y >= 40 && y < 80), // an arm, apart from the body
      ),
    );
    expect(on(s)(80, 80)).toBe(false);
    expect(on(s)(150, 60)).toBe(true);
  });
});
