// Looks: filters and screen effects on the film, each a clip made from a preset (see
// effects/presets.ts). A look lasts from when it's placed for as long as it's set to, over whatever
// plays then; filters go on the Filters layer and screen effects on the Effects layer. Like music
// (see music.ts), a look belongs to the film, not to one video.
import { envelope } from '../effects/curves';
import { passAt, drawsAnything, type DrawnPass } from '../effects/passes';
import {
  controlDefaults,
  fitControl,
  passesWith,
  type ControlValues,
  type Preset,
  type PresetGroup,
} from '../effects/presets';
import type { ParamValue } from '../effects/params';

export interface LookClip {
  id: number;
  name: string;
  preset: Preset;
  values: ControlValues; // its controls' values
  row: number | null; // the row the user put it on in its layer (null: wherever it fits)
  at: number; // when it starts, in the film's time
  len: number; // how long it lasts
}

// the shortest a look can be trimmed to
export const MIN_LOOK_S = 0.1;

export const lookGroup = (c: LookClip): PresetGroup => c.preset.group;

export const lookRange = (c: Pick<LookClip, 'at' | 'len'>) => ({ s: c.at, e: c.at + c.len });

// a new look placed at film time `at`: as long as its preset says, or as much as fits before the
// film ends
export function newLook(id: number, preset: Preset, at: number, filmLength: number): LookClip {
  const room = filmLength - at;
  return {
    id,
    name: preset.name,
    preset,
    values: controlDefaults(preset),
    row: null,
    at: Math.max(0, at),
    len: room > MIN_LOOK_S ? Math.min(preset.length, room) : preset.length,
  };
}

// its start or end moved to film time s or e (not before the film's start, and never shorter than
// MIN_LOOK_S: the end that moved stops there)
export function trimLook(c: LookClip, r: { s?: number; e?: number }): LookClip {
  const was = lookRange(c);
  let s = Math.max(0, r.s ?? was.s),
    e = r.e ?? was.e;
  if (e - s < MIN_LOOK_S) {
    if (r.s !== undefined) s = e - MIN_LOOK_S;
    else e = s + MIN_LOOK_S;
  }
  return { ...c, at: s, len: e - s };
}

export const placeLook = (c: LookClip, at: number): LookClip => ({ ...c, at: Math.max(0, at) });

// another preset in its place: the same timing and row; the controls both have keep their values
export function withPreset(c: LookClip, preset: Preset): LookClip {
  const values = controlDefaults(preset);
  for (const k of Object.keys(values)) if (k in c.values) values[k] = c.values[k];
  return { ...c, preset, name: preset.name, values };
}

export function withControl(c: LookClip, id: string, v: ParamValue): LookClip {
  const control = c.preset.controls.find(x => x.id === id);
  return control ? { ...c, values: { ...c.values, [id]: fitControl(control, v) } } : c;
}

// what the looks on at film time t draw, in order: filters first, then screen effects over them;
// in each layer, lower rows first (so the top row ends up on top)
export function looksAt(clips: readonly LookClip[], t: number): DrawnPass[] {
  const on = clips
    .filter(c => t >= c.at - 1e-6 && t < c.at + c.len - 1e-6)
    .sort(
      (a, b) =>
        Number(a.preset.group === 'screen') - Number(b.preset.group === 'screen') ||
        (b.row ?? 0) - (a.row ?? 0),
    );
  return on.flatMap(c => {
    const local = t - c.at,
      strength = envelope(local, c.len, c.preset.fade.in, c.preset.fade.out);
    return passesWith(c.preset, c.values)
      .map(p => passAt(p, local, c.len, strength, c.id))
      .filter(drawsAnything);
  });
}

// how strongly a flash is shown on its button: at full strength it's just white
const PREVIEW_FLASH = 0.5;

// what a preset draws at its most striking, for its button in the menus: its passes at their
// defaults, at whichever of a dozen moments over its length they're strongest together (a flash
// softened, so the picture under it still shows)
export function previewOf(preset: Preset): DrawnPass[] {
  const passes = passesWith(preset, controlDefaults(preset)),
    len = preset.length;
  let best: DrawnPass[] = [],
    most = -1;
  for (let k = 0; k <= 12; k++) {
    const t = (len * k * 0.999) / 12;
    const drawn = passes.map(p => passAt(p, t, len, p.kind === 'flash' ? PREVIEW_FLASH : 1, 1));
    const sum = drawn.reduce(
      (a, d) => a + Math.abs(d.engine === 'color' ? d.amount : (d.values.amount as number)),
      0,
    );
    if (sum > most + 1e-9) {
      most = sum;
      best = drawn;
    }
  }
  return best.filter(drawsAnything);
}
