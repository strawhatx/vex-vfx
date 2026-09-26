// The bottom toolbar: the main tools, or the selected item's tools behind a back button, like CapCut.
import { Icon, I } from './icons';
import type { Tool } from './ToolSheet';

export type ToolKey = Tool | 'edit' | 'add' | 'replace' | 'camera' | 'outline' | 'start' | 'end' | 'unfix' | 'swap' | 'delete';
export interface ToolBtn { key: ToolKey; label: string; icon: string; on?: boolean; disabled?: boolean }
export type Mode = 'clip' | 'track' | null;

// which buttons show for what's selected
export function toolsFor(mode: Mode, s: {
  ready: boolean; busy: boolean; recording: boolean; camera: boolean; adding: boolean; outline: boolean;
  open: Tool | null; hasKeys: boolean; objects: number;
}): ToolBtn[] {
  const sheet = (t: Tool, label: string, icon: string): ToolBtn => ({ key: t, label, icon, disabled: !s.ready, on: s.open === t });
  if (mode === 'clip') return [
    { key: 'replace', label: 'Replace', icon: I.swap, disabled: s.recording },
    { key: 'camera', label: s.camera ? 'Stop camera' : 'Camera', icon: I.camera, disabled: s.recording },
    { key: 'outline', label: 'Outline', icon: I.outline, on: s.outline, disabled: !s.ready },
  ];
  if (mode === 'track') return [
    sheet('effects', 'Effect', I.effects), sheet('color', 'Color', I.color), sheet('adjust', 'Adjust', I.adjust),
    { key: 'start', label: 'Starts here', icon: I.start, disabled: s.busy },
    { key: 'end', label: 'Ends here', icon: I.end, disabled: s.busy },
    { key: 'unfix', label: 'Remove fix', icon: I.unfix, disabled: s.busy || !s.hasKeys },
    { key: 'swap', label: 'Swap', icon: I.cross, disabled: s.busy || s.objects < 2 },
    { key: 'delete', label: 'Delete', icon: I.trash, disabled: s.recording },
  ];
  return [
    { key: 'edit', label: 'Edit', icon: I.edit },
    { key: 'add', label: s.adding ? 'Cancel' : 'Add object', icon: I.target, on: s.adding, disabled: s.busy },
    sheet('effects', 'Effects', I.effects), sheet('color', 'Color', I.color), sheet('adjust', 'Adjust', I.adjust),
  ];
}

export function Toolbar({ label, buttons, onPress, onBack }: {
  label: string; buttons: ToolBtn[]; onPress(key: ToolKey): void; onBack?: () => void;
}) {
  return (
    <nav className={`toolbar${onBack ? ' sub' : ''}`} aria-label={label}>
      {onBack && (
        <button type="button" className="back" aria-label="Back to all tools" onClick={onBack}>
          <Icon d={I.back} />
        </button>
      )}
      {buttons.map(t => (
        <button key={t.key} type="button" disabled={t.disabled} aria-pressed={t.on ?? false} onClick={() => onPress(t.key)}>
          <Icon d={t.icon} />
          <span>{t.label}</span>
        </button>
      ))}
    </nav>
  );
}
