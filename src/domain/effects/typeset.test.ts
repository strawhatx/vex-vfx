import { describe, expect, it } from 'vitest';
import { REST, arriving, letterIn, letterOut } from './letters';
import { fitPass } from './passes';
import { textAt, type TextPass } from './typeset';

const pass = (kind: string, params: object = {}) => fitPass({ engine: 'text', kind, params }) as TextPass;
const place = { words: 'Hey', x: 0.5, y: 0.5, scale: 1, rot: 0 };

describe('letters coming in', () => {
  it('start one after another, and settle at rest', () => {
    // letter 0 is half in when letter 2 hasn't started
    expect(letterIn('fade', 0, 3, 0.25, 0.5, 0.3).alpha).toBeCloseTo(0.5);
    expect(letterIn('fade', 2, 3, 0.25, 0.5, 0.3).alpha).toBe(0);
    for (const a of ['fade', 'pop', 'rise', 'drop', 'type', 'blur', 'spin', 'wide'] as const)
      expect(letterIn(a, 1, 3, 5, 0.5, 0.1)).toEqual(
        expect.objectContaining({ alpha: 1, dy: expect.closeTo(0, 6) }),
      );
  });

  it('type on one at a time', () => {
    expect([0, 1, 2].map(i => letterIn('type', i, 3, 0.15, 0.5, 0.1).alpha)).toEqual([1, 1, 0]);
  });

  it('pop from nothing, rise from below, drop from above, spread from wide', () => {
    expect(letterIn('pop', 0, 1, 0, 0.5, 0).scale).toBeCloseTo(0);
    expect(letterIn('rise', 0, 1, 0, 0.5, 0).dy).toBeGreaterThan(0);
    expect(letterIn('drop', 0, 1, 0, 0.5, 0).dy).toBeLessThan(0);
    expect(letterIn('wide', 0, 3, 0, 0.5, 0).dx).toBeLessThan(0);
    expect(letterIn('wide', 2, 3, 0, 0.5, 0).dx).toBeGreaterThan(0);
  });

  it('go out backwards, the last letter first', () => {
    expect(letterOut('fade', 2, 3, 0.1, 0.2, 0.1).alpha).toBeCloseTo(0.5);
    expect(letterOut('fade', 0, 3, 0.1, 0.2, 0.1).alpha).toBe(0);
  });

  it('know how long they take to all arrive', () => {
    expect(arriving('fade', 4, 0.5, 0.1)).toBeCloseTo(0.8);
    expect(arriving('type', 4, 0.5, 0.1)).toBeCloseTo(0.3);
    expect(arriving('none', 4, 0.5, 0.1)).toBe(0);
  });
});

describe('a text at a moment', () => {
  const passes = [
    pass('type', { caps: 'upper', font: 'bebas' }),
    pass('glow', { amount: 0.5 }),
    pass('fill'),
    pass('in', { style: 'fade', duration: 0.5, stagger: 0 }),
    pass('out', { style: 'fade', duration: 0.5, stagger: 0 }),
  ];

  it('has its letters, in capitals if its type says so, and its styles back to front', () => {
    const d = textAt(7, passes, place, 1, 3, 1, 7);
    expect(d.letters).toEqual(['H', 'E', 'Y']);
    expect(d.font).toBe('bebas');
    expect(d.styles.map(s => s.kind)).toEqual(['glow', 'fill']);
    expect(d.poses).toEqual([REST, REST, REST]);
  });

  it('comes in at the start and goes out by the end', () => {
    expect(textAt(1, passes, place, 0.25, 3, 1, 1).poses[0].alpha).toBeCloseTo(0.5);
    expect(textAt(1, passes, place, 2.75, 3, 1, 1).poses[0].alpha).toBeCloseTo(0.5);
    expect(textAt(1, passes, place, 3, 3, 1, 1).poses[0].alpha).toBe(0);
  });

  it('fades its styles with the clip, and leaves out ones faded away', () => {
    const d = textAt(1, passes, place, 1, 3, 0.5, 1);
    expect(d.styles.map(s => s.values.amount)).toEqual([0.25, 0.5]);
    expect(textAt(1, passes, place, 1, 3, 0, 1).styles).toEqual([]);
  });

  it('draws plain, in its default type, with no type pass', () => {
    const d = textAt(1, [pass('fill')], place, 0, 1, 1, 1);
    expect(d).toMatchObject({ letters: ['H', 'e', 'y'], font: 'anton' });
  });
});
