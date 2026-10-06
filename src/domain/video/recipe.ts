// An aesthetic is a recipe, not code: palette (with the user's brand colour slotted in), two fonts,
// how it moves, its texture, its transitions and text moves, and the scene types it allows. Recipes
// are JSON files in ./recipes; the same data drives the engine, the AI prompts and the
// /aesthetics pages. Every scene takes its look from the recipe, so one scene looks different in
// each style.
import { isTextMove, isTransition, type TextMove, type TransitionMove } from './moves';
import { SCENE_TYPES, type SceneType } from './scenes';

// fonts the engine can draw with (the app loads each under this id; all open-licence)
export const FONT_IDS = [
  'inter',
  'inter-tight',
  'syne',
  'archivo-black',
  'space-mono',
  'vt323',
  'ibm-plex-mono',
] as const;
export type FontId = (typeof FONT_IDS)[number];

// eases a recipe can move with ('reel' is the site's own curve)
export const EASES = ['reel', 'power3.out', 'expo.out', 'back.out(1.7)', 'power2.inOut', 'steps(6)'] as const;
export type EaseName = (typeof EASES)[number];

// soft: a light gradient and a faint grid (Clean Soft)
export const TEXTURES = ['none', 'soft', 'grain', 'glow', 'scanlines'] as const;
export type Texture = (typeof TEXTURES)[number];

export interface Palette {
  // the stage
  bg: string;
  // cards and panels drawn on the stage
  surface: string;
  // text
  fg: string;
  muted: string;
  // the recipe's own accent (decoration); the brand colour replaces it when brandIsAccent
  accent: string;
}

export interface Recipe {
  slug: string;
  name: string;
  palette: Palette;
  // true: the user's brand colour becomes the accent everywhere; false: the recipe keeps its own
  // accent and the brand colour is used only for key words, rings, checkmarks and counters
  brandIsAccent: boolean;
  fonts: { display: FontId; body: FontId };
  // display text in capitals (Brutalist, Terminal) or as typed
  caps: boolean;
  // corner radius of cards, as a fraction of the frame's short side (0: square corners)
  radius: number;
  // speed: how fast entrances play (1 = normal, 1.3 = faster)
  motion: { ease: EaseName; speed: number; tempo: 'calm' | 'steady' | 'fast' };
  texture: Texture;
  // the first is the default
  transitions: TransitionMove[];
  textMoves: TextMove[];
  scenes: SceneType[];
  // the /aesthetics/[slug] page
  page: {
    keyword: string;
    title: string;
    description: string;
    blurb: string;
    bestFor: string[];
    mood: string;
  };
}

const HEX = /^#[0-9a-f]{6}$/i;

export class RecipeError extends Error {}

// checks a recipe's JSON and returns it typed; throws a RecipeError naming the first problem
export function parseRecipe(raw: unknown): Recipe {
  const r = raw as Recipe;
  const fail = (what: string): never => {
    throw new RecipeError(`${r?.slug ?? 'recipe'}: ${what}`);
  };
  if (!r || typeof r !== 'object') fail('not an object');
  if (!/^[a-z0-9-]+$/.test(r.slug)) fail('slug must be lowercase-hyphenated');
  for (const k of ['bg', 'surface', 'fg', 'muted', 'accent'] as const)
    if (!HEX.test(r.palette?.[k] ?? '')) fail(`palette.${k} must be #rrggbb`);
  if (typeof r.brandIsAccent !== 'boolean') fail('brandIsAccent must be true or false');
  for (const k of ['display', 'body'] as const)
    if (!FONT_IDS.includes(r.fonts?.[k])) fail(`fonts.${k} is not a known font`);
  if (!(r.radius >= 0 && r.radius <= 0.1)) fail('radius must be within 0–0.1');
  if (!EASES.includes(r.motion?.ease)) fail('motion.ease is not a known ease');
  if (!(r.motion?.speed >= 0.5 && r.motion.speed <= 2)) fail('motion.speed must be within 0.5–2');
  if (!TEXTURES.includes(r.texture)) fail('texture is not known');
  const list = (ids: unknown, ok: (id: unknown) => boolean, where: string) => {
    if (!Array.isArray(ids) || !ids.length) fail(`${where} needs at least one entry`);
    for (const id of ids as unknown[]) if (!ok(id)) fail(`${where}: "${String(id)}" is not allowed here`);
  };
  list(r.transitions, isTransition, 'transitions');
  list(r.textMoves, isTextMove, 'textMoves');
  list(r.scenes, id => SCENE_TYPES.includes(id as SceneType), 'scenes');
  if (!r.page?.keyword || !r.page.title || !r.page.description)
    fail('page needs keyword, title, description');
  return r;
}

// the palette with the brand colour slotted in: `brand` is what scenes use for key words, rings,
// checkmarks and counters
export function resolvePalette(r: Recipe, brandColor: string | null): Palette & { brand: string } {
  const brand = brandColor && HEX.test(brandColor) ? brandColor : r.palette.accent;
  return { ...r.palette, accent: r.brandIsAccent ? brand : r.palette.accent, brand };
}
