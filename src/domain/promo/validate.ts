// Every plan is checked before it plays, whoever wrote it. Small problems are fixed and listed (a move
// the aesthetic doesn't allow, a zoom off the screen, a caption that's too long, the wrong length).
// A plan that can't be saved (not JSON, no scenes, most scenes broken) is refused, and the caller
// falls back to the rule-based plan.
import { isMove, kindOf, type MoveId, type MoveKind } from './moves';
import { LIMITS, OUTRO_SECONDS, type Aspect, type Plan, type Scene, type Zoom } from './plan';
import { displayUrl, type Product } from './product';
import type { Recipe } from './recipe';

export interface PlanContext {
  recipe: Recipe;
  shots: number;
  product: Product;
  aspect: Aspect;
}

export type Validation = { ok: true; plan: Plan; fixes: string[] } | { ok: false; reason: string };

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const round2 = (v: number) => Math.round(v * 100) / 100;

// cut at a word boundary to at most n characters
export function trimText(s: string, n: number): string {
  const t = s.replace(/\s+/g, ' ').trim();
  if (t.length <= n) return t;
  const cut = t.slice(0, n + 1);
  const sp = cut.lastIndexOf(' ');
  return (sp > n * 0.5 ? cut.slice(0, sp) : t.slice(0, n)).replace(/[\s,;:.-]+$/, '');
}

export function validatePlan(raw: unknown, ctx: PlanContext): Validation {
  const { recipe, shots } = ctx;
  if (!raw || typeof raw !== 'object') return { ok: false, reason: 'The plan is not a JSON object.' };
  if (shots < 1) return { ok: false, reason: 'Add at least one screenshot.' };
  const p = raw as Record<string, unknown>;
  if (!Array.isArray(p.scenes) || !p.scenes.length) return { ok: false, reason: 'The plan has no scenes.' };
  const fixes: string[] = [];

  // a move of this kind the recipe allows: the one asked for, or the recipe's i-th
  const move = (id: unknown, kind: MoveKind, i: number, where: string): MoveId => {
    const allowed: MoveId[] = kind === 'transition' ? recipe.transitions : recipe.moves[kind];
    if (isMove(id) && kindOf(id) === kind && allowed.includes(id)) return id;
    const swap = allowed[i % allowed.length];
    fixes.push(
      isMove(id)
        ? `${where}: "${id}" isn't part of ${recipe.name}, used "${swap}"`
        : `${where}: unknown move "${String(id)}", used "${swap}"`,
    );
    return swap;
  };

  const [sceneMin, sceneMax] = [
    Math.max(LIMITS.scene[0], recipe.motion.scene[0]),
    Math.min(LIMITS.scene[1], recipe.motion.scene[1]),
  ];

  // scenes: one is broken if it isn't an object or doesn't point at a screenshot
  const rawScenes = p.scenes as unknown[];
  const scenes: Scene[] = [];
  let broken = 0;
  rawScenes.forEach((s, i) => {
    const r = s as Record<string, unknown> | null;
    const where = `Scene ${i + 1}`;
    const shot = r && typeof r === 'object' ? r.shot : undefined;
    if (typeof shot !== 'number' || !Number.isInteger(shot) || shot < 0 || shot >= shots) {
      broken++;
      fixes.push(`${where}: no screenshot ${String(shot)}, dropped`);
      return;
    }
    const d = num(r!.duration, (sceneMin + sceneMax) / 2);
    const duration = round2(clamp(d, sceneMin, sceneMax));
    if (duration !== d) fixes.push(`${where}: length ${d}s kept to ${duration}s`);
    scenes.push({
      shot,
      duration,
      move: move(r!.move, 'screen', i, where),
      zoom: zoomOf(r!.zoom, where, fixes),
      caption: captionOf(r!.caption, i, where),
      transition: move(r!.transition, 'transition', i, `${where} transition`),
      extra: r!.extra == null ? null : move(r!.extra, 'extra', i, `${where} extra`),
    });
  });
  if (broken > rawScenes.length / 2)
    return { ok: false, reason: 'Most scenes point at screenshots that don’t exist.' };

  function captionOf(c: unknown, i: number, where: string): Scene['caption'] {
    if (c == null || c === '') return null;
    const r = (typeof c === 'string' ? { text: c } : c) as Record<string, unknown>;
    if (typeof r.text !== 'string' || !r.text.trim()) return null;
    const text = trimText(r.text, LIMITS.caption);
    if (text !== r.text.trim()) fixes.push(`${where}: caption shortened`);
    return { text, move: move(r.move, 'text', i, `${where} caption`) };
  }

  // too few: show screenshots again (unused ones first) as quiet scenes; too many: keep the first
  const [minScenes, maxScenes] = LIMITS.scenes;
  if (scenes.length > maxScenes) {
    fixes.push(`Kept the first ${maxScenes} of ${scenes.length} scenes`);
    scenes.length = maxScenes;
  }
  for (let i = scenes.length; i < minScenes; i++) {
    const used = new Set(scenes.map(s => s.shot));
    const shot = [...Array(shots).keys()].find(k => !used.has(k)) ?? i % shots;
    scenes.push({
      shot,
      duration: round2((sceneMin + sceneMax) / 2),
      move: recipe.moves.screen[i % recipe.moves.screen.length],
      zoom: { x: 0.5, y: 0.5, scale: 1 },
      caption: null,
      transition: recipe.transitions[i % recipe.transitions.length],
      extra: null,
    });
    fixes.push(`Added scene ${i + 1} (a plan needs at least ${minScenes})`);
  }

  // the hook: its text, or the tagline, or the product name
  const h = (p.hook ?? {}) as Record<string, unknown>;
  const hookRaw =
    typeof h.text === 'string' && h.text.trim() ? h.text : ctx.product.tagline || ctx.product.name || 'New';
  const hookText = trimText(hookRaw, LIMITS.hookText);
  if (hookText !== hookRaw.trim()) fixes.push('Hook shortened');
  const hookDuration = round2(clamp(num(h.duration, 1.6), LIMITS.hook[0], LIMITS.hook[1]));

  const plan: Plan = {
    v: 1,
    aspect: ctx.aspect,
    hook: { text: hookText, move: move(h.move, 'text', 0, 'Hook'), duration: hookDuration },
    scenes,
    outro: outroOf(p.outro, ctx.product),
  };
  fitLength(plan, sceneMin, sceneMax, fixes);
  return { ok: true, plan, fixes };
}

