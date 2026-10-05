// An aesthetic is a recipe: its palette, two fonts, how it moves, its texture, layout, and which
// moves it allows. The recipes are JSON files in ./recipes. The same data drives the video engine,
// the director prompt and the /aesthetics pages.
import { isMove, kindOf, type MoveId, type MoveKind } from './moves';

// fonts the engine can draw with (the app loads each under this id)
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

export const TEXTURES = ['none', 'grain', 'glow', 'scanlines'] as const;
export type Texture = (typeof TEXTURES)[number];

// how the screenshot sits in the frame
export const LAYOUTS = ['centered', 'floating-device', 'full-bleed', 'grid', 'terminal'] as const;
export type Layout = (typeof LAYOUTS)[number];

export type Tempo = 'calm' | 'steady' | 'fast';

export interface Palette {
  bg: string;
  fg: string;
  accent: string;
  muted: string;
}

export interface Recipe {
  slug: string;
  name: string;
  palette: Palette;
  fonts: { display: FontId; body: FontId };
  // display text in capitals (Brutalist, Terminal) or as typed
  caps: boolean;
  motion: { ease: EaseName; tempo: Tempo; scene: [number, number] };
  texture: Texture;
  layout: Layout;
  transitions: MoveId[];
  moves: { screen: MoveId[]; text: MoveId[]; extra: MoveId[] };
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
  for (const k of ['bg', 'fg', 'accent', 'muted'] as const)
    if (!HEX.test(r.palette?.[k] ?? '')) fail(`palette.${k} must be #rrggbb`);
  for (const k of ['display', 'body'] as const)
    if (!FONT_IDS.includes(r.fonts?.[k])) fail(`fonts.${k} is not a known font`);
  if (!EASES.includes(r.motion?.ease)) fail('motion.ease is not a known ease');
  const [lo, hi] = r.motion?.scene ?? [];
  if (!(lo >= 1 && hi <= 6 && lo < hi)) fail('motion.scene must be [min, max] within 1–6s');
  if (!TEXTURES.includes(r.texture)) fail('texture is not known');
  if (!LAYOUTS.includes(r.layout)) fail('layout is not known');
  const allowed = (ids: unknown, kind: MoveKind, where: string) => {
    if (!Array.isArray(ids) || !ids.length) fail(`${where} needs at least one move`);
    for (const id of ids as unknown[])
      if (!isMove(id) || kindOf(id) !== kind) fail(`${where}: "${String(id)}" is not a ${kind} move`);
  };
  allowed(r.transitions, 'transition', 'transitions');
  allowed(r.moves?.screen, 'screen', 'moves.screen');
  allowed(r.moves?.text, 'text', 'moves.text');
  allowed(r.moves?.extra, 'extra', 'moves.extra');
  if (!r.page?.keyword || !r.page.title || !r.page.description)
    fail('page needs keyword, title, description');
  return r;
}

// every move this recipe lets a plan use
export const allowedMoves = (r: Recipe): MoveId[] => [
  ...r.moves.screen,
  ...r.moves.text,
  ...r.moves.extra,
  ...r.transitions,
];
