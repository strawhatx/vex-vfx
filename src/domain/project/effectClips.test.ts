import { describe, expect, it } from 'vitest';
import {
  effectRange,
  effectsAt,
  guessBlend,
  newEffectClip,
  placeEffect,
  trimEffect,
  withLook,
  type PackItem,
} from './effectClips';

const boom: PackItem = { id: 'p1', name: 'Boom', length: 3, blend: 'screen' };

describe('an effect clip on the film', () => {
  it('plays all its video from where it is placed, in the middle, blended as its video is', () => {
    const c = newEffectClip(1, boom, 2, 20);
    expect(effectRange(c)).toEqual({ s: 2, e: 5 });
    expect(c).toMatchObject({ x: 0.5, y: 0.5, scale: 1, blend: 'screen', pack: 'p1' });
    expect(effectRange(newEffectClip(1, boom, 19, 20))).toEqual({ s: 19, e: 20 });
  });

  it('trimmed, keeps what plays where it is, within its video', () => {
    const c = newEffectClip(1, boom, 2, 20);
    expect(trimEffect(c, { s: 3 })).toMatchObject({ at: 3, src: { s: 1, e: 3 } });
    expect(trimEffect(c, { e: 4 })).toMatchObject({ at: 2, src: { s: 0, e: 2 } });
    expect(trimEffect(c, { s: 0 })).toMatchObject({ at: 2, src: { s: 0, e: 3 } });
    expect(trimEffect(c, { e: 9 }).src.e).toBe(3);
  });

  it('moves whole, and keeps its size, fade and key in bounds', () => {
    const c = newEffectClip(1, boom, 2, 20);
    expect(placeEffect(c, -1).at).toBe(0);
    expect(withLook(c, { scale: 99, opacity: 2, tolerance: -1, x: 0.2 })).toMatchObject({
      scale: 6,
      opacity: 1,
      tolerance: 0,
      x: 0.2,
    });
  });

  it('plays at the time in its video, lower rows first', () => {
    const a = { ...newEffectClip(1, boom, 2, 20), row: 0 },
      b = { ...trimEffect(newEffectClip(2, boom, 0, 20), { s: 1 }), row: 1 };
    expect(effectsAt([a, b], 2.5).map(x => [x.clip.id, x.time])).toEqual([
      [2, 2.5],
      [1, 0.5],
    ]);
    expect(effectsAt([a], 5)).toEqual([]);
  });

  it('is drawn in front of the subject unless it’s set behind', () => {
    const c = newEffectClip(1, boom, 2, 20);
    expect(effectsAt([c], 3, 'front')).toHaveLength(1);
    expect(effectsAt([{ ...c, place: 'behind' }], 3, 'front')).toEqual([]);
    expect(effectsAt([{ ...c, place: 'behind' }], 3, 'behind')).toHaveLength(1);
  });
});

describe('guessing how to blend a video', () => {
  it('keys a green screen, screens black, and leaves anything else', () => {
    const green = [0.1, 0.8, 0.2] as const,
      black = [0.02, 0.03, 0.02] as const,
      grey = [0.5, 0.5, 0.5] as const;
    expect(guessBlend([green, green, green, black])).toBe('key');
    expect(guessBlend([black, black, black, grey])).toBe('screen');
    expect(guessBlend([grey, grey, black, green])).toBe('normal');
    expect(guessBlend([])).toBe('normal');
  });
});
