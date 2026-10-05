// The prompt that asks an AI (Claude, ChatGPT, Gemini, or the user's own API key) to direct the
// video. It names only the moves this aesthetic allows and asks for JSON in the plan's exact shape;
// whatever comes back still goes through validatePlan.
import { MOVES, type MoveId } from './moves';
import { LIMITS, OUTRO_SECONDS, type Aspect } from './plan';
import { displayUrl, type Product } from './product';
import type { Recipe } from './recipe';

export interface PromptInput {
  recipe: Recipe;
  product: Product;
  shots: number;
  aspect: Aspect;
  // what the video is for, e.g. "a Product Hunt launch"; shapes the length and tone
  purpose?: string;
  // target length in seconds
  seconds?: [number, number];
}

const list = (ids: readonly MoveId[]) => ids.map(id => `  - "${id}": ${MOVES[id].describe}`).join('\n');

export function directorPrompt({ recipe, product, shots, aspect, purpose, seconds = [15, 25] }: PromptInput) {
  const [lo, hi] = recipe.motion.scene;
  return `You are the director of a short promo video for a software product. You get ${shots} screenshot${shots === 1 ? '' : 's'} of the product (attached in order: screenshot 0 is the first). Plan a ${seconds[0]}–${seconds[1]} second ${aspect === '9:16' ? 'vertical (9:16)' : 'horizontal (16:9)'} video${purpose ? ` for ${purpose}` : ''} in the "${recipe.name}" style (${recipe.page.mood}).

PRODUCT
- Name: ${product.name || '(not given)'}
- Tagline: ${product.tagline || '(not given)'}
- URL: ${displayUrl(product.url) || '(not given)'}

HOW TO DIRECT
1. Look at each screenshot. Find what it shows and the one detail worth zooming in on.
2. Open with a hook: at most 6 words that make a developer stop scrolling. Not the product name alone.
3. Put the most impressive screenshot first. You may skip weak screenshots or show one twice (with a different zoom).
4. Each caption is a benefit to the user, not a feature list. At most ${LIMITS.caption} characters; 2–6 words is best.
5. Zoom: x and y are where to push in, as fractions of the screenshot (0 = left/top, 1 = right/bottom); scale is how far (1 = whole screen, up to ${LIMITS.zoomScale[1]}).
6. Scene durations between ${lo} and ${hi} seconds. Use ${LIMITS.scenes[0]}–${LIMITS.scenes[1]} scenes. A ${OUTRO_SECONDS}s outro with the name and URL is added for you.

MOVES YOU MAY USE (use only these exact names)
Screen moves ("move"):
${list(recipe.moves.screen)}
Text moves (the hook's and each caption's "move"):
${list(recipe.moves.text)}
Transitions ("transition", from each scene into the next):
${list(recipe.transitions)}
Extras ("extra", optional, or null):
${list(recipe.moves.extra)}

ANSWER WITH ONLY THIS JSON, nothing before or after it:
{
  "v": 1,
  "aspect": "${aspect}",
  "hook": { "text": string, "move": text move, "duration": number (${LIMITS.hook[0]}–${LIMITS.hook[1]}) },
  "scenes": [
    {
      "shot": number (screenshot index, 0–${Math.max(0, shots - 1)}),
      "duration": number,
      "move": screen move,
      "zoom": { "x": number, "y": number, "scale": number },
      "caption": { "text": string, "move": text move },
      "transition": transition,
      "extra": extra or null
    }
  ],
  "outro": { "cta": string (at most ${LIMITS.cta} characters, e.g. "Try it free") }
}`;
}
