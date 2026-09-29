// The panels for presets: a menu of a group's presets by category (filters, video effects and text
// shown on the frame showing), and the controls of the selected clip's. Picking a look adds it at
// the playhead; with one selected, picking another swaps it, so presets can be tried one after
// another. Body effects are picked the same way, then tapped onto the person or object.
import { MY_OWN } from '@/domain/effects/custom';
import { useEffect, useState, type CSSProperties } from 'react';
import { gradeOf, gradeSwatch } from '@/domain/effects/color';
import { presetsIn } from '@/domain/effects/library';
import type { ParamValue } from '@/domain/effects/params';
import { PALETTES } from '@/domain/effects/palettes';
import { soundOfBurst } from '@/domain/effects/bursts';
import { IMPACT_ART } from './ToolSheet';
import type { ControlValues, LookGroup, Preset } from '@/domain/effects/presets';
import { MAX_SCALE, MAX_WORDS, MIN_SCALE, type TextPlace } from '@/domain/effects/typeset';
import { Icon, I } from './icons';

// the groups with a menu of presets
export type MenuGroup = LookGroup | 'body' | 'impact';

export const GROUP_NAMES: Record<MenuGroup, string> = {
  filter: 'Filters',
  screen: 'Video effects',
  text: 'Text',
  body: 'Object effects',
  impact: 'Custom effects',
};
// whether a group's presets are split up by category (filters, video effects, object effects and
// text aren't: all of them in one list)
const BY_CATEGORY: Record<MenuGroup, boolean> = {
  filter: false,
  screen: false,
  text: false,
  body: false,
  impact: true,
};

// a preset's picture when there's none of the frame: a filter's colors as it turns them, a body
// effect's colors round a figure, or a screen effect's glow
function fallbackArt(p: Preset) {
  const grade = p.passes.find(x => x.engine === 'frame' && x.kind === 'grade');
  if (grade) {
    const c = gradeSwatch(gradeOf(grade.params));
    return `linear-gradient(160deg, ${c[4]}, ${c[0]} 35%, ${c[2]} 60%, ${c[1]} 80%, ${c[3]})`;
  }
  if (p.group === 'impact') return IMPACT_ART[soundOfBurst(p.passes)];
  if (p.group === 'body') {
    const [a, b] = bodyColors(p);
    return `radial-gradient(ellipse 16% 30% at 50% 58%, #1d2230 0 90%, transparent 100%), radial-gradient(ellipse 26% 42% at 50% 58%, ${a} 0 40%, ${b}88 70%, transparent 100%), #26262a`;
  }
  return 'radial-gradient(circle at 50% 45%, #fff 0 6%, #e0312b88 30%, transparent 62%), #26262a';
}

// the colors a body effect shows most: its first palette's, or its first colors
function bodyColors(p: Preset): [string, string] {
  for (const x of p.passes) {
    const pal = PALETTES.find(q => q.name.toLowerCase() === x.params.palette);
    if (pal) return [pal.c[1], pal.c[2]];
    const c = (x.params.glowColor ?? x.params.color) as string | undefined;
    if (c) return [c, c];
  }
  return ['#ffffff', '#e0312b'];
}

