'use client';

// Adding a layer in the Preset Lab: one list of every layer that can go on the preset, whichever
// engine draws it, narrowed by typing.
import { useState } from 'react';
import type { Engine } from '@/domain/effects/passes';

export interface LayerKind {
  engine: Engine;
  kind: string;
  label: string;
}

// what each engine's layers are, in a word, shown beside them
const WHAT: Record<Engine, string> = {
  color: 'grade',
  screen: 'frame',
  text: 'text',
  motion: 'motion',
  object: 'object',
  burst: 'impact',
};

export function AddLayer({ kinds, onAdd }: { kinds: readonly LayerKind[]; onAdd(k: LayerKind): void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const words = q.trim().toLowerCase();
  const shown = kinds.filter(
    k => !words || `${k.label} ${k.kind} ${WHAT[k.engine]}`.toLowerCase().includes(words),
  );
  const add = (k: LayerKind) => {
    onAdd(k);
    setOpen(false);
    setQ('');
  };

  if (!open)
    return (
      <button type="button" className="lab-add-open" onClick={() => setOpen(true)}>
        + Add layer
      </button>
    );
  return (
    <section className="lab-card lab-add" aria-label="Add layer">
      <div className="lab-row">
        <input
          type="text"
          autoFocus
          placeholder="Find a layer: fire, glitch, grade, zoom…"
          aria-label="Find a layer"
          value={q}
          onChange={e => setQ(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && shown[0]) add(shown[0]);
            if (e.key === 'Escape') setOpen(false);
          }}
        />
        <button type="button" aria-label="Close" onClick={() => setOpen(false)}>
          ✕
        </button>
      </div>
      <ul className="lab-add-list">
        {shown.map(k => (
          <li key={`${k.engine}:${k.kind}`}>
            <button type="button" onClick={() => add(k)}>
              {k.label}
              <small>{k.kind === 'emitter' ? 'particles' : WHAT[k.engine]}</small>
            </button>
          </li>
        ))}
        {!shown.length && <li className="lab-note">No layer matches “{q}”.</li>}
      </ul>
    </section>
  );
}
