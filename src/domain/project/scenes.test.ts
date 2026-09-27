import { describe, expect, it } from 'vitest';
import { sceneIndexAt, sceneStarts, scenesOf, splitAt } from './scenes';

// 60 frames at 10 fps: a 6-second clip
const clip = Array.from({ length: 60 }, (_, i) => ({ t: i / 10, dur: 0.1 }));

describe('splitting the film', () => {
  it('splits at the start of the frame at the playhead: that frame starts the second film', () => {
    const cuts = splitAt([], clip, 20, 6)!;
    expect(cuts).toEqual([2]);
    expect(scenesOf(cuts, 6)).toEqual([
      { s: 0, e: 2 },
      { s: 2, e: 6 },
    ]);
  });

  it('splits whichever film the playhead is in, keeping the cuts in order', () => {
    const cuts = splitAt(splitAt([], clip, 40, 6)!, clip, 20, 6)!;
    expect(cuts).toEqual([2, 4]);
    expect(scenesOf(cuts, 6)).toHaveLength(3);
  });

  it('will not leave a film shorter than a tenth of a second', () => {
    expect(splitAt([], clip, 0, 6)).toBeNull();
    expect(splitAt([2], clip, 20, 6)).toBeNull();
    expect(splitAt([2], clip, 21, 6)).toEqual([2, 2.1]);
  });

  it('knows which film is playing', () => {
    expect(sceneIndexAt([2, 4], 0)).toBe(0);
    expect(sceneIndexAt([2, 4], 2)).toBe(1);
    expect(sceneIndexAt([2, 4], 5.9)).toBe(2);
  });

  it('gives each frame its film’s first frame, for effects to start fresh from', () => {
    const starts = sceneStarts(clip, [2]);
    expect(starts[0]).toBe(0);
    expect(starts[19]).toBe(0);
    expect(starts[20]).toBe(20);
    expect(starts[59]).toBe(20);
  });
});
