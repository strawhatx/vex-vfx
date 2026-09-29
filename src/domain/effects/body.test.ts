import { describe, expect, it } from 'vitest';
import { bodyAt, fxOf, passOfFx, soundOf } from './body';
import { fitPass, type ObjectPass } from './passes';
import type { FxSettings } from './palettes';

const FX: FxSettings = {
  effect: 'fire',
  pal: 1,
  size: 1.5,
  intensity: 0.8,
  volume: 1,
  outline: 'neon',
  glitch: 'chaos',
  text: '',
  textStyle: 'behind',
  font: 'anton',
  water: 'rain',
};

describe('effects made the old way', () => {
  it('are drawn as one pass of the object engine', () => {
    expect(passOfFx(FX, false)).toEqual({
      kind: 'fire',
      params: { amount: 0.8, size: 1.5, palette: 'blue' },
    });
    expect(passOfFx({ ...FX, effect: 'outline', outline: 'pulse' }, false)?.params.style).toBe('pulse');
    expect(passOfFx({ ...FX, effect: 'glitch' }, false)?.kind).toBe('glitch');
  });

  it('are left to their own drawing when the engine does not draw them', () => {
    expect(passOfFx({ ...FX, effect: 'water' }, false)).toBeNull();
    expect(passOfFx({ ...FX, effect: 'text' }, false)).toBeNull();
    expect(passOfFx({ ...FX, effect: 'glitch' }, true)).toBeNull(); // (over the whole frame)
  });

  it('come back as the same settings for the old painters', () => {
    const one = passOfFx(FX, false)!;
    expect(fxOf(one.kind, one.params, FX)).toEqual(FX);
    const lines = passOfFx({ ...FX, effect: 'outline', outline: 'sketch' }, false)!;
    expect(fxOf(lines.kind, lines.params, FX)).toMatchObject({
      effect: 'outline',
      outline: 'sketch',
      pal: 1,
    });
  });
});

describe('body passes over time', () => {
  it('have their strength moved by their motion, and are left alone when steady', () => {
    const glow = fitPass({
      engine: 'object',
      kind: 'edge',
      params: { amount: 1 },
      motion: { kind: 'pulse', rate: 1 },
    }) as ObjectPass;
    const still = fitPass({ engine: 'object', kind: 'fire' }) as ObjectPass;
    const [a, b] = bodyAt([glow, still], 0.5, 2, 1);
    expect(a.params.amount).toBeCloseTo(1);
    expect(bodyAt([glow], 0, 2, 1)[0].params.amount).toBeCloseTo(0);
    expect(b).toBe(still);
  });

  it('sound like their first particle effect', () => {
    expect(soundOf(['edge', 'lightning', 'fire'])).toBe('lightning');
    expect(soundOf(['tint', 'clones'])).toBe('outline');
  });
});
