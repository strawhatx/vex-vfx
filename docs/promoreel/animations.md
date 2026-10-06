# Animations: where they are and how to tune them

**One motion system.** Everything uses the "reel" ease, `cubic-bezier(0.22, 1, 0.36, 1)`: as
`--ease-reel` in CSS (`src/app/globals.css:16`) and as GSAP's `'reel'`
(`src/components/site/motion.ts:8` for the site, `src/infrastructure/promo/engine/ease.ts:7` for
the videos). Durations step 0.2 / 0.4 / 0.8 / 1.6s (`--t-1` to `--t-4`). Change the curve in those
three places and the whole site and every video change together.

**Reduced motion.** With `prefers-reduced-motion`, the intro, the pin, smooth scrolling, the reveals,
and the hero's rise-in are all off; CSS transitions are cut to ~0; the engine previews show a
still frame. All content stays visible.

## On the site

Motion is quiet, the Apple way: things rise and fade in once, and the product does the moving.

| Animation | Where | Duration / ease | Code |
| --- | --- | --- | --- |
| Hero frame rises in (24px, 98% → 100%, fade) | Home hero | 1.6s, reel, on load; the text never moves | `components/home/home.css` (`@keyframes rise`) |
| Showcase pin and style changes | Signature section | pinned for `reels × 90%` of the viewport | `components/home/Showcase.tsx` (ScrollTrigger) |
| Style change crossfade (opacity 0.35 → 1, 98.5% → 100%) | Showcase frame | 0.6s, reel | `Showcase.tsx` |
| Segmented control selection | Showcase | 0.4s, reel | `.segmented` in `home.css` |
| "Now try yours" drag-over and landing | Showcase end | 0.4s, reel; `landed` keyframes | `home.css` |
| Split headlines (words rise from a mask) | `h2[data-split]` below the fold | 0.8s, 0.06s stagger, reel | `components/site/SiteMotion.tsx` |
| Section reveals (y 32px, fade) | `[data-reveal]` below the fold | 0.8s, reel | `SiteMotion.tsx` |
| Smooth scroll | Marketing pages | Lenis, 1.1s, ease-out cubic | `SiteMotion.tsx` |
| Tiles grow (102%) and play on hover | Five styles, /create gallery | 0.8s, reel; plays the live engine | `.tile` in `home.css`, `EnginePlayer.tsx` |
| Buttons and links | Everywhere | 0.2s colour, reel | `.btn` in `globals.css` |
| Drop zone: over, landed pulse, blue sweep | /create step 2 | 0.4s and 0.8s reel | `components/create/create.css` |

## In the videos

Every frame is a function of time: a paused GSAP timeline gives each scene its span and each cut its
progress (`src/infrastructure/video/engine/timeline.ts`), and each scene times its details from its
own local time with `at()` (the style's ease, scaled by its speed) or `lin()` (linear), both in
`engine/scenes/common.ts`. Times below are at speed 1; a style with speed 1.3 plays them 1.3× faster.

| Timing | Value | Code |
| --- | --- | --- |
| Transitions | 0.5s, centred on the cut | `domain/video/plan.ts` (`TRANSITION_SECONDS`) |
| End card | 2.5s | `plan.ts` (`END_CARD_SECONDS`) |
| Subtitle words | appear over min(60% of the scene, 0.25s + 0.22s per word) | `engine/scenes/subtitles.ts` |

| Scene / move | What moves, and when | Code |
| --- | --- | --- |
| logo-reveal | mark scales 60% → 100% with overshoot (0–0.7s), a ring ripples out (0.25–1.25s), the name rises from behind an edge (0.4–1.1s), the tagline fades up (0.85–1.45s) | `engine/scenes/logoReveal.ts` |
| stat-counter | number counts up (0.15–1.65s, style ease), rule grows (0.5–1.4s), label rises (0.6–1.3s) | `statCounter.ts` |
| stat-ring | ring fills and number counts (0.2–1.7s), label rises (0.5–1.2s), badge pops (1.4–1.85s) | `statRing.ts` |
| card-stack | card i slides in from 8u right at 0.25 + 0.45·i s (0.6s each), the timeline line grows to it; the stat counts after the last card (1.2s) | `cardStack.ts` |
| ambient-wall | rows drift ±3.5u per second; each card's checkmark pops at a fixed hashed time within the first 70% of the scene; the line's card rises (0.3–0.9s), its text mask-reveals | `ambientWall.ts` |
| word-slam | each word drops from 2.6× to its size, words 0.55 apart | `engine/text.ts` |
| word-pop | each word scales 35% → 100% with overshoot, 0.35 apart | `text.ts` |
| mask-reveal | each line rises from behind an edge, lines 0.3 apart | `text.ts` |
| letter-stagger | letters fade and rise one after another | `text.ts` |
| typewriter | letters type in order; the cursor blinks at 2 Hz | `text.ts` |
| highlight-swipe | a brand-colour bar swipes behind each line; text flips to the colour that reads on it | `text.ts` |
| soft-push | outgoing drifts up 4% and fades; incoming rises 5% and fades in (power2.inOut) | `engine/transitions.ts` |
| wipe | a hard edge in the accent colour sweeps left to right | `transitions.ts` |
| blur-dissolve, whip-pan, flash-cut, glitch | as before: blurred crossfade, sideways pan with trail, white flash, sliced glitch | `transitions.ts` |
| textures | soft (gradient, faint grid, slow brand glow), glow (bloom), grain, scanlines | `engine/backdrop.ts` |

To add a scene type: add it to `domain/video/scenes.ts` (slots, limits, length, a one-line
description for the AI), draw it in a new file in `engine/scenes/`, dispatch it in
`engine/scenes/index.ts`, allow it in the recipes, and extend the checker tests.
