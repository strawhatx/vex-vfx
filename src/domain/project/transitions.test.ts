import { describe, expect, it } from 'vitest';
import { parsePreset } from '../effects/presets';
import { fitDuration, transitionAt, transitionInto, withTransition, type Played } from './transitions';

// three films: two scenes of video 1, then video 2
const films: Played[] = [
  { reel: 1, s: 0, at: 0, length: 4 },
  { reel: 1, s: 4, at: 4, length: 3 },
  { reel: 2, s: 0, at: 7, length: 0.6 },
];
const whip = parsePreset({
  id: 'whip',
  name: 'Whip',
  group: 'transition',
  passes: [
    { engine: 'motion', kind: 'out', params: { ease: 'linear', x: -1 } },
    { engine: 'motion', kind: 'in', params: { ease: 'linear', x: 1 } },
    { engine: 'screen', kind: 'flash', params: { amount: 1 } },
  ],
});

describe('a transition at a join', () => {
  it('belongs to the film it goes into; the first has none', () => {
    const trs = withTransition(films, [], 1, whip, 1);
    expect(trs).toMatchObject([{ reel: 1, s: 4, duration: 1 }]);
    expect(transitionInto(films, trs, 1)?.preset.id).toBe('whip');
    expect(transitionInto(films, trs, 2)).toBeNull();
    expect(withTransition(films, [], 0, whip, 1)).toEqual([]);
    expect(withTransition(films, trs, 1, null, 1)).toEqual([]);
  });

  it('is never longer than either film it joins', () => {
    expect(fitDuration(films, 1, 5)).toBe(2);
    expect(fitDuration(films, 2, 1)).toBe(0.6);
    expect(fitDuration(films, 1, 0)).toBe(0.1);
  });

  it('moves the ending film out over the first half and the starting one in over the second', () => {
    const trs = withTransition(films, [], 1, whip, 1);
    expect(transitionAt(films, trs, 3.4)).toBeNull();
    expect(transitionAt(films, trs, 3.75)!.pose.x).toBeCloseTo(-0.5);
    expect(transitionAt(films, trs, 4)!.pose.x).toBeCloseTo(1);
    expect(transitionAt(films, trs, 4.25)!.pose.x).toBeCloseTo(0.5);
    expect(transitionAt(films, trs, 4.5)).toBeNull();
  });

  it('is strongest right at the join', () => {
    const trs = withTransition(films, [], 1, whip, 1);
    const flash = (t: number) => {
      const p = transitionAt(films, trs, t)!.passes[0];
      return p.engine === 'screen' ? (p.values.amount as number) : 0;
    };
    expect(flash(4)).toBeCloseTo(1);
    expect(flash(3.75)).toBeCloseTo(0.5);
    expect(transitionAt(films, trs, 3.5)!.passes).toEqual([]);
  });
});
