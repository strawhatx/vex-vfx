// The bottom toolbar: the main tools, or a list (effect categories, or the selected clip's tools)
// behind a back button, like CapCut.
import { Icon, I } from './icons';
import type { ImpactFamily } from '@/domain/effects/impacts';
import { SHOW_OVERLAYS, type Tool } from './ToolSheet';

export type ToolKey =
  | Tool
  | 'catalog'
  | 'filters'
  | 'screenfx'
  | 'body'
  | 'packs'
  | 'objects'
  | 'custom'
  | 'cancel'
  | 'edit'
  | 'replace'
  | 'camera'
  | 'outline'
  | 'start'
  | 'end'
  | 'unfix'
  | 'swap'
  | 'delete'
  | 'hithere'
  | 'mute'
  | 'split'
  | 'duplicatescene'
  | 'reverse'
  | 'cutout'
  | 'movekey'
  | 'place'
  | 'deletescene'
  | 'isolate'
  | 'addtext'
  | 'crop'
  | 'review'
  | 'removevideo'
  | 'videoearlier'
  | 'videolater'
  | 'duplicate'
  // checking a cutout's outline (the roto screen)
  | 'add'
  | 'remove'
  | 'pen'
  | 'hand'
  | 'prevframe'
  | 'nextframe'
  | 'penback'
  | 'penclear'
  | 'penclose';
export interface ToolBtn {
  key: ToolKey;
  label: string;
  icon: string;
  on?: boolean;
  disabled?: boolean;
}
// what the toolbar lists: the effect groups, object effects, custom effects, the footage tools (the
// film selected), a selected effect, impact, cutout, music or look's tools
export type Mode =
  'catalog' | 'clip' | 'track' | 'impact' | 'cutout' | 'music' | 'look' | 'effectclip' | null;

// Effects come in three groups:
//   - video effects: over the whole picture (templates)
//   - object effects: on a person or object, following it: templates, all in one list
//   - custom effects: going off wherever you point (hits, explosions, shockwaves…): templates, all in
//     one list, then the user's own effect clips
export const CUSTOM_EXTRAS = [{ id: 'packs', label: 'My clips', icon: I.film }];

