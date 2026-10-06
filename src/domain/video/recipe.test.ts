import { describe, expect, it } from 'vitest';
import { parseRecipe, RecipeError, resolvePalette } from './recipe';
import { RECIPES, recipeBySlug, SIGNATURE_REELS } from './recipes';
import { SCENE_TYPES } from './scenes';

describe('recipes', () => {
  it('all five parse, with unique slugs and keywords', () => {
    expect(RECIPES.map(r => r.slug)).toEqual([
      'clean-soft',
      'y2k-chrome',
      'swiss-minimal',
      'brutalist',
      'retro-terminal',
    ]);
    expect(new Set(RECIPES.map(r => r.page.keyword)).size).toBe(RECIPES.length);
  });

  it('every style allows every phase-1 scene', () => {
    for (const r of RECIPES) expect(r.scenes).toEqual(SCENE_TYPES);
  });

  it('the signature runs Clean Soft → Y2K Chrome → Swiss Minimal → Brutalist', () => {
    expect(SIGNATURE_REELS.map(r => r.name)).toEqual([
      'Clean Soft',
      'Y2K Chrome',
      'Swiss Minimal',
      'Brutalist',
    ]);
  });

  it('refuses a transition used as a text move, and an unknown scene', () => {
    const r = recipeBySlug('brutalist')!;
    expect(() => parseRecipe({ ...r, textMoves: ['wipe'] })).toThrow(RecipeError);
    expect(() => parseRecipe({ ...r, scenes: ['hologram'] })).toThrow(/scenes/);
  });

  it('slots the brand colour in', () => {
    const soft = resolvePalette(recipeBySlug('clean-soft')!, '#2E8B57');
    expect(soft.accent).toBe('#2E8B57');
    expect(soft.brand).toBe('#2E8B57');
    // a style with its own accent keeps it; the brand still drives highlights
    const y2k = resolvePalette(recipeBySlug('y2k-chrome')!, '#2E8B57');
    expect(y2k.accent).toBe('#7CF3FF');
    expect(y2k.brand).toBe('#2E8B57');
    // no brand colour: the style's accent stands in
    expect(resolvePalette(recipeBySlug('y2k-chrome')!, null).brand).toBe('#7CF3FF');
  });
});
