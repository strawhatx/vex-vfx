// The presets the app ships with (see library/), checked once when first used, and looked up by
// id or by group and category for the menus.
import { PRESET_FILES } from './library/files';
import { parsePreset, type Preset, type PresetGroup } from './presets';

let all: Preset[] | null = null;

export function presets(): readonly Preset[] {
  all ??= PRESET_FILES.map(parsePreset);
  return all;
}

export const presetById = (id: string) => presets().find(p => p.id === id) ?? null;

// a group's presets by category, in the order they first appear
export function presetsIn(group: PresetGroup): { category: string; presets: Preset[] }[] {
  const out: { category: string; presets: Preset[] }[] = [];
  for (const p of presets()) {
    if (p.group !== group) continue;
    let c = out.find(x => x.category === p.category);
    if (!c) out.push((c = { category: p.category, presets: [] }));
    c.presets.push(p);
  }
  return out;
}