function zoomOf(z: unknown, where: string, fixes: string[]): Zoom {
  const r = (z ?? {}) as Record<string, unknown>;
  const x = num(r.x, 0.5),
    y = num(r.y, 0.5),
    scale = num(r.scale, 1);
  const out = {
    x: clamp(x, 0, 1),
    y: clamp(y, 0, 1),
    scale: round2(clamp(scale, LIMITS.zoomScale[0], LIMITS.zoomScale[1])),
  };
  if (out.x !== x || out.y !== y || out.scale !== round2(scale))
    fixes.push(`${where}: zoom kept on the screen`);
  return out;
}

// the outro is always the product's own card; only the call to action can come from the plan
function outroOf(o: unknown, product: Product): Plan['outro'] {
  const r = (o ?? {}) as Record<string, unknown>;
  const cta = typeof r.cta === 'string' && r.cta.trim() ? trimText(r.cta, LIMITS.cta) : 'Try it free';
  return { title: product.name || 'Your product', url: displayUrl(product.url), cta };
}

// keep the whole video within LIMITS.total by scaling scene lengths (within their range)
function fitLength(plan: Plan, lo: number, hi: number, fixes: string[]) {
  const fixed = plan.hook.duration + OUTRO_SECONDS;
  const scenesTotal = plan.scenes.reduce((s, x) => s + x.duration, 0);
  const [minT, maxT] = LIMITS.total;
  const target = clamp(fixed + scenesTotal, minT, maxT) - fixed;
  if (Math.abs(target - scenesTotal) < 0.01) return;
  const k = target / scenesTotal;
  for (const s of plan.scenes) s.duration = round2(clamp(s.duration * k, lo, hi));
  fixes.push(`Length kept within ${minT}–${maxT}s`);
}
