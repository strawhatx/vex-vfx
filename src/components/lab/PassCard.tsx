// One pass in the Preset Lab: its settings (a slider, color or choice each, with a box to give it to
// users as a slider of its own), how it moves over time, and buttons to move or remove it.
import type { CSSProperties } from 'react';
import { MOTIONS, type Motion, type MotionKind } from '@/domain/effects/curves';
import { ENGINES, paramsOf, type Pass } from '@/domain/effects/passes';
import type { ParamSpec, ParamValue } from '@/domain/effects/params';

// which motions use their rate and their decay
const RATED = new Set<MotionKind>(['pulse', 'burst', 'flicker']),
  DECAYING = new Set<MotionKind>(['burst', 'once']);

const pct = (v: number, min: number, max: number) =>
  ({ '--p': `${((v - min) / (max - min || 1)) * 100}%` }) as CSSProperties;
const show = (v: number) => (Math.abs(v) >= 10 ? v.toFixed(0) : v.toFixed(2));

export function PassCard({
  pass,
  index,
  count,
  exposed,
  strength,
  on,
}: {
  pass: Pass;
  index: number;
  count: number; // how many passes there are
  exposed(param: string): boolean; // whether users get this setting as a slider
  strength: boolean; // Strength covers each pass's strength, so it isn't given a slider of its own
  on: {
    set(param: string, v: ParamValue): void;
    expose(param: string, on: boolean): void;
    motion(m: Partial<Motion>): void;
    move(by: -1 | 1): void;
    remove(): void;
  };
}) {
  const specs = paramsOf(pass.engine, pass.kind);
  const m = pass.motion;
  return (
    <section className="lab-card" aria-label={`Pass ${index + 1}`}>
      <header className="lab-card-head">
        <strong>
          {index + 1}. {ENGINES[pass.engine][pass.kind].label}
        </strong>
        <span className="lab-card-tools">
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
      <div className="lab-params">
        {specs.map(s => (
          <Param
            key={s.key}
            spec={s}
            value={pass.params[s.key]}
            exposable={(s.type === 'number' || s.type === 'color') && !(strength && s.key === 'amount')}
            exposed={exposed(s.key)}
            onSet={v => on.set(s.key, v)}
            onExpose={e => on.expose(s.key, e)}
          />
        ))}
      </div>
      <div className="lab-params lab-motion">
        <label className="lab-param">
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
          <Slider label="Per second" min={0.1} max={12} value={m.rate} onSet={rate => on.motion({ rate })} />
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
    <label className="lab-param">
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

function Param({
  spec,
  value,
  exposable,
  exposed,
  onSet,
  onExpose,
}: {
  spec: ParamSpec;
  value: ParamValue;
  exposable: boolean;
  exposed: boolean;
  onSet(v: ParamValue): void;
  onExpose(on: boolean): void;
}) {
  const box = exposable && (
    <input
      type="checkbox"
      className="lab-expose"
      checked={exposed}
      title="Give users a slider for this"
      aria-label={`Give users a slider for ${spec.label}`}
      onChange={e => onExpose(e.target.checked)}
    />
  );
  if (spec.type === 'number')
    return (
      <div className="lab-row">
        <Slider label={spec.label} min={spec.min} max={spec.max} value={value as number} onSet={onSet} />
        {box}
      </div>
    );
  if (spec.type === 'color')
    return (
      <div className="lab-row">
        <label className="lab-param">
          <span>{spec.label}</span>
          <input
            type="color"
            className="color-input"
            value={value as string}
            onChange={e => onSet(e.target.value)}
          />
          <output />
        </label>
        {box}
      </div>
    );
  if (spec.type === 'text')
    return (
      <div className="lab-row">
        <label className="lab-param">
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
    <div className="lab-row">
      <label className="lab-param">
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
