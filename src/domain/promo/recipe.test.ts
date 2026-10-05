import { describe, expect, it } from 'vitest';
import { allowedMoves, parseRecipe, RecipeError } from './recipe';
import { RECIPES, recipeBySlug, SIGNATURE_REELS } from './recipes';

describe('recipes', () => {
  it('all five parse, with unique slugs', () => {
    expect(RECIPES.map(r => r.slug)).toEqual([
      'clean-apple',
      'y2k-chrome',
      'swiss-minimal',
      'brutalist',
      'retro-terminal',
    ]);
  });

  it('the signature reels run Clean → Y2K → Brutalist → Swiss', () => {
    expect(SIGNATURE_REELS.map(r => r.name)).toEqual([
      'Clean Apple',
      'Y2K Chrome',
      'Brutalist',
      'Swiss Minimal',
    ]);
  });

  it('each recipe has a unique keyword for its page', () => {
    const keywords = RECIPES.map(r => r.page.keyword);
    expect(new Set(keywords).size).toBe(keywords.length);
  });

  it('refuses a move of the wrong kind', () => {
    const bad = { ...recipeBySlug('brutalist')!, transitions: ['word-pop'] };
    expect(() => parseRecipe(bad)).toThrow(RecipeError);
  });

  it('refuses an unknown font', () => {
    const r = recipeBySlug('clean-apple')!;
    expect(() => parseRecipe({ ...r, fonts: { ...r.fonts, display: 'comic-sans' } })).toThrow(
      /fonts.display/,
    );
  });

  it('lists every allowed move', () => {
    expect(allowedMoves(recipeBySlug('y2k-chrome')!)).toContain('glitch');
  });
});
