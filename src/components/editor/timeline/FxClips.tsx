// The effect, impact and cutout clips on the timeline. Each covers the stretch it lasts; when
// selected, grips on its ends drag its start and end.
import { useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { IMPACTS } from '@/domain/effects/impacts';
import { Icon, I } from '../icons';
import type { Lane } from '../player';
import { mmss } from '@/domain/tracking/timeLabels';
import { effectName } from '../ToolSheet';
import type { Scale } from './layout';
import { Wave } from './Wave';

// what a clip on the timeline can do
export interface ClipActions {
  select(id: number): void;
  // live while dragging a clip's end; commit once the drag ends
  setRange(id: number, r: { s?: number; e?: number }): void;
  commitRange(id: number): void;
  // an impact dragged to hit at time t
  moveImpact(id: number, t: number): void;
  // a cutout dragged to start at time t
  moveCutout(id: number, t: number): void;
}

interface ClipProps {
  lane: Lane;
  scale: Scale;
  selected: boolean;
  duration: number;
  sound: number[]; // its sound effect's waveform
  on: ClipActions;
}

// an effect: where its object was found (and where it's unsure), its keyframes and its sound
export function EffectClip({ lane: l, scale, selected, duration, sound, on }: ClipProps) {
  const { x } = scale;
  const w = x(l.range.e - l.range.s);
  const name = effectName(l.fx.effect);
  return (
    <span
      className={`fx-clip${selected ? ' on' : ''}`}
      style={{ left: x(l.range.s), width: w, '--c': l.color } as CSSProperties}
    >
      <button
        type="button"
        className="fx-body"
        aria-pressed={selected}
        aria-label={`${l.name}: ${name}, ${mmss(l.range.s)} to ${mmss(l.range.e)}`}
        onClick={e => {
          e.stopPropagation();
          on.select(l.id);
        }}
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
          <i style={{ background: l.color }} />
          {w > 110 ? `${l.name} · ${name}` : name}
        </span>
      </button>
      {selected && <Grips lane={l} scale={scale} duration={duration} on={on} />}
    </span>
  );
}

// an impact: a short clip starting at the hit. Tap to select, drag to move; stretch its ends to
// slow the burst down, squeeze them to speed it up.
export function ImpactClip({ lane: l, scale, selected, duration, sound, on }: ClipProps) {
  const { x, pps } = scale;
  const [drag, setDrag] = useState<{ x: number; from: number; t: number; moved: boolean } | null>(null);
  const start = drag ? drag.t : l.range.s;
  const w = Math.max(24, x(l.range.e - l.range.s));
  const style = l.impact ? IMPACTS[l.impact].label : '';
  const speed = speedLabel(l.speed);
  const on_ = selected || !!drag;

  function down(e: PointerEvent) {
    e.stopPropagation();
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDrag({ x: e.clientX, from: l.range.s, t: l.range.s, moved: false });
  }
  function move(e: PointerEvent) {
    if (!drag) return;
    const dx = e.clientX - drag.x;
    if (!drag.moved && Math.abs(dx) < 4) return;
    setDrag({ ...drag, t: Math.max(0, Math.min(duration, drag.from + dx / pps)), moved: true });
  }
  function up() {
    const d = drag;
    setDrag(null);
    if (!d) return;
    if (d.moved) on.moveImpact(l.id, d.t);
    if (!d.moved || !selected) on.select(l.id);
  }

  return (
    <span
      className={`fx-clip${on_ ? ' on' : ''}`}
      style={{ left: x(start), width: w, '--c': l.color } as CSSProperties}
    >
      <button
        type="button"
        className={`impact-clip${on_ ? ' on' : ''}`}
        aria-pressed={selected}
        aria-label={`${l.name}: ${style}${speed ? ` at ${speed} speed` : ''}, hits at ${mmss(l.range.s)}. Tap to select, drag to move.`}
        onClick={e => e.stopPropagation()}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={() => setDrag(null)}
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
      {selected && !drag && <Grips lane={l} scale={scale} duration={duration} on={on} />}
    </span>
  );
}

// a cutout: where it's placed, with where its object was found and its keyframes (tracking fixes as
// on an effect, and its transform keyframes). Drag to place it at another time; its ends change
// which frames it's cut from.
export function CutoutClip({ lane: l, scale, selected, duration, on }: Omit<ClipProps, 'sound'>) {
  const { x, pps } = scale;
  const [drag, setDrag] = useState<{ x: number; from: number; t: number; moved: boolean } | null>(null);
  const len = l.range.e - l.range.s;
  const start = drag ? drag.t : l.range.s;
  const w = x(len);
  const cut = l.cutout;
  const from = cut && Math.abs(cut.from - start) > 0.05 ? ` · from ${mmss(cut.from)}` : '';

  function down(e: PointerEvent) {
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDrag({ x: e.clientX, from: l.range.s, t: l.range.s, moved: false });
  }
  function move(e: PointerEvent) {
    if (!drag) return;
    const dx = e.clientX - drag.x;
    if (!drag.moved && Math.abs(dx) < 4) return;
    const t = Math.max(0, Math.min(Math.max(0, duration - len), drag.from + dx / pps));
    setDrag({ ...drag, t, moved: true });
  }
  function up() {
    const d = drag;
    setDrag(null);
    if (!d) return;
    if (d.moved) on.moveCutout(l.id, d.t);
    else on.select(l.id);
  }

  return (
    <span
      className={`fx-clip cut-clip${selected || drag ? ' on' : ''}`}
      style={{ left: x(start), width: w, '--c': l.color } as CSSProperties}
    >
      <button
        type="button"
        className="fx-body"
        aria-pressed={selected}
        aria-label={`${l.name}: ${mmss(l.range.s)} to ${mmss(l.range.e)}${from}. Tap to select, drag to place it.`}
        onClick={e => e.stopPropagation()}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={() => setDrag(null)}
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
      {selected && !drag && <Grips lane={l} scale={scale} duration={duration} on={on} />}
    </span>
  );
}

// '' at normal speed, else e.g. 0.75× or 1.5×
function speedLabel(speed: number) {
  if (Math.abs(speed - 1) < 0.01) return '';
  return `${speed < 1 ? speed.toFixed(2).replace(/0$/, '') : speed.toFixed(1)}×`;
}

// the grips on a selected clip's start and end
function Grips(props: { lane: Lane; scale: Scale; duration: number; on: ClipActions }) {
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
  lane: Lane;
  scale: Scale;
  duration: number;
  on: ClipActions;
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
