// A laser's aim: which way it fires, left-right and up-down (fine-tuned a degree at a time), with
// quick presets, including straight at the camera for a face looking into it. Or a spot in the
// scene for it to hit instead.
import type { CSSProperties } from 'react';
import type { Aim } from '@/domain/effects/laser';
import { Icon, I } from './icons';

const PRESETS: { name: string; h: number; v: number }[] = [
  { name: 'Left', h: -90, v: 0 },
  { name: 'At camera', h: 0, v: 0 },
  { name: 'Right', h: 90, v: 0 },
  { name: 'Up', h: 90, v: -90 },
  { name: 'Into scene', h: 180, v: 0 },
  { name: 'Down', h: 90, v: 90 },
];

// h and v in words: 0° is at the camera; right or left of that, up or down
const sideways = (h: number) =>
  h === 0 ? 'At camera' : Math.abs(h) === 180 ? 'Into scene' : `${Math.abs(h)}° ${h > 0 ? 'right' : 'left'}`;
const upDown = (v: number) => (v === 0 ? 'Level' : `${Math.abs(v)}° ${v < 0 ? 'up' : 'down'}`);

export function AimPanel({
  aim,
  onChange,
  onTarget,
  onClear,
}: {
  aim: Aim;
  onChange(p: { h?: number; v?: number }): void;
  onTarget(): void;
  onClear(): void;
}) {
  const locked = !!aim.target; // it hits the target, whatever its direction
  return (
    <div className="sliders">
      <AimRow
        label="Left ↔ Right"
        value={aim.h}
        min={-180}
        max={180}
        text={sideways(aim.h)}
        disabled={locked}
        onChange={h => onChange({ h })}
      />
      <AimRow
        label="Up ↕ Down"
        value={aim.v}
        min={-90}
        max={90}
        text={upDown(aim.v)}
        disabled={locked}
        onChange={v => onChange({ v })}
      />
      <div className="aim-dirs" role="group" aria-label="Quick directions">
        {PRESETS.map(p => (
          <button
            key={p.name}
            type="button"
            aria-pressed={!locked && aim.h === p.h && aim.v === p.v}
            disabled={locked}
            onClick={() => onChange({ h: p.h, v: p.v })}
          >
            {p.name}
          </button>
        ))}
      </div>
      <div className="aim-target">
        <span>{locked ? 'Hitting the spot you tapped.' : 'Or hit a spot in the scene.'}</span>
        {locked ? (
          <button type="button" onClick={onClear}>
            Clear target
          </button>
        ) : (
          <button type="button" className="primary" onClick={onTarget}>
            <Icon d={I.target} size={18} />
            Tap a target
          </button>
        )}
      </div>
    </div>
  );
}

// a slider with a button either side to nudge it a degree at a time
function AimRow({
  label,
  value,
  min,
  max,
  text,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  text: string;
  disabled: boolean;
  onChange(v: number): void;
}) {
  const set = (v: number) => onChange(Math.max(min, Math.min(max, v)));
  return (
    <div className="aim-row">
      <span className="aim-label">
        {label}
        <output>{text}</output>
      </span>
      <button
        type="button"
        aria-label={`${label}: 1° less`}
        disabled={disabled}
        onClick={() => set(value - 1)}
      >
        −
      </button>
      <input
        type="range"
        aria-label={label}
        min={min}
        max={max}
        step={1}
        value={value}
        style={{ '--p': `${((value - min) / (max - min)) * 100}%` } as CSSProperties}
        disabled={disabled}
        onChange={e => set(+e.target.value)}
      />
      <button
        type="button"
        aria-label={`${label}: 1° more`}
        disabled={disabled}
        onClick={() => set(value + 1)}
      >
        +
      </button>
    </div>
  );
}
