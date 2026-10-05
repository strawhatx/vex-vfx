// The AI director on the user's own Anthropic API key, called straight from this browser. The key is
// held by the studio in memory (or in this browser's storage if the user asks); it never touches our
// servers. The reply is constrained to the plan's JSON shape, with only this aesthetic's moves.
import Anthropic from '@anthropic-ai/sdk';
import type { Director } from '@/application/promo/ports';
import type { Recipe } from '@/domain/promo/recipe';
import type { ShotStore } from './shots';

export const DIRECTOR_MODEL = 'claude-opus-5-5';

export class AnthropicDirector implements Director {
  constructor(
    private shots: ShotStore,
    private recipe: () => Recipe,
  ) {}

  async direct({ prompt, shotIds, apiKey }: { prompt: string; shotIds: string[]; apiKey: string }) {
    const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 1 });
    const images = await Promise.all(shotIds.map(id => this.shots.jpegBase64(id)));
    try {
      const response = await client.beta.messages.create({
        model: DIRECTOR_MODEL,
        max_tokens: 16000,
        // a refused request is re-run on Anthropic's recommended fallback model
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: {
          effort: 'medium',
          format: { type: 'json_schema', schema: planSchema(this.recipe()) },
        },
        messages: [
          {
            role: 'user',
            content: [
              ...images.flatMap((data, i) => [
                { type: 'text' as const, text: `Screenshot ${i}:` },
                {
                  type: 'image' as const,
                  source: { type: 'base64' as const, media_type: 'image/jpeg' as const, data },
                },
              ]),
              { type: 'text', text: prompt },
            ],
          },
        ],
      });
      if (response.stop_reason === 'refusal') throw new Error('The AI declined to direct this one.');
      const text = response.content.flatMap(b => (b.type === 'text' ? [b.text] : [])).join('');
      if (!text) throw new Error('The AI sent back an empty answer.');
      return text;
    } catch (e) {
      throw new Error(explain(e));
    }
  }
}

function explain(e: unknown): string {
  if (e instanceof Anthropic.AuthenticationError) return 'That API key wasn’t accepted.';
  if (e instanceof Anthropic.PermissionDeniedError) return 'That API key can’t use this model.';
  if (e instanceof Anthropic.RateLimitError)
    return 'The API is rate-limiting this key. Wait a minute and try again.';
  if (e instanceof Anthropic.BadRequestError) return `The API refused the request: ${e.message}`;
  if (e instanceof Anthropic.APIConnectionError)
    return 'Couldn’t reach the Anthropic API. Check your connection.';
  if (e instanceof Anthropic.APIError) return `The API had a problem (${e.status ?? 'error'}). Try again.`;
  return e instanceof Error ? e.message : 'The AI call failed.';
}

// the plan's JSON shape, with this recipe's moves as the only choices
function planSchema(r: Recipe) {
  const str = { type: 'string' };
  const num = { type: 'number' };
  const obj = (properties: Record<string, unknown>) => ({
    type: 'object',
    properties,
    required: Object.keys(properties),
    additionalProperties: false,
  });
  const text = obj({ text: str, move: { type: 'string', enum: r.moves.text } });
  return obj({
    v: { type: 'integer', enum: [1] },
    aspect: { type: 'string', enum: ['9:16', '16:9'] },
    hook: obj({ text: str, move: { type: 'string', enum: r.moves.text }, duration: num }),
    scenes: {
      type: 'array',
      items: obj({
        shot: { type: 'integer' },
        duration: num,
        move: { type: 'string', enum: r.moves.screen },
        zoom: obj({ x: num, y: num, scale: num }),
        caption: text,
        transition: { type: 'string', enum: r.transitions },
        extra: { anyOf: [{ type: 'string', enum: r.moves.extra }, { type: 'null' }] },
      }),
    },
    outro: obj({ cta: str }),
  });
}
