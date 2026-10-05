# Formats: aesthetic recipes, video plans, and the AI director prompt

## Aesthetic recipe

One JSON file per style in `src/domain/promo/recipes/`. The same data drives the video engine, the
director prompt (which moves the AI may use), and the `/aesthetics/[slug]` page. `parseRecipe` in
`src/domain/promo/recipe.ts` checks every file when it's imported, so a bad recipe fails the build
and the tests.

| Field | Meaning | Allowed values |
| --- | --- | --- |
| `slug`, `name` | URL slug, display name | lowercase-hyphenated |
| `palette` | `bg`, `fg`, `accent`, `muted` | `#rrggbb` (the user's brand colour is added on top) |
| `fonts` | `display`, `body` | `inter`, `inter-tight`, `syne`, `archivo-black`, `space-mono`, `vt323`, `ibm-plex-mono` |
| `caps` | Set display text in capitals | boolean |
| `motion` | `ease`, `tempo`, `scene` (min/max seconds per scene) | ease: `reel`, `power3.out`, `expo.out`, `back.out(1.7)`, `power2.inOut`, `steps(6)`; tempo: `calm`, `steady`, `fast`; scene within 1–6 |
| `texture` | Laid over every frame | `none`, `grain`, `glow`, `scanlines` |
| `layout` | How the screenshot sits | `centered`, `floating-device`, `full-bleed`, `grid`, `terminal` |
| `transitions` | Transitions it allows | transition moves |
| `moves` | `screen`, `text`, `extra` moves it allows | from the move library |
| `page` | SEO page copy | `keyword`, `title`, `description`, `blurb`, `bestFor`, `mood` |

Example (`y2k-chrome.json`):

```json
{
  "slug": "y2k-chrome",
  "name": "Y2K Chrome",
  "palette": { "bg": "#070B1A", "fg": "#EAF2FF", "accent": "#7CF3FF", "muted": "#8E9AB5" },
  "fonts": { "display": "syne", "body": "inter-tight" },
  "caps": false,
  "motion": { "ease": "back.out(1.7)", "tempo": "fast", "scene": [1.4, 2.6] },
  "texture": "glow",
  "layout": "floating-device",
  "transitions": ["flash-cut", "glitch", "whip-pan"],
  "moves": {
    "screen": ["tilt-float", "device-frame-spin", "zoom-detail", "slide-in"],
    "text": ["word-slam", "word-pop"],
    "extra": ["light-sweep", "glow-pulse"]
  },
  "page": {
    "keyword": "y2k product video template",
    "title": "Y2K product video template: chrome, glow, free",
    "description": "Turn app screenshots into a Y2K chrome promo video: glowing devices, flash cuts and slammed type. Free and private, made in your browser.",
    "blurb": "Liquid chrome, cyan glow and a night-sky backdrop. Devices spin in, words slam onto the screen and cuts land on a white flash. It stops the scroll on TikTok and X because it does not look like another SaaS ad.",
    "bestFor": ["consumer and social apps", "TikTok and Reels promos", "creator and music tools"],
    "mood": "loud, shiny, nostalgic"
  }
}
```

To add a style: add a JSON file, import it in `recipes/index.ts`, and add a backdrop for its slug
in `src/infrastructure/promo/engine/backdrop.ts` if it needs its own stage.

## Video plan

The AI (or the rules) returns this. `src/domain/promo/plan.ts` defines it.

```json
{
  "v": 1,
  "aspect": "9:16",
  "hook": { "text": "Orbit is here", "move": "word-slam", "duration": 1.4 },
  "scenes": [
    {
      "shot": 0,
      "duration": 2.4,
      "move": "device-frame-spin",
      "zoom": { "x": 0.5, "y": 0.5, "scale": 1 },
      "caption": { "text": "Changelogs that write themselves", "move": "word-pop" },
      "transition": "flash-cut",
      "extra": "glow-pulse"
    },
    {
      "shot": 1,
      "duration": 2.2,
      "move": "zoom-detail",
      "zoom": { "x": 0.5, "y": 0.36, "scale": 1.8 },
      "caption": { "text": "Ship notes in one click", "move": "word-slam" },
      "transition": "glitch",
      "extra": null
    }
  ],
  "outro": { "cta": "Try it free" }
}
```

### Validation (`src/domain/promo/validate.ts`)

Every plan goes through `validatePlan` before it plays, whoever wrote it.

- **Fixed and listed** (the UI shows "We tidied N things"): a move that doesn't exist, is the wrong kind, or isn't allowed by the style is swapped for one the style allows; zoom x/y are clamped to 0–1 and scale to 1–3; scene durations are kept to the style's range (always within 1–6s); long captions (60 characters) and hooks (48) are cut at a word; more than 8 scenes are trimmed; fewer than 3 are padded with unused screenshots; the whole video is kept within 8–45s.
- **Always the engine's own:** the outro card's name and URL come from the product details, whatever the plan says (only the call to action can come from the plan); the aspect is the one the user chose.
- **Refused:** not JSON, no scenes, or more than half the scenes pointing at screenshots that don't exist. The studio then shows the rule-based plan (`autoPlan.ts`) with a notice, so there's always a video.

## The AI director prompt

Built by `directorPrompt` in `src/domain/promo/prompt.ts`. It lists only the moves the chosen style
allows, each with a one-line description, plus the product, the number of screenshots, the aspect,
the purpose and target length (from a `/for` page) and the exact JSON shape. With the user's API
key, the request also constrains the reply to that shape with structured outputs, with each move
field limited to the style's moves (`src/infrastructure/promo/anthropicDirector.ts`).

This is the prompt for Y2K Chrome, 4 screenshots, opened from the TikTok page:

```text
You are the director of a short promo video for a software product. You get 4 screenshots of the product (attached in order: screenshot 0 is the first). Plan a 12–22 second vertical (9:16) video for a TikTok post (9:16, fast, hook in the first second, captions must be readable without sound) in the "Y2K Chrome" style (loud, shiny, nostalgic).

PRODUCT
- Name: Orbit
- Tagline: Changelogs that write themselves
- URL: orbit.dev

HOW TO DIRECT
1. Look at each screenshot. Find what it shows and the one detail worth zooming in on.
2. Open with a hook: at most 6 words that make a developer stop scrolling. Not the product name alone.
3. Put the most impressive screenshot first. You may skip weak screenshots or show one twice (with a different zoom).
4. Each caption is a benefit to the user, not a feature list. At most 60 characters; 2–6 words is best.
5. Zoom: x and y are where to push in, as fractions of the screenshot (0 = left/top, 1 = right/bottom); scale is how far (1 = whole screen, up to 3).
6. Scene durations between 1.4 and 2.6 seconds. Use 3–8 scenes. A 2.6s outro with the name and URL is added for you.

MOVES YOU MAY USE (use only these exact names)
Screen moves ("move"):
  - "tilt-float": the screen floats tilted in 3D and slowly turns to face the viewer. Premium, hero shots.
  - "device-frame-spin": the device spins in from edge-on and settles facing the viewer. A big reveal; use once.
  - "zoom-detail": starts on the whole screen, then pushes in on the zoom target. Use to point at one feature.
  - "slide-in": the screen glides up into place, then drifts slowly. Calm, works anywhere.
Text moves (the hook's and each caption's "move"):
  - "word-slam": each word slams down from large to its size. Loud; best for short hooks.
  - "word-pop": words pop in one by one with a small overshoot. Friendly, upbeat.
Transitions ("transition", from each scene into the next):
  - "flash-cut": a hard cut through a quick white flash. Punchy, on the beat.
  - "glitch": the frame tears into offset slices for a moment. Edgy, tech.
  - "whip-pan": a fast blurred pan sideways into the next scene. Energetic.
Extras ("extra", optional, or null):
  - "light-sweep": a band of light sweeps across the screen once. Adds shine to a hero shot.
  - "glow-pulse": the screen glows in the brand colour and pulses gently. Draws the eye.

ANSWER WITH ONLY THIS JSON, nothing before or after it:
{
  "v": 1,
  "aspect": "9:16",
  "hook": { "text": string, "move": text move, "duration": number (1–3) },
  "scenes": [
    {
      "shot": number (screenshot index, 0–3),
      "duration": number,
      "move": screen move,
      "zoom": { "x": number, "y": number, "scale": number },
      "caption": { "text": string, "move": text move },
      "transition": transition,
      "extra": extra or null
    }
  ],
  "outro": { "cta": string (at most 24 characters, e.g. "Try it free") }
}```

### The three ways to get a plan

| Mode | What happens | Code |
| --- | --- | --- |
| No AI | `autoPlan` builds a plan from the style and screenshots, seeded; "Re-direct" uses a new seed | `domain/promo/autoPlan.ts` |
| Copy prompt | The user pastes the prompt and screenshots into Claude, ChatGPT or Gemini and pastes the reply back; `extractJson` finds the JSON even inside prose or a code fence | `domain/promo/parse.ts` |
| Your API key | The browser calls Anthropic's Messages API directly (`claude-opus-5-5`, structured output, server-side refusal fallback). The key never reaches our server | `infrastructure/promo/anthropicDirector.ts` |

Other providers can be added by implementing the `Director` port (`application/promo/ports.ts`)
and offering them in `components/create/DirectPanel.tsx`.
