<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# PromoReel architecture

A free browser tool that turns 3–6 product screenshots into an AI-directed promo video, plus the
static marketing and SEO pages around it. No accounts or database. The only server code is the
email signup route. Dependencies point inward only.

```
src/
├── domain/promo/       # pure TypeScript: no React, DOM, canvas, GSAP, clock or random (seeds passed in)
│   ├── recipes/        #   the aesthetics, one JSON each (they drive the engine, the prompt and /aesthetics pages)
│   ├── moves.ts        #   the move library: every move a plan may name
│   ├── plan.ts         #   the plan format; validate.ts checks and fixes any plan; autoPlan.ts is the no-AI director
│   ├── schedule.ts     #   plan → timed spans, snapping cuts to the beat
│   ├── prompt.ts       #   the AI director prompt; parse.ts pulls JSON out of a pasted reply
│   ├── palette.ts      #   brand colour from screenshot pixels
│   └── content/        #   data for the SEO pages: use cases, competitors, FAQ, examples, guides
├── application/promo/  # studio.ts: the /create use cases; ports.ts: Director, Exporter, Subscriber
├── infrastructure/promo/  # browser adapters that implement the ports
│   ├── engine/         #   the video engine: one paused GSAP timeline per plan, drawn on canvas 2D
│   ├── export/         #   MP4 export with WebCodecs + Mediabunny
│   ├── anthropicDirector.ts  # the user's own API key, called from the browser
│   └── shots.ts, music.ts, subscribe.ts
├── server/             # import "server-only": the newsletter signup (zod, rate limit)
├── lib/                # fonts and SEO helpers (metadata, JSON-LD, site URL)
├── components/
│   ├── site/           # nav, footer, buttons, smooth scroll, reveals
│   ├── home/           # the home page: hero, the signature style showcase, bands and cards
│   ├── engine/         # the engine on a page (EnginePlayer) and the recipe fonts
│   └── create/         # the /create tool; studioStore.ts is its composition root
├── content/guides/     # MDX guides
└── app/                # Next.js routes: static marketing/SEO pages, /create, /api/subscribe
```

## Rules
1. `domain/` imports only `domain/`. No `window`, `document`, canvas, GSAP, React, clock or random: pass time and seeds in.
2. `application/` imports only `domain/`. It reaches the outside only through `application/promo/ports.ts`, named by what it does (`Director`, `Exporter`), never by technology.
3. `infrastructure/` may import `domain/` and `application/` (to implement ports), never `components/` or `app/`.
4. In `components/`, only `create/studioStore.ts` (the tool) and `engine/` (previews on marketing pages) import `infrastructure/` at runtime; other components use domain types.
5. New editing behaviour goes in `Studio` (application) with its rules in `domain/`; the UI only turns clicks into calls on it.
6. Rules and use cases get tests (`npm test`, Vitest) with the in-memory fakes in `application/promo/fakes.ts`. Don't mock the browser to test a rule.
7. Don't add a port or layer without a real outside dependency behind it; pure helpers are just functions.
8. Every plan goes through `validatePlan` before it plays. A plan that can't be fixed falls back to `autoPlan`; never leave the user without a video.
9. The engine must stay deterministic: the frame at time t depends only on the plan, the images and t (no `Date`, `Math.random`, or state carried between frames). Preview and export share it.

## Marketing and SEO pages
- Every indexable page is static, with all its content in the HTML. Animation may move content but never hide it before JavaScript runs; `prefers-reduced-motion` turns motion off.
- Each page has `pageMetadata(...)`, one h1, breadcrumbs (nested pages) and the matching JSON-LD from `lib/seo/schema.ts`.
- Motion uses the one ease, "reel" (`--ease-reel` in CSS, `'reel'` in GSAP), and the 0.2/0.4/0.8/1.6s steps.
- The look follows Apple's product pages: white and `--mist` bands, `--ink` type in the system font (Inter elsewhere), blue (`--blue`) only for actions, 28px corners, no shadows or gradients (a 1px `--control` hairline is the one allowed edge).

## Before you finish
- `npm test`, `npx tsc --noEmit` and `npx eslint .` pass, and `npm run format` has been run (Prettier).
- Keep files to one job each; split a file when it starts doing several.
- `domain/` and `application/` have no imports from `infrastructure/`, `components/`, React or Next.js.
- A changed rule or use case has a test.

# Security

Screenshots, music and videos stay in the browser. The only server code is `/api/subscribe`.

1. **Headers live in `next.config.ts`.** The Content-Security-Policy allows only this site, plus exactly what the tool needs: `blob:` for media, images, workers and connections; `https://api.anthropic.com` (the user's own key, from the browser); Cloudflare Web Analytics. Don't loosen it with `*`, other domains or `'unsafe-eval'` in production; find what is blocked and allow exactly that. Permissions-Policy allows nothing extra.
2. **Clips stay on the device.** Never send screenshots, frames or videos to our server or a third party. The one exception is the user's own choice to direct with their API key, which goes straight from the browser to Anthropic.
3. **No secrets in browser code.** Never use `NEXT_PUBLIC_` for keys or tokens. Server code reads secrets only under `src/server/` with `import "server-only"`, validates input with zod, rate-limits, and returns generic errors (details go to the server log).
4. **`.env*` stays out of git** (`.env.example` lists the names only). If a secret is ever committed or pasted somewhere public, rotate it; deleting it isn't enough.
5. **No raw HTML.** Don't use `dangerouslySetInnerHTML`. JSON-LD goes through `lib/seo/JsonLd.tsx`.
6. **Packages:** only well-known, maintained packages, checked on npm under the exact name. Run `npm audit` after adding one.

Before finishing a change that touches headers, packages, env vars or server code: `npm audit` has nothing new, and /create still loads screenshots, previews and exports with no CSP errors in the console.
