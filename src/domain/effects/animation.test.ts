import { describe, expect, it } from 'vitest';
import { NO_ANIM, REST_POSE, hasAnim, poseAt, type AnimSlot, type ClipAnim } from './animation';
import { presetById } from './library';
import { fitPass } from './passes';

const slot = (kind: string, params: object): AnimSlot => ({
  preset: 'test',
  params: fitPass({ engine: 'motion', kind, params }).params,
});
const anim = (a: Partial<ClipAnim>): ClipAnim => ({ ...NO_ANIM, ...a });

describe('a clip coming in and going out', () => {
  const a = anim({
    in: slot('in', { duration: 1, ease: 'linear', scale: 0, opacity: 0 }),
    out: slot('out', { duration: 1, ease: 'linear', x: 1 }),
  });

  it('starts from its in pose and eases to rest', () => {
    expect(poseAt(a, 0, 5)).toMatchObject({ scale: 0, alpha: 0 });
    expect(poseAt(a, 0.5, 5)).toMatchObject({ scale: 0.5, alpha: 0.5 });
    expect(poseAt(a, 2, 5)).toEqual(REST_POSE);
  });

  it('ends at its out pose', () => {
    expect(poseAt(a, 4.5, 5).x).toBeCloseTo(0.5);
    expect(poseAt(a, 5, 5).x).toBeCloseTo(1);
  });

  it('shares a clip too short for both', () => {
    // 1 s in and 1 s out on a 1 s clip: half a second each
    expect(poseAt(a, 0.25, 1).scale).toBeCloseTo(0.5);
    expect(poseAt(a, 0.75, 1).x).toBeCloseTo(0.5);
  });

  it('turns in degrees and blurs as a fraction of the frame', () => {
    const b = anim({ in: slot('in', { duration: 1, ease: 'linear', turn: 180, blur: 1 }) });
    expect(poseAt(b, 0, 5).rot).toBeCloseTo(Math.PI);
    expect(poseAt(b, 0, 5).blur).toBeCloseTo(0.04);
  });
});

describe('a combo', () => {
  it('sways, pulses and floats round rest', () => {
    const c = anim({ combo: slot('combo', { rate: 1, sway: 1, pulse: 1, float: 1 }) });
    expect(poseAt(c, 0, 4)).toMatchObject({ rot: 0, scale: 1 });
    expect(poseAt(c, 0.25, 4).rot).toBeCloseTo(0.12);
    expect(poseAt(c, 0.5, 4).scale).toBeCloseTo(1.08);
  });

  it('zooms and spins over the whole clip', () => {
    const c = anim({ combo: slot('combo', { zoom: 1, spin: 1 }) });
    expect(poseAt(c, 4, 4).scale).toBeCloseTo(1.3);
    expect(poseAt(c, 2, 4).rot).toBeCloseTo(Math.PI);
  });

  it('shakes the same way every time', () => {
    const c = anim({ combo: slot('combo', { shake: 1 }) });
    expect(poseAt(c, 1.37, 4)).toEqual(poseAt(c, 1.37, 4));
    expect(Math.abs(poseAt(c, 1.37, 4).x)).toBeLessThanOrEqual(0.03);
  });
});

describe('the animations that ship', () => {
  it('each hold one pass of their own kind', () => {
    for (const id of ['grow-in', 'fade-out', 'sway']) {
      const p = presetById(id)!;
      expect(p.group).toBe('motion');
      expect(p.passes).toHaveLength(1);
      expect(p.passes[0].kind).toBe(p.category.toLowerCase());
    }
  });

  it('are none until one is picked', () => {
    expect(hasAnim(NO_ANIM)).toBe(false);
    expect(hasAnim(anim({ combo: slot('combo', {}) }))).toBe(true);
  });
});
