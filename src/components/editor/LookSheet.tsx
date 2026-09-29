// The panels for looks (filters and screen effects): a menu of a group's presets by category, each
// shown on the frame showing, and the selected look's controls. Picking a preset adds a look at the
// playhead; with one selected, picking another swaps it, so presets can be tried one after another.
import { useEffect, useState, type CSSProperties } from 'react';
import { gradeOf, gradeSwatch } from '@/domain/effects/color';
import { presetsIn } from '@/domain/effects/library';
import type { ParamValue } from '@/domain/effects/params';
import type { Preset, PresetGroup } from '@/domain/effects/presets';
import type { LookClip } from '@/domain/project/looks';
import { Icon, I } from './icons';

export const GROUP_NAMES: Record<PresetGroup, string> = { filter: 'Filters', screen: 'Video effects' };

// a preset's picture when there's none of the frame: a filter's colors as it turns them, or a
// screen effect's glow
function fallbackArt(p: Preset) {
  const grade = p.passes.find(x => x.engine === 'color');
  if (grade) {
    const c = gradeSwatch(gradeOf(grade.params));
    return `linear-gradient(160deg, ${c[4]}, ${c[0]} 35%, ${c[2]} 60%, ${c[1]} 80%, ${c[3]})`;
  }
  return 'radial-gradient(circle at 50% 45%, #fff 0 6%, #e0312b88 30%, transparent 62%), #26262a';
}

export function PresetSheet({
  group,
  current,
  thumbs,
  onPick,
  onClose,
  onShown,
}: {
  group: PresetGroup;
  current: string | null; // the selected look's preset
  thumbs: Record<string, string>;
  onPick(presetId: string): void;
  onClose(): void;
  onShown(): void; // opened: the presets' pictures are wanted
}) {
  const categories = presetsIn(group);
  const [tab, setTab] = useState(
    () => categories.find(c => c.presets.some(p => p.id === current))?.category ?? categories[0]?.category,
  );
  // (once, on opening: pictures of what's showing now)
  useEffect(onShown, []); // eslint-disable-line react-hooks/exhaustive-deps
  const shown = categories.find(c => c.category === tab) ?? categories[0];
  return (
    <div className="sheet" role="dialog" aria-label={GROUP_NAMES[group]}>
      <div className="sheet-head">
        <strong>{GROUP_NAMES[group]}</strong>
        <button type="button" className="icon-btn" aria-label="Done" onClick={onClose}>
          <Icon d={I.check} />
        </button>
      </div>
      <div className="sheet-tabs" role="tablist" aria-label="Categories">
        {categories.map(c => (
          <button
            key={c.category}
            type="button"
            role="tab"
            aria-selected={c.category === shown?.category}
            onClick={() => setTab(c.category)}
          >
            {c.category}
          </button>
        ))}
      </div>
      <div className="tiles" role="group" aria-label={shown?.category}>
        {shown?.presets.map(p => (
          <button
            key={p.id}
            type="button"
            className="tile look-tile"
            aria-pressed={p.id === current}
            onClick={() => onPick(p.id)}
          >
            {thumbs[p.id] ? (
              // (a picture made here, of the frame showing: a blob: URL)
              // eslint-disable-next-line @next/next/no-img-element
              <img className="tile-art" src={thumbs[p.id]} alt="" />
            ) : (
              <span className="tile-art" style={{ background: fallbackArt(p) }} />
            )}
            {p.name}
          </button>
        ))}
      </div>
    </div>
  );
}

const pct = (v: number) => ({ '--p': `${v * 100}%` }) as CSSProperties;

// the selected look's controls: its preset's sliders and colors
export function LookControls({
  look,
  onChange,
  onClose,
}: {
  look: LookClip;
  onChange(control: string, v: ParamValue): void;
  onClose(): void;
}) {
  const { controls } = look.preset;
  return (
    <div className="sheet" role="dialog" aria-label={`Adjust ${look.name}`}>
      <div className="sheet-head">
        <strong>Adjust · {look.name}</strong>
        <button type="button" className="icon-btn" aria-label="Done" onClick={onClose}>
          <Icon d={I.check} />
        </button>
      </div>
      <div className="sliders">
        {controls.map(c => {
          const v = look.values[c.id] ?? c.def;
          return c.type === 'slider' ? (
            <label key={c.id} className="slider">
              <span>{c.label}</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={v as number}
                style={pct(v as number)}
                onChange={e => onChange(c.id, +e.target.value)}
              />
              <output>{Math.round((v as number) * 100)}</output>
            </label>
          ) : (
            <label key={c.id} className="slider">
              <span>{c.label}</span>
              <input
                type="color"
                className="color-input"
                value={v as string}
                onChange={e => onChange(c.id, e.target.value)}
              />
              <output />
            </label>
          );
        })}
        {!controls.length && <p className="sheet-note">{look.name} has nothing to adjust.</p>}
      </div>
    </div>
  );
}
