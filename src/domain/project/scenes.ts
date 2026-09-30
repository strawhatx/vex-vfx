// Scenes: the film split into separate films at cuts. A cut is the start time of a frame (clip
// time), and that frame is the first of the next scene. Nothing is removed or moved: the scenes
// play one after another as before, but each is its own film, so effects start fresh at a cut and
// new clips stay inside the scene they're added in.
import type { ClipFrame } from '../tracking/types';

export interface Scene {
  s: number;
  e: number;
} // seconds

// a scene has to last at least this long
export const MIN_SCENE_S = 0.1;

// the scenes the cuts make, in order
export function scenesOf(cuts: readonly number[], duration: number): Scene[] {
  const edges = [0, ...cuts, duration];
  return edges.slice(0, -1).map((s, k) => ({ s, e: edges[k + 1] }));
}

// the scene playing at time t (the last one, at the very end)
export function sceneIndexAt(cuts: readonly number[], t: number) {
  let k = 0;
  while (k < cuts.length && t >= cuts[k] - 1e-6) k++;
  return k;
}

// the cuts with a new one at the start of frame i (the frame shown at the playhead starts the new
// scene); null if either side would be shorter than MIN_SCENE_S
export function splitAt(cuts: readonly number[], clip: readonly ClipFrame[], i: number, duration: number) {
  const f = clip[i];
  if (!f) return null;
  const t = f.t;
  const scene = scenesOf(cuts, duration)[sceneIndexAt(cuts, t)];
  if (t - scene.s < MIN_SCENE_S - 1e-6 || scene.e - t < MIN_SCENE_S - 1e-6) return null;
  return [...cuts, t].sort((a, b) => a - b);
}

// for each frame, the first frame of its scene (what the renderer restarts effects from)
export function sceneStarts(clip: readonly ClipFrame[], cuts: readonly number[]) {
  const out = new Int32Array(clip.length);
  let start = 0,
    k = 0;
  for (let i = 0; i < clip.length; i++) {
    while (k < cuts.length && clip[i].t >= cuts[k] - 1e-6) {
      k++;
      start = i;
    }
    out[i] = start;
  }
  return out;
}
