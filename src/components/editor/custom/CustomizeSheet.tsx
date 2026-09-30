'use client';

// Customizing an effect: every layer of it, each setting of each, with layers added (from what can
// go on this kind of effect), moved and taken out. The first change gives the clip its own copy of
// its template (see domain/effects/custom.ts), so it draws on just as it did until then.
import {
  addPass,
  kindsOf,
  movePass,
  ownCopy,
  removePass,
  setMotion,
  setParam,
} from '@/domain/effects/custom';
import type { ControlValues, Preset } from '@/domain/effects/presets';
import { Icon, I } from '../icons';
import { AddLayer } from './AddLayer';
import { LayerCard } from './LayerCard';

// a change to the effect; merge: its kind, joined with the last change if the same (a slider's drag)
type Edit = (edit: (p: Preset) => Preset, merge?: string) => void;

export function CustomizeSheet({
  name,
  preset,
  values,
  onEdit,
  onClose,
}: {
  name: string;
  preset: Preset;
  values: ControlValues;
  onEdit: Edit;
  onClose(): void;
}) {
  // (what it draws now: its sliders as they're set)
  const own = ownCopy(preset, values);
  return (
    <div className="sheet custom" role="dialog" aria-label={`Customize ${name}`}>
      <div className="sheet-head">
        <strong>Customize · {name}</strong>
        <button type="button" className="icon-btn" aria-label="Done" onClick={onClose}>
          <Icon d={I.check} />
        </button>
      </div>
      <div className="custom-layers">
        {own.passes.map((x, k) => (
          <LayerCard
            key={`${k}:${x.engine}:${x.kind}`}
            pass={x}
            index={k}
            count={own.passes.length}
            on={{
              set: (param, v) => onEdit(p => setParam(p, k, param, v), `set:${k}:${param}`),
              motion: m => onEdit(p => setMotion(p, k, m), `motion:${k}`),
              move: by => onEdit(p => movePass(p, k, by)),
              remove: () => onEdit(p => removePass(p, k)),
            }}
          />
        ))}
        <AddLayer kinds={kindsOf(preset.group)} onAdd={l => onEdit(p => addPass(p, l.engine, l.kind))} />
      </div>
    </div>
  );
}
