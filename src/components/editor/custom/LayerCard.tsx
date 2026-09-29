// One layer of an effect being customized: its settings (a slider, color, choice or words each;
// past the first few, under More), how its strength moves over time, and buttons to move or remove
// it.
import { useState, type CSSProperties } from 'react';
import { MOTIONS, type Motion, type MotionKind } from '@/domain/effects/curves';
import { ENGINES, paramsOf, type Pass } from '@/domain/effects/passes';
import type { ParamSpec, ParamValue } from '@/domain/effects/params';

// which motions use their rate and their decay
const RATED = new Set<MotionKind>(['pulse', 'burst', 'flicker']),
  DECAYING = new Set<MotionKind>(['burst', 'once']);

const pct = (v: number, min: number, max: number) =>
  ({ '--p': `${((v - min) / (max - min || 1)) * 100}%` }) as CSSProperties;
const show = (v: number) => (Math.abs(v) >= 10 ? v.toFixed(0) : v.toFixed(2));

// how many settings show before More
const FIRST = 5;

export function LayerCard({
  pass,
  index,
  count,
  on,
}: {
  pass: Pass;
  index: number;
  count: number; // how many layers there are
  on: {
    set(param: string, v: ParamValue): void;
    motion(m: Partial<Motion>): void;
    move(by: -1 | 1): void;
    remove(): void;
  };
}) {
  const specs = paramsOf(pass.engine, pass.kind);
  const m = pass.motion;
  const [more, setMore] = useState(false);
  const shown = more ? specs : specs.slice(0, FIRST);
  return (
    <section className="custom-card" aria-label={`Layer ${index + 1}`}>
      <header className="custom-card-head">
        <strong>
          {index + 1}. {ENGINES[pass.engine][pass.kind].label}
        </strong>
        <span className="custom-card-tools">
          <button type="button" aria-label="Draw earlier" disabled={index === 0} onClick={() => on.move(-1)}>
            ↑
          </button>
          <button
            type="button"
            aria-label="Draw later"
            disabled={index === count - 1}
            onClick={() => on.move(1)}
          >
            ↓
          </button>
          <button type="button" aria-label="Remove" disabled={count < 2} onClick={on.remove}>
            ✕
          </button>
        </span>
      </header>
      <div className="custom-params">
        {shown.map(s => (
          <Param key={s.key} spec={s} value={pass.params[s.key]} onSet={v => on.set(s.key, v)} />
        ))}
        {specs.length > FIRST && (
          <button type="button" className="custom-more" onClick={() => setMore(!more)}>
            {more ? 'Fewer settings' : `More settings (${specs.length - FIRST})`}
          </button>
        )}
      </div>
      {/* (strength that moves over time: only for layers that have a strength) */}
      {specs.some(s => s.key === 'amount') && (
        <div className="custom-params custom-motion">
          <label className="custom-param">
            <span>Motion</span>
            <select value={m.kind} onChange={e => on.motion({ kind: e.target.value as MotionKind })}>
              {MOTIONS.map(x => (
                <option key={x.id} value={x.id}>
                  {x.label}
                </option>
              ))}
            </select>
          </label>
          {RATED.has(m.kind) && (
            <Slider
              label="Per second"
              min={0.1}
              max={12}
              value={m.rate}
              onSet={rate => on.motion({ rate })}
            />
          )}
          {DECAYING.has(m.kind) && (
            <Slider
              label="Dies away (s)"
              min={0.02}
              max={2}
              value={m.decay}
              onSet={decay => on.motion({ decay })}
            />
          )}
        </div>
      )}
    </section>
  );
}

function Slider({
  label,
  min,
  max,
  value,
  onSet,
}: {
  label: string;
  min: number;
  max: number;
  value: number;
  onSet(v: number): void;
}) {
  return (
    <label className="custom-param">
      <span>{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={(max - min) / 200}
        value={value}
        style={pct(value, min, max)}
        onChange={e => onSet(+e.target.value)}
      />
      <output>{show(value)}</output>
    </label>
  );
}

function Param({ spec, value, onSet }: { spec: ParamSpec; value: ParamValue; onSet(v: ParamValue): void }) {
  if (spec.type === 'number')
    return (
      <div className="custom-row">
        <Slider label={spec.label} min={spec.min} max={spec.max} value={value as number} onSet={onSet} />
      </div>
    );
  if (spec.type === 'color')
    return (
      <div className="custom-row">
        <label className="custom-param">
          <span>{spec.label}</span>
          <input
            type="color"
            className="color-input"
            value={value as string}
            onChange={e => onSet(e.target.value)}
          />
          <output />
        </label>
      </div>
    );
  if (spec.type === 'text')
    return (
      <div className="custom-row">
        <label className="custom-param">
          <span>{spec.label}</span>
          <input
            type="text"
            value={value as string}
            maxLength={spec.max}
            onChange={e => onSet(e.target.value)}
          />
          <output />
        </label>
      </div>
    );
  return (
    <div className="custom-row">
      <label className="custom-param">
        <span>{spec.label}</span>
        <select value={value as string} onChange={e => onSet(e.target.value)}>
          {spec.options.map(o => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
