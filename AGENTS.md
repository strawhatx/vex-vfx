<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# FlareCut architecture

A browser-only video editor: no server, database or login. The layers keep the editing rules
testable without a browser. Dependencies point inward only.

```
src/
├── domain/          # pure TypeScript: no React, DOM, canvas, workers or Next.js
│   ├── project/     #   effects on the timeline: ranges, keyframes, stacking (the editing rules)
│   ├── tracking/    #   track data types, clip time, body parts (from pose/hand/face landmarks)
│   └── effects/     #   effect settings and palettes; the engines' passes and presets (library/: one JSON per preset)
├── application/     # use cases: editor.ts (actions + job queue), ports.ts (interfaces it needs)
├── infrastructure/  # browser adapters that implement the ports
│   ├── analysis/    #   worker, MediaPipe models (segmenter, pose, hands, face), object and body-part trackers (implements Analysis)
│   ├── rendering/   #   canvas renderer, effect simulation, WebGL fire (implements EffectLayers); body effects as passes; gpu/: color, screen, tint and dissolve passes
│   ├── storage/     #   films and the effects library, kept on this device in IndexedDB (implements FilmStore, PackLibrary)
│   └── video/       #   recording and camera capture
├── components/editor/  # React UI; player.ts is the controller and composition root
├── components/home/    # the start page's list of saved projects; homeStore.ts is its root
├── components/lab/     # the Preset Lab (/lab/<engine>): builds presets on a test clip; labPlayer.ts is its root
└── app/             # Next.js routes
```

## Rules
1. `domain/` imports only `domain/`. No `window`, `document`, canvas, `Worker`, React, clock or random: pass time and IDs in.
2. `application/` imports only `domain/`. It reaches the outside only through the interfaces in `application/ports.ts`, named by what they do (`Analysis`, `EffectLayers`), never by technology.
3. `infrastructure/` may import `domain/` and `application/` (to implement ports), never `components/` or `app/`.
4. In `components/`, only `player.ts` (the editor), `lab/labPlayer.ts` (the Preset Lab) and `home/homeStore.ts` (the start page's saved projects) import `infrastructure/`: they build the adapters and plug them in. React components talk to them and use domain types for display.
5. New editing behaviour goes in `Editor` (application) with its rules in `domain/`; `player.ts` only turns taps, playback and export into calls on it.
6. Rules and use cases get tests (`npm test`, Vitest) with in-memory fakes for the ports, like `application/editor.test.ts`. Don't mock the browser to test a rule.
7. Don't add a port or layer without a real outside dependency behind it; pure helpers are just functions.

## Before you finish
- `npm test`, `npx tsc --noEmit` and `npx eslint .` pass, and `npm run format` has been run (Prettier).
- Keep files to one job each; split a file when it starts doing several.
- `domain/` and `application/` have no imports from `infrastructure/`, `components/`, React or Next.js.
- A changed rule or use case has a test.

# Security

The editor runs entirely in the browser: clips are never uploaded, and there are no accounts,
database or secrets in this branch. Keep it that way unless a change says otherwise.

1. **Headers live in `next.config.ts`.** The Content-Security-Policy allows only this site, plus what the editor needs: `'wasm-unsafe-eval'` (MediaPipe), `worker-src 'self' blob:`, and `blob:` for media, images and connections. Don't loosen it with `*`, other domains or `'unsafe-eval'` in production to make an error go away; find what is being blocked and allow exactly that. Permissions-Policy allows only the camera and microphone.
2. **Clips stay on the device.** Don't send video, frames or track data to any server or third party without the user asking for it.
3. **No secrets in browser code.** Never use `NEXT_PUBLIC_` for keys or tokens. If server code is added (Route Handlers, Server Actions), it reads secrets only there with `import "server-only"`, validates input with zod, checks who is calling, rate-limits anything expensive, and returns generic error messages (full details go to the server log).
4. **`.env*` stays out of git.** If a secret is ever committed or pasted somewhere public, rotate it; deleting it isn't enough.
5. **No raw HTML.** Don't use `dangerouslySetInnerHTML`.
6. **Packages:** only well-known, maintained packages, checked on npm under the exact name. Run `npm audit` after adding one.

Before finishing a change that touches headers, packages, env vars or adds server code: `npm audit` is clean, and the editor still loads a clip, tracks, and exports with no CSP errors in the console.
