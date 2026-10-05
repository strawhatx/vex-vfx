// When each part of a plan plays: the hook, each scene, the outro, as spans on one clock. The engine
// builds its timeline from these; snapToBeats moves the cuts onto the music's beat.
import { LIMITS, OUTRO_SECONDS, type Plan } from './plan';

export interface Span {
  kind: 'hook' | 'scene' | 'outro';
  // the scene's index (0 for the hook and outro)
  index: number;
  start: number;
  end: number;
}

export function schedule(plan: Plan): { spans: Span[]; duration: number } {
  const spans: Span[] = [];
  let t = 0;
  const add = (kind: Span['kind'], index: number, d: number) => {
    spans.push({ kind, index, start: t, end: t + d });
    t += d;
  };
  add('hook', 0, plan.hook.duration);
  plan.scenes.forEach((s, i) => add('scene', i, s.duration));
  add('outro', 0, OUTRO_SECONDS);
  return { spans, duration: t };
}

// the plan with every cut (end of the hook, end of each scene) moved to the nearest beat, keeping each
// part at least a beat long and within its limits. bpm outside 40–240 leaves the plan as it is.
export function snapToBeats(plan: Plan, bpm: number | null): Plan {
  if (!bpm || bpm < 40 || bpm > 240) return plan;
  const beat = 60 / bpm;
  const snap = (t: number) => Math.max(beat, Math.round(t / beat) * beat);
  const round = (v: number) => Math.round(v * 1000) / 1000;

  let at = 0;
  const cut = (d: number, lo: number, hi: number) => {
    let end = snap(at + d);
    // stay within limits by whole beats
    while (end - at > hi && end - beat > at) end -= beat;
    while (end - at < Math.min(lo, beat)) end += beat;
    const length = round(end - at);
    at = end;
    return length;
  };
  const hook = cut(plan.hook.duration, LIMITS.hook[0], Math.max(LIMITS.hook[1], beat));
  const scenes = plan.scenes.map(s => ({
    ...s,
    duration: cut(s.duration, LIMITS.scene[0], LIMITS.scene[1]),
  }));
  return { ...plan, hook: { ...plan.hook, duration: hook }, scenes };
}

export const totalSeconds = (plan: Plan) => schedule(plan).duration;
export { OUTRO_SECONDS };
