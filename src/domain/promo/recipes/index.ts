// All the aesthetics, checked once when first imported. Add one by adding its JSON here.
import { parseRecipe, type Recipe } from '../recipe';
import brutalist from './brutalist.json';
import cleanApple from './clean-apple.json';
import retroTerminal from './retro-terminal.json';
import swissMinimal from './swiss-minimal.json';
import y2kChrome from './y2k-chrome.json';

// gallery order
export const RECIPES: readonly Recipe[] = [cleanApple, y2kChrome, swissMinimal, brutalist, retroTerminal].map(
  parseRecipe,
);

export const DEFAULT_RECIPE = RECIPES[0];

export const recipeBySlug = (slug: string): Recipe | undefined => RECIPES.find(r => r.slug === slug);

// the reels of the home page's signature moment, in order
export const SIGNATURE_REELS = ['clean-apple', 'y2k-chrome', 'brutalist', 'swiss-minimal'].map(s =>
  recipeBySlug(s)!,
);
