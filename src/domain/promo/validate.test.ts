import { describe, expect, it } from 'vitest';
import { autoPlan } from './autoPlan';
import { LIMITS, planDuration } from './plan';
import { recipeBySlug } from './recipes';
import { trimText, validatePlan, type PlanContext } from './validate';

const recipe = recipeBySlug('y2k-chrome')!;
const ctx: PlanContext = {
  recipe,
  shots: 3,
  product: { name: 'Orbit', tagline: 'Ship your changelog in one click', url: 'https://www.orbit.dev/' },
  aspect: '9:16',
};

const scene = (over: Record<string, unknown> = {}) => ({
  shot: 0,
  duration: 2,
  move: 'tilt-float',
  zoom: { x: 0.5, y: 0.3, scale: 1.5 },
  caption: { text: 'One click changelogs', move: 'word-pop' },
  transition: 'flash-cut',
  extra: null,
  ...over,
});

const good = {
  v: 1,
  aspect: '9:16',
  hook: { text: 'Changelogs, done', move: 'word-slam', duration: 1.5 },
  scenes: [scene(), scene({ shot: 1 }), scene({ shot: 2 })],
  outro: { cta: 'Try it free' },
};

describe('validatePlan', () => {
  it('accepts a good plan without fixes', () => {
    const v = validatePlan(good, ctx);
    expect(v.ok && v.fixes).toEqual([]);
  });

  it('always uses the product for the outro, whatever the plan says', () => {
    const v = validatePlan({ ...good, outro: { title: 'Hacked', url: 'evil.example', cta: 'Go' } }, ctx);
    expect(v.ok && v.plan.outro).toEqual({ title: 'Orbit', url: 'orbit.dev', cta: 'Go' });
  });

  it('swaps a move that does not exist, or that the aesthetic does not allow', () => {
    const v = validatePlan(
      {
        ...good,
        scenes: [
          scene({ move: 'barrel-roll' }),
          scene({ shot: 1, move: 'parallax-scroll' }),
          scene({ shot: 2 }),
        ],
      },
      ctx,
    );
    if (!v.ok) throw new Error(v.reason);
    expect(recipe.moves.screen).toContain(v.plan.scenes[0].move);
    expect(recipe.moves.screen).toContain(v.plan.scenes[1].move);
    expect(v.fixes.join(' ')).toMatch(/barrel-roll/);
  });

  it('a move of the wrong kind is swapped too', () => {
    const v = validatePlan(
      { ...good, scenes: [scene({ transition: 'word-pop' }), scene({ shot: 1 }), scene({ shot: 2 })] },
      ctx,
    );
    expect(v.ok && recipe.transitions).toContain(v.ok && v.plan.scenes[0].transition);
  });

  it('keeps zoom targets on the screen', () => {
    const v = validatePlan(
      {
        ...good,
        scenes: [scene({ zoom: { x: 1.4, y: -0.2, scale: 9 } }), scene({ shot: 1 }), scene({ shot: 2 })],
      },
      ctx,
    );
    expect(v.ok && v.plan.scenes[0].zoom).toEqual({ x: 1, y: 0, scale: LIMITS.zoomScale[1] });
  });

  it('keeps scene lengths in the aesthetic’s range', () => {
    const v = validatePlan(
      { ...good, scenes: [scene({ duration: 30 }), scene({ shot: 1, duration: 0.1 }), scene({ shot: 2 })] },
      ctx,
    );
    if (!v.ok) throw new Error(v.reason);
    for (const s of v.plan.scenes) {
      expect(s.duration).toBeGreaterThanOrEqual(recipe.motion.scene[0]);
      expect(s.duration).toBeLessThanOrEqual(recipe.motion.scene[1]);
    }
  });

  it('pads a plan with too few scenes, using unused screenshots first', () => {
    const v = validatePlan({ ...good, scenes: [scene()] }, ctx);
    if (!v.ok) throw new Error(v.reason);
    expect(v.plan.scenes.map(s => s.shot)).toEqual([0, 1, 2]);
  });

  it('trims a plan with too many scenes', () => {
    const v = validatePlan(
      { ...good, scenes: Array.from({ length: 12 }, (_, i) => scene({ shot: i % 3 })) },
      ctx,
    );
    expect(v.ok && v.plan.scenes.length).toBe(LIMITS.scenes[1]);
  });

  it('keeps the whole video within the length limits', () => {
    const long = validatePlan(
      { ...good, scenes: Array.from({ length: 8 }, (_, i) => scene({ shot: i % 3, duration: 6 })) },
      {
        ...ctx,
        recipe: recipeBySlug('clean-apple')!,
      },
    );
    if (!long.ok) throw new Error(long.reason);
    expect(planDuration(long.plan)).toBeLessThanOrEqual(LIMITS.total[1] + 0.05);
  });

  it('shortens long captions and hooks at a word', () => {
    const text = 'This caption is far too long to fit on a phone screen in one or two lines of type';
    const v = validatePlan(
      {
        ...good,
        hook: { ...good.hook, text },
        scenes: [scene({ caption: { text, move: 'word-pop' } }), scene({ shot: 1 }), scene({ shot: 2 })],
      },
      ctx,
    );
    if (!v.ok) throw new Error(v.reason);
    expect(v.plan.scenes[0].caption!.text.length).toBeLessThanOrEqual(LIMITS.caption);
    expect(v.plan.hook.text.length).toBeLessThanOrEqual(LIMITS.hookText);
    expect(v.plan.hook.text.endsWith(' ')).toBe(false);
  });

  it('uses the aspect the user chose', () => {
    const v = validatePlan({ ...good, aspect: '4:3' }, { ...ctx, aspect: '16:9' });
    expect(v.ok && v.plan.aspect).toBe('16:9');
  });

  it('refuses junk, so the caller falls back to the rules', () => {
    expect(validatePlan('nope', ctx).ok).toBe(false);
    expect(validatePlan({ scenes: [] }, ctx).ok).toBe(false);
    expect(validatePlan({ scenes: [scene({ shot: 7 }), scene({ shot: 9 }), scene()] }, ctx).ok).toBe(false);
  });

  it('drops a scene whose screenshot does not exist, if most are fine', () => {
    const v = validatePlan(
      { ...good, scenes: [scene({ shot: 7 }), scene({ shot: 1 }), scene({ shot: 2 }), scene()] },
      ctx,
    );
    expect(v.ok && v.plan.scenes.map(s => s.shot)).toEqual([1, 2, 0]);
  });
});

