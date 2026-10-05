import { describe, expect, it } from 'vitest';
import { MOVE_IDS } from './moves';
import { directorPrompt } from './prompt';
import { recipeBySlug } from './recipes';

describe('directorPrompt', () => {
  const recipe = recipeBySlug('retro-terminal')!;
  const text = directorPrompt({
    recipe,
    product: { name: 'grepd', tagline: 'Search every repo at once', url: 'https://grepd.dev' },
    shots: 4,
    aspect: '16:9',
    purpose: 'a Product Hunt launch',
  });

  it('names the product, the shots and the aspect', () => {
    expect(text).toContain('grepd');
    expect(text).toContain('grepd.dev');
    expect(text).toContain('4 screenshots');
    expect(text).toContain('horizontal (16:9)');
    expect(text).toContain('Product Hunt');
  });

  it('offers only the moves this aesthetic allows', () => {
    const allowed = new Set([
      ...recipe.moves.screen,
      ...recipe.moves.text,
      ...recipe.moves.extra,
      ...recipe.transitions,
    ]);
    for (const id of MOVE_IDS) expect(text.includes(`"${id}":`)).toBe(allowed.has(id));
  });
});
