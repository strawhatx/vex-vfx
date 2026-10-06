// The scene library: every scene type a video can use, what it's for, and the slots the AI (or the
// user) fills. Each type is built and tested once in the engine; a plan only fills slots. Captions
// (the subtitles layer) are a slot of every scene.
import type { TextMove, TransitionMove } from './moves';

// a number in the video: shown only once the user has confirmed it (the AI never invents numbers)
export interface Num {
  value: number | null;
  confirmed: boolean;
}

export interface Card {
  title: string;
  subtitle: string;
}

// icons for the ambient wall (drawn from Lucide, ISC licence)
export const ICON_IDS = [
  'file-text',
  'receipt',
  'chart',
  'shield',
  'zap',
  'users',
  'clock',
  'mail',
  'lock',
  'globe',
  'code',
  'terminal',
  'sparkles',
  'message',
  'calendar',
  'credit-card',
  'database',
  'cloud',
  'bell',
  'heart',
  'star',
  'image',
  'search',
  'inbox',
  'rocket',
  'wallet',
  'layers',
  'workflow',
] as const;
export type IconId = (typeof ICON_IDS)[number];

interface Base {
  sec: number;
  // the subtitle line under this scene; a word in *asterisks* shows in the brand colour
  caption: string;
  // how this scene hands over to the next (null: the style's default)
  transition: TransitionMove | null;
}

export interface LogoReveal extends Base {
  type: 'logo-reveal';
  name: string;
  tagline: string;
}
export interface StatCounter extends Base {
  type: 'stat-counter';
  value: Num;
  prefix: string;
  suffix: string;
  label: string;
}
export interface StatRing extends Base {
  type: 'stat-ring';
  percent: Num;
  label: string;
  badge: string;
}
export interface CardStack extends Base {
  type: 'card-stack';
  cards: Card[];
  stat: Num;
  statPrefix: string;
  statSuffix: string;
  statLabel: string;
}
export interface AmbientWall extends Base {
  type: 'ambient-wall';
  icon: IconId;
  title: string;
}
export interface KineticType extends Base {
  type: 'kinetic-type';
  // a word in *asterisks* shows in the brand colour
  text: string;
  move: TextMove;
}

export type Scene = LogoReveal | StatCounter | StatRing | CardStack | AmbientWall | KineticType;
export type SceneType = Scene['type'];

// how a slot is edited and checked
export type SlotSpec =
  | { key: string; kind: 'text'; label: string; max: number; required: boolean }
  // a required number must be filled in and confirmed before export; an optional one may stay empty
  | {
      key: string;
      kind: 'number';
      label: string;
      min: number;
      max: number;
      integer: boolean;
      required: boolean;
    }
  | {
      key: string;
      kind: 'cards';
      label: string;
      min: number;
      max: number;
      titleMax: number;
      subtitleMax: number;
    }
  | { key: string; kind: 'icon'; label: string }
  | { key: string; kind: 'move'; label: string };

export interface SceneInfo {
  type: SceneType;
  label: string;
  // one line for the AI director: what it shows and when to use it
  describe: string;
  // the scene's length range, in seconds
  sec: [number, number];
  slots: SlotSpec[];
}

export const CAPTION_MAX = 90;

const text = (key: string, label: string, max: number, required = true): SlotSpec => ({
  key,
  kind: 'text',
  label,
  max,
  required,
});
const number = (key: string, label: string, max = 1e12, required = true): SlotSpec => ({
  key,
  kind: 'number',
  label,
  min: 0,
  max,
  integer: false,
  required,
});

export const SCENES: Record<SceneType, SceneInfo> = {
  'logo-reveal': {
    type: 'logo-reveal',
    label: 'Logo reveal',
    describe: 'the logo and product name resolve on a soft background. Use to open, or to sign off.',
    sec: [2, 4],
    slots: [text('name', 'Product name', 32), text('tagline', 'Tagline', 60, false)],
  },
  'stat-counter': {
    type: 'stat-counter',
    label: 'Stat counter',
    describe: 'one big number counts up with a label. Proof. Only with a number the user gave.',
    sec: [2.5, 4],
    slots: [
      number('value', 'Number'),
      text('prefix', 'Before the number', 4, false),
      text('suffix', 'After the number', 8, false),
      text('label', 'Label', 48),
    ],
  },
  'stat-ring': {
    type: 'stat-ring',
    label: 'Stat ring',
    describe: 'a ring fills to a percentage with a label and a small badge. Proof as a share or rate.',
    sec: [2.5, 4],
    slots: [number('percent', 'Percent', 100), text('label', 'Label', 48), text('badge', 'Badge', 18, false)],
  },
  'card-stack': {
    type: 'card-stack',
    label: 'Card stack',
    describe: 'two to four cards step in as a timeline, with a big stat beside them. How it works, or steps.',
    sec: [3, 5.5],
    slots: [
      { key: 'cards', kind: 'cards', label: 'Cards', min: 2, max: 4, titleMax: 28, subtitleMax: 40 },
      number('stat', 'Stat', 1e12, false),
      text('statPrefix', 'Before the stat', 8, false),
      text('statSuffix', 'After the stat', 8, false),
      text('statLabel', 'Stat label', 40, false),
    ],
  },
  'ambient-wall': {
    type: 'ambient-wall',
    label: 'Ambient wall',
    describe:
      'a wall of small cards with an icon drifts by, each gaining a checkmark; a line sits on top. Scale, volume, "all of it, done".',
    sec: [2.5, 4.5],
    slots: [{ key: 'icon', kind: 'icon', label: 'Icon' }, text('title', 'Line on top', 48)],
  },
  'kinetic-type': {
    type: 'kinetic-type',
    label: 'Kinetic type',
    describe: 'large text animates in. Hooks, the problem, and the call to action.',
    sec: [1.5, 3.5],
    slots: [text('text', 'Text', 60), { key: 'move', kind: 'move', label: 'Move' }],
  },
};

export const SCENE_TYPES = Object.keys(SCENES) as SceneType[];
export const isSceneType = (t: unknown): t is SceneType => typeof t === 'string' && t in SCENES;

// the number slots of a scene, by key
export function numberSlots(s: Scene): { key: string; label: string; required: boolean; num: Num }[] {
  return SCENES[s.type].slots.flatMap(x =>
    x.kind === 'number'
      ? [
          {
            key: x.key,
            label: x.label,
            required: x.required,
            num: (s as unknown as Record<string, Num>)[x.key],
          },
        ]
      : [],
  );
}

// a scene of this type with placeholder content (for "+ add scene"); numbers start empty
export function blankScene(type: SceneType, product = 'Your product'): Scene {
  const base = { sec: SCENES[type].sec[0] + 0.5, caption: '', transition: null };
  const empty: Num = { value: null, confirmed: false };
  switch (type) {
    case 'logo-reveal':
      return { ...base, type, name: product, tagline: '' };
    case 'stat-counter':
      return { ...base, type, value: empty, prefix: '', suffix: '', label: 'customers' };
    case 'stat-ring':
      return { ...base, type, percent: empty, label: 'of teams', badge: '' };
    case 'card-stack':
      return {
        ...base,
        type,
        cards: [
          { title: 'Step one', subtitle: '' },
          { title: 'Step two', subtitle: '' },
          { title: 'Step three', subtitle: '' },
        ],
        stat: empty,
        statPrefix: '',
        statSuffix: '',
        statLabel: '',
      };
    case 'ambient-wall':
      return { ...base, type, icon: 'sparkles', title: 'All of it, handled' };
    case 'kinetic-type':
      return { ...base, type, text: `Try *${product}*`, move: 'word-slam' };
  }
}
