// An effect clip on its layer: a bar for the stretch it plays, with its name. Tap to select, drag to
// move it (or onto another row); selected, grips on its ends trim it.
import type { CSSProperties } from 'react';
import { effectRange } from '@/domain/project/effectClips';
import { mmss } from '@/domain/tracking/timeLabels';
import { Icon, I } from '../icons';
import type { UiState } from '../player';
import { Grips, useSlide, type ClipActions } from './FxClips';
import type { Scale } from './layout';

export function EffectClipBar({
  clip: c,
  scale,
  selected,
  duration,
  on,
  moveTo,
}: {
  clip: UiState['effectClips'][number];
  scale: Scale;
  selected: boolean;
  duration: number;
  on: Pick<ClipActions, 'select' | 'setRange' | 'commitRange' | 'moveRow'>;
  moveTo(t: number): void;
}) {
  const { x } = scale;
  const placed = { id: c.id, name: c.name, row: c.row, range: effectRange(c) };
  const slide = useSlide(placed, scale, duration, on, moveTo);
  return (
    <span
      className={`fx-clip look-clip packclip-clip${selected || slide.dragging ? ' on' : ''}`}
      style={
        { left: x(slide.start), width: x(placed.range.e - placed.range.s), ...slide.style } as CSSProperties
      }
    >
      <button
        type="button"
        className="fx-body"
        aria-pressed={selected}
        aria-label={`${c.name}: ${mmss(placed.range.s)} to ${mmss(placed.range.e)}. Tap to select, drag to move it.`}
        onClick={e => e.stopPropagation()}
        {...slide.handlers(() => on.select(c.id))}
      >
        <span className="fx-label">
          <Icon d={I.flame} size={12} />
          {c.name}
        </span>
      </button>
      {selected && !slide.dragging && <Grips lane={placed} scale={scale} duration={duration} on={on} />}
    </span>
  );
}
