import { describe, expect, it } from 'vitest';
import { GRADE_PARAMS, buildLut, gradeColor, gradeOf, type Grade } from './color';
import { defaults } from './params';

const NEUTRAL = gradeOf(defaults(GRADE_PARAMS));
const grade = (p: Partial<Grade>): Grade => ({ ...NEUTRAL, ...p });
const lum = (c: number[]) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
const spread = (c: number[]) => Math.max(...c) - Math.min(...c);

describe('grading a color', () => {
  it('leaves every color as it is with nothing set', () => {
    for (const c of [
      [0, 0, 0],
      [1, 1, 1],
      [0.2, 0.5, 0.9],
    ])
      gradeColor(NEUTRAL, c).forEach((v, j) => expect(v).toBeCloseTo(c[j], 6));
  });

  it('brightens with exposure, and darkens below 0', () => {
    expect(lum(gradeColor(grade({ exposure: 1 }), [0.3, 0.3, 0.3]))).toBeGreaterThan(0.3);
    expect(lum(gradeColor(grade({ exposure: -1 }), [0.3, 0.3, 0.3]))).toBeLessThan(0.3);
  });

  it('warms by adding red and taking blue', () => {
    const [r, , b] = gradeColor(grade({ temperature: 1 }), [0.5, 0.5, 0.5]);
    expect(r).toBeGreaterThan(0.5);
    expect(b).toBeLessThan(0.5);
  });

  it('turns to grey with saturation -1', () => {
    expect(spread(gradeColor(grade({ saturation: -1 }), [0.9, 0.2, 0.1]))).toBeCloseTo(0, 6);
  });

  it('pushes darks darker and brights brighter with contrast', () => {
    const g = grade({ contrast: 0.8 });
    expect(gradeColor(g, [0.2, 0.2, 0.2])[0]).toBeLessThan(0.2);
    expect(gradeColor(g, [0.8, 0.8, 0.8])[0]).toBeGreaterThan(0.8);
    expect(gradeColor(g, [0.5, 0.5, 0.5])[0]).toBeCloseTo(0.5);
  });

  it('turns the hue round, keeping greys grey', () => {
    const red = gradeColor(grade({ hue: 120 }), [1, 0, 0]);
    expect(red[1]).toBeGreaterThan(red[0]); // red turned to green
    gradeColor(grade({ hue: 77 }), [0.4, 0.4, 0.4]).forEach(v => expect(v).toBeCloseTo(0.4, 6));
  });

  it('lifts blacks with fade', () => {
    expect(gradeColor(grade({ fade: 1 }), [0, 0, 0])[0]).toBeGreaterThan(0.1);
  });

  it('tints the shadows and the highlights their own colors', () => {
    const g = grade({ shadowTone: '#0000ff', shadowAmount: 1, highlightTone: '#ff0000', highlightAmount: 1 });
    const dark = gradeColor(g, [0.1, 0.1, 0.1]),
      bright = gradeColor(g, [0.9, 0.9, 0.9]);
    expect(dark[2]).toBeGreaterThan(dark[0]);
    expect(bright[0]).toBeGreaterThan(bright[2]);
  });

  it('keeps every channel in 0..1', () => {
    const g = grade({ exposure: 2, contrast: 1, saturation: 1, vibrance: 1, shadows: 1, highlights: 1 });
    gradeColor(g, [0.9, 0.95, 0.1]).forEach(v => {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    });
  });
});

describe('the lookup table', () => {
  it('holds the grade at each corner, red fastest', () => {
    const size = 5,
      lut = buildLut(grade({ temperature: 0.5 }), size);
    expect(lut.length).toBe(size ** 3 * 4);
    const at = (r: number, g: number, b: number) => {
      const o = ((b * size + g) * size + r) * 4;
      return [lut[o], lut[o + 1], lut[o + 2], lut[o + 3]];
    };
    const want = gradeColor(grade({ temperature: 0.5 }), [1, 0, 0]).map(v => Math.round(v * 255));
    expect(at(4, 0, 0)).toEqual([...want, 255]);
    expect(at(0, 0, 0).slice(0, 3)).toEqual([0, 0, 0]);
  });

  it('with nothing set, gives back what it looks up', () => {
    const size = 3,
      lut = buildLut(NEUTRAL, size);
    expect([lut[4], lut[5], lut[6]]).toEqual([128, 0, 0]); // r = 1/2
  });
});
