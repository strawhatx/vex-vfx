// Looks: filters, screen effects and text on the film, each a clip made from a preset (see
// effects/presets.ts). A look lasts from when it's placed for as long as it's set to, over whatever
// plays then; each group has a timeline layer of its own. Like music (see music.ts), a look belongs
// to the film, not to one video. A text look also keeps its own words and where it's placed.
import { envelope, motionAt } from '../effects/curves';
import {
  passAt,
  drawsAnything,
  type DrawnPass,
  type LookPass,
  type EmitterPass,
  isEmitter,
} from '../effects/passes';
import { arriving, type LetterAnim } from '../effects/letters';
import { NO_ANIM, poseAt, type ClipAnim } from '../effects/animation';
import {
  MAX_SCALE,
  MAX_WORDS,
  MIN_SCALE,
  startWords,
  textAt,
  type DrawnText,
  type TextPass,
  type TextPlace,
} from '../effects/typeset';
import {
  controlDefaults,
  fitControl,
  passesWith,
  type ControlValues,
  type LookGroup,
  type Preset,
} from '../effects/presets';
import type { ParamValue, Params } from '../effects/params';
import { placeOf, type Place } from './drawOrder';

// what a filter applies to: the whole clip under it, just its background, or just what's cut out of
// it (docs/timeline-rules.md, rule 7)
export type Scope = 'clip' | 'background' | 'subject';

export const SCOPES: readonly { id: Scope; label: string }[] = [
  { id: 'clip', label: 'Whole clip' },
  { id: 'background', label: 'Background' },
  { id: 'subject', label: 'Subject' },
];

export interface LookClip {
  id: number;
  name: string;
  preset: Preset;
  values: ControlValues; // its controls' values
  row: number | null; // the row the user put it on in its layer (null: wherever it fits)
  at: number; // when it starts, in the film's time
  len: number; // how long it lasts
  text: TextPlace | null; // a text's words and placement
  anim: ClipAnim; // how a text moves as a whole (in, out, combo), on top of its letters' own
  scope?: Scope; // a filter's (none: the whole clip)
  place?: Place; // a text's, behind the subject or in front (none: in front)
}

export const scopeOf = (c: Pick<LookClip, 'scope'>): Scope => c.scope ?? 'clip';

// a filter applying to something else, or a text drawn behind the subject or in front
export const withScope = (c: LookClip, scope: Scope): LookClip => ({ ...c, scope });
export const withPlace = (c: LookClip, place: Place): LookClip => ({ ...c, place });

// how many of the filters on during [s, e) (film time) apply to just the background
export const backgroundOnly = (clips: readonly LookClip[], r: { s: number; e: number }) =>
  clips.filter(
    c =>
      c.preset.group === 'filter' &&
      scopeOf(c) === 'background' &&
      c.at < r.e - 1e-6 &&
      c.at + c.len > r.s + 1e-6,
  ).length;

// a text starts in the middle, as big as its type says
const startPlace = (preset: Preset): TextPlace | null =>
  preset.group === 'text'
    ? { words: startWords(preset.passes as TextPass[]), x: 0.5, y: 0.5, scale: 1, rot: 0 }
    : null;

// the shortest a look can be trimmed to
export const MIN_LOOK_S = 0.1;

// (a look is never made from a motion preset: see Project.addLook)
export const lookGroup = (c: Pick<LookClip, 'preset'>) => c.preset.group as LookGroup;

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
    text: startPlace(preset),
    anim: NO_ANIM,
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
  return { ...c, preset, name: preset.name, values, text: c.text ?? startPlace(preset) };
}

// a text's words or placement changed (its size and words kept in bounds)
export function withText(c: LookClip, p: Partial<TextPlace>): LookClip {
  if (!c.text) return c;
  const t = { ...c.text, ...p };
  return {
    ...c,
    text: {
      ...t,
      words: Array.from(t.words).slice(0, MAX_WORDS).join(''),
      scale: Math.max(MIN_SCALE, Math.min(MAX_SCALE, t.scale)),
    },
  };
}

export function withControl(c: LookClip, id: string, v: ParamValue): LookClip {
  const control = c.preset.controls.find(x => x.id === id);
  return control ? { ...c, values: { ...c.values, [id]: fitControl(control, v) } } : c;
}

