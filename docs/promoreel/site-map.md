# Site map and the home page's scroll story

Every page below is static HTML at build time except `/api/subscribe`. URLs are lowercase,
hyphenated and have no trailing slash. The old FlareCut routes redirect with a 301:
`/editor` and `/editor/*` go to `/create`, and `/contact` goes to `/`.

| Route | What it is | Source |
| --- | --- | --- |
| `/` | Premiere Night home | `src/app/(site)/page.tsx` |
| `/create` | The tool: a static shell plus a client-only studio | `src/app/create/page.tsx` |
| `/aesthetics` | All five styles | `src/app/(site)/aesthetics/page.tsx` |
| `/aesthetics/[slug]` | clean-apple, y2k-chrome, swiss-minimal, brutalist, retro-terminal | `…/aesthetics/[slug]/page.tsx` (from the recipe JSON) |
| `/for` | Use-case index | `src/app/(site)/for/page.tsx` |
| `/for/[use-case]` | product-hunt-launch-video, app-store-preview-video, tiktok-app-promo, x-launch-video, saas-demo-video, what-i-shipped-video | `…/for/[useCase]/page.tsx` (from `domain/promo/content/useCases.ts`) |
| `/guides`, `/guides/[slug]` | MDX articles | `src/content/guides/*.mdx`, listed in `domain/promo/content/guides.ts` |
| `/examples` | Videos made with the tool | `public/examples/*.mp4` and `.jpg`, listed in `content/examples.ts` |
| `/alternatives`, `/alternatives/[competitor]` | rotato, screen-studio, canva, previewed | `content/competitors.ts` |
| `/privacy` | What stays on the device, what's sent where | `src/app/(site)/privacy/page.tsx` |
| `/sitemap.xml`, `/robots.txt`, `/llms.txt` | Search and AI crawlers | `src/app/sitemap.ts`, `robots.ts`, `llms.txt/route.ts` |
| `opengraph-image` | Root, each style, each use case, each guide | `src/lib/og.tsx` |
| `/api/subscribe` | POST only: the download email goes to the newsletter | `src/app/api/subscribe/route.ts` |

**Adding a page:** add a recipe JSON, a use case, a guide (MDX plus an entry in `guides.ts`) or a
competitor. The page, its metadata, OG image, sitemap entry and llms.txt line all follow from that.

## Home page, section by section

| # | Section | Job | Notes |
| --- | --- | --- | --- |
| 0 | Intro (≤1.6s) | Sets the mood | House lights dim, curtains draw back, the lamp flickers on. First visit per session only; any input skips it; off with reduced motion. The headline is never hidden. |
| 1 | Hero: the screen | Headline and CTA in 5 seconds | The h1 (the LCP element) is on the lit screen, with **Make my video** beside it. The 3D projector beam loads after idle, only on capable desktops. |
| 2 | The problem | Why this exists | Three subtitles (launch day with no video, $500 editor, lost weekend), then "PromoReel takes two minutes." |
| 3 | The premiere (signature) | "This made my product look designed" | Pinned for about 360% of the viewport. One Orbit screenshot re-cut as Clean → Y2K Chrome → Brutalist → Swiss Minimal by the real engine, with a projector flicker on each reel change. The reels are tabs too (keyboard, reduced motion). It ends on **"Your film here."**: drop screenshots and /create opens with them. |
| 4 | Three acts | How it works | Pick a style · Drop screenshots · AI directs, on a film strip. |
| 5 | Now showing | Choice | Five posters; each plays its live preview on hover or focus and links to its style page. |
| 6 | Made for every premiere | Internal links | The six /for pages with their size and length. |
| 7 | Privacy | Trust | Screenshots never leave the browser; your AI or none; free. |
| 8 | FAQ | Objections | Six questions, also FAQPage JSON-LD. |
| 9 | Marquee | Final CTA | "Your premiere starts now", lit like a marquee sign. |
| 10 | End credits | Footer | Every style, use case, guide and comparison, billed like a film. |
