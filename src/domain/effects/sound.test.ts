import { describe, expect, it } from 'vitest';
import { hitsBetween, soundingAt, type SoundClip } from './sound';

const effect = (id: number, s: number, e: number, volume = 1): SoundClip => ({ id, kind: 'effect', effect: 'fire', impact: null, s, e, volume, speed: 1 });
const impact = (id: number, s: number, volume = 1): SoundClip => ({ id, kind: 'impact', effect: 'fire', impact: 'punch', s, e: s + 0.45, volume, speed: 1 });

describe('soundingAt', () => {
  it('is the effects the playhead is inside', () => {
    const clips = [effect(1, 0, 2), effect(2, 1, 3), impact(3, 1.5)];
    expect(soundingAt(clips, 1.5).map(c => c.id)).toEqual([1, 2]);
    expect(soundingAt(clips, 2).map(c => c.id)).toEqual([2]);
    expect(soundingAt(clips, 3)).toEqual([]);
  });
  it('leaves out effects turned all the way down', () => {
    expect(soundingAt([effect(1, 0, 2, 0)], 1)).toEqual([]);
  });
});

describe('hitsBetween', () => {
  it('sounds an impact once, as playback passes its moment', () => {
    const clips = [impact(1, 1.0)];
    expect(hitsBetween(clips, 0.96, 1.0).map(c => c.id)).toEqual([1]);
    expect(hitsBetween(clips, 1.0, 1.04)).toEqual([]);
    expect(hitsBetween(clips, 0.9, 0.95)).toEqual([]);
  });
  it('is silent when jumping (scrubbing or seeking) or going backwards', () => {
    const clips = [impact(1, 1.0)];
    expect(hitsBetween(clips, 0.2, 1.5)).toEqual([]);
    expect(hitsBetween(clips, 1.1, 0.98)).toEqual([]);
  });
  it('leaves out muted impacts', () => {
    expect(hitsBetween([impact(1, 1.0, 0)], 0.96, 1.0)).toEqual([]);
  });
});
