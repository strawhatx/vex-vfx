// The plan checker. Every plan goes through it before it plays, whoever wrote it (the AI, a person,
// an old save). Small problems are fixed and listed: an unknown scene or move, a slot too long, a
// length out of range. Numbers are never invented: a number the user didn't give or confirm is
// emptied, and the editor shows it as a slot to fill. A plan with no usable scene is refused.
import { isTextMove, isTransition, type TextMove, type TransitionMove } from './moves';
import { FORMATS, LENGTHS, LIMITS, totalSeconds, type Format, type Length, type Plan } from './plan';
import type { Recipe } from './recipe';
import { DEFAULT_RECIPE, recipeBySlug } from './recipes';
import {
  ICON_IDS,
  isSceneType,
  numberSlots,
  SCENES,
  type Card,
  type IconId,
  type Num,
  type Scene,
  type SlotSpec,
} from './scenes';

export interface CheckOptions {
  // numbers the user gave (Phase 2 intake: "real stats"); a slot holding one of these is confirmed
  supplied?: number[];
}

export type Checked =
  | {
      ok: true;
      plan: Plan;
      // what was changed to make the plan valid
      fixes: string[];
      // things to look at that weren't changed (a number written inside text, a length off target)
      notes: string[];
    }
  | { ok: false; reason: string };

const HEX = /^#[0-9a-f]{6}$/i;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const round1 = (v: number) => Math.round(v * 10) / 10;
const str = (v: unknown) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '');

// cut at a word boundary to at most n characters
export function trimText(s: string, n: number): string {
  const t = s.replace(/\s+/g, ' ').trim();
  if (t.length <= n) return t;
  const cut = t.slice(0, n + 1);
  const sp = cut.lastIndexOf(' ');
  return (sp > n * 0.5 ? cut.slice(0, sp) : t.slice(0, n)).replace(/[\s,;:.-]+$/, '');
}

export function checkPlan(raw: unknown, opts: CheckOptions = {}): Checked {
  if (!raw || typeof raw !== 'object') return { ok: false, reason: 'The plan is not a JSON object.' };
  const p = raw as Record<string, unknown>;
  if (!Array.isArray(p.scenes) || !p.scenes.length) return { ok: false, reason: 'The plan has no scenes.' };
  const fixes: string[] = [];
  const notes: string[] = [];
  const supplied = new Set(opts.supplied ?? []);

  const format: Format = FORMATS.includes(p.format as Format) ? (p.format as Format) : '9:16';
  if (format !== p.format) fixes.push(`Format "${String(p.format)}" isn't available; used 9:16`);
  const recipe: Recipe = recipeBySlug(str(p.aesthetic)) ?? DEFAULT_RECIPE;
  if (recipe.slug !== p.aesthetic)
    fixes.push(`Style "${String(p.aesthetic)}" isn't available; used ${recipe.name}`);
  const brandColor = typeof p.brandColor === 'string' && HEX.test(p.brandColor) ? p.brandColor : null;
  if (p.brandColor != null && !brandColor)
    fixes.push('The brand colour wasn’t a #rrggbb colour; used the style’s');
  const length: Length = LENGTHS.includes(p.length as Length) ? (p.length as Length) : 15;
  const prod = (p.product ?? {}) as Record<string, unknown>;
  const product = { name: trimText(str(prod.name), 32), url: trimText(str(prod.url), 80) };

  const scenes: Scene[] = [];
  (p.scenes as unknown[]).forEach((rawScene, i) => {
    const where = `Scene ${i + 1}`;
    const s = checkScene(rawScene, recipe, supplied, where, fixes, notes);
    if (s) scenes.push(s);
  });
  if (!scenes.length) return { ok: false, reason: 'None of the scenes could be used.' };
  if (scenes.length > LIMITS.scenes[1]) {
    fixes.push(`Kept the first ${LIMITS.scenes[1]} of ${scenes.length} scenes`);
    scenes.length = LIMITS.scenes[1];
  }

  const plan: Plan = {
    v: 2,
    format,
    aesthetic: recipe.slug,
    brandColor,
    length,
    product,
    captions: p.captions !== false,
    scenes,
  };
  fitLength(plan, fixes, notes);
  return { ok: true, plan, fixes, notes };
}

