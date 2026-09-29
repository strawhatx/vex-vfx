import { describe, expect, it } from 'vitest';
import { musicAt, musicRange, newMusic, placeMusic, trimMusic, withVolume } from './music';

describe('music on the film', () => {
  it('starts as the whole file, or as much as fits before the film ends', () => {
    expect(newMusic(1, 'song', 30, 2, 60).src).toEqual({ s: 0, e: 30 });
    expect(newMusic(1, 'song', 30, 50, 60).src).toEqual({ s: 0, e: 10 });
  });

  it('plays its stretch of the file from where it is placed', () => {
    const m = { ...newMusic(1, 'song', 30, 4, 60), src: { s: 10, e: 20 } };
    expect(musicRange(m)).toEqual({ s: 4, e: 14 });
    expect(musicAt([m], 6)).toEqual([{ clip: m, offset: 12 }]);
    expect(musicAt([m], 14)).toEqual([]);
  });

  it('trimmed, keeps what plays where it is, within the file', () => {
    const m = { ...newMusic(1, 'song', 30, 4, 60), src: { s: 10, e: 20 } };
    expect(trimMusic(m, { s: 6 })).toMatchObject({ at: 6, src: { s: 12, e: 20 } });
    expect(trimMusic(m, { e: 10 })).toMatchObject({ at: 4, src: { s: 10, e: 16 } });
    // not before the file's start, nor past its end
    expect(trimMusic(m, { s: 0 })).toMatchObject({ at: 0, src: { s: 6, e: 20 } });
    expect(trimMusic(m, { e: 99 })).toMatchObject({ src: { s: 10, e: 30 } });
  });

  it('moves whole, and keeps its volume in bounds', () => {
    const m = newMusic(1, 'song', 30, 4, 60);
    expect(placeMusic(m, -3).at).toBe(0);
    expect(placeMusic(m, 7)).toMatchObject({ at: 7, src: m.src });
    expect(withVolume(m, 5).volume).toBe(2);
  });
});
