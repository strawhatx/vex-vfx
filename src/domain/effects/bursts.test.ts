import { describe, expect, it } from 'vitest';
import { burstPassesOf, lookOf, soundOfBurst } from './bursts';
import { IMPACTS, type ImpactStyle } from './impacts';
import { presets } from './library';
import type { BurstPassOf } from './passes';
import { controlDefaults, passesWith } from './presets';

// an impact style's look, without the palette a new one starts with (that's the clip's to keep)
const lookOfStyle = (s: ImpactStyle) => {
  const { pal, ...rest } = IMPACTS[s];
  void pal;
  return rest;
};

describe('impacts as burst passes', () => {
  it('make the same impact as each style did', () => {
    for (const s of Object.keys(IMPACTS) as ImpactStyle[])
      expect(lookOf(burstPassesOf(s), IMPACTS[s].label)).toEqual(lookOfStyle(s));
  });

  it('ship as presets that draw as the styles did, each sounding like its style', () => {
    const shipped = presets().filter(p => p.group === 'impact');
    expect(shipped).toHaveLength(Object.keys(IMPACTS).length);
    for (const p of shipped) {
      const passes = passesWith(p, controlDefaults(p)) as BurstPassOf[];
      const style = soundOfBurst(passes);
      expect(lookOf(passes, p.name)).toEqual(lookOfStyle(style));
    }
  });

  it('have a hit even when a preset leaves it out', () => {
    const look = lookOf([{ kind: 'word', params: { text: 'ZAP', tilt: 0, spikes: 8 } }], 'Zap');
    expect(look).toMatchObject({ family: 'hit', duration: 0.5, word: { text: 'ZAP' } });
    expect(soundOfBurst([])).toBe('punch');
  });
});
