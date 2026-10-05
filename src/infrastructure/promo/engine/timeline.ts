// A plan as one paused GSAP timeline. Each part (hook, scenes, outro) gets plain numbers that the
// timeline tweens (how far it has entered, how far through its life it is, how much of its text has
// appeared) and each cut gets a 0..1 transition progress. Seeking the timeline to any time gives the
// same numbers, so the preview and the export draw the same frame for the same time.
import type { MoveId } from '@/domain/promo/moves';
import { TRANSITION_SECONDS, type Plan } from '@/domain/promo/plan';
import type { Recipe } from '@/domain/promo/recipe';
import { schedule } from '@/domain/promo/schedule';
import { gsap } from './ease';

export interface PartState {
  // 0..1 through its entrance, in the aesthetic's ease
  enter: number;
  // 0..1 through the time it's on screen, linear
  life: number;
  // 0..1 through its text's entrance, linear (each text move eases its own words)
  words: number;
}

export interface Part {
  kind: 'hook' | 'scene' | 'outro';
  index: number;
  start: number;
  end: number;
  state: PartState;
}

export interface Cut {
  at: number;
  move: MoveId;
  // 0..1 through the transition
  state: { k: number };
}

export interface Built {
  tl: gsap.core.Timeline;
  parts: Part[];
  cuts: Cut[];
  duration: number;
}

const T = TRANSITION_SECONDS;

// how long a caption takes to appear: typing takes longer the longer the text
export const textSeconds = (move: MoveId, text: string) =>
  move === 'typewriter' ? Math.min(1.4, 0.3 + text.length * 0.035) : move === 'word-slam' ? 0.5 : 0.7;

export function buildTimeline(plan: Plan, recipe: Recipe): Built {
  const { spans, duration } = schedule(plan);
  const tl = gsap.timeline({ paused: true });
  const parts: Part[] = spans.map(span => {
    const state: PartState = { enter: 0, life: 0, words: 0 };
    const len = span.end - span.start;
    const shown0 = Math.max(0, span.start - T / 2),
      shown1 = Math.min(duration, span.end + T / 2);
    const tween = (vars: gsap.TweenVars, at: number) =>
      tl.fromTo(state, { [Object.keys(vars)[0]]: 0 }, { ...vars, immediateRender: false }, at);
    tween({ enter: 1, duration: Math.min(0.9, len * 0.45), ease: recipe.motion.ease }, span.start);
    tween({ life: 1, duration: shown1 - shown0, ease: 'none' }, shown0);
    const text =
      span.kind === 'hook'
        ? textSeconds(plan.hook.move, plan.hook.text)
        : span.kind === 'scene'
          ? textSeconds(
              plan.scenes[span.index].caption?.move ?? 'word-pop',
              plan.scenes[span.index].caption?.text ?? '',
            )
          : 0.8;
    tween(
      { words: 1, duration: Math.min(text, len * 0.7), ease: 'none' },
      span.start + Math.min(0.2, len * 0.1),
    );
    return { ...span, state };
  });

  const cuts: Cut[] = [];
  for (let i = 0; i + 1 < parts.length; i++) {
    const a = parts[i];
    const move: MoveId = a.kind === 'scene' ? plan.scenes[a.index].transition : recipe.transitions[0];
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