export function PresetSheet({
  group,
  current,
  thumbs,
  extras = [],
  onPick,
  onExtra,
  onClose,
  onShown,
}: {
  group: MenuGroup;
  current: string | null; // the selected clip's preset
  thumbs: Record<string, string>;
  // effects listed after the presets that aren't presets (they open styles of their own)
  extras?: readonly { id: string; label: string; icon: string }[];
  onPick(presetId: string): void;
  onExtra?(id: string): void;
  onClose(): void;
  onShown(): void; // opened: the presets' pictures are wanted
}) {
  const tabbed = BY_CATEGORY[group];
  const categories = tabbed
    ? presetsIn(group)
    : [{ category: GROUP_NAMES[group], presets: presetsIn(group).flatMap(c => c.presets) }];
  const [tab, setTab] = useState(
    () => categories.find(c => c.presets.some(p => p.id === current))?.category ?? categories[0]?.category,
  );
  // (once, on opening: pictures of what's showing now)
  useEffect(() => {
    onShown();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const shown = categories.find(c => c.category === tab) ?? categories[0];
  return (
    <div className="sheet" role="dialog" aria-label={GROUP_NAMES[group]}>
      <div className="sheet-head">
        <strong>{GROUP_NAMES[group]}</strong>
        <button type="button" className="icon-btn" aria-label="Done" onClick={onClose}>
          <Icon d={I.check} />
        </button>
      </div>
      {tabbed && (
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
      )}
      {/* (all of them in one list: a grid rather than one long row) */}
      <div className={`tiles${tabbed ? '' : ' wrap'}`} role="group" aria-label={shown?.category}>
        {/* (an effect made from nothing, customized from there) */}
        <button type="button" className="tile look-tile" onClick={() => onPick(MY_OWN)}>
          <span className="tile-art own-art">
            <Icon d={I.plus} />
          </span>
          Create your own
        </button>
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
        {extras.map(x => (
          <button key={x.id} type="button" className="tile look-tile" onClick={() => onExtra?.(x.id)}>
            <span className="tile-art own-art">
              <Icon d={x.icon} />
            </span>
            {x.label}
          </button>
        ))}
      </div>
    </div>
  );
}

const pct = (v: number) => ({ '--p': `${v * 100}%` }) as CSSProperties;

// the selected clip's controls: its preset's sliders and colors; a text's words, size and turn
// first
export function PresetControls({
  name,
  preset,
  values,
  text = null,
  onChange,
  onText,
  onClose,
}: {
  name: string;
  preset: Preset;
  values: ControlValues;
  text?: TextPlace | null;
  onChange(control: string, v: ParamValue): void;
  onText?(p: Partial<TextPlace>): void;
  onClose(): void;
}) {
  const { controls } = preset;
  const title = text ? 'Edit' : 'Adjust';
  return (
    <div className="sheet" role="dialog" aria-label={`${title} ${name}`}>
      <div className="sheet-head">
        <strong>
          {title} · {name}
        </strong>
        <button type="button" className="icon-btn" aria-label="Done" onClick={onClose}>
          <Icon d={I.check} />
        </button>
      </div>
      {text && (
        <input
          className="words-input"
          type="text"
          value={text.words}
          maxLength={MAX_WORDS}
          aria-label="Words"
          placeholder="Type something"
          enterKeyHint="done"
          onChange={e => onText?.({ words: e.target.value })}
          onKeyDown={e => e.key === 'Enter' && onClose()}
        />
      )}
      <div className="sliders">
        {text && (
          <>
            <label className="slider">
              <span>Size</span>
              <input
                type="range"
                min={MIN_SCALE}
                max={MAX_SCALE}
                step={0.01}
                value={text.scale}
                style={
                  { '--p': `${((text.scale - MIN_SCALE) / (MAX_SCALE - MIN_SCALE)) * 100}%` } as CSSProperties
                }
                onChange={e => onText?.({ scale: +e.target.value })}
              />
              <output>{Math.round(text.scale * 100)}</output>
            </label>
            <label className="slider">
              <span>Rotate</span>
              <input
                type="range"
                min={-180}
                max={180}
                step={1}
                value={text.rot}
                style={{ '--p': `${((text.rot + 180) / 360) * 100}%` } as CSSProperties}
                onChange={e => onText?.({ rot: +e.target.value })}
              />
              <output>{Math.round(text.rot)}°</output>
            </label>
          </>
        )}
        {controls.map(c => {
          const v = values[c.id] ?? c.def;
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
        {!controls.length && !text && <p className="sheet-note">{name} has nothing to adjust.</p>}
        {text && <p className="sheet-note">Drag the text in the preview to move it.</p>}
      </div>
    </div>
  );
}
