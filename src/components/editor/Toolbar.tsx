// The bottom toolbar: the main tools, or a list (effect categories, or the selected clip's tools)
// behind a back button, like CapCut.
import { Icon, I } from './icons';
import type { Category, Tool } from './ToolSheet';

export type ToolKey =
  | Tool
  | `cat-${Category}`
  | 'catalog'
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
  | 'mute';
export interface ToolBtn {
  key: ToolKey;
  label: string;
  icon: string;
  on?: boolean;
  disabled?: boolean;
}
// what the toolbar lists: the effect categories, the clip's tools, a selected effect or impact's tools
export type Mode = 'catalog' | 'clip' | 'track' | 'impact' | null;

export const CATEGORIES: { id: Category; label: string; icon: string }[] = [
  { id: 'fire', label: 'Fire', icon: I.flame },
  { id: 'lightning', label: 'Lightning', icon: I.bolt },
  { id: 'aura', label: 'Aura', icon: I.aura },
  { id: 'sparks', label: 'Sparks', icon: I.effects },
  { id: 'laser', label: 'Laser', icon: I.laser },
  { id: 'impact', label: 'Impact', icon: I.burst },
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
    objects: number;
    laser: boolean;
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
    return CATEGORIES.map(c => ({
      key: `cat-${c.id}` as const,
      label: c.label,
      icon: c.icon,
      disabled: s.busy,
    }));
  if (mode === 'clip')
    return [
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
      sheet('impact', 'Style', I.burst),
      sheet('color', 'Color', I.color),
      sheet('adjust', 'Adjust', I.adjust),
      { key: 'hithere', label: 'Hit here', icon: I.target, disabled: s.busy },
      { key: 'unfix', label: 'Remove fix', icon: I.unfix, disabled: s.busy || !s.hasKeys },
      { key: 'delete', label: 'Delete', icon: I.trash, disabled: s.recording },
    ];
  if (mode === 'track')
    return [
      sheet('effects', 'Effect', I.effects),
      ...(s.laser ? [sheet('aim', 'Aim', I.target)] : []),
      sheet('color', 'Color', I.color),
      sheet('adjust', 'Adjust', I.adjust),
      { key: 'start', label: 'Starts here', icon: I.start, disabled: s.busy },
      { key: 'end', label: 'Ends here', icon: I.end, disabled: s.busy },
      { key: 'unfix', label: 'Remove fix', icon: I.unfix, disabled: s.busy || !s.hasKeys },
      { key: 'swap', label: 'Swap', icon: I.cross, disabled: s.busy || s.objects < 2 },
      { key: 'delete', label: 'Delete', icon: I.trash, disabled: s.recording },
    ];
  return [
    { key: 'catalog', label: 'Effects', icon: I.effects, disabled: s.busy },
    { key: 'edit', label: 'Edit', icon: I.edit },
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
