// The director without AI: a plan made by rules from the aesthetic and the screenshots, so nobody hits
// a dead end. The same seed gives the same plan; "Re-direct" asks again with a new seed.
import { LIMITS, type Aspect, type Plan, type Scene } from './plan';
import { displayUrl, type Product } from './product';
import type { Recipe } from './recipe';
import { pick, rng } from './rng';
import { trimText } from './validate';

export interface AutoPlanInput {
  recipe: Recipe;
  shots: number;
  product: Product;
  aspect: Aspect;
  seed: number;
}

// captions for scenes after the first (which uses the tagline); short, about the user, editable
const CAPTIONS = [
  'See it in action',
  'Everything in one place',
  'Built for speed',
  'Set up in seconds',
  'Less busywork',
  'Made for makers',
  'Simple by design',
  'Works the way you do',
];

// spots on a screenshot worth pushing in on (most UIs put the action up top or centre)
const FOCUS = [
  { x: 0.5, y: 0.3 },
  { x: 0.5, y: 0.55 },
  { x: 0.3, y: 0.35 },
  { x: 0.7, y: 0.4 },
];

const SECONDS = { calm: 3, steady: 2.4, fast: 1.8 };

export function autoPlan({ recipe, shots, product, aspect, seed }: AutoPlanInput): Plan {
  const r = rng(seed);
  const n = Math.min(LIMITS.scenes[1], Math.max(LIMITS.scenes[0], shots));
  const [lo, hi] = recipe.motion.scene;
  const base = SECONDS[recipe.motion.tempo];
  const captions = [...CAPTIONS].sort(() => r() - 0.5);
  const screenMoves = recipe.moves.screen;

  let last = '';
  const scenes: Scene[] = [];
  for (let i = 0; i < n; i++) {
    const shot = i % shots;
    const first = i === 0,
      final = i === n - 1;
    // the first scene gets the aesthetic's lead move; then never the same move twice in a row
    let move = first ? screenMoves[0] : pick(r, screenMoves);
    if (move === last && screenMoves.length > 1)
      move = screenMoves[(screenMoves.indexOf(move) + 1) % screenMoves.length];
    if (final && screenMoves.includes('zoom-detail') && last !== 'zoom-detail') move = 'zoom-detail';
    last = move;
    const focus = pick(r, FOCUS);
    const zoomed = move === 'zoom-detail' || (!first && r() < 0.35);
    const caption = first && product.tagline ? product.tagline : captions[i % captions.length];
    scenes.push({
      shot,
      duration: Math.round(Math.min(hi, Math.max(lo, base + (r() - 0.5) * 0.6)) * 100) / 100,
      move,
      zoom: zoomed
        ? { ...focus, scale: Math.round((1.4 + r() * 0.5) * 100) / 100 }
        : { x: 0.5, y: 0.5, scale: 1 },
      caption: {
        text: trimText(caption, LIMITS.caption),
        move: recipe.moves.text[i % recipe.moves.text.length],
      },
      transition: recipe.transitions[i % recipe.transitions.length],
      extra: i % 2 === 0 ? recipe.moves.extra[(i / 2) % recipe.moves.extra.length] : null,
    });
  }

  return {
    v: 1,
    aspect,
    hook: {
      text: trimText(hookFor(product, r), LIMITS.hookText),
      move: recipe.moves.text[0],
      duration: recipe.motion.tempo === 'fast' ? 1.4 : 1.8,
    },
    scenes,
    outro: { title: product.name || 'Your product', url: displayUrl(product.url), cta: 'Try it free' },
  };
}

function hookFor(p: Product, r: () => number): string {
  const name = p.name.trim();
  if (!name) return p.tagline || 'Something new';
  return pick(r, [`Meet ${name}`, `Introducing ${name}`, `${name} is here`]);
}
