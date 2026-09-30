// Transitions: how one film of the film gives way to the next, at the join between them. A
// transition is a preset (group "transition") made of the other engines' passes:
//   - a motion "out" pass: how the film ending leaves, over the first half
//   - a motion "in" pass: how the film starting arrives, over the second half
//   - screen and color passes: over both halves, strongest right at the join (a flash, a blur…)
// The two films don't overlap (the second starts at the join), so there's no blending one into the
// other: a dissolve dips through a color instead.
// A transition belongs to the film that starts at its join, found by its video and where it starts
// in it, so it stays put when films around it change; a film that's gone just has none.
import { NO_ANIM, REST_POSE, poseAt, type ClipPose } from '../effects/animation';
import { ease } from '../effects/curves';
import { drawsAnything, passAt, type DrawnPass, type LookPass } from '../effects/passes';
import type { Preset } from '../effects/presets';

export interface Transition {
  reel: number; // the film starting at the join: its video
  s: number; // and where it starts in it (the video's own time)
  preset: Preset;
  duration: number; // both halves together (s)
}

export const MIN_TRANSITION_S = 0.1,
  MAX_TRANSITION_S = 2;

// a film of the film, as transitions need it: its video, where it starts in it, and when and for
// how long it plays in the film
export interface Played {
  reel: number;
  s: number;
  at: number;
  length: number;
}

const EPS = 1e-6;
const same = (tr: Pick<Transition, 'reel' | 's'>, f: Pick<Played, 'reel' | 's'>) =>
  tr.reel === f.reel && Math.abs(tr.s - f.s) < EPS;

// the transition into film k (none into the first)
export const transitionInto = (films: readonly Played[], transitions: readonly Transition[], k: number) =>
  k > 0 && films[k] ? (transitions.find(tr => same(tr, films[k])) ?? null) : null;

// how long a transition into film k can last: never longer than either film it joins
export function fitDuration(films: readonly Played[], k: number, d: number) {
  const most = Math.min(MAX_TRANSITION_S, films[k - 1]?.length ?? 0, films[k]?.length ?? 0);
  return Math.max(Math.min(MIN_TRANSITION_S, most), Math.min(most, d));
}

// the transition into film k set to `preset` (null: taken off), lasting `duration`
export function withTransition(
  films: readonly Played[],
  transitions: readonly Transition[],
  k: number,
  preset: Preset | null,
  duration: number,
): Transition[] {
  const f = films[k];
  if (!f || k === 0) return transitions.slice();
  const rest = transitions.filter(tr => !same(tr, f));
  return preset
    ? [...rest, { reel: f.reel, s: f.s, preset, duration: fitDuration(films, k, duration) }]
    : rest;
}

// what a transition does at film time t: the pose of the film drawn then, and the passes over it;
// null away from any join with one
export function transitionAt(
  films: readonly Played[],
  transitions: readonly Transition[],
  t: number,
): { pose: ClipPose; passes: DrawnPass[] } | null {
  for (let k = 1; k < films.length; k++) {
    const tr = transitionInto(films, transitions, k);
    if (!tr) continue;
    const half = fitDuration(films, k, tr.duration) / 2,
      join = films[k].at;
    if (t < join - half - EPS || t >= join + half - EPS) continue;
    const leaving = t < join;
    // the ending film goes out over the first half, the starting one comes in over the second
    const move = tr.preset.passes.find(p => p.engine === 'motion' && p.kind === (leaving ? 'out' : 'in'));
    let pose = REST_POSE;
    if (move) {
      const slot = { preset: tr.preset.id, params: { ...move.params, duration: half } };
      pose = leaving
        ? poseAt({ ...NO_ANIM, out: slot }, t - (join - half), half)
        : poseAt({ ...NO_ANIM, in: slot }, t - join, half);
    }
    // strongest at the join
    const strength = ease('inOut', 1 - Math.abs(t - join) / half);
    const passes = tr.preset.passes
      .filter((p): p is LookPass => p.engine === 'frame')
      .map(p => passAt(p, t - (join - half), 2 * half, strength, k * 7 + 1))
      .filter(drawsAnything);
    return { pose, passes };
  }
  return null;
}
