// The moves a plan can name: how text arrives (kinetic-type, and the hook-style scenes) and how one
// scene hands over to the next. The engine draws each one; the descriptions go into the AI prompts.

export type MoveKind = 'text' | 'transition';

export interface MoveInfo {
  kind: MoveKind;
  label: string;
  // one line for the AI director: what it looks like and when it fits
  describe: string;
}

export const MOVES = {
  // text
  'word-slam': {
    kind: 'text',
    label: 'Word slam',
    describe: 'each word slams down from large to its size. Loud; best for short hooks.',
  },
  'word-pop': {
    kind: 'text',
    label: 'Word pop',
    describe: 'words pop in one by one with a small overshoot. Friendly, upbeat.',
  },
  'mask-reveal': {
    kind: 'text',
    label: 'Mask reveal',
    describe: 'each line rises into view from behind an invisible edge. Calm, premium.',
  },
  'letter-stagger': {
    kind: 'text',
    label: 'Letter stagger',
    describe: 'letters fade and rise in one after another. Elegant, for short phrases.',
  },
  typewriter: {
    kind: 'text',
    label: 'Typewriter',
    describe: 'letters type out with a cursor. Technical, developer tools.',
  },
  'highlight-swipe': {
    kind: 'text',
    label: 'Highlight swipe',
    describe: 'a bar of the brand colour swipes in behind the words. Clear, for key benefits.',
  },
  // transitions
  'soft-push': {
    kind: 'transition',
    label: 'Soft push',
    describe: 'the scene drifts up and fades as the next one rises in. Calm.',
  },
  'blur-dissolve': {
    kind: 'transition',
    label: 'Blur dissolve',
    describe: 'a soft crossfade through a blur. Calm, premium.',
  },
  wipe: {
    kind: 'transition',
    label: 'Wipe',
    describe: 'a hard edge sweeps across and uncovers the next scene. Precise, editorial.',
  },
  'whip-pan': {
    kind: 'transition',
    label: 'Whip pan',
    describe: 'a fast blurred pan sideways into the next scene. Energetic.',
  },
  'flash-cut': {
    kind: 'transition',
    label: 'Flash cut',
    describe: 'a hard cut through a quick white flash. Punchy, on the beat.',
  },
  glitch: {
    kind: 'transition',
    label: 'Glitch',
    describe: 'the frame tears into offset slices for a moment. Edgy, tech.',
  },
} as const satisfies Record<string, MoveInfo>;

export type MoveId = keyof typeof MOVES;
export const MOVE_IDS = Object.keys(MOVES) as MoveId[];
export type TextMove = { [K in MoveId]: (typeof MOVES)[K]['kind'] extends 'text' ? K : never }[MoveId];
export type TransitionMove = Exclude<MoveId, TextMove>;

export const isMove = (id: unknown): id is MoveId => typeof id === 'string' && id in MOVES;
export const kindOf = (id: MoveId): MoveKind => MOVES[id].kind;
export const isTextMove = (id: unknown): id is TextMove => isMove(id) && kindOf(id) === 'text';
export const isTransition = (id: unknown): id is TransitionMove => isMove(id) && kindOf(id) === 'transition';
