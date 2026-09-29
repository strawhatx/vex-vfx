// Making a preset in the Preset Lab, a page at a time (see LAB_PAGES): passes added, taken out, moved and set,
// settings picked out as the sliders users get, and a Strength slider over all of it. Each change
// gives a new preset (nothing is changed in place).
//
// A draft always draws as its passes say: its controls' defaults give back exactly the settings
// being edited, so what the lab shows is what a new clip of it shows. Setting a setting a control
// drives moves the control's default (or, for Strength and controls driving several settings, where
// the control takes that setting) to match.
import type { Motion } from './curves';
import { ENGINES, fitPass, paramsOf, type Engine, type Pass } from './passes';
import { fitParam, type ParamValue } from './params';
import {
  controlDefaults,
  parsePreset,
  passesWith,
  type Control,
  type Drive,
  type Preset,
  type PresetGroup,
} from './presets';

// The lab's pages: one for each engine, and one for transitions, which mix engines (a motion out
// and in, and screen passes). Each says which group its presets go in, the kinds of pass it offers
// (all an engine's, or some), what a new preset starts with, and how long it lasts.
export type LabPage = Engine | 'transition';

interface LabSpec {
  name: string;
  group: PresetGroup;
  offers: readonly { engine: Engine; kinds?: readonly string[] }[];
  first: readonly (readonly [Engine, string])[];
  length: number;
}

export const LAB_PAGES: Record<LabPage, LabSpec> = {
  color: {
    name: 'Color engine',
    group: 'filter',
    offers: [{ engine: 'color' }],
    first: [['color', 'grade']],
    length: 5,
  },
  screen: {
    name: 'Screen engine',
    group: 'screen',
    offers: [{ engine: 'screen' }],
    first: [['screen', 'flash']],
    length: 3,
  },
  text: {
    name: 'Text engine',
    group: 'text',
    offers: [{ engine: 'text' }],
    first: [
      ['text', 'type'],
      ['text', 'fill'],
      ['text', 'in'],
      ['text', 'out'],
    ],
    length: 3,
  },
  motion: {
    name: 'Motion engine',
    group: 'motion',
    offers: [{ engine: 'motion' }],
    first: [['motion', 'in']],
    length: 2,
  },
  object: {
    name: 'Object engine',
    group: 'body',
    offers: [{ engine: 'object' }],
    first: [['object', 'edge']],
    length: 3,
  },
  transition: {
    name: 'Transitions',
    group: 'transition',
    offers: [{ engine: 'motion', kinds: ['out', 'in'] }, { engine: 'screen' }],
    first: [
      ['motion', 'out'],
      ['motion', 'in'],
      ['screen', 'blur'],
    ],
    length: 0.6,
  },
};

export const isLabPage = (p: string): p is LabPage => Object.hasOwn(LAB_PAGES, p);

// the lab page a preset is made on
export const pageOf = (p: Pick<Preset, 'group'>) =>
  (Object.keys(LAB_PAGES) as LabPage[]).find(k => LAB_PAGES[k].group === p.group)!;

// the slider over every pass's strength
export const STRENGTH = 'strength';

// a name made into an id: lower-case words joined by dashes
export const slug = (name: string) =>
  name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // (accents)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'preset';

// the kinds of pass a lab page offers, with the engine each is drawn by
export const kindsOf = (page: LabPage) =>
  LAB_PAGES[page].offers.flatMap(({ engine, kinds }) =>
    Object.entries(ENGINES[engine])
      .filter(([id]) => !kinds || kinds.includes(id))
      .map(([id, k]) => ({ engine, kind: id, label: k.label })),
  );

export const newPass = (engine: Engine, kind: string): Pass => fitPass({ engine, kind });

// a new preset for a lab page: its first passes, and a Strength slider
export function newDraft(page: LabPage): Preset {
  const spec = LAB_PAGES[page];
  const p = parsePreset({
    id: 'untitled',
    name: 'Untitled',
    group: spec.group,
    passes: spec.first.map(([engine, kind]) => newPass(engine, kind)),
    length: spec.length,
  });
  return withStrength(p, true);
}

