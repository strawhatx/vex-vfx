# FlareCut

A video editor that runs entirely in the browser: clips, projects and your effects library stay on
the device.

- `npm run dev` — the editor at http://localhost:3000
- `npm test`, `npx tsc --noEmit`, `npx eslint .` — checks (see AGENTS.md)

## The Preset Lab

`/lab` is one page for building effect presets on a test clip: pick what a preset is for, then add layers. It's always there in
development. A production build leaves it out unless it's built with `FLARECUT_LAB=on` (for a
private test site); the public site should be built without it.
