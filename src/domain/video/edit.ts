// Editing a plan, one slot at a time. Unlike the checker, an edit never drops a scene: while the user
// is typing, a field may be empty for a moment. What still needs doing before export (empty text,
// numbers to fill in or confirm) is listed by `blockers`.
import { unconfirmed } from './check';
import type { TextMove, TransitionMove } from './moves';
import { LIMITS, type Plan } from './plan';
import type { Recipe } from './recipe';
import {
  blankScene,
  CAPTION_MAX,
  SCENES,
  type Card,
  type IconId,
  type Num,
  type Scene,
  type SceneType,
} from './scenes';

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const round1 = (v: number) => Math.round(v * 10) / 10;

export type SlotValue = string | number | null | Card[];

// the plan with one slot of scene i set. Text is cut to its limit (not trimmed, so spaces typed
// mid-edit survive); a number typed by the user counts as confirmed; cards keep within their count.
export function editSlot(plan: Plan, i: number, key: string, value: SlotValue): Plan {
  const scene = plan.scenes[i];
  if (!scene) return plan;
  const next = structuredClone(plan);
  const s = next.scenes[i] as unknown as Record<string, unknown>;
  if (key === 'caption') {
    s.caption = String(value ?? '').slice(0, CAPTION_MAX);
    return next;
  }
  const spec = SCENES[scene.type].slots.find(x => x.key === key);
  if (!spec) return plan;
  switch (spec.kind) {
    case 'text':
      s[key] = String(value ?? '').slice(0, spec.max);
      break;
    case 'number': {
      const n = typeof value === 'number' && Number.isFinite(value) ? clamp(value, spec.min, spec.max) : null;
      s[key] = { value: n, confirmed: n != null } satisfies Num;
      break;
    }
    case 'cards':
      if (!Array.isArray(value)) return plan;
      s[key] = value.slice(0, spec.max).map(c => ({
        title: c.title.slice(0, spec.titleMax),
        subtitle: c.subtitle.slice(0, spec.subtitleMax),
      }));
      break;
    case 'icon':
      s[key] = value as IconId;
      break;
    case 'move':
      s[key] = value as TextMove;
      break;
  }
  return next;
}

// confirms a number slot as it stands (the user checked it)
export function confirmNumber(plan: Plan, i: number, key: string): Plan {
  const n = (plan.scenes[i] as unknown as Record<string, Num | undefined>)?.[key];
  if (!n || n.value == null) return plan;
  const next = structuredClone(plan);
  (next.scenes[i] as unknown as Record<string, Num>)[key] = { value: n.value, confirmed: true };
  return next;
}

export function setSeconds(plan: Plan, i: number, sec: number): Plan {
  const s = plan.scenes[i];
  if (!s || !Number.isFinite(sec)) return plan;
  const next = structuredClone(plan);
  const [lo, hi] = SCENES[s.type].sec;
  next.scenes[i].sec = round1(clamp(sec, lo, hi));
  return next;
}

export function setTransition(plan: Plan, i: number, t: TransitionMove | null): Plan {
  if (!plan.scenes[i]) return plan;
  const next = structuredClone(plan);
  next.scenes[i].transition = t;
  return next;
}

export function moveScene(plan: Plan, from: number, to: number): Plan {
  if (from === to || !plan.scenes[from] || to < 0 || to >= plan.scenes.length) return plan;
  const next = structuredClone(plan);
  const [s] = next.scenes.splice(from, 1);
  next.scenes.splice(to, 0, s);
  return next;
}

export function duplicateScene(plan: Plan, i: number): Plan {
  if (!plan.scenes[i] || plan.scenes.length >= LIMITS.scenes[1]) return plan;
  const next = structuredClone(plan);
  next.scenes.splice(i + 1, 0, structuredClone(plan.scenes[i]));
  return next;
}

export function removeScene(plan: Plan, i: number): Plan {
  if (!plan.scenes[i] || plan.scenes.length <= LIMITS.scenes[0]) return plan;
  const next = structuredClone(plan);
  next.scenes.splice(i, 1);
  return next;
}

// a new scene after scene i (or at the end), with a move the style allows
export function addScene(plan: Plan, type: SceneType, recipe: Recipe, after = plan.scenes.length - 1): Plan {
  if (plan.scenes.length >= LIMITS.scenes[1]) return plan;
  const next = structuredClone(plan);
  const s = blankScene(type, plan.product.name || 'Your product');
  if (s.type === 'kinetic-type') s.move = recipe.textMoves[0];
  next.scenes.splice(after + 1, 0, s);
  return next;
}

// the plan in another style: moves and transitions the new style doesn't have are swapped for its own
export function restyle(plan: Plan, recipe: Recipe): Plan {
  const next = structuredClone(plan);
  next.aesthetic = recipe.slug;
  next.scenes = next.scenes.filter(s => recipe.scenes.includes(s.type));
  for (const s of next.scenes) {
    if (s.transition && !recipe.transitions.includes(s.transition)) s.transition = null;
    if (s.type === 'kinetic-type' && !recipe.textMoves.includes(s.move)) s.move = recipe.textMoves[0];
  }
  return next;
}

// what has to be done before the video can be exported, as short sentences
export function blockers(plan: Plan): string[] {
  const out: string[] = [];
  plan.scenes.forEach((s: Scene, i) => {
    for (const spec of SCENES[s.type].slots) {
      const v = (s as unknown as Record<string, unknown>)[spec.key];
      if (spec.kind === 'text' && spec.required && !String(v ?? '').trim())
        out.push(`Scene ${i + 1}: add the ${spec.label.toLowerCase()}`);
      if (spec.kind === 'cards' && (v as Card[]).filter(c => c.title.trim()).length < spec.min)
        out.push(`Scene ${i + 1}: add at least ${spec.min} cards`);
    }
  });
  for (const n of unconfirmed(plan)) {
    const s = plan.scenes[n.scene] as unknown as Record<string, Num>;
    out.push(
      s[n.key].value == null
        ? `Scene ${n.scene + 1}: fill in the ${n.label.toLowerCase()}`
        : `Scene ${n.scene + 1}: confirm the ${n.label.toLowerCase()}`,
    );
  }
  return out;
}
