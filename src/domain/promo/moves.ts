// The move library: every move a video can use, by name. A plan (from the AI or the rules) can only
// name moves in this list; the engine draws each one. The descriptions go into the director prompt.

export type MoveKind = 'screen' | 'text' | 'transition' | 'extra';

export interface MoveInfo {
  kind: MoveKind;
  label: string;
  // one line for the AI director: what it looks like and when it fits
  describe: string;
}

export const MOVES = {
  // screens: how a screenshot is shown for its scene
  'slide-in': {
    kind: 'screen',
    label: 'Slide in',
    describe: 'the screen glides up into place, then drifts slowly. Calm, works anywhere.',
  },
  'tilt-float': {
    kind: 'screen',
    label: 'Tilt float',
    describe: 'the screen floats tilted in 3D and slowly turns to face the viewer. Premium, hero shots.',
  },
  'zoom-detail': {
    kind: 'screen',
    label: 'Zoom to detail',
    describe: 'starts on the whole screen, then pushes in on the zoom target. Use to point at one feature.',
  },
  'parallax-scroll': {
    kind: 'screen',
    label: 'Parallax scroll',
    describe: 'the screenshot scrolls inside its frame while the frame drifts the other way. For tall pages.',
  },
  'device-frame-spin': {
    kind: 'screen',
    label: 'Device spin',
    describe: 'the device spins in from edge-on and settles facing the viewer. A big reveal; use once.',
  },
  // text: how a caption or the hook appears
  'word-pop': {
    kind: 'text',
    label: 'Word pop',
    describe: 'words pop in one by one with a small overshoot. Friendly, upbeat.',
  },
  typewriter: {
    kind: 'text',
    label: 'Typewriter',
    describe: 'letters type out with a cursor. Technical, developer tools.',
  },
  'word-slam': {
    kind: 'text',
    label: 'Word slam',
    describe: 'each word slams down from large to its size. Loud; best for short hooks.',
  },
  'highlight-swipe': {
    kind: 'text',
    label: 'Highlight swipe',
    describe: 'a bar of the brand colour swipes in behind the words. Clear, for key benefits.',
  },
  // transitions: how a scene hands over to the next
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
  'blur-dissolve': {
    kind: 'transition',
    label: 'Blur dissolve',
    describe: 'the scene blurs and melts into the next. Soft, elegant.',
  },
  glitch: {
    kind: 'transition',
    label: 'Glitch',
    describe: 'the frame tears into offset slices for a moment. Edgy, tech.',
  },
  // extras: something laid over a scene
  'light-sweep': {
    kind: 'extra',
    label: 'Light sweep',
    describe: 'a band of light sweeps across the screen once. Adds shine to a hero shot.',
  },
  grain: {
    kind: 'extra',
    label: 'Grain',
    describe: 'film grain over the scene. Texture, warmth.',
  },
  'glow-pulse': {
    kind: 'extra',
    label: 'Glow pulse',
    describe: 'the screen glows in the brand colour and pulses gently. Draws the eye.',
  },
} as const satisfies Record<string, MoveInfo>;

export type MoveId = keyof typeof MOVES;

export const MOVE_IDS = Object.keys(MOVES) as MoveId[];

export const isMove = (id: unknown): id is MoveId => typeof id === 'string' && id in MOVES;

export const kindOf = (id: MoveId): MoveKind => MOVES[id].kind;

export const movesOf = (kind: MoveKind) => MOVE_IDS.filter(id => MOVES[id].kind === kind);
