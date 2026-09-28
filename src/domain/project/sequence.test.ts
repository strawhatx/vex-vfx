import { describe, expect, it } from 'vitest';
import { filmLength, layoutReels, nextReel, reelAt } from './sequence';

describe('videos in a film', () => {
  const spans = layoutReels([4, 0, 2.5]);

  it('play one after another; one with nothing kept takes no time', () => {
    expect(spans).toEqual([
      { at: 0, length: 4 },
      { at: 4, length: 0 },
      { at: 4, length: 2.5 },
    ]);
    expect(filmLength(spans)).toBe(6.5);
  });

  it('knows which video plays when, the last one at the very end', () => {
    expect(reelAt(spans, 0)).toBe(0);
    expect(reelAt(spans, 3.99)).toBe(0);
    expect(reelAt(spans, 4)).toBe(2);
    expect(reelAt(spans, 6.5)).toBe(2);
    expect(reelAt([], 1)).toBe(-1);
  });

  it('skips videos with nothing kept to find the next', () => {
    expect(nextReel(spans, 0)).toBe(2);
    expect(nextReel(spans, 2)).toBe(-1);
  });
});