// which buttons show for what's selected
export function toolsFor(
  mode: Mode,
  s: {
    ready: boolean;
    busy: boolean;
    recording: boolean;
    camera: boolean;
    adding: boolean;
    outline: boolean;
    muted: boolean;
    open: Tool | null;
    hasKeys: boolean;
    pinned: boolean; // the selected effect comes from a spot: nothing to fix or swap
    objects: number;
    laser: boolean;
    looks: boolean; // the selected effect has styles of its own (Outline, Glitch, Text)
    text: boolean; // the selected look is a text
    body: boolean; // the selected effect is made from a body preset
    burst: boolean; // the selected impact is made from a burst preset
    tunable: boolean; // the selected clip's preset has controls of its own
    words: boolean; // the selected effect is Text: its words can be changed
    colors: boolean; // the selected effect takes a palette (a glitch uses the video's own colors)
    impact: ImpactFamily | null; // the selected impact's family
    moveKey: boolean; // the selected cutout has a transform keyframe at the playhead
    isolated: boolean; // the selected cutout is shown on its own
    films: number; // how many films the clip is split into (kept)
    // the selected film's video: where it is among the film's videos, and how many there are
    video: { at: number; of: number } | null;
  },
): ToolBtn[] {
  const sheet = (t: Tool, label: string, icon: string): ToolBtn => ({
    key: t,
    label,
    icon,
    disabled: !s.ready,
    on: s.open === t,
  });
  if (s.adding) return [{ key: 'cancel', label: 'Cancel', icon: I.back }];
  if (mode === 'catalog')
    return [
      { key: 'screenfx', label: 'Video effects', icon: I.scene, disabled: s.busy || !s.ready },
      { key: 'objects', label: 'Object effects', icon: I.person, disabled: s.busy || !s.ready },
      { key: 'custom', label: 'Custom effects', icon: I.burst, disabled: s.busy || !s.ready },
    ];
  // the footage: split the film, cut objects out of it, and the clip's own settings
  if (mode === 'clip')
    return [
      { key: 'split', label: 'Split', icon: I.edit, disabled: s.busy },
      { key: 'duplicatescene', label: 'Duplicate', icon: I.copy, disabled: s.busy || s.films < 1 },
      { key: 'reverse', label: 'Reverse', icon: I.undo, disabled: s.busy || s.films < 1 },
      { ...sheet('speed', 'Speed', I.speed), disabled: s.busy || s.films < 1 },
      { key: 'crop', label: 'Crop', icon: I.crop, disabled: s.busy || s.films < 1 },
      { ...sheet('animation', 'Animation', I.move), disabled: s.busy || s.films < 1 },
      { key: 'cutout', label: 'Cut out', icon: I.cutout, disabled: s.busy },
      { key: 'deletescene', label: 'Delete', icon: I.trash, disabled: s.busy || s.films < 1 },
      ...(s.video && s.video.of > 1
        ? [
            {
              key: 'videoearlier' as const,
              label: 'Move earlier',
              icon: I.back,
              disabled: s.busy || s.video.at === 0,
            },
            {
              key: 'videolater' as const,
              label: 'Move later',
              icon: I.forward,
              disabled: s.busy || s.video.at === s.video.of - 1,
            },
            { key: 'removevideo' as const, label: 'Remove video', icon: I.remove, disabled: s.busy },
          ]
        : []),
      {
        key: 'mute',
        label: s.muted ? 'Unmute' : 'Mute',
        icon: s.muted ? I.muted : I.sound,
        on: s.muted,
        disabled: !s.ready,
      },
      { key: 'replace', label: 'Replace', icon: I.swap, disabled: s.recording },
      { key: 'camera', label: s.camera ? 'Stop camera' : 'Camera', icon: I.camera, disabled: s.recording },
      { key: 'outline', label: 'Outline', icon: I.outline, on: s.outline, disabled: !s.ready },
    ];
  if (mode === 'impact')
    return [
      ...(s.burst ? [sheet('presets', 'Style', I.burst)] : []),
      ...(s.burst && s.tunable ? [sheet('controls', 'Tune', I.adjust)] : []),
      ...(s.burst ? [sheet('customize', 'Customize', I.edit)] : []),
      ...(s.burst
        ? []
        : [
            sheet(
              'impact',
              'Style',
              s.impact === 'explosion'
                ? I.explosion
                : s.impact === 'shockwave'
                  ? I.wave
                  : s.impact === 'word'
                    ? I.text
                    : s.impact === 'water'
                      ? I.water
                      : I.burst,
            ),
          ]),
      sheet('color', 'Color', I.color),
      sheet('adjust', 'Adjust', I.adjust),
      // an impact isn't tracked, so has no fixes: tap the preview to move it
      {
        key: 'hithere',
        label: s.impact === 'hit' ? 'Hit here' : 'Go off here',
        icon: I.target,
        disabled: s.busy,
      },
      { key: 'duplicate', label: 'Duplicate', icon: I.copy, disabled: s.busy },
      { key: 'delete', label: 'Delete', icon: I.trash, disabled: s.recording },
    ];
  // one of the user's own effect clips
  if (mode === 'effectclip')
    return [
      sheet('controls', 'Adjust', I.adjust),
      { key: 'start', label: 'Starts here', icon: I.start, disabled: s.busy },
      { key: 'end', label: 'Ends here', icon: I.end, disabled: s.busy },
      { key: 'place', label: 'Place here', icon: I.place, disabled: s.busy },
      { key: 'duplicate', label: 'Duplicate', icon: I.copy, disabled: s.busy },
      { key: 'delete', label: 'Delete', icon: I.trash, disabled: s.recording },
    ];
  // a filter or screen effect
  if (mode === 'look')
    return [
      sheet('presets', 'Style', I.effects),
      s.text ? sheet('controls', 'Edit', I.text) : sheet('controls', 'Adjust', I.adjust),
      sheet('customize', 'Customize', I.edit),
      ...(s.text ? [sheet('animation', 'Animation', I.wave)] : []),
      { key: 'start', label: 'Starts here', icon: I.start, disabled: s.busy },
      { key: 'end', label: 'Ends here', icon: I.end, disabled: s.busy },
      { key: 'place', label: 'Place here', icon: I.place, disabled: s.busy },
      { key: 'duplicate', label: 'Duplicate', icon: I.copy, disabled: s.busy },
      { key: 'delete', label: 'Delete', icon: I.trash, disabled: s.recording },
    ];
  if (mode === 'music')
    return [
      sheet('volume', 'Volume', I.sound),
      { key: 'delete', label: 'Delete', icon: I.trash, disabled: s.recording },
    ];
  if (mode === 'cutout')
    return [
      { key: 'review', label: 'Check outline', icon: I.eye, disabled: s.busy },
      { key: 'isolate', label: 'View alone', icon: I.cutout, on: s.isolated, disabled: !s.ready },
      sheet('transform', 'Transform', I.move),
      sheet('animation', 'Animation', I.wave),
      {
        key: 'movekey',
        label: s.moveKey ? 'Remove key' : 'Keyframe',
        icon: I.key,
        on: s.moveKey,
        disabled: s.busy,
      },
      sheet('background', 'Background', I.scene),
      { key: 'place', label: 'Place here', icon: I.place, disabled: s.busy },
      { key: 'start', label: 'Starts here', icon: I.start, disabled: s.busy },
      { key: 'end', label: 'Ends here', icon: I.end, disabled: s.busy },
      { key: 'duplicate', label: 'Duplicate', icon: I.copy, disabled: s.busy },
      { key: 'delete', label: 'Delete', icon: I.trash, disabled: s.recording },
    ];
  if (mode === 'track')
    return [
      // (a body effect: its preset and its controls, rather than an effect's settings)
      ...(s.body
        ? [
            sheet('presets', 'Style', I.effects),
            sheet('controls', 'Adjust', I.adjust),
            sheet('customize', 'Customize', I.edit),
          ]
        : [
            sheet('effects', 'Effect', I.effects),
            ...(s.laser ? [sheet('aim', 'Aim', I.target)] : []),
            ...(s.looks ? [sheet('look', 'Style', I.effects)] : []),
            ...(s.words ? [sheet('words', 'Text', I.text)] : []),
            ...(s.colors ? [sheet('color', 'Color', I.color)] : []),
            sheet('adjust', 'Adjust', I.adjust),
          ]),
      { key: 'start', label: 'Starts here', icon: I.start, disabled: s.busy },
      { key: 'end', label: 'Ends here', icon: I.end, disabled: s.busy },
      ...(s.pinned
        ? []
        : [
            { key: 'unfix' as const, label: 'Remove fix', icon: I.unfix, disabled: s.busy || !s.hasKeys },
            { key: 'swap' as const, label: 'Swap', icon: I.cross, disabled: s.busy || s.objects < 2 },
          ]),
      { key: 'duplicate', label: 'Duplicate', icon: I.copy, disabled: s.busy },
      { key: 'delete', label: 'Delete', icon: I.trash, disabled: s.recording },
    ];
  // the main tools, like CapCut's: the footage, text, effects, filters, and objects cut out of the
  // footage
  return [
    { key: 'edit', label: 'Edit', icon: I.film },
    { key: 'addtext', label: 'Text', icon: I.text, disabled: s.busy || !s.ready },
    { key: 'catalog', label: 'Effects', icon: I.effects, disabled: s.busy },
    { key: 'filters', label: 'Filters', icon: I.color, disabled: s.busy || !s.ready },
    ...(SHOW_OVERLAYS
      ? [{ key: 'cutout' as const, label: 'Overlay', icon: I.cutout, disabled: s.busy || !s.ready }]
      : []),
  ];
}

