// Customizing an effect: its template's layers (passes) set, added, taken out and moved, and new
// effects made from nothing. Each change gives a new preset (nothing is changed in place). A clip
// customized gets its own copy of its template (see ownCopy), with a Strength slider over it all.
//
// An effect always draws as its passes say: its controls' defaults give back exactly the settings
// being edited. Setting a setting a control drives moves the control's default (or, for Strength
// and controls driving several settings, where the control takes that setting) to match.
import type { Motion } from './curves';
import { BODY_KINDS } from './body';
import { BURST_KINDS } from './bursts';
import { ENGINES, fitPass, paramsOf, type Engine, type Pass } from './passes';
import { fitParam, type ParamValue } from './params';
import {
  parsePreset,
  passesWith,
  type Control,
  type ControlValues,
  type Drive,
  type Preset,
  type PresetGroup,
} from './presets';

// What an effect is for (its group): the frame (a filter, or a video effect), an object, text, a
// clip's motion, the join between clips, or a custom effect (going off wherever it's pointed). Each
// says the layers (kinds of pass, from any engine) that can go on it, what a new one starts with,
// and how long it lasts.
interface Target {
  name: string;
  offers: readonly { engine: Engine; kinds?: readonly string[] }[];
  first: readonly (readonly [Engine, string])[];
  length: number;
}

export const EFFECT_TARGETS: Record<PresetGroup, Target> = {
  filter: {
    name: 'The frame: a filter',
    offers: [{ engine: 'frame', kinds: ['grade'] }],
    first: [['frame', 'grade']],
    length: 5,
  },
  screen: {
    name: 'The frame: an effect',
    offers: [{ engine: 'frame' }, { engine: 'object', kinds: ['emitter'] }],
    first: [['frame', 'flash']],
    length: 3,
  },
  body: {
    name: 'An object',
    offers: [{ engine: 'object', kinds: Object.keys(BODY_KINDS) }],
    first: [['object', 'edge']],
    length: 3,
  },
  text: {
    name: 'Text',
    offers: [{ engine: 'text' }, { engine: 'object', kinds: ['emitter'] }],
    first: [
      ['text', 'type'],
      ['text', 'fill'],
      ['text', 'in'],
      ['text', 'out'],
    ],
    length: 3,
  },
  motion: {
    name: "A clip's motion",
    offers: [{ engine: 'motion' }],
    first: [['motion', 'in']],
    length: 2,
  },
  transition: {
    name: 'Between clips',
    offers: [{ engine: 'motion', kinds: ['out', 'in'] }, { engine: 'frame' }],
    first: [
      ['motion', 'out'],
      ['motion', 'in'],
      ['frame', 'blur'],
    ],
    length: 0.6,
  },
  impact: {
    name: 'An impact',
    offers: [{ engine: 'object', kinds: [...Object.keys(BURST_KINDS), 'emitter'] }],
    first: [['object', 'hit']],
    length: 0.5,
  },
};

export const TARGETS = Object.keys(EFFECT_TARGETS) as PresetGroup[];

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

// the layers (kinds of pass) that can go on a preset for `target`, with the engine each is drawn by
export const kindsOf = (target: PresetGroup) =>
  EFFECT_TARGETS[target].offers.flatMap(({ engine, kinds }) =>
    Object.entries(ENGINES[engine])
      .filter(([id]) => !kinds || kinds.includes(id))
      .map(([id, k]) => ({ engine, kind: id, label: k.label })),
  );

export const newPass = (engine: Engine, kind: string): Pass => fitPass({ engine, kind });

// the id an effect made from nothing starts with (so "add MY_OWN" means make one)
export const MY_OWN = 'my-effect';

// a new effect for `target`, made from nothing: its first layers, and a Strength slider
export function blankEffect(target: PresetGroup): Preset {
  const spec = EFFECT_TARGETS[target];
  const p = parsePreset({
    id: MY_OWN,
    name: 'My effect',
    group: target,
    passes: spec.first.map(([engine, kind]) => newPass(engine, kind)),
    length: spec.length,
  });
  return withStrength(p, true);
}

// a clip's own copy of its preset, to customize: its controls' values baked into its layers, and a
// Strength slider over all of them (at full, so it draws just as it did)
export function ownCopy(p: Preset, values: ControlValues): Preset {
  return withStrength({ ...p, passes: passesWith(p, values), controls: [] }, true);
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
