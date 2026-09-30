// Clip time: 0 at the first frame the player shows. A file's own timestamps don't always start at
// 0: some start later, and some start earlier with lead-in frames that are never shown. Browsers
// differ too (Chrome keeps the file's times, and can't reach the last frames when the file starts
// late). So the analysis and the player each convert their own times to clip time, and the clip
// only runs as long as the player can play.
import type { ClipFrame } from './types';

// seconds to subtract from file times to get clip time: the first shown frame's time
export const clipShift = (firstT: number) => Math.max(0, firstT);

// the frames the player can show, in clip time; `kept` maps them back to the input's indices.
// length: how long the player says the clip is (0 = unknown, keep everything)
export function toClipTime(frames: ClipFrame[], length: number) {
  const shift = frames.length ? clipShift(frames[0].t) : 0,
    out: ClipFrame[] = [],
    kept: number[] = [];
  frames.forEach((f, i) => {
    const t = f.t - shift;
    if (t + f.dur <= 1e-3) return; // lead-in the player never shows
    if (length > 0 && t >= length - 1e-3) return; // past the end the player can reach
    out.push({ t: Math.max(0, t), dur: f.dur });
    kept.push(i);
  });
  return { frames: out, kept, shift };
}
