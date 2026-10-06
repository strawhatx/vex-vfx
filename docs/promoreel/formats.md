# Formats: aesthetic recipes, scene slots and video plans

A video is a **plan**: a list of **scenes** from the scene library, each with its slots filled,
drawn in an **aesthetic** (a recipe). The engine draws every pixel; a plan only holds words, numbers
and choices. Phase 2 adds the AI director, which writes plans in this same format.

## Aesthetic recipe

One JSON file per style in `src/domain/video/recipes/`, checked by `parseRecipe`
(`src/domain/video/recipe.ts`) when it's imported, so a bad recipe fails the build and the tests.

| Field | Meaning | Allowed values |
| --- | --- | --- |
| `slug`, `name` | URL slug, display name | lowercase-hyphenated |
| `palette` | `bg` (stage), `surface` (cards), `fg` (text), `muted`, `accent` | `#rrggbb` |
| `brandIsAccent` | the user's brand colour replaces the accent everywhere (`true`), or only drives key words, rings, checkmarks and counters (`false`) | boolean |
| `fonts` | `display`, `body` (open licences) | `inter`, `inter-tight`, `syne`, `archivo-black`, `space-mono`, `vt323`, `ibm-plex-mono` |
| `caps` | display text in capitals | boolean |
| `radius` | card corners, as a fraction of the short side | 0–0.1 |
| `motion` | `ease`, `speed` (entrances ×), `tempo` | ease: `reel`, `power3.out`, `expo.out`, `back.out(1.7)`, `power2.inOut`, `steps(6)`; speed 0.5–2 |
| `texture` | the stage and overlay | `soft` (light gradient, faint grid), `none`, `grain`, `glow`, `scanlines` |
| `transitions` | allowed transitions, first is the default | `soft-push`, `blur-dissolve`, `wipe`, `whip-pan`, `flash-cut`, `glitch` |
| `textMoves` | allowed kinetic-type moves | `mask-reveal`, `word-pop`, `letter-stagger`, `highlight-swipe`, `word-slam`, `typewriter` |
| `scenes` | allowed scene types | see below |
| `page` | the `/aesthetics/[slug]` page copy | `keyword`, `title`, `description`, `blurb`, `bestFor`, `mood` |

Example (`clean-soft.json`):

```json
{
  "slug": "clean-soft",
  "name": "Clean Soft",
  "palette": {
    "bg": "#F6F7F9",
    "surface": "#FFFFFF",
    "fg": "#101828",
    "muted": "#5D6677",
    "accent": "#1F6FEB"
  },
  "brandIsAccent": true,
  "fonts": {
    "display": "inter-tight",
    "body": "inter"
  },
  "caps": false,
  "radius": 0.035,
  "motion": {
    "ease": "reel",
    "speed": 0.9,
    "tempo": "calm"
  },
  "texture": "soft",
  "transitions": [
    "soft-push",
    "blur-dissolve"
  ],
  "textMoves": [
    "mask-reveal",
    "word-pop",
    "letter-stagger",
    "highlight-swipe"
  ],
  "scenes": [
    "logo-reveal",
    "stat-counter",
    "stat-ring",
    "card-stack",
    "ambient-wall",
    "kinetic-type"
  ],
  "page": {
    "keyword": "saas explainer video template",
    "title": "Clean SaaS explainer video template, free",
    "description": "Make a calm, trustworthy SaaS launch video: soft light, counters that tick up, cards that step in. Describe your product; edit everything; free in your browser.",
    "blurb": "Light and quiet, with soft gradients and a faint grid. Numbers count up, rings fill, cards step in as a timeline, and your brand colour carries every highlight. It's the look people already trust from the best B2B launch videos.",
    "bestFor": [
      "B2B and SaaS products",
      "website hero videos",
      "LinkedIn and Product Hunt launches"
    ],
    "mood": "calm, trustworthy, light"
  }
}
```

Adding a style means adding a JSON file and listing it in `recipes/index.ts`; every scene already
takes its look from the recipe.

## Scene library (Phase 1)

