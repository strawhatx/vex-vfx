// Shots: the clip split at its cuts. Tracking and effects never cross from one shot to the next.

export interface Shot { s: number; e: number } // frame indices, e exclusive

// cuts: frames that start a new shot. start[i] is the first frame of frame i's shot.
export function makeShots(frameCount: number, cuts: number[]) {
  const shots: Shot[] = [], start = new Int32Array(frameCount);
  const bounds = [0, ...cuts.filter(c => c > 0 && c < frameCount), frameCount];
  for (let k = 0; k + 1 < bounds.length; k++) {
    if (bounds[k + 1] <= bounds[k]) continue;
    shots.push({ s: bounds[k], e: bounds[k + 1] });
    start.fill(bounds[k], bounds[k], bounds[k + 1]);
  }
  return { shots, start };
}

export const shotIndex = (shots: Shot[], i: number) => shots.findIndex(s => i >= s.s && i < s.e);
export const inShot = (shot: Shot, i: number) => i >= shot.s && i < shot.e;

// the frame to show when jumping to a shot: a little way in, clear of the cut
export const shotPreviewFrame = (shot: Shot) => Math.min(shot.e - 1, shot.s + ((shot.e - shot.s) >> 2));
// the frame to search when looking for an object in a shot: a couple of frames in, clear of any blur from the cut
export const shotSearchFrame = (shot: Shot) => Math.min(shot.e - 1, shot.s + 2);
