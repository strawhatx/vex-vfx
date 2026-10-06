import { describe, expect, it } from 'vitest';
import { checkPlan, trimText, unconfirmed } from './check';
import { EXAMPLES, examplePlan } from './examples';
import { totalSeconds } from './plan';
import { blankScene, SCENE_TYPES } from './scenes';

// the doc's example plan, as an AI would write it
const aiPlan = () => ({
  format: '9:16',
  aesthetic: 'clean-soft',
  brandColor: '#2E8B57',
  length: 15,
  product: { name: 'Invofox', url: 'invofox.com' },
  scenes: [
    { type: 'logo-reveal', sec: 2.5, caption: "Hi, I'm Nacho from Invofox.", name: 'Invofox' },
    {
      type: 'stat-counter',
      sec: 3,
      value: null,
      label: 'documents processed',
      caption: "We've processed millions of documents.",
    },
    {
      type: 'card-stack',
      sec: 4,
      cards: ['Demo & pricing', 'Security review', 'Setup kickoff'],
      stat: 6,
      statPrefix: 'Week ',
      statLabel: 'before your first result',
    },
    { type: 'kinetic-type', sec: 2.5, text: 'Start today. Free.', move: 'word-pop' },
  ],
});

const ok = (raw: unknown, supplied?: number[]) => {
  const c = checkPlan(raw, { supplied });
  if (!c.ok) throw new Error(c.reason);
  return c;
};

describe('checkPlan', () => {
  it('reads the doc’s example plan', () => {
    const c = ok(aiPlan());
    expect(c.plan.scenes.map(s => s.type)).toEqual([
      'logo-reveal',
      'stat-counter',
      'card-stack',
      'kinetic-type',
    ]);
    const cards = c.plan.scenes[2];
    expect(cards.type === 'card-stack' && cards.cards[0]).toEqual({ title: 'Demo & pricing', subtitle: '' });
  });

  it('never invents numbers: one the user didn’t give is emptied', () => {
    const c = ok(aiPlan());
    const s = c.plan.scenes[2];
    expect(s.type === 'card-stack' && s.stat).toEqual({ value: null, confirmed: false });
    expect(c.fixes.join(' ')).toMatch(/6 wasn’t a number you gave/);
  });

  it('keeps a number the user gave, as confirmed', () => {
    const s = ok(aiPlan(), [6]).plan.scenes[2];
    expect(s.type === 'card-stack' && s.stat).toEqual({ value: 6, confirmed: true });
  });

  it('keeps a number the user confirmed in the editor', () => {
    const raw = aiPlan();
    (raw.scenes[1] as Record<string, unknown>).value = { value: 2_000_000, confirmed: true };
    const s = ok(raw).plan.scenes[1];
    expect(s.type === 'stat-counter' && s.value).toEqual({ value: 2_000_000, confirmed: true });
  });

  it('lists the numbers still to fill in; an empty optional one is fine', () => {
    const plan = ok(aiPlan()).plan;
    // the counter is required; the card-stack stat is optional
    expect(unconfirmed(plan)).toEqual([{ scene: 1, key: 'value', label: 'Number' }]);
  });

  it('keeps percentages within 0–100', () => {
    const raw = {
      ...aiPlan(),
      scenes: [{ type: 'stat-ring', percent: { value: 140, confirmed: true }, label: 'done' }],
    };
    const s = ok(raw).plan.scenes[0];
    expect(s.type === 'stat-ring' && s.percent.value).toBe(100);
  });

  it('drops unknown scenes and scenes missing required text', () => {
    const raw = {
      ...aiPlan(),
      scenes: [...aiPlan().scenes, { type: 'hologram' }, { type: 'kinetic-type', text: '  ' }],
    };
    const c = ok(raw);
    expect(c.plan.scenes).toHaveLength(4);
    expect(c.fixes.join(' ')).toMatch(/unknown scene type "hologram"/);
    expect(c.fixes.join(' ')).toMatch(/text is empty/);
  });

  it('drops a card stack with fewer than two cards, and keeps at most four', () => {
    const one = ok({ ...aiPlan(), scenes: [{ type: 'card-stack', cards: ['Only'] }, aiPlan().scenes[3]] });
    expect(one.plan.scenes.map(s => s.type)).toEqual(['kinetic-type']);
    const many = ok({ ...aiPlan(), scenes: [{ type: 'card-stack', cards: ['a', 'b', 'c', 'd', 'e', 'f'] }] });
    const s = many.plan.scenes[0];
    expect(s.type === 'card-stack' && s.cards).toHaveLength(4);
  });

  it('swaps a move the style doesn’t allow, and drops a foreign transition', () => {
    const raw = aiPlan();
    raw.scenes[3] = {
      ...raw.scenes[3],
      move: 'word-slam',
      transition: 'glitch',
    } as unknown as (typeof raw.scenes)[number];
    const s = ok(raw).plan.scenes[3];
    // Clean Soft has no word-slam or glitch
    expect(s.type === 'kinetic-type' && s.move).toBe('mask-reveal');
    expect(s.transition).toBeNull();
  });

  it('falls back on an unknown style, format or colour', () => {
    const c = ok({ ...aiPlan(), aesthetic: 'vaporwave', format: '4:3', brandColor: 'green' });
    expect(c.plan.aesthetic).toBe('clean-soft');
    expect(c.plan.format).toBe('9:16');
    expect(c.plan.brandColor).toBeNull();
    expect(c.fixes.join(' ')).toMatch(/Style "vaporwave".*Format|Format.*Style "vaporwave"/);
    expect(c.fixes.join(' ')).toMatch(/brand colour/);
  });

  it('keeps scene lengths in range and the total within 10% of the target', () => {
    const raw = { ...aiPlan(), length: 30, scenes: aiPlan().scenes.map(s => ({ ...s, sec: 0.2 })) };
    const c = ok(raw);
    // every scene is at least its minimum; four scenes can't reach 30s, so it says so
    expect(totalSeconds(c.plan)).toBeLessThan(27);
    expect(c.notes.join(' ')).toMatch(/Add a scene/);
    const long = ok({ ...aiPlan(), length: 15, scenes: aiPlan().scenes.map(s => ({ ...s, sec: 9 })) });
    expect(Math.abs(totalSeconds(long.plan) - 15)).toBeLessThanOrEqual(1.5);
  });

  it('points out numbers written inside text', () => {
    const raw = { ...aiPlan(), scenes: [{ type: 'kinetic-type', text: 'Save 40 hours', move: 'word-pop' }] };
    expect(ok(raw).notes.join(' ')).toMatch(/check the number in “Save 40 hours”/);
  });

  it('refuses junk', () => {
    expect(checkPlan('nope').ok).toBe(false);
    expect(checkPlan({ scenes: [] }).ok).toBe(false);
    expect(checkPlan({ scenes: [{ type: 'hologram' }] }).ok).toBe(false);
  });

  it('accepts a blank scene of every type', () => {
    const raw = { ...aiPlan(), scenes: SCENE_TYPES.map(t => blankScene(t)) };
    expect(ok(raw).plan.scenes).toHaveLength(SCENE_TYPES.length);
  });

  it('a checked plan checks again unchanged', () => {
    const plan = ok(aiPlan()).plan;
    const again = ok(plan);
    expect(again.plan).toEqual(plan);
    expect(again.fixes).toEqual([]);
  });
});

