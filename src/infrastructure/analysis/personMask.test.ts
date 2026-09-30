import { describe, expect, it } from 'vitest';
import { POSE, person, type Pt } from '@/domain/tracking/bodyParts';
import { personPixels, type Follow } from './personMask';

const W = 200,
  H = 160;

// a person standing at x = cx, arms down: head at the top, feet at y 130
function standing(cx: number) {
  const p: Pt[] = Array.from({ length: 33 }, () => ({ x: cx, y: 60 }));
  const set = (i: number, dx: number, y: number) => (p[i] = { x: cx + dx, y });
  set(POSE.nose, 0, 20);
  set(POSE.earL, 5, 18);
  set(POSE.earR, -5, 18);
  set(POSE.shoulderL, 10, 35);
  set(POSE.shoulderR, -10, 35);
  set(13, 13, 55);
  set(14, -13, 55);
  for (const s of [0, 1] as const) {
    const side = s === 0 ? 1 : -1;
    set(POSE.wrist[s], 14 * side, 75);
    set(POSE.index[s], 14 * side, 80);
    set(POSE.ankle[s], 7 * side, 130);
    set(POSE.toe[s], 9 * side, 134);
  }
  set(POSE.hipL, 7, 80);
  set(POSE.hipR, -7, 80);
  set(25, 7, 105);
  set(26, -7, 105);
  return person(p);
}

// a segmenter's mask with these boxes marked as people
function seg(...boxes: [number, number, number, number][]) {
  const m = new Uint8Array(W * H);
  for (const [x0, y0, x1, y1] of boxes)
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) m[y * W + x] = 1;
  return m;
}

function run(s: Uint8Array, f: Follow) {
  const mask = new Uint8Array(W * H);
  const b = personPixels(s, W, H, f, mask, new Int32Array(W * H));
  return { b, on: (x: number, y: number) => mask[y * W + x] === 1 };
}

describe('the whole person’s outline', () => {
  it('keeps the person’s outline, filled in', () => {
    const s = seg([80, 15, 120, 135]);
    s[70 * W + 100] = 0; // a hole in it
    const { b, on } = run(s, { who: standing(100), others: [] });
    expect(b).toEqual({ bx0: 80, by0: 15, bx1: 120, by1: 135 });
    expect(on(100, 70)).toBe(true);
  });

  it('drops a patch the segmenter marked that isn’t them', () => {
    const { on } = run(seg([80, 15, 120, 135], [160, 20, 180, 40]), { who: standing(100), others: [] });
    expect(on(100, 60)).toBe(true);
    expect(on(170, 30)).toBe(false);
  });

  it('splits two people touching between them', () => {
    // one piece covering both: the person at 80 and someone at 130
    const { on } = run(seg([60, 15, 150, 135]), { who: standing(80), others: [standing(130)] });
    expect(on(80, 60)).toBe(true);
    expect(on(100, 60)).toBe(true);
    expect(on(110, 60)).toBe(false);
    expect(on(130, 60)).toBe(false);
  });

  it('keeps following them by last frame’s outline when the pose isn’t found', () => {
    const prev = seg([80, 15, 120, 135]);
    // they've moved 6 px right; someone else is off to the side
    const { on } = run(seg([86, 15, 126, 135], [10, 15, 40, 135]), { who: null, others: [], prev });
    expect(on(100, 60)).toBe(true);
    expect(on(20, 60)).toBe(false);
  });

  it('takes the piece tapped on the first frame when there’s no pose', () => {
    const { on } = run(seg([80, 15, 120, 135], [10, 15, 40, 135]), {
      who: null,
      others: [],
      prev: null,
      seed: { x: 25, y: 60 },
    });
    expect(on(25, 60)).toBe(true);
    expect(on(100, 60)).toBe(false);
  });

  it('finds nothing when none of it is theirs', () => {
    expect(run(seg([10, 15, 40, 135]), { who: standing(150), others: [] }).b).toBeNull();
  });
});
