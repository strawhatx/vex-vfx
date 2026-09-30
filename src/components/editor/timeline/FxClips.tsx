// The effect, impact and cutout clips on the timeline. Each covers the stretch it lasts; when
// selected, grips on its ends drag its start and end.
import { useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { IMPACTS } from '@/domain/effects/impacts';
import { Icon, I } from '../icons';
import type { Lane } from '../player';
import { mmss } from '@/domain/tracking/timeLabels';
import { effectName } from '../ToolSheet';
import { ROW_PITCH, type Scale } from './layout';
import { Wave } from './Wave';

// what the timeline needs of a clip to drag it about: where it is, its row, and its name
export type Placed = Pick<Lane, 'id' | 'range' | 'row' | 'name'>;

// what a clip on the timeline can do
export interface ClipActions {
  select(id: number): void;
  // live while dragging a clip's end; commit once the drag ends
  setRange(id: number, r: { s?: number; e?: number }): void;
  commitRange(id: number): void;
  // an impact dragged to hit at time t
  moveImpact(id: number, t: number): void;
  // a cutout dragged to start at time t
  // a clip dragged onto another row (-1: a new one on top)
  moveRow(id: number, row: number): void;
}

interface ClipProps {
  lane: Lane;
  scale: Scale;
  selected: boolean;
  duration: number;
  sound: number[]; // its sound effect's waveform
  on: ClipActions;
}

// an effect: where its object was found (and where it's unsure), its keyframes and its sound.
// Tap to select, drag to slide it to another time; its grips change its start and end.
export function EffectClip({ lane: l, scale, selected, duration, sound, on }: ClipProps) {
  const { x } = scale;
  const len = l.range.e - l.range.s;
  const w = x(len);
  const name = effectName(l.fx.effect);
  const slide = useSlide(l, scale, duration, on, t => {
    on.setRange(l.id, { s: t, e: t + len });
    on.commitRange(l.id);
  });
  return (
    <span
      className={`fx-clip${selected || slide.dragging ? ' on' : ''}`}
      style={{ left: x(slide.start), width: w, '--c': l.color, ...slide.style } as CSSProperties}
    >
      <button
        type="button"
        className="fx-body"
        aria-pressed={selected}
        aria-label={`${l.name}: ${name}, ${mmss(l.range.s)} to ${mmss(l.range.e)}. Tap to select, drag to slide it.`}
        onClick={e => e.stopPropagation()}
        {...slide.handlers(() => on.select(l.id))}
      >
        {l.spans.map((sp, i) => (
          <span
            key={i}
            className={`span${sp.weak ? ' weak' : ''}`}
            style={{ left: x(sp.s - l.range.s), width: Math.max(2, x(sp.e - sp.s)) }}
          />
        ))}
        <Wave levels={sound} className="fx-wave" />
        {l.keys.map((k, i) => (
          <i key={i} className="key" style={{ left: x(k - l.range.s) }} />
        ))}
        <span className="fx-label">
          {/* (text shows its words; an effect its name, and its kind when there's room) */}
          {l.fx.effect === 'text' ? (
            <>
              <Icon d={I.text} size={12} />
              {l.fx.text || 'Text'}
            </>
          ) : (
            <>
              <i style={{ background: l.color }} />
              {w > 110 ? `${l.name} · ${name}` : name}
            </>
          )}
        </span>
      </button>
      {selected && !slide.dragging && <Grips lane={l} scale={scale} duration={duration} on={on} />}
    </span>
  );
}

// dragging a clip about the timeline: along it to another time, and up or down onto another row
// (or a new one above or below). While dragged, where it would start and how far it's lifted; the
// pointer handlers for its body. A tap selects it; a drag moves it and selects it too.
export function useSlide(
  l: Placed,
  scale: Scale,
  duration: number,
  on: Pick<ClipActions, 'moveRow'>,
  // (none: it stays at its time, and only moves between rows)
  moveTo?: (t: number) => void,
) {
  const [drag, setDrag] = useState<{
    x: number;
    y: number;
    from: number;
    t: number;
    dy: number;
    moved: boolean;
  } | null>(null);
  const len = l.range.e - l.range.s;
  const moved = !!drag?.moved;
  return {
    dragging: moved,
    start: moved ? drag!.t : l.range.s,
    style: moved ? ({ transform: `translateY(${drag!.dy}px)`, zIndex: 5 } as CSSProperties) : undefined,
    handlers: (select: () => void) => ({
      onPointerDown(e: PointerEvent) {
        e.stopPropagation();
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        setDrag({ x: e.clientX, y: e.clientY, from: l.range.s, t: l.range.s, dy: 0, moved: false });
      },
      onPointerMove(e: PointerEvent) {
        if (!drag) return;
        const dx = e.clientX - drag.x,
          dy = e.clientY - drag.y;
        if (!drag.moved && Math.hypot(dx, dy) < 5) return;
        // a small sideways wobble while moving it up or down doesn't change its time
        const t =
          Math.abs(dx) < 8 || !moveTo
            ? drag.from
            : Math.max(0, Math.min(Math.max(0, duration - len), drag.from + dx / scale.pps));
        setDrag({ ...drag, t, dy, moved: true });
      },
      onPointerUp() {
        const d = drag;
        setDrag(null);
        if (!d) return;
        if (d.moved) {
          const rows = Math.round(d.dy / ROW_PITCH);
          if (rows) on.moveRow(l.id, Math.max(-1, l.row + rows));
          if (moveTo && Math.abs(d.t - d.from) > 1e-6) moveTo(d.t);
        }
        select();
      },
      onPointerCancel: () => setDrag(null),
    }),
  };
}

// an impact: a short clip starting at the hit. Tap to select, drag to move; stretch its ends to
// slow the burst down, squeeze them to speed it up.
export function ImpactClip({ lane: l, scale, selected, duration, sound, on }: ClipProps) {
  const { x } = scale;
  const slide = useSlide(l, scale, duration, on, t => on.moveImpact(l.id, t));
  const start = slide.start;
  const w = Math.max(24, x(l.range.e - l.range.s));
  const style = l.impact ? IMPACTS[l.impact].label : '';
  const speed = speedLabel(l.speed);
  const on_ = selected || slide.dragging;

  return (
    <span
      className={`fx-clip${on_ ? ' on' : ''}`}
      style={{ left: x(start), width: w, '--c': l.color, ...slide.style } as CSSProperties}
    >
      <button
        type="button"
        className={`impact-clip${on_ ? ' on' : ''}`}
        aria-pressed={selected}
        aria-label={`${l.name}: ${style}${speed ? ` at ${speed} speed` : ''}, hits at ${mmss(l.range.s)}. Tap to select, drag to move.`}
        onClick={e => e.stopPropagation()}
        {...slide.handlers(() => on.select(l.id))}
      >
        <Wave levels={sound} className="fx-wave" />
        <Icon d={I.burst} size={14} />
        {w > 40 && (
          <span>
            {w > 110 ? style : ''}
            {speed && <b>{speed}</b>}
          </span>
        )}
      </button>
      {selected && !slide.dragging && <Grips lane={l} scale={scale} duration={duration} on={on} />}
    </span>
  );
}

// a cutout's subject layer: where the frames it's cut from play, with its transform keyframes. It
// stays with its clip (drag it up or down to change rows); its ends change which frames it's cut from.
export function CutoutClip({ lane: l, scale, selected, duration, on }: Omit<ClipProps, 'sound'>) {
  const { x } = scale;
  const len = l.range.e - l.range.s;
  const slide = useSlide(l, scale, duration, on);
  const start = slide.start;
  const w = x(len);
  const cut = l.cutout;
  const from =
    cut && cut.from !== null && Math.abs(cut.from - start) > 0.05 ? ` · from ${mmss(cut.from)}` : '';

  return (
    <span
      className={`fx-clip cut-clip${selected || slide.dragging ? ' on' : ''}`}
      style={{ left: x(start), width: w, '--c': l.color, ...slide.style } as CSSProperties}
    >
      <button
        type="button"
        className="fx-body"
        aria-pressed={selected}
        aria-label={`${l.name}: ${mmss(l.range.s)} to ${mmss(l.range.e)}${from}. Tap to select.`}
        onClick={e => e.stopPropagation()}
        {...slide.handlers(() => on.select(l.id))}
      >
        {l.spans.map((sp, i) => (
          <span
            key={i}
            className={`span${sp.weak ? ' weak' : ''}`}
            style={{ left: x(sp.s - l.range.s), width: Math.max(2, x(sp.e - sp.s)) }}
          />
        ))}
        {l.keys.map((k, i) => (
          <i key={i} className="key" style={{ left: x(k - l.range.s) }} />
        ))}
        {cut?.moves.map((k, i) => (
          <i key={`m${i}`} className="key move" style={{ left: x(k - l.range.s) }} />
        ))}
        <span className="fx-label">
          <Icon d={I.cutout} size={12} />
          {w > 90 ? `${l.name}${from}` : l.name}
        </span>
      </button>
      {selected && !slide.dragging && <Grips lane={l} scale={scale} duration={duration} on={on} />}
    </span>
  );
}

// '' at normal speed, else e.g. 0.75× or 1.5×
function speedLabel(speed: number) {
  if (Math.abs(speed - 1) < 0.01) return '';
  return `${speed < 1 ? speed.toFixed(2).replace(/0$/, '') : speed.toFixed(1)}×`;
}

// the grips on a selected clip's start and end
export function Grips(props: {
  lane: Placed;
  scale: Scale;
  duration: number;
  on: Pick<ClipActions, 'setRange' | 'commitRange'>;
}) {
  return (
    <>
      <Grip {...props} end="s" />
      <Grip {...props} end="e" />
    </>
  );
}

function Grip({
  lane: l,
  scale,
  duration,
  on,
  end,
}: {
  lane: Placed;
  scale: Scale;
  duration: number;
  on: Pick<ClipActions, 'setRange' | 'commitRange'>;
  end: 's' | 'e';
}) {
  const drag = useRef<{ x: number; t: number } | null>(null);
  const stopDrag = () => {
    const was = drag.current;
    drag.current = null;
    if (was) on.commitRange(l.id);
  };
  return (
    <span
      className={`grip ${end}`}
      onPointerDown={e => {
        e.stopPropagation();
        e.preventDefault();
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        drag.current = { x: e.clientX, t: l.range[end] };
      }}
      onPointerMove={e => {
        const d = drag.current;
        if (d) on.setRange(l.id, { [end]: d.t + (e.clientX - d.x) / scale.pps });
      }}
      onPointerUp={stopDrag}
      onPointerCancel={stopDrag}
      onClick={e => e.stopPropagation()}
      role="slider"
      aria-label={`${l.name} ${end === 's' ? 'start' : 'end'}`}
      aria-valuemin={0}
      aria-valuemax={duration}
      aria-valuenow={l.range[end]}
    />
  );
}
