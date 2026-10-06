// A plan as one paused GSAP timeline. Each part (each scene, then the end card) gets a 0..1 "life"
// that the timeline tweens across the time it's on screen, and each cut gets a 0..1 transition
// progress. Seeking the timeline to any time gives the same numbers, so the preview and the export
// draw the same frame for the same time. (Scenes time their own details from their local time.)
import type { TransitionMove } from '@/domain/video/moves';
import { TRANSITION_SECONDS, type Plan } from '@/domain/video/plan';
import type { Recipe } from '@/domain/video/recipe';
import { schedule } from '@/domain/video/schedule';
import { gsap } from './ease';

export interface Part {
  kind: 'scene' | 'end';
  index: number;
  start: number;
  end: number;
  state: { life: number };
}

export interface Cut {
  at: number;
  move: TransitionMove;
  state: { k: number };
}

export interface Built {
  tl: gsap.core.Timeline;
  parts: Part[];
  cuts: Cut[];
  duration: number;
}

const T = TRANSITION_SECONDS;

export function buildTimeline(plan: Plan, recipe: Recipe): Built {
  const { spans, duration } = schedule(plan);
  const tl = gsap.timeline({ paused: true });
  const parts: Part[] = spans.map(span => {
    const state = { life: 0 };
    tl.fromTo(
      state,
      { life: 0 },
      { life: 1, duration: span.end - span.start, ease: 'none', immediateRender: false },
      span.start,
    );
    return { ...span, state };
  });
  const cuts: Cut[] = [];
  for (let i = 0; i + 1 < parts.length; i++) {
    const a = parts[i];
    const move = (a.kind === 'scene' && plan.scenes[a.index].transition) || recipe.transitions[0];
    const state = { k: 0 };
    tl.fromTo(state, { k: 0 }, { k: 1, duration: T, ease: 'none', immediateRender: false }, a.end - T / 2);
    cuts.push({ at: a.end, move, state });
  }
  // the timeline runs to the end of the video even if the last tween ends earlier
  tl.set({}, {}, duration);
  return { tl, parts, cuts, duration };
}

// what's on screen at time t: one part, or two parts mid-transition
export function activeAt(b: Built, t: number): { a: Part; b?: Part; cut?: Cut } {
  for (let i = 0; i < b.cuts.length; i++) {
    const c = b.cuts[i];
    if (Math.abs(t - c.at) < T / 2) return { a: b.parts[i], b: b.parts[i + 1], cut: c };
  }
  const p = b.parts.find(p => t >= p.start && t < p.end) ?? b.parts[b.parts.length - 1];
  return { a: p };
}
