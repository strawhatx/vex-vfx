import { describe, expect, it } from 'vitest';
import { autoPlan } from './autoPlan';
import { OUTRO_SECONDS, planDuration } from './plan';
import { recipeBySlug } from './recipes';
import { schedule, snapToBeats } from './schedule';

const plan = autoPlan({
  recipe: recipeBySlug('brutalist')!,
  shots: 4,
  product: { name: 'Orbit', tagline: 'Changelogs in one click', url: 'orbit.dev' },
  aspect: '9:16',
  seed: 5,
});

describe('schedule', () => {
  it('lays out hook, scenes and outro back to back', () => {
    const { spans, duration } = schedule(plan);
    expect(spans.map(s => s.kind)).toEqual(['hook', 'scene', 'scene', 'scene', 'scene', 'outro']);
    for (let i = 1; i < spans.length; i++) expect(spans[i].start).toBeCloseTo(spans[i - 1].end);
    expect(duration).toBeCloseTo(planDuration(plan));
    expect(spans.at(-1)!.end - spans.at(-1)!.start).toBeCloseTo(OUTRO_SECONDS);
  });
});

describe('snapToBeats', () => {
  it('puts every cut on a beat', () => {
    const bpm = 120,
      beat = 0.5;
    const snapped = snapToBeats(plan, bpm);
    const { spans } = schedule(snapped);
    for (const s of spans.slice(0, -1)) expect((s.end / beat) % 1).toBeCloseTo(0, 5);
  });

  it('keeps every scene at least a beat long', () => {
    const snapped = snapToBeats(plan, 50);
    for (const s of snapped.scenes) expect(s.duration).toBeGreaterThanOrEqual(1.2 - 1e-9);
  });

  it('leaves the plan alone without a usable bpm', () => {
    expect(snapToBeats(plan, null)).toBe(plan);
    expect(snapToBeats(plan, 900)).toBe(plan);
  });
});
