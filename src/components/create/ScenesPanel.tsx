'use client';

// Step 3: the scenes, in order. Pick one to edit its text, numbers, cards, icon, move, caption,
// length and transition. Every number is highlighted until you've typed or confirmed it.
import type { EditorState } from '@/application/video/editor';
import type { Editor } from '@/application/video/editor';
import { MOVES, type TextMove, type TransitionMove } from '@/domain/video/moves';
import type { Recipe } from '@/domain/video/recipe';
import {
  ICON_IDS,
  SCENE_TYPES,
  SCENES,
  type Card,
  type Num,
  type Scene,
  type SlotSpec,
} from '@/domain/video/scenes';
import { TextField } from './TextField';

interface Props {
  state: EditorState;
  editor: Editor;
  recipe: Recipe;
}

const preview = (s: Scene) => {
  const r = s as unknown as Record<string, unknown>;
  const text = (r.text ?? r.name ?? r.title ?? r.label ?? '') as string;
  return text.replace(/\*/g, '');
};

export function ScenesPanel({ state, editor, recipe }: Props) {
  const { plan } = state.project;
  const sel = state.selected;
  return (
    <div className="panel-body">
      <ol className="scene-list">
        {plan.scenes.map((s, i) => {
          const open = i === sel;
          const todo = needsNumbers(s);
          return (
            <li key={`${state.rev}-${i}`} className={open ? 'open' : undefined}>
              <button
                type="button"
                className="scene-head"
                aria-expanded={open}
                onClick={() => editor.select(i)}
              >
                <span className="scene-n">{i + 1}</span>
                <span className="scene-title">
                  <strong>{SCENES[s.type].label}</strong>
                  <span className="hint">{preview(s) || ' '}</span>
                </span>
                {todo && <span className="flag">Number to check</span>}
                <span className="hint">{s.sec.toFixed(1)}s</span>
              </button>
              {open && (
                <SceneFields scene={s} i={i} editor={editor} recipe={recipe} count={plan.scenes.length} />
              )}
            </li>
          );
        })}
      </ol>
      <label className="add-scene">
        <span className="visually-hidden">Add a scene</span>
        <select
          value=""
          onChange={e => {
            if (e.target.value) editor.addScene(e.target.value as Scene['type']);
          }}
        >
          <option value="">+ Add a scene after scene {sel + 1}…</option>
          {SCENE_TYPES.filter(t => recipe.scenes.includes(t)).map(t => (
            <option key={t} value={t}>
              {SCENES[t].label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

const needsNumbers = (s: Scene) =>
  SCENES[s.type].slots.some(x => {
    if (x.kind !== 'number') return false;
    const n = (s as unknown as Record<string, Num>)[x.key];
    return n.value == null ? x.required : !n.confirmed;
  });

function SceneFields({
  scene,
  i,
  editor,
  recipe,
  count,
}: {
  scene: Scene;
  i: number;
  editor: Editor;
  recipe: Recipe;
  count: number;
}) {
  const info = SCENES[scene.type];
  const r = scene as unknown as Record<string, unknown>;
  return (
    <div className="scene-fields">
      <p className="hint">{info.describe[0].toUpperCase() + info.describe.slice(1)}</p>
      {info.slots.map(spec => (
        <Slot key={spec.key} spec={spec} value={r[spec.key]} i={i} editor={editor} recipe={recipe} />
      ))}
      <label className="field-block">
        <span>Subtitle (a word in *asterisks* shows in your brand colour)</span>
        <TextField value={scene.caption} maxLength={90} onValue={v => editor.setSlot(i, 'caption', v)} />
      </label>
      <div className="row-2">
        <label className="field-block">
          <span>
            Length: {scene.sec.toFixed(1)}s ({info.sec[0]}–{info.sec[1]}s)
          </span>
          <input
            type="range"
            min={info.sec[0]}
            max={info.sec[1]}
            step={0.1}
            value={scene.sec}
            onChange={e => editor.setSeconds(i, Number(e.target.value))}
          />
        </label>
        <label className="field-block">
          <span>Into the next scene</span>
          <select
            value={scene.transition ?? ''}
            onChange={e => editor.setTransition(i, (e.target.value || null) as TransitionMove | null)}
          >
            <option value="">{MOVES[recipe.transitions[0]].label} (style default)</option>
            {recipe.transitions.map(t => (
              <option key={t} value={t}>
                {MOVES[t].label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="scene-actions">
        <button
          type="button"
          className="btn btn-sm btn-quiet"
          onClick={() => editor.moveScene(i, i - 1)}
          disabled={i === 0}
        >
          ↑ Earlier
        </button>
        <button
          type="button"
          className="btn btn-sm btn-quiet"
          onClick={() => editor.moveScene(i, i + 1)}
          disabled={i === count - 1}
        >
          ↓ Later
        </button>
        <button type="button" className="btn btn-sm btn-quiet" onClick={() => editor.duplicateScene(i)}>
          Duplicate
        </button>
        <button
          type="button"
          className="btn btn-sm btn-quiet"
          onClick={() => editor.removeScene(i)}
          disabled={count <= 1}
        >
          Delete
        </button>
      </div>
    </div>
  );
}

function Slot({
  spec,
  value,
  i,
  editor,
  recipe,
}: {
  spec: SlotSpec;
  value: unknown;
  i: number;
  editor: Editor;
  recipe: Recipe;
}) {
  switch (spec.kind) {
    case 'text':
      return (
        <label className="field-block">
          <span>
            {spec.label}
            {spec.required ? '' : ' (optional)'}
          </span>
          <TextField
            value={String(value ?? '')}
            maxLength={spec.max}
            onValue={v => editor.setSlot(i, spec.key, v)}
          />
        </label>
      );
    case 'number': {
      const n = value as Num;
      const flagged = n.value == null ? spec.required : !n.confirmed;
      return (
        <div className={`field-block num${flagged ? ' flagged' : ''}`}>
          <label htmlFor={`num-${i}-${spec.key}`}>
            {spec.label}
            {spec.required ? '' : ' (optional)'}
          </label>
          <div className="num-row">
            <input
              id={`num-${i}-${spec.key}`}
              type="number"
              inputMode="decimal"
              min={spec.min}
              max={spec.max}
              defaultValue={n.value ?? ''}
              placeholder="Your real number"
              onChange={e =>
                editor.setSlot(i, spec.key, e.target.value === '' ? null : Number(e.target.value))
              }
            />
            {n.value != null && !n.confirmed && (
              <button type="button" className="btn btn-sm" onClick={() => editor.confirmNumber(i, spec.key)}>
                It’s right
              </button>
            )}
          </div>
          {flagged && (
            <p className="hint">
              {n.value == null
                ? 'Add a real number, or delete this scene.'
                : 'Check this number before you publish.'}
            </p>
          )}
        </div>
      );
    }
    case 'cards':
      return <Cards spec={spec} cards={value as Card[]} i={i} editor={editor} />;
    case 'icon':
      return (
        <label className="field-block">
          <span>{spec.label}</span>
          <select value={String(value)} onChange={e => editor.setSlot(i, spec.key, e.target.value)}>
            {ICON_IDS.map(id => (
              <option key={id} value={id}>
                {id.replace('-', ' ')}
              </option>
            ))}
          </select>
        </label>
      );
    case 'move':
      return (
        <label className="field-block">
          <span>{spec.label}</span>
          <select
            value={String(value)}
            onChange={e => editor.setSlot(i, spec.key, e.target.value as TextMove)}
          >
            {recipe.textMoves.map(m => (
              <option key={m} value={m}>
                {MOVES[m].label}
              </option>
            ))}
          </select>
        </label>
      );
  }
}

function Cards({
  spec,
  cards,
  i,
  editor,
}: {
  spec: Extract<SlotSpec, { kind: 'cards' }>;
  cards: Card[];
  i: number;
  editor: Editor;
}) {
  const set = (next: Card[]) => editor.setSlot(i, spec.key, next);
  return (
    <fieldset className="cards-edit">
      <legend>
        {spec.label} ({spec.min}–{spec.max})
      </legend>
      {cards.map((c, k) => (
        <div key={`${cards.length}-${k}`} className="card-edit">
          <TextField
            aria-label={`Card ${k + 1} title`}
            value={c.title}
            maxLength={spec.titleMax}
            onValue={title => set(cards.map((x, j) => (j === k ? { ...x, title } : x)))}
          />
          <TextField
            aria-label={`Card ${k + 1} subtitle`}
            value={c.subtitle}
            maxLength={spec.subtitleMax}
            placeholder="Subtitle (optional)"
            onValue={subtitle => set(cards.map((x, j) => (j === k ? { ...x, subtitle } : x)))}
          />
          <button
            type="button"
            className="link-btn"
            onClick={() => set(cards.filter((_, j) => j !== k))}
            disabled={cards.length <= spec.min}
            aria-label={`Remove card ${k + 1}`}
          >
            Remove
          </button>
        </div>
      ))}
      {cards.length < spec.max && (
        <button
          type="button"
          className="btn btn-sm btn-quiet"
          onClick={() => set([...cards, { title: 'New step', subtitle: '' }])}
        >
          + Add card
        </button>
      )}
    </fieldset>
  );
}