// how long the lab plays a preset round for: its length, or for a transition, a moment of one
// picture, the transition, and a moment of the next
export const TRANSITION_HOLD = 0.6;
export const previewLength = (p: Pick<Preset, 'group' | 'length'>) =>
  p.group === 'transition' ? p.length + 2 * TRANSITION_HOLD : p.length;

// a preset loaded to start from: its controls' defaults baked into its passes, so what's edited is
// what it draws
export function draftOf(p: Preset): Preset {
  return { ...p, passes: passesWith(p, controlDefaults(p)) };
}

const hasAmount = (x: Pass) => paramsOf(x.engine, x.kind).some(s => s.key === 'amount');

// Strength: on, a slider running every pass's strength from nothing up to what it's set to
export function withStrength(p: Preset, on: boolean): Preset {
  const rest = p.controls.filter(c => c.id !== STRENGTH);
  if (!on) return { ...p, controls: rest };
  const drives = p.passes.flatMap((x, k) =>
    hasAmount(x) ? [{ pass: k, param: 'amount', from: 0, to: x.params.amount as number }] : [],
  );
  if (!drives.length) return { ...p, controls: rest };
  const strength: Control = { id: STRENGTH, label: 'Strength', type: 'slider', def: 1, drives };
  return { ...p, controls: [strength, ...rest] };
}

export const hasStrength = (p: Preset) => p.controls.some(c => c.id === STRENGTH);

// the control (other than Strength) that gives users setting `param` of pass k, if any
export const exposedBy = (p: Preset, k: number, param: string) =>
  p.controls.find(c => c.id !== STRENGTH && c.drives.some(d => d.pass === k && d.param === param)) ?? null;

// setting `param` of pass k given to users as a control of its own (a slider over its whole range,
// or a color), or taken back
export function expose(p: Preset, k: number, param: string, on: boolean): Preset {
  const was = exposedBy(p, k, param);
  if (!on) return was ? { ...p, controls: p.controls.filter(c => c !== was) } : p;
  const spec = paramsOf(p.passes[k].engine, p.passes[k].kind).find(s => s.key === param);
  if (was || !spec || spec.type === 'choice' || spec.type === 'text') return p;
  const v = p.passes[k].params[param];
  const id = uniqueId(p, `${slug(spec.label)}`);
  const c: Control =
    spec.type === 'color'
      ? { id, label: spec.label, type: 'color', def: v as string, drives: [{ pass: k, param }] }
      : {
          id,
          label: spec.label,
          type: 'slider',
          def: spec.max > spec.min ? ((v as number) - spec.min) / (spec.max - spec.min) : 0,
          drives: [{ pass: k, param, from: spec.min, to: spec.max }],
        };
  return { ...p, controls: [...p.controls, c] };
}

function uniqueId(p: Preset, base: string) {
  let id = base,
    n = 2;
  while (p.controls.some(c => c.id === id)) id = `${base}-${n++}`;
  return id;
}

// control `id` taken away (its settings stay as they are)
export const removeControl = (p: Preset, id: string): Preset => ({
  ...p,
  controls: p.controls.filter(c => c.id !== id),
});

export function renameControl(p: Preset, id: string, label: string): Preset {
  return { ...p, controls: p.controls.map(c => (c.id === id ? { ...c, label } : c)) };
}

