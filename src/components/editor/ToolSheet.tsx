// The panel for one tool: a category's styles (to add an effect or impact), or the selected
// clip's effect, impact style, color or size. On phones it takes over the dock; on desktop it
// floats beside the preview.
import type { CSSProperties } from 'react';
import { IMPACTS, IMPACT_STYLES, type ImpactStyle } from '@/domain/effects/impacts';
import { DEFAULT_PAL, PALETTES, type Effect, type FxSettings } from '@/domain/effects/palettes';
import { BODY_PARTS, type BodyPart } from '@/domain/tracking/bodyParts';
import { Icon, I } from './icons';

export type Tool = 'styles' | 'effects' | 'color' | 'adjust' | 'impact' | 'parts';
// the effect categories: each continuous effect, and impacts
export type Category = Effect | 'impact';

export const EFFECTS: { id: Effect; label: string }[] = [
  { id: 'fire', label: 'Fire' },
  { id: 'lightning', label: 'Lightning' },
  { id: 'aura', label: 'Aura' },
  { id: 'sparks', label: 'Sparks' },
];
export const effectName = (e: Effect) => EFFECTS.find(x => x.id === e)!.label;
export const categoryName = (c: Category) => (c === 'impact' ? 'Impact' : effectName(c));

export const TOOL_TITLES: Record<Tool, string> = { styles: 'Styles', effects: 'Effect', color: 'Color', adjust: 'Adjust', impact: 'Impact style', parts: 'Which part?' };

const PART_ICONS: Record<BodyPart, string> = { body: I.person, head: I.head, eyes: I.eye, handL: I.hand, handR: I.hand, footL: I.foot, footR: I.foot };

// a burst of each impact style's colors, for its tile
export const IMPACT_ART: Record<ImpactStyle, string> = {
  punch: 'radial-gradient(circle, #fff 0 18%, #ffe9b0 30%, #ff9a3c 52%, transparent 72%), #26262a',
  slam: 'radial-gradient(circle at 50% 70%, #fff 0 14%, #ffd27a 30%, #b3531e 55%, transparent 75%), #26262a',
  blast: 'radial-gradient(circle, #f0fbff 0 16%, #7fe0ff 34%, #2f7bff 55%, transparent 78%), #26262a',
  anime: 'radial-gradient(circle, #fff 0 22%, #d98bff 40%, #8a2be2 60%, transparent 80%), #fff3',
};

const swatchBg = (i: number) => { const c = PALETTES[i].c; return `radial-gradient(circle at 40% 40%, ${c[0]}, ${c[1]} 35%, ${c[2]} 70%, ${c[3]})`; };
const pct = (v: number, min: number, max: number) => ({ '--p': `${((v - min) / (max - min)) * 100}%` }) as CSSProperties;

// what picking a style in a category adds
export type Pick = { kind: 'effect'; effect: Effect; pal: number } | { kind: 'impact'; style: ImpactStyle };

export function ToolSheet({ tool, title, fx, onChange, onClose, category, onPick, impact, onImpact, suggested, onPart }: {
  tool: Tool; title: string; fx: FxSettings; onChange(p: Partial<FxSettings>): void; onClose(): void;
  category?: Category | null; onPick?(p: Pick): void;
  impact?: ImpactStyle | null; onImpact?(style: ImpactStyle): void;
  // parts: the one nearest the tap, and what to do with the one picked
  suggested?: BodyPart; onPart?(part: BodyPart): void;
}) {
  return (
    <div className="sheet" role="dialog" aria-label={title}>
      <div className="sheet-head">
        <strong>{title}</strong>
        <button type="button" className="icon-btn" aria-label="Done" onClick={onClose}><Icon d={I.check} /></button>
      </div>
      {tool === 'parts' && (
        <div className="tiles" role="group" aria-label="Body part">
          {BODY_PARTS.map(b => (
            <button key={b.id} type="button" className="tile part-tile" aria-pressed={suggested === b.id} onClick={() => onPart?.(b.id)}>
              <span className={`tile-art${b.id.endsWith('L') ? ' mirror' : ''}`}><Icon d={PART_ICONS[b.id]} size={30} /></span>
              {b.label}
            </button>
          ))}
        </div>
      )}
      {tool === 'styles' && category === 'impact' && (
        <div className="tiles" role="group" aria-label="Impact styles">
          {IMPACT_STYLES.map(st => (
            <button key={st} type="button" className="tile" onClick={() => onPick?.({ kind: 'impact', style: st })}>
              <span className="tile-art" style={{ background: IMPACT_ART[st] }} />
              {IMPACTS[st].label}
            </button>
          ))}
        </div>
      )}
      {tool === 'styles' && category && category !== 'impact' && (
        <div className="tiles" role="group" aria-label={`${categoryName(category)} styles`}>
          {PALETTES.map((p, i) => (
            <button key={p.name} type="button" className="tile" onClick={() => onPick?.({ kind: 'effect', effect: category, pal: i })}>
              <span className="tile-art" style={{ background: swatchBg(i) }} />
              {i === DEFAULT_PAL[category] ? `${p.name} ★` : p.name}
            </button>
          ))}
        </div>
      )}
      {tool === 'effects' && (
        <div className="tiles" role="group" aria-label="Effect">
          {EFFECTS.map(f => (
            <button key={f.id} type="button" className="tile" aria-pressed={fx.effect === f.id} onClick={() => onChange({ effect: f.id, pal: DEFAULT_PAL[f.id] })}>
              <span className="tile-art" style={{ background: swatchBg(DEFAULT_PAL[f.id]) }} />
              {f.label}
            </button>
          ))}
        </div>
      )}
      {tool === 'impact' && (
        <div className="tiles" role="group" aria-label="Impact style">
          {IMPACT_STYLES.map(st => (
            <button key={st} type="button" className="tile" aria-pressed={impact === st} onClick={() => onImpact?.(st)}>
              <span className="tile-art" style={{ background: IMPACT_ART[st] }} />
              {IMPACTS[st].label}
            </button>
          ))}
        </div>
      )}
      {tool === 'color' && (
        <div className="tiles" role="group" aria-label="Color">
          {PALETTES.map((p, i) => (
            <button key={p.name} type="button" className="tile" aria-pressed={fx.pal === i} onClick={() => onChange({ pal: i })}>
              <span className="tile-art round" style={{ background: swatchBg(i) }} />
              {p.name}
            </button>
          ))}
        </div>
      )}
      {tool === 'adjust' && (
        <div className="sliders">
          <label className="slider">
            <span>Size</span>
            <input type="range" min={0.3} max={2.5} step={0.05} value={fx.size} style={pct(fx.size, 0.3, 2.5)}
              onChange={e => onChange({ size: +e.target.value })} />
            <output>{Math.round(fx.size * 100)}</output>
          </label>
          <label className="slider">
            <span>Intensity</span>
            <input type="range" min={0.2} max={2} step={0.05} value={fx.intensity} style={pct(fx.intensity, 0.2, 2)}
              onChange={e => onChange({ intensity: +e.target.value })} />
            <output>{Math.round(fx.intensity * 100)}</output>
          </label>
          <label className="slider">
            <span>Sound</span>
            <input type="range" min={0} max={1.5} step={0.05} value={fx.volume} style={pct(fx.volume, 0, 1.5)}
              onChange={e => onChange({ volume: +e.target.value })} />
            <output>{fx.volume === 0 ? 'Off' : Math.round(fx.volume * 100)}</output>
          </label>
        </div>
      )}
    </div>
  );
}
