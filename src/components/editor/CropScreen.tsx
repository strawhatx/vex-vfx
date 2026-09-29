// Cropping the film's frame, like CapCut's Resize: its own top bar (cancel, Crop, done) and dock.
// On the preview, the whole frame shows with the crop box over it: drag a corner to size it, or the
// box to move it. Below: turning the frame (it zooms in just enough to fill the box), the aspect
// ratio the box is held to, and Reset. Everything on the frame is cropped together.
import type { CSSProperties } from 'react';
import { MAX_ROT, RATIOS, type RatioId } from '@/domain/project/crop';
import { Icon, I } from './icons';

export interface CropActions {
  cancel(): void;
  apply(): void;
  rotate(deg: number): void;
  ratio(id: RatioId): void;
  reset(): void;
}

export function CropHeader({ on }: { on: CropActions }) {
  return (
    <header className="topbar crop-top">
      <button type="button" className="icon-btn" aria-label="Cancel" onClick={on.cancel}>
        <Icon d={I.close} />
      </button>
      <strong>Crop</strong>
      <button type="button" className="icon-btn" aria-label="Done" onClick={on.apply}>
        <Icon d={I.check} />
      </button>
    </header>
  );
}

const pct = (v: number) => ({ '--p': `${((v + MAX_ROT) / (2 * MAX_ROT)) * 100}%` }) as CSSProperties;

export function CropDock({ rot, ratio, on }: { rot: number; ratio: RatioId; on: CropActions }) {
  return (
    <div className="crop">
      <div className="sliders">
        <label className="slider">
          <span>Rotate</span>
          <input
            type="range"
            min={-MAX_ROT}
            max={MAX_ROT}
            step={0.5}
            value={rot}
            style={pct(rot)}
            onChange={e => on.rotate(+e.target.value)}
            onDoubleClick={() => on.rotate(0)}
          />
          <output>{+rot.toFixed(1)}°</output>
        </label>
      </div>
      <div className="tiles crop-ratios" role="group" aria-label="Aspect ratio">
        {RATIOS.map(r => (
          <button
            key={r.id}
            type="button"
            className="tile"
            aria-pressed={ratio === r.id}
            onClick={() => on.ratio(r.id)}
          >
            <span className="tile-art ratio-art">
              {r.ratio ? (
                <i style={{ aspectRatio: r.ratio, [r.ratio >= 1 ? 'width' : 'height']: '60%' }} />
              ) : (
                <Icon d={I.expand} size={24} />
              )}
            </span>
            {r.label}
          </button>
        ))}
      </div>
      <button type="button" className="sheet-btn" onClick={on.reset}>
        <Icon d={I.undo} size={16} />
        Reset
      </button>
    </div>
  );
}