// setting `param` of pass k set to v (fitted to its range), and the controls driving it moved to
// match
export function setParam(p: Preset, k: number, param: string, v: ParamValue): Preset {
  const x = p.passes[k],
    spec = x && paramsOf(x.engine, x.kind).find(s => s.key === param);
  if (!spec) return p;
  const value = fitParam(spec, v);
  const drives = (c: Control) => c.drives.some(d => d.pass === k && d.param === param);
  // (a color control sets each setting it drives to the same color, so they all change together)
  const color = p.controls.find(c => c.type === 'color' && drives(c));
  const targets = color ? color.drives : [{ pass: k, param }];
  const passes = p.passes.map((y, j) => {
    const mine = targets.filter(d => d.pass === j);
    return mine.length
      ? { ...y, params: { ...y.params, ...Object.fromEntries(mine.map(d => [d.param, value])) } }
      : y;
  });
  const controls = p.controls.map((c): Control => {
    const d = c.drives.find(d => d.pass === k && d.param === param);
    if (!d) return c;
    if (c.type === 'color') return { ...c, def: value as string };
    const n = value as number,
      dr = d as Drive;
    // one setting: the slider starts where it gives it; Strength and several: it reaches it there
    if (c.id !== STRENGTH && c.drives.length === 1) {
      const def = dr.to !== dr.from ? (n - dr.from) / (dr.to - dr.from) : 0;
      return { ...c, def: Math.max(0, Math.min(1, def)) };
    }
    const to = c.def > 1e-6 ? dr.from + (n - dr.from) / c.def : n;
    return { ...c, drives: c.drives.map(e => (e === d ? { ...dr, to } : e)) };
  });
  return { ...p, passes, controls };
}

export const setMotion = (p: Preset, k: number, m: Partial<Motion>): Preset => ({
  ...p,
  passes: p.passes.map((x, j) => (j === k ? { ...x, motion: { ...x.motion, ...m } } : x)),
});

// passes renumbered: to(old index) is its new one, or null where it's gone. Controls follow them;
// a control left driving nothing goes, and Strength is made again over what's left.
function renumber(p: Preset, passes: Pass[], to: (k: number) => number | null): Preset {
  const controls = p.controls
    .filter(c => c.id !== STRENGTH)
    .map(c => ({
      ...c,
      drives: c.drives.flatMap(d => {
        const k = to(d.pass);
        return k === null ? [] : [{ ...d, pass: k }];
      }),
    }))
    .filter(c => c.drives.length) as Control[];
  return withStrength({ ...p, passes, controls }, hasStrength(p));
}

// a new pass of `kind` (drawn by `engine`) on top of the others
export function addPass(p: Preset, engine: Engine, kind: string): Preset {
  return renumber(p, [...p.passes, newPass(engine, kind)], k => k);
}

// pass k taken out (never the last one: a preset draws something)
export function removePass(p: Preset, k: number): Preset {
  if (p.passes.length < 2 || !p.passes[k]) return p;
  return renumber(
    p,
    p.passes.filter((_, j) => j !== k),
    j => (j === k ? null : j > k ? j - 1 : j),
  );
}

// pass k moved one place down (drawn earlier, -1) or up (later, +1)
export function movePass(p: Preset, k: number, by: -1 | 1): Preset {
  const j = k + by;
  if (!p.passes[k] || !p.passes[j]) return p;
  const passes = p.passes.slice();
  [passes[k], passes[j]] = [passes[j], passes[k]];
  return renumber(p, passes, i => (i === k ? j : i === j ? k : i));
}

// its name (and the id made from it), category, length and fades
export function setMeta(
  p: Preset,
  m: Partial<Pick<Preset, 'name' | 'category' | 'length'> & { fadeIn: number; fadeOut: number }>,
): Preset {
  const name = m.name ?? p.name;
  return {
    ...p,
    name,
    id: m.name !== undefined ? slug(name) : p.id,
    category: m.category ?? p.category,
    length: Math.max(0.1, Math.min(60, m.length ?? p.length)),
    fade: {
      in: Math.max(0, Math.min(10, m.fadeIn ?? p.fade.in)),
      out: Math.max(0, Math.min(10, m.fadeOut ?? p.fade.out)),
    },
  };
}

// the preset as its JSON file holds it
export function presetFile(p: Preset) {
  return {
    id: p.id,
    name: p.name,
    group: p.group,
    category: p.category,
    length: p.length,
    fade: p.fade,
    passes: p.passes.map(x => ({ engine: x.engine, kind: x.kind, params: x.params, motion: x.motion })),
    controls: p.controls,
  };
}
