// When each part of a plan plays: each scene, then the end card, as spans on one clock.
import { END_CARD_SECONDS, type Plan } from './plan';

export interface Span {
  kind: 'scene' | 'end';
  // the scene's index (0 for the end card)
  index: number;
  start: number;
  end: number;
}

export function schedule(plan: Plan): { spans: Span[]; duration: number } {
  const spans: Span[] = [];
  let t = 0;
  plan.scenes.forEach((s, i) => {
    spans.push({ kind: 'scene', index: i, start: t, end: t + s.sec });
    t += s.sec;
  });
  spans.push({ kind: 'end', index: 0, start: t, end: t + END_CARD_SECONDS });
  return { spans, duration: t + END_CARD_SECONDS };
}
