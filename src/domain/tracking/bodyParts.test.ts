import { describe, expect, it } from 'vitest';
import {
  POSE,
  fillPolygon,
  handFor,
  hull,
  partNearest,
  partOutlines,
  person,
  personAt,
  samePerson,
  shapeFrom,
  sideFor,
  type Pt,
} from './bodyParts';

// a person facing the camera at x offset `dx`: their left side is on the screen's right
function pose(dx = 0): Pt[] {
  const p: Pt[] = Array.from({ length: 33 }, () => ({ x: 100 + dx, y: 100 }));
  const set = (i: number, x: number, y: number) => {
    p[i] = { x: x + dx, y };
  };
  set(POSE.nose, 100, 40);
  set(POSE.eyeL, 106, 34);
  set(POSE.eyeR, 94, 34);
  set(POSE.earL, 114, 38);
  set(POSE.earR, 86, 38);
  set(POSE.shoulderL, 125, 70);
  set(POSE.shoulderR, 75, 70);
  set(POSE.hipL, 118, 140);
  set(POSE.hipR, 82, 140);
  // arms out to the sides: their left wrist on the screen's right
  for (const [pair, x] of [
    [POSE.wrist, 170],
    [POSE.index, 178],
    [POSE.pinky, 176],
    [POSE.thumb, 172],
  ] as const) {
    set(pair[0], x, 110);
    set(pair[1], 200 - x, 110);
  }
  for (const [pair, y] of [
    [POSE.ankle, 210],
    [POSE.heel, 214],
    [POSE.toe, 216],
  ] as const) {
    set(pair[0], 115, y);
    set(pair[1], 85, y);
  }
  return p;
}

describe('picking a person', () => {
  it('takes the person tapped, not someone else', () => {
    const a = person(pose(0)),
      b = person(pose(300));
    expect(personAt([a, b], { x: 170, y: 112 })).toBe(a);
    expect(personAt([a, b], { x: 470, y: 112 })).toBe(b);
  });
  it('is nobody when the tap is away from everyone', () => {
    expect(personAt([person(pose(0))], { x: 700, y: 20 })).toBeNull();
  });
  it('follows the same person to the next frame, even with someone else nearby', () => {
    const a = person(pose(0)),
      b = person(pose(160));
    expect(samePerson([b, person(pose(8))], a)!.center.x).toBeCloseTo(a.center.x + 8);
    expect(samePerson([person(pose(600))], a)).toBeNull();
  });
});

describe('the part nearest the tap', () => {
  const p = person(pose());
  it('finds eyes, head, hands and feet by where they are on screen', () => {
    expect(partNearest(p, { x: 94, y: 35 })).toBe('eyes');
    expect(partNearest(p, { x: 100, y: 45 })).toBe('head');
    expect(partNearest(p, { x: 28, y: 110 })).toBe('handL'); // screen left = their right hand
    expect(partNearest(p, { x: 172, y: 110 })).toBe('handR');
    expect(partNearest(p, { x: 84, y: 212 })).toBe('footL');
    expect(partNearest(p, { x: 100, y: 110 })).toBe('body');
  });
  it("maps screen left and right to the person's own sides", () => {
    expect(sideFor(p, 'handL')).toBe(1); // their right wrist is on the screen's left
    expect(sideFor(p, 'handR')).toBe(0);
  });
});

describe('outlines', () => {
  const p = person(pose());
  it('a hand uses the hand model when it found the hand at that wrist', () => {
    const hand = Array.from({ length: 21 }, (_, k) => ({
      x: 20 + (k % 5) * 3,
      y: 100 + Math.floor(k / 5) * 4,
    }));
    expect(handFor([hand], p, 1)).toBe(hand);
    expect(handFor([hand], p, 0)).toBeNull(); // too far from their left wrist
    const [outline] = partOutlines('handL', p, 1, hand, null);
    expect(Math.min(...outline.map(q => q.x))).toBeLessThan(20);
  });
  it('without a face model, eyes are two small circles', () => {
    const outlines = partOutlines('eyes', p, 0, null, null);
    expect(outlines).toHaveLength(2);
  });
  it('fills outlines into a shape with its box', () => {
    const W = 300,
      H = 300,
      mask = new Uint8Array(W * H);
    const s = shapeFrom(partOutlines('eyes', p, 0, null, null), W, H, mask)!;
    expect(Math.abs(s.cx - 100)).toBeLessThan(1);
    expect(Math.abs(s.cy - 34)).toBeLessThan(1);
    expect(s.w).toBeGreaterThan(12);
    expect(s.mask).toBeDefined();
  });
});

describe('geometry', () => {
  it('hull keeps only the outside points', () => {
    const h = hull([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
      { x: 5, y: 5 },
    ]);
    expect(h).toHaveLength(4);
  });
  it('fillPolygon fills a square', () => {
    const W = 20,
      H = 20,
      mask = new Uint8Array(W * H);
    const b = fillPolygon(
      [
        { x: 2, y: 2 },
        { x: 12, y: 2 },
        { x: 12, y: 12 },
        { x: 2, y: 12 },
      ],
      W,
      H,
      mask,
    )!;
    expect(b).toEqual({ x0: 2, y0: 2, x1: 11, y1: 11 });
    expect(mask.reduce((a, v) => a + v, 0)).toBe(100);
  });
});
