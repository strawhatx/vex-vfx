// Effects from a spot in the scene (sparks shooting from a point, rather than off an object), or
// for a glitch, over the whole frame.
// Nothing is tracked: each frame gets a small box at the spot, carried along the camera's path so
// it stays put in the scene as the camera moves, and the effect comes from that box.
import { carry, type Cam } from '../effects/laser';
import type { Effect } from '../effects/palettes';
import type { ClipFrame } from '../tracking/types';
import { rangeFrames, refreshFrames, type Track } from './track';

// the effects that can come from a spot (or for a glitch, the whole frame) instead of an object
export const canPin = (effect: Effect) =>
  effect === 'sparks' || effect === 'glitch' || effect === 'text' || effect === 'water';

// the spot's box, as a fraction of the frame's width
export const SPOT_SIZE = 0.05;

// puts a spot effect's box in each frame of its range. cam: the camera's path (null where not
// worked out yet: the spot stays where it was tapped); W: the frame's width, in work pixels
export function placeAtSpot(t: Track, clip: ClipFrame[], cam: readonly (Cam | null)[], W: number) {
  const key = t.keys[0];
  if (!t.spot || !key) return;
  const { s, e } = rangeFrames(t, clip);
  const from = cam[key.i];
  const size = W * SPOT_SIZE;
  t.shapes.fill(null);
  for (let i = s; i < e; i++) {
    const to = cam[i];
    const c = from && to ? carry(key, from, to) : { at: key, scale: 1 };
    t.shapes[i] = { id: t.id, cx: c.at.x, cy: c.at.y, w: size * c.scale, h: size * c.scale };
  }
  refreshFrames(t, clip);
}