// what the looks on at film time t draw, in order: filters first, then screen effects over them
// (group: just that group's; on: just the filters that apply to the clip's background, or to what's
// cut out of it); in each layer, lower rows first (so the top row ends up on top)
export function looksAt(
  clips: readonly LookClip[],
  t: number,
  group?: LookGroup,
  on?: 'background' | 'subject',
): DrawnPass[] {
  const applies = (c: LookClip) =>
    !on || c.preset.group !== 'filter' || scopeOf(c) === 'clip' || scopeOf(c) === on;
  const drawn = onAt(clips, t)
    .filter(c => c.preset.group !== 'text' && (!group || c.preset.group === group) && applies(c))
    .sort(
      (a, b) =>
        Number(a.preset.group === 'screen') - Number(b.preset.group === 'screen') ||
        (b.row ?? 0) - (a.row ?? 0),
    );
  return drawn.flatMap(c => {
    const local = t - c.at,
      strength = envelope(local, c.len, c.preset.fade.in, c.preset.fade.out);
    return passesWith(c.preset, c.values)
      .filter((p): p is LookPass => p.engine === 'frame')
      .map(p => passAt(p, local, c.len, strength, c.id))
      .filter(drawsAnything);
  });
}

// a particle emitter a look draws over the whole frame (see effects/particles.ts)
export interface DrawnEmitter {
  key: string; // which look and pass
  seed: number;
  params: Params; // `amount` scaled by the look's fades and the pass's motion
  local: number; // seconds into the look
}

// the emitters of the looks on at film time t (drawn over the looks, under the texts)
export function particlesAt(clips: readonly LookClip[], t: number): DrawnEmitter[] {
  return onAt(clips, t)
    .filter(c => c.preset.group !== 'text')
    .sort((a, b) => (b.row ?? 0) - (a.row ?? 0))
    .flatMap(c => {
      const local = t - c.at,
        strength = envelope(local, c.len, c.preset.fade.in, c.preset.fade.out);
      return passesWith(c.preset, c.values).flatMap((p, k) =>
        isEmitter(p)
          ? [
              {
                key: `${c.id}:${k}`,
                seed: c.id * 31 + k,
                params: {
                  ...p.params,
                  amount: (p.params.amount as number) * strength * motionAt(p.motion, local, c.len, c.id),
                },
                local,
              },
            ]
          : [],
      );
    });
}

const onAt = (clips: readonly LookClip[], t: number) =>
  clips.filter(c => t >= c.at - 1e-6 && t < c.at + c.len - 1e-6);

// the texts on at film time t (place: just those behind the subject, or in front), lower rows first
// (so the top row ends up on top)
export function textsAt(clips: readonly LookClip[], t: number, place?: Place): DrawnText[] {
  return onAt(clips, t)
    .filter(c => c.text && (!place || placeOf(c) === place))
    .sort((a, b) => (b.row ?? 0) - (a.row ?? 0))
    .map(c => {
      const local = t - c.at;
      const strength = envelope(local, c.len, c.preset.fade.in, c.preset.fade.out);
      const passes = passesWith(c.preset, c.values).filter(
        (p): p is TextPass | EmitterPass => p.engine === 'text' || isEmitter(p),
      );
      const d = textAt(c.id, passes, c.text!, local, c.len, strength, c.id);
      return { ...d, pose: poseAt(c.anim, local, c.len) };
    });
}

// a text preset as its button shows it: its words, in the middle, all come in
export function textPreviewOf(preset: Preset): DrawnText {
  const passes = passesWith(preset, controlDefaults(preset)).filter(
    (p): p is TextPass | EmitterPass => p.engine === 'text' || isEmitter(p),
  );
  const inn = passes.find(p => p.kind === 'in')?.params;
  const n = Array.from(startWords(passes)).length;
  const settled = inn
    ? arriving(inn.style as LetterAnim, n, inn.duration as number, inn.stagger as number)
    : 0;
  const len = Math.max(preset.length, settled + 1);
  return textAt(0, passes, startPlace(preset)!, Math.min(settled + 0.05, len / 2), len, 1, 1);
}

// how strongly a flash is shown on its button: at full strength it's just white
const PREVIEW_FLASH = 0.5;

// what a preset draws at its most striking, for its button in the menus: its passes at their
// defaults, at whichever of a dozen moments over its length they're strongest together (a flash
// softened, so the picture under it still shows)
export function previewOf(preset: Preset): DrawnPass[] {
  const passes = passesWith(preset, controlDefaults(preset)).filter(
      (p): p is LookPass => p.engine === 'frame',
    ),
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
