import { describe, expect, it } from 'vitest';
import { DRAW_ORDER, placeOf } from './drawOrder';

const at = (s: (typeof DRAW_ORDER)[number]) => DRAW_ORDER.indexOf(s);

describe('the draw order', () => {
  it('filters the background, then draws what’s behind the subject, the subject, then what’s in front', () => {
    expect(at('background')).toBeLessThan(at('behind'));
    expect(at('behind')).toBeLessThan(at('subjects'));
    expect(at('subjects')).toBeLessThan(at('front'));
    expect(at('front')).toBeLessThan(at('clips'));
  });

  it('puts screen effects on the finished image, and transitions over everything', () => {
    expect(at('screen')).toBe(DRAW_ORDER.length - 2);
    expect(at('transition')).toBe(DRAW_ORDER.length - 1);
  });

  it('has each step once', () => {
    expect(new Set(DRAW_ORDER).size).toBe(DRAW_ORDER.length);
  });

  it('puts things in front unless they’re set behind', () => {
    expect(placeOf({})).toBe('front');
    expect(placeOf({ place: 'behind' })).toBe('behind');
  });
});
