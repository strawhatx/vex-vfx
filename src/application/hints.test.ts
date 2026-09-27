import { describe, expect, it } from 'vitest';
import { hintFor, type HintQueries, type HintState } from './hints';

const idle: HintState = {
  ready: true,
  scanning: false,
  camera: false,
  exporting: false,
  paused: true,
  choosing: false,
  aiming: false,
  adding: null,
  selected: null,
};

// one clip, "Object 1", in range on frames 10..19 and found on 10..14; lost on frame 30
const clips = (count = 1): HintQueries => ({
  trackCount: count,
  name: () => 'Object 1',
  inRange: (_id, i) => i >= 10 && i < 20,
  hasShapeAt: (_id, i) => i >= 10 && i < 15,
  lostAt: i => i === 30,
  pinned: () => false,
  kind: () => 'effect' as const,
  cutoutShowing: () => false,
});

describe('hints', () => {
  it('says nothing until the clip is ready, or while exporting', () => {
    expect(hintFor({ ...idle, ready: false }, clips(0), 0)).toBe('');
    expect(hintFor({ ...idle, scanning: true }, clips(0), 0)).toBe('');
    expect(hintFor({ ...idle, exporting: true }, clips(), 0)).toBe('');
  });

  it('asks for the first tap on a new clip', () => {
    expect(hintFor(idle, clips(0), 0)).toBe('Tap what the effect should follow.');
  });

  it('says what the next tap does', () => {
    expect(hintFor({ ...idle, choosing: true }, clips(), 0)).toBe('Pick where it should come from.');
    expect(hintFor({ ...idle, aiming: true }, clips(), 0)).toBe('Tap where the laser should hit.');
    expect(hintFor({ ...idle, adding: 'impact' }, clips(), 0)).toBe('Tap where the impact should hit.');
    expect(hintFor({ ...idle, adding: 'word' }, clips(), 0)).toBe('Tap where the word should pop up.');
  });

  it('explains the selected clip at the paused frame', () => {
    const sel = { ...idle, selected: 1 };
    expect(hintFor(sel, clips(), 5)).toBe('Outside Object 1’s effect. Drag its ends to cover this.');
    expect(hintFor(sel, clips(), 17)).toBe('Object 1 isn’t found here. Tap it to fix.');
    expect(hintFor(sel, clips(), 12)).toBe('Wrong? Tap Object 1 to fix this frame.');
  });

  it('explosions go off where you tap, and move where you tap', () => {
    expect(hintFor({ ...idle, adding: 'explosion' }, clips(), 0)).toBe(
      'Tap where the explosion should go off.',
    );
    // even on a new clip, before anything's been added
    expect(hintFor({ ...idle, adding: 'explosion' }, clips(0), 0)).toBe(
      'Tap where the explosion should go off.',
    );
    const boom = { ...clips(), name: () => 'Explosion 2', pinned: () => true };
    expect(hintFor({ ...idle, selected: 2 }, boom, 5)).toBe('Tap the preview to move Explosion 2.');
  });

  it('shockwaves start where you tap', () => {
    expect(hintFor({ ...idle, adding: 'shockwave' }, clips(0), 0)).toBe(
      'Tap where the shockwave should start.',
    );
  });

  it('says when an object is lost', () => {
    expect(hintFor({ ...idle, paused: false }, clips(), 30)).toBe('Searching for the object…');
  });
});
