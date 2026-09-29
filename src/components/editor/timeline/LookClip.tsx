// A look (a filter, screen effect or text) on its layer: a bar for when it's on, with its name (a
// text's own words). Tap to
// select, drag to move it (or onto another row); selected, grips on its ends trim it.
import type { CSSProperties } from 'react';
import { lookGroup, lookRange } from '@/domain/project/looks';
import { mmss } from '@/domain/tracking/timeLabels';
import { Icon, I } from '../icons';
import type { LookGroup } from '@/domain/effects/presets';
import type { LookUi } from '../player';
import { Grips, useSlide, type ClipActions } from './FxClips';
import type { Scale } from './layout';

const GROUP_ICONS: Record<LookGroup, string> = { filter: I.color, screen: I.effects, text: I.text };

export function LookClip({
  look: c,
  scale,
  selected,
  duration,
  on,
  moveTo,
}: {
  look: LookUi;
  scale: Scale;
  selected: boolean;
  duration: number;
  on: Pick<ClipActions, 'select' | 'setRange' | 'commitRange' | 'moveRow'>;
  moveTo(t: number): void;
}) {
  const { x } = scale;
  const placed = { id: c.id, name: c.name, row: c.row, range: lookRange(c) };
  const slide = useSlide(placed, scale, duration, on, moveTo);
  return (
    <span
      className={`fx-clip look-clip ${c.preset.group}-clip${selected || slide.dragging ? ' on' : ''}`}
      style={{ left: x(slide.start), width: x(c.len), ...slide.style } as CSSProperties}
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
          <Icon d={GROUP_ICONS[lookGroup(c)]} size={12} />
          {c.text ? c.text.words || c.name : c.name}
        </span>
      </button>
      {selected && !slide.dragging && <Grips lane={placed} scale={scale} duration={duration} on={on} />}
    </span>
  );
}