// the roto screen's tools (checking a cutout's outline): what a tap or loop does (add a piece, or
// take one out), the pen, the hand (to move the zoomed preview), the edge, and stepping a frame
// back or on (it's trimmed by dragging the
// ends of its timeline).
// With the pen's shape begun: taking a point back, clearing it, and closing it.
export function rotoTools(s: {
  tool: 'add' | 'remove';
  pen: { on: boolean; points: number };
  hand: boolean;
  open: Tool | null;
}): ToolBtn[] {
  if (s.pen.on && s.pen.points)
    return [
      { key: 'penclose', label: 'Close shape', icon: I.check, disabled: s.pen.points < 3 },
      { key: 'penback', label: 'Undo point', icon: I.undo },
      { key: 'penclear', label: 'Clear', icon: I.trash },
    ];
  return [
    { key: 'add', label: 'Add', icon: I.plus, on: s.tool === 'add' },
    { key: 'remove', label: 'Remove', icon: I.remove, on: s.tool === 'remove' },
    { key: 'pen', label: 'Pen', icon: I.pen, on: s.pen.on },
    { key: 'hand', label: 'Grab', icon: I.hand, on: s.hand },
    { key: 'edge', label: 'Edge', icon: I.outline, on: s.open === 'edge' },
    { key: 'prevframe', label: 'Previous', icon: I.back },
    { key: 'nextframe', label: 'Next', icon: I.forward },
  ];
}

export function Toolbar({
  label,
  buttons,
  onPress,
  onBack,
}: {
  label: string;
  buttons: ToolBtn[];
  onPress(key: ToolKey): void;
  onBack?: () => void;
}) {
  return (
    <nav className={`toolbar${onBack ? ' sub' : ''}`} aria-label={label}>
      {onBack && (
        <button type="button" className="back" aria-label="Back to all tools" onClick={onBack}>
          <Icon d={I.back} />
        </button>
      )}
      {buttons.map(t => (
        <button
          key={t.key}
          type="button"
          disabled={t.disabled}
          aria-pressed={t.on ?? false}
          onClick={() => onPress(t.key)}
        >
          <Icon d={t.icon} />
          <span>{t.label}</span>
        </button>
      ))}
    </nav>
  );
}