describe('trimText', () => {
  it('cuts at a word and drops trailing punctuation', () => {
    expect(trimText('Ship faster, sleep better, launch today', 26)).toBe('Ship faster, sleep better');
  });
});

describe('autoPlan', () => {
  it('passes validation unchanged for every aesthetic', async () => {
    const { RECIPES } = await import('./recipes');
    for (const r of RECIPES)
      for (const shots of [1, 3, 6]) {
        const plan = autoPlan({ ...ctx, recipe: r, shots, seed: 7 });
        const v = validatePlan(plan, { ...ctx, recipe: r, shots });
        expect(v.ok && v.fixes).toEqual([]);
      }
  });

  it('is the same for the same seed, and differs for another', () => {
    const a = autoPlan({ ...ctx, seed: 1 }),
      b = autoPlan({ ...ctx, seed: 1 }),
      c = autoPlan({ ...ctx, seed: 2 });
    expect(a).toEqual(b);
    expect(JSON.stringify(a)).not.toEqual(JSON.stringify(c));
  });

  it('opens on the tagline and never repeats a move back to back', () => {
    const p = autoPlan({ ...ctx, shots: 6, seed: 3 });
    expect(p.scenes[0].caption?.text).toBe(ctx.product.tagline);
    for (let i = 1; i < p.scenes.length; i++) expect(p.scenes[i].move).not.toBe(p.scenes[i - 1].move);
  });
});
