import { describe, expect, it } from 'vitest';
import { encodeRle, paintRle, type Shape } from '@/domain/tracking/types';
import { withParts, type Part } from './parts';

const W = 100,
  H = 100;

// an outline covering these boxes
function outline(...boxes: [number, number, number, number][]): Shape {
  const m = new Uint8Array(W * H);
  let x0 = W,
    y0 = H,
    x1 = -1,
    y1 = -1;
  for (const [a, b, c, d] of boxes) {
    for (let y = b; y <= d; y++) for (let x = a; x <= c; x++) m[y * W + x] = 1;
    [x0, y0, x1, y1] = [Math.min(x0, a), Math.min(y0, b), Math.max(x1, c), Math.max(y1, d)];
  }
  return {
    id: 3,
    cx: (x0 + x1) / 2,
    cy: (y0 + y1) / 2,
    w: x1 - x0 + 1,
    h: y1 - y0 + 1,
    mask: encodeRle(m, W, x0, y0, x1, y1),
  };
}

function on(s: Shape | null) {
  const m = new Uint8Array(W * H);
  if (s?.mask) paintRle(s.mask, m, W, H);
  return (x: number, y: number) => m[y * W + x] === 1;
}

const rect = (x0: number, y0: number, x1: number, y1: number) => [
  { x: x0, y: y0 },
  { x: x1, y: y0 },
  { x: x1, y: y1 },
  { x: x0, y: y1 },
];

let nextId = 1;
const tapped = (op: Part['op'], shapes: (Shape | null)[]): Part => ({
  id: nextId++,
  op,
  i: 0,
  at: { x: 0, y: 0 },
  loop: null,
  shapes,
});
const drawn = (op: Part['op'], i: number, loop: { x: number; y: number }[]): Part => ({
  id: nextId++,
  op,
  i,
  at: null,
  loop,
  shapes: [],
});

describe('pieces added to and taken out of an outline', () => {
  const body = outline([20, 20, 50, 80]);

  it('without any, is what tracking found', () => {
    expect(withParts([body], [], 0)).toBe(body);
  });

  it('keeps what was found and adds a tapped piece to it', () => {
    const bag = outline([51, 40, 65, 60]);
    const s = withParts([body], [tapped('add', [bag])], 0);
    expect(on(s)(30, 30)).toBe(true);
    expect(on(s)(60, 50)).toBe(true);
    expect(s).toMatchObject({ w: 46, id: 3 });
  });

  it('takes a tapped piece out', () => {
    const wall = outline([20, 20, 50, 30]);
    const s = withParts([body], [tapped('remove', [wall])], 0);
    expect(on(s)(30, 25)).toBe(false);
    expect(on(s)(30, 50)).toBe(true);
  });

  it('carries a drawn loop along with the object', () => {
    // drawn on frame 0; by frame 1 the object has moved 10 px right
    const moved = outline([30, 20, 60, 80]);
    const loop = drawn('add', 0, rect(52, 40, 70, 60));
    expect(on(withParts([body, moved], [loop], 0))(55, 50)).toBe(true);
    const s = withParts([body, moved], [loop], 1);
    expect(on(s)(75, 50)).toBe(true);
    expect(on(s)(53, 50)).toBe(true); // (the object's own body is there now)
  });

  it('a later piece wins where they overlap', () => {
    const cut = drawn('remove', 0, rect(20, 20, 50, 50));
    const back = drawn('add', 0, rect(20, 20, 35, 35));
    const s = withParts([body], [cut, back], 0);
    expect(on(s)(25, 25)).toBe(true);
    expect(on(s)(45, 45)).toBe(false);
    expect(on(s)(30, 70)).toBe(true);
  });

  it('adds a piece where tracking found nothing, and is nothing when all is taken out', () => {
    expect(on(withParts([null], [drawn('add', 0, rect(10, 10, 30, 30))], 0))(20, 20)).toBe(true);
    expect(withParts([body], [drawn('remove', 0, rect(0, 0, 99, 99))], 0)).toBeNull();
  });
});