describe('examples', () => {
  it('every example is already valid and on length', () => {
    for (const e of EXAMPLES) {
      const c = ok(e.plan);
      expect(c.fixes).toEqual([]);
      expect(c.notes).toEqual([]);
    }
  });

  it('only the starter has numbers left to fill', () => {
    for (const e of EXAMPLES) expect(unconfirmed(e.plan).length > 0).toBe(e.id === 'starter');
  });

  it('hands out copies, not the original', () => {
    const a = examplePlan('orbit-launch');
    a.scenes.length = 0;
    expect(examplePlan('orbit-launch').scenes.length).toBeGreaterThan(0);
  });
});

describe('trimText', () => {
  it('cuts at a word and drops trailing punctuation', () => {
    expect(trimText('Ship faster, sleep better, launch today', 26)).toBe('Ship faster, sleep better');
  });
});

describe('example video transcripts', async () => {
  const { EXAMPLES: VIDEOS, transcriptOf } = await import('./content/examples');
  it('say every word on screen, in order, ending on the end card', () => {
    const t = transcriptOf(examplePlan('orbit-launch'));
    expect(t.startsWith('Orbit. Release notes on autopilot. Meet Orbit.')).toBe(true);
    expect(t).toContain('2 min from merge to published.');
    expect(t).toContain('12,000+ teams ship with Orbit.');
    expect(t.endsWith('Orbit. orbit.dev. Made with PromoReel.')).toBe(true);
    expect(t).not.toContain('*');
  });
  it('every example video names a real style', async () => {
    const { recipeBySlug } = await import('./recipes');
    for (const v of VIDEOS) expect(recipeBySlug(v.recipe)).toBeDefined();
  });
});
