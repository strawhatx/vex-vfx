import { describe, expect, it } from 'vitest';
import { insertKey, keysCovering, keysToRetrack, ownedRange, ownerOf, type Key } from './keyframes';

const key = (i: number): Key => ({ i, x: 0, y: 0 });
const span = { s: 30, e: 60 };

describe('ownedRange', () => {
  it('a lone keyframe owns the whole effect, and nothing outside it', () => {
    const k = key(40);
    expect(ownedRange([k], k, span)).toEqual([30, 60]);
  });

  it('two keyframes split the frames between them halfway', () => {
    const a = key(34), b = key(50), keys = [a, b];
    expect(ownedRange(keys, a, span)).toEqual([30, 43]);
    expect(ownedRange(keys, b, span)).toEqual([43, 60]);
  });

  it('keyframes outside the effect are ignored', () => {
    const a = key(10), b = key(40);
    expect(ownedRange([a, b], b, span)).toEqual([30, 60]);
  });

  it('every frame of the effect is owned by exactly one keyframe', () => {
    const keys = [key(31), key(37), key(38), key(55)];
    for (let i = 30; i < 60; i++) {
      const owners = keys.filter(k => { const [a, b] = ownedRange(keys, k, span); return i >= a && i < b; });
      expect(owners).toHaveLength(1);
    }
  });
});

describe('ownerOf', () => {
  it('finds the keyframe tracking a frame', () => {
    const a = key(34), b = key(50);
    expect(ownerOf([a, b], span, 42)).toBe(a);
    expect(ownerOf([a, b], span, 43)).toBe(b);
  });
  it('is null outside the effect', () => {
    expect(ownerOf([key(34)], span, 70)).toBeNull();
  });
});

describe('insertKey', () => {
  it('keeps keyframes in order and replaces one on the same frame', () => {
    const out = insertKey([key(10), key(50)], { i: 50, x: 9, y: 9 });
    expect(out.map(k => k.i)).toEqual([10, 50]);
    expect(out[1].x).toBe(9);
    expect(insertKey(out, key(30)).map(k => k.i)).toEqual([10, 30, 50]);
  });
});

describe('keysCovering', () => {
  it('after removing a middle keyframe, both neighbours take over its frames', () => {
    const a = key(32), mid = key(44), b = key(56);
    const [from, to] = ownedRange([a, mid, b], mid, span);
    expect(keysCovering([a, b], span, from, to)).toEqual([a, b]);
  });
});

describe('keysToRetrack', () => {
  it('extending the end re-tracks only the last keyframe', () => {
    const a = key(34), b = key(50);
    expect(keysToRetrack([a, b], span, { s: 30, e: 80 })).toEqual([b]);
  });
  it('shrinking re-tracks nothing: the frames still covered are already tracked', () => {
    const a = key(34), b = key(50);
    expect(keysToRetrack([a, b], span, { s: 32, e: 55 })).toEqual([]);
    expect(keysToRetrack([a], span, span)).toEqual([]);
  });
  it('a keyframe the new range takes in is tracked; the one it takes frames from is not', () => {
    const inside = key(40), outside = key(70);
    expect(keysToRetrack([inside, outside], span, { s: 30, e: 90 })).toEqual([outside]);
  });
});
