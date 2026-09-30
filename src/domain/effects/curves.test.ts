import { describe, expect, it } from 'vitest';
import { ease, envelope, motionAt, noise } from './curves';

describe('easing', () => {
  it('runs from 0 to 1', () => {
    for (const k of ['linear', 'in', 'out', 'inOut', 'back', 'bounce', 'elastic'] as const) {
      expect(ease(k, 0)).toBeCloseTo(0);
      expect(ease(k, 1)).toBeCloseTo(1);
    }
  });

  it('overshoots with back', () => {
    expect(Math.max(...[0.6, 0.7, 0.8, 0.9].map(u => ease('back', u)))).toBeGreaterThan(1);
  });
});

describe('a clip fading in and out', () => {
  it('rises over the fade in, holds, and falls over the fade out', () => {
    expect(envelope(0, 4, 1, 1)).toBe(0);
    expect(envelope(0.5, 4, 1, 1)).toBeCloseTo(0.5);
    expect(envelope(2, 4, 1, 1)).toBe(1);
    expect(envelope(3.5, 4, 1, 1)).toBeCloseTo(0.5);
  });

  it('is fully on with no fades, and off outside the clip', () => {
    expect(envelope(0, 4, 0, 0)).toBe(1);
    expect(envelope(-0.1, 4, 0, 0)).toBe(0);
    expect(envelope(4.1, 4, 0, 0)).toBe(0);
  });

  it('never fades for more than half the clip', () => {
    expect(envelope(1, 2, 5, 5)).toBe(1);
  });
});

describe('motion', () => {
  const m = (kind: Parameters<typeof motionAt>[0]['kind'], rate = 1, decay = 0.25) => ({ kind, rate, decay });

  it('pulses rate times a second', () => {
    expect(motionAt(m('pulse', 2), 0, 3)).toBeCloseTo(0);
    expect(motionAt(m('pulse', 2), 0.25, 3)).toBeCloseTo(1);
    expect(motionAt(m('pulse', 2), 0.5, 3)).toBeCloseTo(0);
  });

  it('hits on each beat and dies away', () => {
    expect(motionAt(m('burst', 2), 0, 3)).toBe(1);
    expect(motionAt(m('burst', 2), 0.5, 3)).toBe(1);
    expect(motionAt(m('burst', 2), 0.25, 3)).toBeLessThan(0.5);
  });

  it('builds up or fades away over the clip', () => {
    expect(motionAt(m('rise'), 0, 2)).toBe(0);
    expect(motionAt(m('rise'), 2, 2)).toBe(1);
    expect(motionAt(m('fall'), 0, 2)).toBe(1);
    expect(motionAt(m('fall'), 2, 2)).toBeCloseTo(0);
  });
});

describe('noise', () => {
  it('is the same every time, smooth, and within -1..1', () => {
    expect(noise(3, 1.37)).toBe(noise(3, 1.37));
    expect(Math.abs(noise(3, 1.37) - noise(3, 1.371))).toBeLessThan(0.01);
    for (let x = 0; x < 50; x += 0.37) expect(Math.abs(noise(7, x))).toBeLessThanOrEqual(1);
  });

  it('differs from seed to seed', () => {
    expect(noise(1, 2.5)).not.toBe(noise(2, 2.5));
  });
});
