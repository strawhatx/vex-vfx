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

## In the videos (the move library)

Every move is drawn by the engine from a 0..1 progress that one paused GSAP timeline tweens
(`src/infrastructure/promo/engine/timeline.ts`), so any frame can be redrawn at any time.

| Timing | Value | Code |
| --- | --- | --- |
| Scene entrance | min(0.9s, 45% of the scene), in the style's ease | `timeline.ts:58` |
| Caption entrance | typewriter: 0.3s + 0.035s per letter (max 1.4s); word-slam 0.5s; others 0.7s | `timeline.ts:45` |
| Transitions | 0.4s, centred on the cut | `domain/promo/plan.ts:56` |
| Outro | 2.6s | `plan.ts:54` |

| Move | Kind | What it does | Code |
| --- | --- | --- | --- |
| slide-in | screen | rises 30% of the frame and fades in, then drifts 2% | `engine/screens.ts:38` |
| tilt-float | screen | turns from −26° to −9° in 3D, eases toward facing over its life, floats ±0.6% | `screens.ts:40` |
| zoom-detail | screen | settles from 95%, then pushes in on the zoom target from 20% to 80% of the scene | `screens.ts:48` |
| parallax-scroll | screen | a tall page scrolls inside its frame while the frame drifts the other way | `screens.ts:55` |
| device-frame-spin | screen | spins from edge-on (−86°) with a slight roll, scaling 82% → 100% | `screens.ts:62` |
| word-pop | text | each word scales 35% → 100% with an overshoot, 0.35 apart | `engine/text.ts:136` |
| word-slam | text | each word drops from 2.6× to its size, 0.55 apart | `text.ts:136` |
| typewriter | text | letters appear in order; the cursor blinks at 2 Hz | `text.ts:80` |
| highlight-swipe | text | a brand-colour bar swipes behind each line; text flips to the colour that reads on it | `text.ts:103` |
| whip-pan | transition | the outgoing scene accelerates off left with a 4-copy motion trail; the next decelerates in | `engine/transitions.ts:25` |
| blur-dissolve | transition | crossfade through a blur of up to 15× | `transitions.ts:36` |
| glitch | transition | 14 slices offset by up to 12% of the width, plus a colour-split echo | `transitions.ts:56` |
| flash-cut | transition | a hard cut under a white flash peaking at 90% | `transitions.ts:79` |
| light-sweep | extra | a diagonal band of light crosses the screen once, 15%–70% of the scene | `screens.ts:300` |
| glow-pulse | extra | the brand-colour glow behind the screen pulses twice per scene | `screens.ts` (`backing`) |
| grain | extra / texture | film grain at 9% (scene) or 12% (style texture), new offset each frame | `engine/backdrop.ts:121` |
| glow | texture | a bloom from a 1/6-size copy, screen-blended at 22% | `backdrop.ts:141` |
| scanlines | texture | 1-in-3 dark lines and a vignette | `backdrop.ts:158` |
| hook card | system | the hook in its text move; a brand-colour rule grows under it | `engine/cards.ts:36` |
| outro card | system | name (word-pop), URL, call-to-action pill (overshoot), "Made with PromoReel" | `cards.ts:46` |

To add a move: add it to `domain/promo/moves.ts` (with a one-line description for the AI), draw
it in the matching engine file, allow it in the recipes that should use it, and check it with the
validator tests.
