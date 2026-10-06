# Site map and the home page's scroll story

Every page below is static HTML at build time except `/api/subscribe`. URLs are lowercase,
hyphenated and have no trailing slash. The old FlareCut routes redirect with a 301:
`/editor` and `/editor/*` go to `/create`, and `/contact` goes to `/`.

| Route | What it is | Source |
| --- | --- | --- |
| `/` | Home | `src/app/(site)/page.tsx` |
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

The look follows Apple's product pages: a centred headline over the product shown large, then
alternating white and mist bands with 28px cards.

| # | Section | Job | Notes |
| --- | --- | --- | --- |
| 1 | Hero | Headline and CTA in 5 seconds | Kicker "PromoReel · Free", the h1 "Describe your product. Get a launch video." (the LCP element), the subline, **Make my video** and "See the styles ›". Below them, Orbit's Clean Soft launch video plays live in a large mist frame, rising in on load. |
| 2 | The problem | Why this exists | One large statement: launch day with no video, the $500 editor, the lost weekend (in grey), then "PromoReel takes two minutes." |
| 3 | One video. Every style. (signature) | "This looks professionally made" | Pinned for about 360% of the viewport. Orbit's launch video restyled live as Clean Soft → Y2K Chrome → Swiss Minimal → Brutalist by the real engine, with a soft crossfade on each change. A segmented control shows and picks the style (keyboard, reduced motion). It ends on **"Now make yours."**, linking into /create. |
| 4 | How it works | Steps | Three white cards on a mist band: pick a style, make it yours, download it. |
| 5 | Five styles | Choice | Five tiles; each plays its live preview on hover or focus and links to its style page. |
| 6 | Sized for where you launch | Internal links | The six /for pages with their size and length. |
| 7 | Privacy | Trust | Three cards on a mist band: made on your device, your numbers checked, free. |
| 8 | Questions | Objections | Six questions, also FAQPage JSON-LD. |
| 9 | Closing | Final CTA | "Your launch video. Two minutes from now." with the blue pill. |
| 10 | Footer | Links | A mist footer: a privacy note, columns for styles, use cases, guides and comparisons, then the fine print. |
