// The panel for one tool (effect, color, adjust). On phones it takes over the dock; on
// desktop it floats beside the preview.
import type { CSSProperties } from 'react';
import { DEFAULT_PAL, PALETTES, type Effect, type FxSettings } from '@/domain/effects/palettes';
import { Icon, I } from './icons';

export type Tool = 'effects' | 'color' | 'adjust';

export const EFFECTS: { id: Effect; label: string }[] = [
  { id: 'fire', label: 'Fire' },
  { id: 'lightning', label: 'Lightning' },
  { id: 'aura', label: 'Aura' },
  { id: 'sparks', label: 'Sparks' },
];
export const effectName = (e: Effect) => EFFECTS.find(x => x.id === e)!.label;

export const TOOL_TITLES: Record<Tool, string> = { effects: 'Effects', color: 'Color', adjust: 'Adjust' };

const swatchBg = (i: number) => { const c = PALETTES[i].c; return `radial-gradient(circle at 40% 40%, ${c[0]}, ${c[1]} 35%, ${c[2]} 70%, ${c[3]})`; };
const pct = (v: number, min: number, max: number) => ({ '--p': `${((v - min) / (max - min)) * 100}%` }) as CSSProperties;

export function ToolSheet({ tool, title, fx, onChange, onClose }: {
  tool: Tool; title: string; fx: FxSettings; onChange(p: Partial<FxSettings>): void; onClose(): void;
}) {
  return (
    <div className="sheet" role="dialog" aria-label={title}>
      <div className="sheet-head">
        <strong>{title}</strong>
        <button type="button" className="icon-btn" aria-label="Done" onClick={onClose}><Icon d={I.check} /></button>
      </div>
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
        </div>
      )}
    </div>
  );
}