Every scene has `type`, `sec` (length), `caption` (the subtitle line; a word in `*asterisks*` shows
in the brand colour) and `transition` (into the next scene, or `null` for the style's default).
Numbers are `{ "value": number | null, "confirmed": boolean }`.

| Type | Shows | Slots | Length |
| --- | --- | --- | --- |
| `logo-reveal` | Logo (or a monogram) resolves, the name rises beside it, the tagline fades in | `name` (32), `tagline` (60, optional) | 2–4s |
| `stat-counter` | One big number counts up, a rule grows under it, the label rises | `value` (number, required), `prefix` (4), `suffix` (8), `label` (48) | 2.5–4s |
| `stat-ring` | A ring fills to a percentage, the number counts inside, a badge pops on | `percent` (0–100, required), `label` (48), `badge` (18, optional) | 2.5–4s |
| `card-stack` | 2–4 cards step in along a timeline, with a big stat beside them | `cards` [{`title` (28), `subtitle` (40)}], `stat` (number, optional), `statPrefix`, `statSuffix`, `statLabel` | 3–5.5s |
| `ambient-wall` | A drifting wall of icon cards gaining checkmarks, a line on top | `icon` (28 Lucide icons), `title` (48) | 2.5–4.5s |
| `kinetic-type` | Large text animates in | `text` (60), `move` (a text move the style allows) | 1.5–3.5s |
| subtitles | The caption bar on every scene, words appearing as if read aloud | each scene's `caption` (90) | — |

Every video ends with the engine's own end card (logo, name, URL, "Made with PromoReel"), 2.5s.

## Video plan

```json
{
  "v": 2,
  "format": "9:16",
  "aesthetic": "clean-soft",
  "brandColor": "#1F6FEB",
  "length": 15,
  "product": {
    "name": "Orbit",
    "url": "orbit.dev"
  },
  "captions": true,
  "scenes": [
    {
      "type": "logo-reveal",
      "sec": 2.4,
      "caption": "Meet *Orbit*.",
      "transition": null,
      "name": "Orbit",
      "tagline": "Release notes on autopilot"
    },
    {
      "type": "kinetic-type",
      "sec": 2,
      "caption": "Writing them is the worst part of shipping.",
      "transition": null,
      "text": "Release notes take *hours*.",
      "move": "mask-reveal"
    },
    {
      "type": "card-stack",
      "sec": 4,
      "caption": "Connect, draft, *publish*.",
      "transition": null,
      "cards": [
        {
          "title": "Connect your repo",
          "subtitle": "GitHub or GitLab"
        },
        {
          "title": "Orbit drafts the notes",
          "subtitle": "From every merged pull request"
        },
        {
          "title": "Publish everywhere",
          "subtitle": "Changelog, email and Slack"
        }
      ],
      "stat": {
        "value": 2,
        "confirmed": true
      },
      "statPrefix": "",
      "statSuffix": "min",
      "statLabel": "from merge to published"
    },
    {
      "type": "stat-counter",
      "sec": 2.8,
      "caption": "Teams everywhere ship with *Orbit*.",
      "transition": null,
      "value": {
        "value": 12000,
        "confirmed": true
      },
      "prefix": "",
      "suffix": "+",
      "label": "teams ship with Orbit"
    },
    {
      "type": "kinetic-type",
      "sec": 2,
      "caption": "Start free at orbit.dev",
      "transition": null,
      "text": "Ship notes, not *chores*.",
      "move": "word-pop"
    }
  ]
}
```

`format` is `9:16`, `1:1` or `16:9`; `length` is the target, 15, 30 or 60 seconds.

### The plan checker (`src/domain/video/check.ts`)

Every plan from outside (the AI in Phase 2, a saved project) goes through `checkPlan` before it plays.

- **Fixed and listed:** unknown scene types are dropped; a move or transition the style doesn't
  allow is swapped for its own; text is cut at a word to its limit; numbers are kept in range;
  lengths are clamped to each scene's range; the whole video is kept within 10% of the target
  length where the scene ranges allow (otherwise a note says to add or remove a scene).
- **Numbers are never invented:** a number is kept only if the user gave it (`supplied` stats, in
  Phase 2's intake) or confirmed it in the editor. Anything else is emptied and shown in the editor
  as a slot to fill. Numbers written inside text are pointed out as notes.
- **Dropped:** a scene missing required text, or a card stack with fewer than two cards.
- **Refused:** not an object, no scenes, or no usable scene. (The Phase 2 fallback plan then takes over.)

Edits in the editor go through `src/domain/video/edit.ts`, which never drops a scene mid-edit;
`blockers()` lists what must be done before export (empty required text, numbers to fill in or confirm).

## Example plans

`src/domain/video/examples/`: `orbit-launch` (15s, 9:16), `orbit-feature` (30s, 16:9),
`orbit-stats` (15s, 1:1) and `starter` (the build plan's example shape, with its numbers left empty).
A test checks each one passes the checker unchanged.

## AI director prompts

Phase 2. The script pass, scene pass and helper prompts will be built from this same data: the
recipe, the scene library's `describe` lines and slot limits, and the example plans as few-shot
examples. Users bring their own Gemini or Claude key.
