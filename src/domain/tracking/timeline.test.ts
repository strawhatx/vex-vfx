import { describe, expect, it } from 'vitest';
import { toClipTime } from './timeline';

const frames = (first: number, n: number, dur = 0.5) =>
  Array.from({ length: n }, (_, i) => ({ t: first + i * dur, dur }));

describe('toClipTime', () => {
  it('leaves a file that starts at 0 alone', () => {
    const r = toClipTime(frames(0, 4), 2);
    expect(r.shift).toBe(0);
    expect(r.frames.map(f => f.t)).toEqual([0, 0.5, 1, 1.5]);
  });

  it('starts clip time at the first frame of a file that starts late', () => {
    const r = toClipTime(frames(2, 4), 2);
    expect(r.shift).toBe(2);
    expect(r.frames.map(f => f.t)).toEqual([0, 0.5, 1, 1.5]);
  });

  it('drops lead-in frames the player never shows, and says which frames were kept', () => {
    const r = toClipTime(frames(-1, 5), 1.5);
    expect(r.shift).toBe(0);
    expect(r.frames.map(f => f.t)).toEqual([0, 0.5, 1]);
    expect(r.kept).toEqual([2, 3, 4]);
  });

  it('drops frames past the end the player can reach', () => {
    // Chrome plays a file starting at 2 s only up to its reported duration
    const r = toClipTime(frames(2, 8), 2);
    expect(r.frames.map(f => f.t)).toEqual([0, 0.5, 1, 1.5]);
  });

  it('keeps everything when the player length is unknown', () => {
    expect(toClipTime(frames(0, 3), 0).frames).toHaveLength(3);
  });
});
