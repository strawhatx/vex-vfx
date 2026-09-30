// A pass: one step an engine draws, with its settings, and how its strength moves over time. An
// effect is a stack of passes (see presets.ts), drawn in order. Engines:
//   - frame: over the whole picture: a color grade (see color.ts), or a screen effect (see
//     screen.ts). (Files and saved projects from before say `color` or `screen`: both are read as
//     `frame`.)
//   - text: styled, animated words (see typeset.ts)
//   - motion: how a clip moves as a whole (see animation.ts)
//   - object: effects on a target: a tracked person or object (see body.ts), or the spot an impact
//     goes off at (see bursts.ts); and particle emitters (see particles.ts), which also go on text
//     and on the frame. (Impact layers from before say `burst`: they're read as `object`.)
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

export type Engine = 'frame' | 'text' | 'motion' | 'object';

// what's drawn over the whole frame (filters and screen effects)
export type LookPass = { engine: 'frame'; kind: 'grade' | ScreenKind; params: Params; motion: Motion };

export type MotionPass = { engine: 'motion'; kind: AnimKind; params: Params; motion: Motion };

export type ObjectPass = { engine: 'object'; kind: BodyKind; params: Params; motion: Motion };

// an impact's layers: the object engine's, at a point
export type ImpactPass = { engine: 'object'; kind: BurstKind; params: Params; motion: Motion };

export type Pass = LookPass | TextPass | MotionPass | ObjectPass | ImpactPass;

// the object engine's layers on a tracked object, and at an impact's spot
export const isBodyPass = (p: Pass): p is ObjectPass => p.engine === 'object' && isBodyKind(p.kind);
export const isImpactPass = (p: Pass): p is ImpactPass => p.engine === 'object' && isBurstKind(p.kind);

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
  frame: { grade: { label: 'Color grade', params: COLOR_PARAMS }, ...SCREEN_KINDS },
  text: TEXT_KINDS,
  motion: ANIMATION_KINDS,
  object: { ...BODY_KINDS, ...BURST_KINDS },
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
  const frame = engine === 'frame' || engine === 'color' || engine === 'screen';
  if (frame && kind === 'grade')
    return { engine: 'frame', kind, params: fitParams(COLOR_PARAMS, params), motion };
  if (frame && typeof kind === 'string' && isScreenKind(kind))
    return { engine: 'frame', kind, params: fitParams(SCREEN_KINDS[kind].params, params), motion };
  if (engine === 'text' && typeof kind === 'string' && isTextKind(kind))
    return { engine, kind, params: fitParams(TEXT_KINDS[kind].params, params), motion };
  const object = engine === 'object' || engine === 'burst';
  if (object && typeof kind === 'string' && isBodyKind(kind))
    return { engine: 'object', kind, params: fitParams(BODY_KINDS[kind].params, params), motion };
  if (object && typeof kind === 'string' && isBurstKind(kind))
    return { engine: 'object', kind, params: fitParams(BURST_KINDS[kind].params, params), motion };
  if (engine === 'motion' && typeof kind === 'string' && isAnimKind(kind))
    return { engine, kind, params: fitParams(ANIMATION_KINDS[kind].params, params), motion };
  throw new Error(`unknown pass: ${String(engine)}/${String(kind)}`);
}

// a frame pass as drawn at one moment: what the GPU needs (a grade, or a screen effect's shader)
export type DrawnPass =
  { engine: 'color'; grade: Grade; amount: number } | { engine: 'screen'; kind: ScreenKind; values: Params };

// the pass t seconds into an effect len long; strength: how far on the effect is then (its fades);
// seed: which wobble (each clip its own)
export function passAt(p: LookPass, t: number, len: number, strength: number, seed: number): DrawnPass {
  const k = strength * motionAt(p.motion, t, len, seed);
  if (p.kind === 'grade')
    return { engine: 'color', grade: gradeOf(p.params), amount: (p.params.amount as number) * k };
  return { engine: 'screen', kind: p.kind, values: screenValues(p.kind, p.params, k, t, seed) };
}

// whether it changes the picture at all at that strength
export const drawsAnything = (d: DrawnPass) =>
  d.engine === 'color' ? d.amount > 1e-3 : Math.abs(d.values.amount as number) > 1e-3;
