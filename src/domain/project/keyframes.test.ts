import { describe, expect, it } from 'vitest';
import { insertKey, neighboursTakingOver, ownedRange, ownerOf, type Key } from './keyframes';
import { makeShots } from './shots';

const key = (i: number, auto = false): Key => ({ i, x: 0, y: 0, auto });
// 0..29 | 30..59 | 60..89
const { shots } = makeShots(90, [30, 60]);

describe('ownedRange', () => {
  it('a lone keyframe owns its whole shot, and nothing past the cut', () => {
    const k = key(40);
    expect(ownedRange([k], k, shots[1])).toEqual([30, 60]);
  });

  it('two keyframes split the frames between them halfway', () => {
    const a = key(34), b = key(50), keys = [a, b];
    expect(ownedRange(keys, a, shots[1])).toEqual([30, 43]);
    expect(ownedRange(keys, b, shots[1])).toEqual([43, 60]);
  });

  it('keyframes in other shots are ignored', () => {
    const a = key(10), b = key(40);
    expect(ownedRange([a, b], b, shots[1])).toEqual([30, 60]);
    expect(ownedRange([a, b], a, shots[0])).toEqual([0, 30]);
  });

  it('every frame of a shot is owned by exactly one keyframe', () => {
    const keys = [key(31), key(37), key(38), key(55)];
    for (let i = 30; i < 60; i++) {
      const owners = keys.filter(k => { const [a, b] = ownedRange(keys, k, shots[1]); return i >= a && i < b; });
      expect(owners).toHaveLength(1);
    }
  });
});

describe('ownerOf', () => {
  it('finds the keyframe tracking a frame', () => {
    const a = key(34), b = key(50);
    expect(ownerOf([a, b], shots, 42)).toBe(a);
    expect(ownerOf([a, b], shots, 43)).toBe(b);
  });
  it('is null in a shot with no keyframes', () => {
    expect(ownerOf([key(34)], shots, 70)).toBeNull();
  });
});

describe('insertKey', () => {
  it('keeps keyframes in order and replaces one on the same frame', () => {
    const out = insertKey([key(10), key(50)], { i: 50, x: 9, y: 9, auto: false });
    expect(out.map(k => k.i)).toEqual([10, 50]);
    expect(out[1].x).toBe(9);
    expect(insertKey(out, key(30)).map(k => k.i)).toEqual([10, 30, 50]);
  });
});

describe('neighboursTakingOver', () => {
  it('after removing a middle keyframe, both neighbours take over its frames', () => {
    const a = key(32), mid = key(44), b = key(56);
    const [from, to] = ownedRange([a, mid, b], mid, shots[1]);
    const left = [a, b];
    expect(neighboursTakingOver(left, shots[1], from, to)).toEqual([a, b]);
  });
});
