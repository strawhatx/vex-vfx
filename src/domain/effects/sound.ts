// When each clip is heard. An effect makes its sound (a crackle, a buzz, a hum) the whole time the
// video plays through it; an impact makes one hit sound as the playhead passes its moment. Scrubbing
// is silent: only playing past a hit sounds it, not jumping there.
import type { ImpactStyle } from './impacts';
import type { Effect } from './palettes';

export interface SoundClip {
  id: number;
  kind: 'effect' | 'impact';
  effect: Effect;             // which loop an effect plays
  impact: ImpactStyle | null; // which hit an impact plays
  s: number; e: number;       // seconds; an impact hits at s
  volume: number;             // 0..1.5
  speed: number;              // impacts: 1 = the style's own timing, 0.5 = half speed (sounds deeper and longer)
}

// a jump bigger than this between two moments means a seek, not playback
export const MAX_PLAY_STEP_S = 0.3;

// the effects that should be sounding at time t
export const soundingAt = (clips: readonly SoundClip[], t: number) =>
  clips.filter(c => c.kind === 'effect' && c.volume > 0 && t >= c.s && t < c.e);

// the impacts whose hit the playhead just passed going from t0 to t1 while playing
export function hitsBetween(clips: readonly SoundClip[], t0: number, t1: number) {
  if (t1 <= t0 || t1 - t0 > MAX_PLAY_STEP_S) return [];
  return clips.filter(c => c.kind === 'impact' && c.volume > 0 && c.s > t0 && c.s <= t1);
}
