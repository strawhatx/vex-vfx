import { describe, expect, it } from 'vitest';
import { DRAW_ORDER } from './drawOrder';

const at = (s: (typeof DRAW_ORDER)[number]) => DRAW_ORDER.indexOf(s);

describe('the draw order', () => {
  it('filters the cutouts with the footage, and keeps text and effect clips unfiltered in front', () => {
    expect(at('cutouts')).toBeLessThan(at('filter'));
    expect(at('filter')).toBeLessThan(at('text'));
    expect(at('text')).toBeLessThan(at('clips'));
  });

  it('puts screen effects on the finished image, and transitions over everything', () => {
    expect(at('screen')).toBe(DRAW_ORDER.length - 2);
    expect(at('transition')).toBe(DRAW_ORDER.length - 1);
  });

  it('has each step once', () => {
    expect(new Set(DRAW_ORDER).size).toBe(DRAW_ORDER.length);
  });
});
