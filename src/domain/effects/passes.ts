// A pass: one step an engine draws, with its settings, and how its strength moves over time. An
// effect is a stack of passes (see presets.ts), drawn in order. Engines:
//   - color: grades the picture (see color.ts)
//   - screen: an effect over the whole picture (see screen.ts)
//   - text: styled, animated words (see typeset.ts)
//   - motion: how a clip moves as a whole (see animation.ts)
//   - object: effects on a tracked person or object (see body.ts), including particle emitters,
//     which text and screen presets can hold too (see particles.ts)
//   - burst: impacts, going off at a spot (see bursts.ts)
// Each engine lists its kinds of pass and their settings as data, so passes can be checked, filled
// in and given sliders without knowing what each one is.
import { GRADE_PARAMS, gradeOf, type Grade } from './color';
import { MOTIONS, STEADY, motionAt, type Motion, type MotionKind } from './curves';
import { fitParams, type ParamSpec, type Params } from './params';
import { SCREEN_KINDS, isScreenKind, screenValues, type ScreenKind } from './screen';
import { TEXT_KINDS, isTextKind, type TextPass } from './typeset';
import { ANIMATION_KINDS, isAnimKind, type AnimKind } from './animation';
import { BODY_KINDS, isBodyKind, type BodyKind } from './body';
import { BURST_KINDS, isBurstKind, type BurstKind } from './bursts';

export type Engine = 'color' | 'screen' | 'text' | 'motion' | 'object' | 'burst';

// what's drawn over the whole frame (filters and screen effects)
export type LookPass =
  | { engine: 'color'; kind: 'grade'; params: Params; motion: Motion }
  | { engine: 'screen'; kind: ScreenKind; params: Params; motion: Motion };

export type MotionPass = { engine: 'motion'; kind: AnimKind; params: Params; motion: Motion };

export type ObjectPass = { engine: 'object'; kind: BodyKind; params: Params; motion: Motion };

export type BurstPassOf = { engine: 'burst'; kind: BurstKind; params: Params; motion: Motion };

export type Pass = LookPass | TextPass | MotionPass | ObjectPass | BurstPassOf;

// an object engine's particle emitter (the one object pass text and screen presets can hold)
export type EmitterPass = ObjectPass & { kind: 'emitter' };
export const isEmitter = (p: Pass): p is EmitterPass => p.engine === 'object' && p.kind === 'emitter';

// a color pass's settings are its grade and `amount`, how strongly it's mixed in
const COLOR_PARAMS: readonly ParamSpec[] = [
  ...GRADE_PARAMS,
  { key: 'amount', label: 'Strength', type: 'number', min: 0, max: 1, def: 1 },
];

// every kind of pass each engine draws, and its settings
export const ENGINES: Record<Engine, Record<string, { label: string; params: readonly ParamSpec[] }>> = {
  color: { grade: { label: 'Grade', params: COLOR_PARAMS } },
  screen: SCREEN_KINDS,
  text: TEXT_KINDS,
  motion: ANIMATION_KINDS,
  object: BODY_KINDS,
  burst: BURST_KINDS,
};

export const paramsOf = (engine: Engine, kind: string): readonly ParamSpec[] =>
  ENGINES[engine]?.[kind]?.params ?? [];

const MOTION_KINDS = new Set<string>(MOTIONS.map(m => m.id));

function fitMotion(raw: unknown): Motion {
  const m = (raw ?? {}) as Record<string, unknown>;
  const n = (v: unknown, lo: number, hi: number, def: number) =>
    typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : def;
  return {
    kind: typeof m.kind === 'string' && MOTION_KINDS.has(m.kind) ? (m.kind as MotionKind) : STEADY.kind,
    rate: n(m.rate, 0.05, 30, STEADY.rate),
    decay: n(m.decay, 0.02, 10, STEADY.decay),
  };
}

// a pass from data (a preset's file): its engine and kind must be known; its settings are fitted to
// their ranges, with defaults for any left out. Throws if it can't be drawn.
export function fitPass(raw: unknown): Pass {
  const r = (raw ?? {}) as Record<string, unknown>;
  const engine = r.engine,
    kind = r.kind;
  const params = (r.params ?? {}) as Record<string, unknown>;
  const motion = fitMotion(r.motion);
  if (engine === 'color' && kind === 'grade')
    return { engine, kind, params: fitParams(COLOR_PARAMS, params), motion };
  if (engine === 'screen' && typeof kind === 'string' && isScreenKind(kind))
    return { engine, kind, params: fitParams(SCREEN_KINDS[kind].params, params), motion };
  if (engine === 'text' && typeof kind === 'string' && isTextKind(kind))
    return { engine, kind, params: fitParams(TEXT_KINDS[kind].params, params), motion };
  if (engine === 'burst' && typeof kind === 'string' && isBurstKind(kind))
    return { engine, kind, params: fitParams(BURST_KINDS[kind].params, params), motion };
  if (engine === 'object' && typeof kind === 'string' && isBodyKind(kind))
    return { engine, kind, params: fitParams(BODY_KINDS[kind].params, params), motion };
  if (engine === 'motion' && typeof kind === 'string' && isAnimKind(kind))
    return { engine, kind, params: fitParams(ANIMATION_KINDS[kind].params, params), motion };
  throw new Error(`unknown pass: ${String(engine)}/${String(kind)}`);
}

// a pass as drawn at one moment: what the GPU needs
export type DrawnPass =
  { engine: 'color'; grade: Grade; amount: number } | { engine: 'screen'; kind: ScreenKind; values: Params };

// the pass t seconds into an effect len long; strength: how far on the effect is then (its fades);
// seed: which wobble (each clip its own)
export function passAt(p: LookPass, t: number, len: number, strength: number, seed: number): DrawnPass {
  const k = strength * motionAt(p.motion, t, len, seed);
  if (p.engine === 'color')
    return { engine: 'color', grade: gradeOf(p.params), amount: (p.params.amount as number) * k };
  return { engine: 'screen', kind: p.kind, values: screenValues(p.kind, p.params, k, t, seed) };
}

// whether it changes the picture at all at that strength
export const drawsAnything = (d: DrawnPass) =>
  d.engine === 'color' ? d.amount > 1e-3 : Math.abs(d.values.amount as number) > 1e-3;
