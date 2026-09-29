// An engine's settings, described as data: each one's name, range and default. Presets are checked
// against them (see presets.ts), and the Preset Lab and Pro panels build their sliders from them, so
// a new setting needs no new UI.

export interface NumberParam {
  key: string;
  label: string;
  type: 'number';
  min: number;
  max: number;
  def: number;
}

export interface ColorParam {
  key: string;
  label: string;
  type: 'color';
  def: string; // #rrggbb
}

export interface ChoiceParam {
  key: string;
  label: string;
  type: 'choice';
  options: readonly { id: string; label: string }[];
  def: string;
}

export interface TextParam {
  key: string;
  label: string;
  type: 'text';
  max: number; // characters
  def: string;
}

export type ParamSpec = NumberParam | ColorParam | ChoiceParam | TextParam;
export type ParamValue = number | string;
export type Params = Record<string, ParamValue>;

export const num = (key: string, label: string, min: number, max: number, def: number): NumberParam => ({
  key,
  label,
  type: 'number',
  min,
  max,
  def,
});
export const color = (key: string, label: string, def: string): ColorParam => ({
  key,
  label,
  type: 'color',
  def,
});
export const choice = (
  key: string,
  label: string,
  options: readonly { id: string; label: string }[],
  def: string,
): ChoiceParam => ({ key, label, type: 'choice', options, def });

export const text = (key: string, label: string, max: number, def: string): TextParam => ({
  key,
  label,
  type: 'text',
  max,
  def,
});

export const isColor = (v: unknown): v is string => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);

// one setting's value made to fit its spec: a number in its range, a color, one of its choices;
// anything else (or nothing) gives its default
export function fitParam(spec: ParamSpec, v: unknown): ParamValue {
  switch (spec.type) {
    case 'number':
      return typeof v === 'number' && Number.isFinite(v)
        ? Math.max(spec.min, Math.min(spec.max, v))
        : spec.def;
    case 'color':
      return isColor(v) ? v.toLowerCase() : spec.def;
    case 'choice':
      return typeof v === 'string' && spec.options.some(o => o.id === v) ? v : spec.def;
    case 'text':
      return typeof v === 'string' ? Array.from(v).slice(0, spec.max).join('') : spec.def;
  }
}

// every setting in specs, from `given` where it fits, else its default
export function fitParams(specs: readonly ParamSpec[], given: Record<string, unknown> = {}): Params {
  const out: Params = {};
  for (const s of specs) out[s.key] = fitParam(s, given[s.key]);
  return out;
}

export const defaults = (specs: readonly ParamSpec[]) => fitParams(specs);

// #rrggbb as 0..1 channels
export function rgbOf(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export function hexOf([r, g, b]: readonly number[]) {
  const c = (v: number) =>
    Math.round(Math.max(0, Math.min(1, v)) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}
