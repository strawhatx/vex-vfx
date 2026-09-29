// Music on the Audio layer: a bar for the stretch it plays, with its name and its sound's waveform.
// Tap to select, drag to move it (or onto another row); selected, grips on its ends trim it.
import type { CSSProperties } from 'react';
import { musicRange } from '@/domain/project/music';
import { mmss } from '@/domain/tracking/timeLabels';
import { Icon, I } from '../icons';
import type { MusicUi } from '../player';
import { Grips, useSlide, type ClipActions } from './FxClips';
import type { Scale } from './layout';
import { Wave } from './Wave';

export function MusicClip({
  music: m,
  scale,
  selected,
  duration,
  on,
  moveTo,
}: {
  music: MusicUi;
  scale: Scale;
  selected: boolean;
  duration: number;
  on: Pick<ClipActions, 'select' | 'setRange' | 'commitRange' | 'moveRow'>;
  moveTo(t: number): void;
}) {
  const { x } = scale;
  const placed = { id: m.id, name: m.name, row: m.row, range: musicRange(m) };
  const len = placed.range.e - placed.range.s;
  const slide = useSlide(placed, scale, duration, on, moveTo);
  return (
    <span
      className={`fx-clip music-clip${selected || slide.dragging ? ' on' : ''}`}
      style={{ left: x(slide.start), width: x(len), ...slide.style } as CSSProperties}
    >
      <button
        type="button"
        className="fx-body"
        aria-pressed={selected}
        aria-label={`${m.name}: ${mmss(placed.range.s)} to ${mmss(placed.range.e)}. Tap to select, drag to move it.`}
        onClick={e => e.stopPropagation()}
        {...slide.handlers(() => on.select(m.id))}
      >
        <Wave levels={m.wave} className="music-wave" />
        <span className="fx-label">
          <Icon d={I.sound} size={12} />
          {m.name}
        </span>
      </button>
      {selected && !slide.dragging && <Grips lane={placed} scale={scale} duration={duration} on={on} />}
    </span>
  );
}
