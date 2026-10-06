import { describe, expect, it } from 'vitest';
import { brandColor, contrast, textOn } from './palette';

const px = (rgb: [number, number, number], n: number) =>
  Array.from({ length: n }, () => [...rgb, 255]).flat();

describe('brandColor', () => {
  it('finds the colourful colour among UI greys, whites and blacks', () => {
    const pixels = [
      ...px([255, 255, 255], 500),
      ...px([20, 20, 22], 300),
      ...px([120, 120, 120], 200),
      ...px([99, 91, 255], 60),
    ];
    expect(brandColor(pixels)).toBe('#635bff');
  });

  it('is null for a greyscale screenshot', () => {
    expect(brandColor([...px([250, 250, 250], 100), ...px([30, 30, 30], 100)])).toBeNull();
  });

  it('ignores transparent pixels', () => {
    expect(brandColor(Array.from({ length: 100 }, () => [255, 0, 0, 0]).flat())).toBeNull();
  });
});

describe('textOn', () => {
  it('picks the text colour with the most contrast', () => {
    expect(textOn('#FFB547')).toBe('#000000');
    expect(textOn('#4A0D12')).toBe('#ffffff');
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21);
  });
});
