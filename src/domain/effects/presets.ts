// A preset: a ready-made effect as data. It's a stack of passes (see passes.ts), a few friendly
// controls that drive their settings (a "Strength" slider, a color), and how it fades in and out.
// New effects are new presets, not new code: they're made in the Preset Lab and kept as JSON files
// (see library/). A clip keeps the preset it was made from and its controls' values.
//
// Groups: where a preset is offered, and which timeline layer its clips go on.
//   - filter: color looks, on the Filters layer
//   - screen: effects over the whole picture, on the Video effects layer
//   - text: styled, animated words, on the Text layer
//   - motion: animations for clips (in, out, combo), picked for a video's scene, an overlay or text
//   - transition: how one film gives way to the next at the join (see project/transitions.ts); its
//     length is how long a new one lasts
import { fitParam, isColor, type ParamValue } from './params';
import { fitPass, paramsOf, type Pass } from './passes';

// the groups whose presets make clips on the timeline (looks: see project/looks.ts)
export type LookGroup = 'filter' | 'screen' | 'text';
export type PresetGroup = LookGroup | 'motion' | 'transition';
export const PRESET_GROUPS: readonly PresetGroup[] = ['filter', 'screen', 'text', 'motion', 'transition'];

// A control drives settings of the preset's passes. A slider runs 0..1 and sets each setting it
// drives from `from` (at 0) to `to` (at 1); a color sets each one to itself.
export interface Drive {
  pass: number; // index into passes
  param: string;
  from: number;
  to: number;
}

export type Control =
  | { id: string; label: string; type: 'slider'; def: number; drives: Drive[] }
  | { id: string; label: string; type: 'color'; def: string; drives: Omit<Drive, 'from' | 'to'>[] };

export interface Preset {
  id: string;
  name: string;
  group: PresetGroup;
  category: string;
  passes: Pass[];
  controls: Control[];
  fade: { in: number; out: number }; // seconds
  length: number; // how long a new clip of it lasts (seconds)
}

export type ControlValues = Record<string, ParamValue>;

const ID = /^[a-z0-9][a-z0-9-]*$/;
const MAX_FADE = 10,
  MAX_LENGTH = 60;

// a preset from data (one of its JSON files, or one saved from the Preset Lab): anything missing is
// filled in, settings are fitted to their ranges; throws, saying what's wrong, if it can't be used
export function parsePreset(raw: unknown): Preset {
  const r = (raw ?? {}) as Record<string, unknown>;
  const where = typeof r.id === 'string' ? `preset "${r.id}"` : 'preset';
  const fail = (why: string): never => {
    throw new Error(`${where}: ${why}`);
  };
  if (typeof r.id !== 'string' || !ID.test(r.id)) fail('id must be lower-case letters, digits and dashes');
  if (typeof r.name !== 'string' || !r.name.trim()) fail('it needs a name');
  if (!PRESET_GROUPS.includes(r.group as PresetGroup))
    fail(`group must be one of ${PRESET_GROUPS.join(', ')}`);
  if (!Array.isArray(r.passes) || !r.passes.length) fail('it needs at least one pass');
  const passes = (r.passes as unknown[]).map((p, k) => {
    try {
      return fitPass(p);
    } catch (e) {
      return fail(`pass ${k}: ${(e as Error).message}`);
    }
  });
  const controls = ((r.controls ?? []) as unknown[]).map((c, k) =>
    parseControl(c, passes, m => fail(`control ${k}: ${m}`)),
  );
  const ids = controls.map(c => c.id);
  if (new Set(ids).size !== ids.length) fail('two controls have the same id');
  const fade = (r.fade ?? {}) as Record<string, unknown>;
  const secs = (v: unknown, max: number, def: number) =>
    typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(max, v)) : def;
  return {
    id: r.id as string,
    name: (r.name as string).trim(),
    group: r.group as PresetGroup,
    category: typeof r.category === 'string' && r.category.trim() ? r.category.trim() : 'Other',
    passes,
    controls,
    fade: { in: secs(fade.in, MAX_FADE, 0), out: secs(fade.out, MAX_FADE, 0) },
    length: Math.max(0.1, secs(r.length, MAX_LENGTH, 3)),
  };
}

function parseControl(raw: unknown, passes: Pass[], fail: (why: string) => never): Control {
  const c = (raw ?? {}) as Record<string, unknown>;
  if (typeof c.id !== 'string' || !ID.test(c.id)) fail('id must be lower-case letters, digits and dashes');
  if (typeof c.label !== 'string' || !c.label.trim()) fail('it needs a label');
  if (!Array.isArray(c.drives) || !c.drives.length) fail('it must drive at least one setting');
  const drives = (c.drives as Record<string, unknown>[]).map(d => {
    const p = passes[d.pass as number];
    if (!p) fail(`there's no pass ${String(d.pass)}`);
    const spec = paramsOf(p.engine, p.kind).find(s => s.key === d.param);
    if (!spec) fail(`pass ${String(d.pass)} has no setting "${String(d.param)}"`);
    if (c.type === 'color' && spec!.type !== 'color') fail(`"${spec!.key}" isn't a color`);
    if (c.type === 'slider' && spec!.type !== 'number') fail(`"${spec!.key}" isn't a number`);
    const drive = { pass: d.pass as number, param: d.param as string };
    if (c.type === 'color') return drive;
    const from = fitParam(spec!, d.from) as number,
      to = fitParam(spec!, d.to) as number;
    return { ...drive, from, to };
  });
  const label = (c.label as string).trim();
  if (c.type === 'slider') {
    const def = typeof c.def === 'number' ? Math.max(0, Math.min(1, c.def)) : 1;
    return { id: c.id as string, label, type: 'slider', def, drives: drives as Drive[] };
  }
  if (c.type === 'color') {
    if (!isColor(c.def)) fail('a color control needs a #rrggbb default');
    return { id: c.id as string, label, type: 'color', def: (c.def as string).toLowerCase(), drives };
  }
  return fail('type must be slider or color');
}

// each control at its default
export const controlDefaults = (p: Preset): ControlValues =>
  Object.fromEntries(p.controls.map(c => [c.id, c.def]));

// a control's value made to fit it (a slider 0..1, a color #rrggbb); its default if it doesn't
export function fitControl(c: Control, v: unknown): ParamValue {
  if (c.type === 'slider')
    return typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : c.def;
  return isColor(v) ? v.toLowerCase() : c.def;
}

// the preset's passes with its controls set to `values` (defaults for any not given)
export function passesWith(p: Preset, values: ControlValues): Pass[] {
  const passes = p.passes.map(x => ({ ...x, params: { ...x.params } }));
  for (const c of p.controls) {
    const v = fitControl(c, values[c.id]);
    for (const d of c.drives) {
      const target = passes[d.pass].params;
      target[d.param] =
        c.type === 'slider' ? (d as Drive).from + ((d as Drive).to - (d as Drive).from) * (v as number) : v;
    }
  }
  return passes;
}
