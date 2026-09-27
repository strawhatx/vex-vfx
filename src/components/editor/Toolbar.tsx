// The bottom toolbar: the main tools, or a list (effect categories, or the selected clip's tools)
// behind a back button, like CapCut.
import { Icon, I } from './icons';
import type { ImpactFamily } from '@/domain/effects/impacts';
import { SHOW_LASERS, type Category, type Tool } from './ToolSheet';

export type ToolKey =
  | Tool
  | `cat-${Category}`
  | 'catalog'
  | 'impacts'
  | 'elements'
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
  | 'cutout'
  | 'movekey'
  | 'place'
  | 'deletescene'
  | 'isolate'
  | 'duplicate';
export interface ToolBtn {
  key: ToolKey;
  label: string;
  icon: string;
  on?: boolean;
  disabled?: boolean;
}
// what the toolbar lists: the effect categories, the elements, the impact families, the footage
// tools (the film selected), a selected effect, impact or cutout's tools
export type Mode = 'catalog' | 'elements' | 'impacts' | 'clip' | 'track' | 'impact' | 'cutout' | null;

// the Elements menu
export const ELEMENT_CATEGORIES: { id: Category; label: string; icon: string }[] = [
  { id: 'fire', label: 'Fire', icon: I.flame },
  { id: 'lightning', label: 'Lightning', icon: I.bolt },
  { id: 'aura', label: 'Aura', icon: I.aura },
  { id: 'water', label: 'Water', icon: I.water },
];

// the other effect categories; Elements (first) and Impact (last) open menus of their own
export const CATEGORIES: { id: Category; label: string; icon: string }[] = [
  { id: 'sparks', label: 'Sparks', icon: I.effects },
  { id: 'laser', label: 'Laser', icon: I.laser },
  { id: 'outline', label: 'Outline', icon: I.outline },
  { id: 'glitch', label: 'Glitch', icon: I.glitch },
  { id: 'text', label: 'Text', icon: I.text },
];

// the Impact menu: one button per family
export const IMPACT_CATEGORIES: { id: Category; label: string; icon: string }[] = [
  { id: 'impact', label: 'Hit', icon: I.burst },
  { id: 'explosion', label: 'Explosion', icon: I.explosion },
  { id: 'shockwave', label: 'Shockwave', icon: I.wave },
  { id: 'word', label: 'Text', icon: I.text },
  { id: 'splash', label: 'Water', icon: I.water },
];

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
    words: boolean; // the selected effect is Text: its words can be changed
    colors: boolean; // the selected effect takes a palette (a glitch uses the video's own colors)
    impact: ImpactFamily | null; // the selected impact's family
    moveKey: boolean; // the selected cutout has a transform keyframe at the playhead
    isolated: boolean; // the selected cutout is shown on its own
    films: number; // how many films the clip is split into (kept)
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
  const category = (c: { id: Category; label: string; icon: string }): ToolBtn => ({
    key: `cat-${c.id}`,
    label: c.label,
    icon: c.icon,
    disabled: s.busy,
  });
  if (mode === 'catalog')
    return [
      { key: 'elements', label: 'Elements', icon: I.flame, disabled: s.busy },
      ...CATEGORIES.filter(c => SHOW_LASERS || c.id !== 'laser').map(category),
      { key: 'impacts', label: 'Impact', icon: I.burst, disabled: s.busy },
    ];
  if (mode === 'elements') return ELEMENT_CATEGORIES.map(category);
  if (mode === 'impacts') return IMPACT_CATEGORIES.map(category);
  // the footage: split the film, cut objects out of it, and the clip's own settings
  if (mode === 'clip')
    return [
      { key: 'split', label: 'Split', icon: I.edit, disabled: s.busy },
      { key: 'cutout', label: 'Cut out', icon: I.cutout, disabled: s.busy },
      { key: 'deletescene', label: 'Delete', icon: I.trash, disabled: s.busy || s.films < 1 },
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
  if (mode === 'cutout')
    return [
      { key: 'isolate', label: 'View alone', icon: I.cutout, on: s.isolated, disabled: !s.ready },
      sheet('transform', 'Transform', I.move),
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
      { key: 'unfix', label: 'Remove fix', icon: I.unfix, disabled: s.busy || !s.hasKeys },
      { key: 'duplicate', label: 'Duplicate', icon: I.copy, disabled: s.busy },
      { key: 'delete', label: 'Delete', icon: I.trash, disabled: s.recording },
    ];
  if (mode === 'track')
    return [
      sheet('effects', 'Effect', I.effects),
      ...(s.laser ? [sheet('aim', 'Aim', I.target)] : []),
      ...(s.looks ? [sheet('look', 'Style', I.effects)] : []),
      ...(s.words ? [sheet('words', 'Text', I.text)] : []),
      ...(s.colors ? [sheet('color', 'Color', I.color)] : []),
      sheet('adjust', 'Adjust', I.adjust),
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
  return [
    { key: 'catalog', label: 'Effects', icon: I.effects, disabled: s.busy },
    { key: 'edit', label: 'Footage', icon: I.film },
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
