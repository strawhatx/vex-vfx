// The text engine: words drawn as styled, animated letters. Its passes are
//   - type: the words it starts with, its font, size and letter spacing (the first one counts)
//   - fill, stroke, glow, shadow, fire, lightning, aura: style layers, drawn in order, so the first
//     is at the back. Fire, lightning and aura come off the letters' shape, as they do off a
//     tracked object.
//   - in, out: how the letters come in and go out (the first of each counts)
// A text clip keeps its own words and where it's placed; what it draws at a moment is worked out
// here, letter by letter, so any frame draws the same.
import { REST_POSE, type ClipPose } from './animation';
import { motionAt, type Motion } from './curves';
import { FONTS } from './text';
import { LETTER_ANIMS, REST, combine, letterIn, letterOut, type LetterAnim, type Pose } from './letters';
import { PALETTES } from './palettes';
import { choice, color, num, text, type ParamSpec, type Params } from './params';

export type TextKind =
  'type' | 'fill' | 'stroke' | 'glow' | 'shadow' | 'fire' | 'lightning' | 'aura' | 'in' | 'out';

// the most letters a text holds
export const MAX_WORDS = 60;

const amount = (def = 1) => num('amount', 'Strength', 0, 1, def);
const palette = (def: string) =>
  choice(
    'palette',
    'Colors',
    PALETTES.map(p => ({ id: p.name.toLowerCase(), label: p.name })),
    def,
  );
const anim = (def: LetterAnim, dur: number, stagger: number) => [
  choice('style', 'Style', LETTER_ANIMS, def),
  num('duration', 'Each letter (s)', 0.05, 3, dur),
  num('stagger', 'Between letters (s)', 0, 0.3, stagger),
];

export const TEXT_KINDS: Record<TextKind, { label: string; params: readonly ParamSpec[] }> = {
  type: {
    label: 'Type',
    params: [
      text('words', 'Words', MAX_WORDS, 'TITLE'),
      choice('font', 'Font', FONTS, 'anton'),
      num('size', 'Size', 0.03, 0.3, 0.12), // of the frame's width, per letter height
      num('spacing', 'Letter spacing', -0.1, 0.5, 0.02), // ems
      choice(
        'caps',
        'Capitals',
        [
          { id: 'typed', label: 'As typed' },
          { id: 'upper', label: 'All capitals' },
        ],
        'typed',
      ),
    ],
  },
  fill: {
    label: 'Fill',
    params: [
      amount(),
      color('color', 'Color', '#ffffff'),
      color('color2', 'Bottom color', '#ffc640'),
      num('gradient', 'Gradient', 0, 1, 0),
    ],
  },
  stroke: {
    label: 'Outline',
    params: [amount(), color('color', 'Color', '#000000'), num('width', 'Width', 0, 1, 0.3)],
  },
  glow: {
    label: 'Glow',
    params: [amount(0.8), color('color', 'Color', '#62d8ff'), num('size', 'Size', 0, 1, 0.4)],
  },
  shadow: {
    label: 'Shadow',
    params: [
      amount(0.7),
      color('color', 'Color', '#000000'),
      num('x', 'Across', -1, 1, 0.3),
      num('y', 'Down', -1, 1, 0.3),
      num('blur', 'Blur', 0, 1, 0.2),
    ],
  },
  fire: {
    label: 'Fire',
    params: [amount(1), num('height', 'Height', 0, 1, 0.5), palette('ember')],
  },
  lightning: {
    label: 'Lightning',
    params: [num('amount', 'Strength', 0, 2, 1), num('size', 'Size', 0.3, 3, 1), palette('blue')],
  },
  aura: {
    label: 'Aura',
    params: [num('amount', 'Strength', 0, 2, 1), num('size', 'Size', 0.3, 3, 1), palette('void')],
  },
  in: { label: 'Comes in', params: anim('pop', 0.35, 0.05) },
  out: { label: 'Goes out', params: anim('fade', 0.25, 0) },
};

export const isTextKind = (k: string): k is TextKind => Object.hasOwn(TEXT_KINDS, k);
const STYLES = new Set<TextKind>(['fill', 'stroke', 'glow', 'shadow', 'fire', 'lightning', 'aura']);

// where a text clip is: its middle (fractions of the frame), its size (1 = as its type says) and
// its turn (degrees)
export interface TextPlace {
  words: string;
  x: number;
  y: number;
  scale: number;
  rot: number;
}

export const MIN_SCALE = 0.2,
  MAX_SCALE = 5;

export interface TextPass {
  engine: 'text';
  kind: TextKind;
  params: Params;
  motion: Motion;
}

// a text as drawn at one moment
export interface DrawnText {
  id: number;
  letters: string[]; // one per character (spaces too)
  poses: Pose[]; // one per letter
  font: string;
  size: number;
  spacing: number;
  place: Omit<TextPlace, 'words'>;
  styles: { kind: TextKind; values: Params }[]; // back to front, `amount` scaled
  t: number; // seconds into it (fire moves with it)
  pose: ClipPose; // how the clip's animation moves the whole of it (see animation.ts)
}

// the words a text starts with: its type's
export function startWords(passes: readonly TextPass[]) {
  const type = passes.find(p => p.kind === 'type');
  return (type?.params.words as string | undefined) ?? 'TITLE';
}

const typeOf = (passes: readonly TextPass[]) =>
  passes.find(p => p.kind === 'type')?.params ??
  Object.fromEntries(TEXT_KINDS.type.params.map(s => [s.key, s.def]));

// the text t seconds into a clip len long; strength: how far on the clip is (its fades); seed:
// which flicker (each clip its own)
export function textAt(
  id: number,
  passes: readonly TextPass[],
  place: TextPlace,
  t: number,
  len: number,
  strength: number,
  seed: number,
): DrawnText {
  const type = typeOf(passes);
  const words = type.caps === 'upper' ? place.words.toUpperCase() : place.words;
  const letters = Array.from(words),
    n = letters.length;
  const inn = passes.find(p => p.kind === 'in')?.params,
    out = passes.find(p => p.kind === 'out')?.params;
  const poses = letters.map((_, i) => {
    let pose = REST;
    if (inn)
      pose = combine(
        pose,
        letterIn(inn.style as LetterAnim, i, n, t, inn.duration as number, inn.stagger as number),
      );
    // (going out: done just as the clip ends)
    if (out)
      pose = combine(
        pose,
        letterOut(out.style as LetterAnim, i, n, len - t, out.duration as number, out.stagger as number),
      );
    return pose;
  });
  const styles = passes
    .filter(p => STYLES.has(p.kind))
    .map(p => ({
      kind: p.kind,
      values: {
        ...p.params,
        amount: (p.params.amount as number) * strength * motionAt(p.motion, t, len, seed),
      },
    }))
    .filter(s => (s.values.amount as number) > 1e-3);
  return {
    id,
    letters,
    poses,
    font: type.font as string,
    size: type.size as number,
    spacing: type.spacing as number,
    place: { x: place.x, y: place.y, scale: place.scale, rot: place.rot },
    styles,
    t,
    pose: REST_POSE,
  };
}