function checkScene(
  raw: unknown,
  recipe: Recipe,
  supplied: Set<number>,
  where: string,
  fixes: string[],
  notes: string[],
): Scene | null {
  const r = raw as Record<string, unknown> | null;
  if (!r || typeof r !== 'object' || !isSceneType(r.type)) {
    fixes.push(`${where}: unknown scene type "${String(r?.type)}", dropped`);
    return null;
  }
  const info = SCENES[r.type];
  if (!recipe.scenes.includes(r.type)) {
    fixes.push(`${where}: ${recipe.name} has no ${info.label} scene, dropped`);
    return null;
  }
  const [lo, hi] = info.sec;
  const want = typeof r.sec === 'number' && Number.isFinite(r.sec) ? r.sec : (lo + hi) / 2;
  const sec = round1(clamp(want, lo, hi));
  if (typeof r.sec === 'number' && Math.abs(sec - r.sec) > 0.05)
    fixes.push(`${where}: length ${r.sec}s kept to ${sec}s`);

  let transition: TransitionMove | null = null;
  if (r.transition != null) {
    if (isTransition(r.transition) && recipe.transitions.includes(r.transition)) transition = r.transition;
    else
      fixes.push(
        `${where}: transition "${String(r.transition)}" isn't part of ${recipe.name}; used its default`,
      );
  }
  const caption = trimText(str(r.caption), LIMITS.caption);
  if (str(r.caption).length > LIMITS.caption) fixes.push(`${where}: caption shortened`);

  const out: Record<string, unknown> = { type: r.type, sec, caption, transition };
  for (const slot of info.slots) {
    const v = checkSlot(slot, r[slot.key], recipe, supplied, `${where} ${slot.label.toLowerCase()}`, fixes);
    if (v === MISSING) {
      fixes.push(`${where}: ${slot.label.toLowerCase()} is empty, dropped the scene`);
      return null;
    }
    out[slot.key] = v;
  }

  // numbers written into text can't be checked for the user: point them out
  const texts = [caption, ...info.slots.filter(x => x.kind === 'text').map(x => out[x.key] as string)];
  for (const c of (out.cards as Card[] | undefined) ?? []) texts.push(c.title, c.subtitle);
  const withDigits = texts.filter(t => /\d/.test(t));
  if (withDigits.length) notes.push(`${where}: check the number in “${withDigits[0]}”`);
  return out as unknown as Scene;
}

const MISSING = Symbol('missing');

function checkSlot(
  spec: SlotSpec,
  raw: unknown,
  recipe: Recipe,
  supplied: Set<number>,
  where: string,
  fixes: string[],
): unknown {
  switch (spec.kind) {
    case 'text': {
      const t = trimText(str(raw), spec.max);
      if (str(raw).length > spec.max) fixes.push(`${where} shortened`);
      return spec.required && !t ? MISSING : t;
    }
    case 'number':
      return checkNumber(spec, raw, supplied, where, fixes);
    case 'cards': {
      const list = (Array.isArray(raw) ? raw : [])
        .map(c => {
          const o = (typeof c === 'string' ? { title: c } : (c ?? {})) as Record<string, unknown>;
          return {
            title: trimText(str(o.title), spec.titleMax),
            subtitle: trimText(str(o.subtitle), spec.subtitleMax),
          };
        })
        .filter(c => c.title);
      if (list.length > spec.max) fixes.push(`${where}: kept the first ${spec.max}`);
      return list.length < spec.min ? MISSING : list.slice(0, spec.max);
    }
    case 'icon': {
      if (ICON_IDS.includes(raw as IconId)) return raw;
      fixes.push(`${where}: icon "${String(raw)}" isn't available; used sparkles`);
      return 'sparkles';
    }
    case 'move': {
      if (isTextMove(raw) && recipe.textMoves.includes(raw)) return raw;
      const swap: TextMove = recipe.textMoves[0];
      fixes.push(`${where}: "${String(raw)}" isn't part of ${recipe.name}; used ${swap}`);
      return swap;
    }
  }
}

// a number slot: { value, confirmed }. A plain number from the AI is kept only if the user gave it.
function checkNumber(
  spec: Extract<SlotSpec, { kind: 'number' }>,
  raw: unknown,
  supplied: Set<number>,
  where: string,
  fixes: string[],
): Num {
  const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
  const asObj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null;
  let value = isNum(raw) ? raw : isNum(asObj?.value) ? (asObj.value as number) : null;
  if (value == null) return { value: null, confirmed: false };
  const fixed = clamp(spec.integer ? Math.round(value) : value, spec.min, spec.max);
  if (fixed !== value) fixes.push(`${where}: ${value} kept within ${spec.min}–${spec.max}`);
  value = fixed;
  const confirmed = (asObj?.confirmed === true && isNum(asObj.value)) || supplied.has(value);
  if (!confirmed) {
    fixes.push(`${where}: ${value} wasn’t a number you gave, so it’s left empty to fill in`);
    return { value: null, confirmed: false };
  }
  return { value, confirmed: true };
}

// keep the whole video within 10% of its target by scaling scene lengths (within their ranges)
function fitLength(plan: Plan, fixes: string[], notes: string[]) {
  const target = plan.length;
  const within = () => Math.abs(totalSeconds(plan) - target) <= target * 0.1;
  if (within()) return;
  const before = totalSeconds(plan);
  const end = before - plan.scenes.reduce((s, x) => s + x.sec, 0);
  const k = (target - end) / (before - end);
  for (const s of plan.scenes) {
    const [lo, hi] = SCENES[s.type].sec;
    s.sec = round1(clamp(s.sec * k, lo, hi));
  }
  if (Math.abs(totalSeconds(plan) - before) > 0.05) fixes.push(`Scene lengths adjusted toward ${target}s`);
  if (!within())
    notes.push(
      `The video runs ${Math.round(totalSeconds(plan))}s; the target is ${target}s. ${
        totalSeconds(plan) < target ? 'Add' : 'Remove'
      } a scene to get closer.`,
    );
}

// every number still to fill in or confirm, in order (an empty optional number is fine)
export function unconfirmed(plan: Plan): { scene: number; key: string; label: string }[] {
  return plan.scenes.flatMap((s, i) =>
    numberSlots(s)
      .filter(n => (n.num.value == null ? n.required : !n.num.confirmed))
      .map(n => ({ scene: i, key: n.key, label: n.label })),
  );
}
