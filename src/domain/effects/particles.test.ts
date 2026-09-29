import { describe, expect, it } from 'vitest';
import {
  AURA_PARTICLES,
  EMITTER_PARAMS,
  FIRE_PARTICLES,
  FIRE_TONGUES,
  SPARK_PARTICLES,
  emitter,
  particleAlpha,
  particleGrowth,
  specOf,
} from './particles';
import { fitPass } from './passes';

describe('an emitter', () => {
  it('turns its settings into numbers for the simulation', () => {
    const s = specOf(
      emitter({
        palette: 'blue',
        direction: 90,
        spread: 180,
        follow: 'yes',
        colorEnd: 'white',
        blend: 'over',
      }),
    );
    expect(s).toMatchObject({ pal: 1, follow: true, colorStart: 0, colorEnd: 4, add: false });
    expect(s.direction).toBeCloseTo(Math.PI / 2);
    expect(s.spread).toBeCloseTo(Math.PI);
  });

  it('fades in over its first part of life, then out to nothing', () => {
    const s = { opacity: 0.8, fadeIn: 0.25 };
    expect(particleAlpha(s, 0)).toBe(0);
    expect(particleAlpha(s, 0.25)).toBeCloseTo(0.8);
    expect(particleAlpha(s, 0.625)).toBeCloseTo(0.4);
    expect(particleAlpha(s, 1)).toBeCloseTo(0);
    expect(particleAlpha({ opacity: 1, fadeIn: 0 }, 0)).toBe(1);
  });

  it('grows or shrinks over its life, never below nothing', () => {
    expect(particleGrowth({ grow: 1 }, 1)).toBe(2);
    expect(particleGrowth({ grow: -1 }, 0.5)).toBe(0.5);
    expect(particleGrowth({ grow: -1 }, 1)).toBe(0);
  });

  it('is a pass of the particle engine, its settings fitted to their ranges', () => {
    const p = fitPass({ engine: 'particle', kind: 'emitter', params: { rate: 9999, shape: 'blob' } });
    expect(p.params.rate).toBe(400);
    expect(p.params.shape).toBe('dot');
  });
});

describe('the built-in effects', () => {
  it('are emitters with every setting there', () => {
    for (const p of [...FIRE_PARTICLES, FIRE_TONGUES, ...AURA_PARTICLES, SPARK_PARTICLES])
      for (const s of EMITTER_PARAMS) expect(p).toHaveProperty(s.key);
  });

  it('keep smoke drawn over, the rest glowing', () => {
    expect(specOf(FIRE_PARTICLES[1])).toMatchObject({ shape: 'smoke', add: false });
    expect(specOf(SPARK_PARTICLES)).toMatchObject({ shape: 'spark', add: true });
    expect(specOf(AURA_PARTICLES[0]).follow).toBe(true);
  });
});
