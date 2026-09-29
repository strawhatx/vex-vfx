'use client';

// The Preset Lab, one page at a time (an engine, or transitions): build an effect from the page's
// passes on a test clip, pick the
// sliders users get, and download it as a preset file for domain/effects/library/. The preview uses
// the editor's own GPU painter (see labPlayer.ts), so what's made here looks the same there.
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import {
  LAB_PAGES,
  previewLength,
  type LabPage,
  addPass,
  draftOf,
  expose,
  exposedBy,
  hasStrength,
  kindsOf,
  movePass,
  newDraft,
  presetFile,
  removeControl,
  removePass,
  renameControl,
  setMeta,
  setMotion,
  setParam,
  withStrength,
} from '@/domain/effects/draft';
import { presets } from '@/domain/effects/library';
import { parsePreset, type Preset } from '@/domain/effects/presets';
import { LabPlayer, type LabState } from './labPlayer';
import { PassCard } from './PassCard';

// changes of the same kind (dragging one slider) this close together are one step to undo
const MERGE_MS = 1000;
const HISTORY = 100;

interface History {
  past: Preset[];
  now: Preset;
  future: Preset[];
  last: { key: string; at: number } | null;
}

const undone = (h: History): History =>
  h.past.length
    ? { past: h.past.slice(0, -1), now: h.past[h.past.length - 1], future: [h.now, ...h.future], last: null }
    : h;
const redone = (h: History): History =>
  h.future.length ? { past: [...h.past, h.now], now: h.future[0], future: h.future.slice(1), last: null } : h;

export default function EngineLab({ page }: { page: LabPage }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const clipRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const playerRef = useRef<LabPlayer | null>(null);
  const [lab, setLab] = useState<LabState>({ t: 0, playing: true, clip: null, gpu: true });
  const [compare, setCompare] = useState(false);
  const [problem, setProblem] = useState('');
  const [h, setH] = useState<History>(() => ({ past: [], now: newDraft(page), future: [], last: null }));
  const p = h.now;
  const group = LAB_PAGES[page].group;
  // how long a round of the preview is (a transition's has a moment either side of it)
  const loop = previewLength(p);
  const shipped = presets().filter(x => x.group === group);

  useEffect(() => {
    const player = new LabPlayer(canvasRef.current!, setLab);
    playerRef.current = player;
    return () => player.destroy();
  }, []);
  useEffect(() => playerRef.current?.setPreset(p), [p]);

  // a change to the draft, as a step to undo (merge: its kind, joined with the last step if the same)
  function change(next: Preset, merge?: string) {
    setProblem('');
    setH(cur => {
      const now = Date.now();
      const joins = !!merge && cur.last?.key === merge && now - cur.last.at < MERGE_MS;
      return {
        past: joins ? cur.past : [...cur.past, cur.now].slice(-HISTORY),
        now: next,
        future: [],
        last: merge ? { key: merge, at: now } : null,
      };
    });
  }
  const undo = () => setH(undone);
  const redo = () => setH(redone);

  // Ctrl/⌘+Z undoes, Ctrl/⌘+Shift+Z (or Ctrl+Y) redoes, except while typing
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (!(e.metaKey || e.ctrlKey) || (key !== 'z' && key !== 'y')) return;
      if ((e.target as HTMLElement).closest('input[type="text"], input[type="number"]')) return;
      e.preventDefault();
      setH(key === 'y' || e.shiftKey ? redone : undone);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  function startFrom(id: string) {
    const from = shipped.find(x => x.id === id);
    change(from ? draftOf(from) : newDraft(page));
  }

  // a preset file picked to carry on with
  async function loadFile(f: File) {
    try {
      const loaded = parsePreset(JSON.parse(await f.text()));
      if (loaded.group !== group) throw new Error(`it's a ${loaded.group} preset, not a ${group} one`);
      change(draftOf(loaded));
    } catch (e) {
      setProblem(`Couldn't load ${f.name}: ${(e as Error).message}`);
    }
  }

  // the preset as a file, <id>.json
  function download() {
    try {
      const file = presetFile(p);
      parsePreset(file); // (says what's wrong, if anything)
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(file, null, 2) + '\n'], { type: 'application/json' }),
      );
      const a = document.createElement('a');
      a.href = url;
      a.download = `${p.id}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setProblem((e as Error).message);
    }
  }

  const strength = hasStrength(p);
  const others = p.controls.filter(c => c.id !== 'strength');

  return (
    <div className="lab">
      <div className="lab-stage">
        <header className="lab-top">
          <Link href="/lab" className="lab-home" aria-label="Back to the lab">
            ←
          </Link>
          <strong>{LAB_PAGES[page].name}</strong>
          <span className="lab-top-tools">
            <button type="button" disabled={!h.past.length} onClick={undo}>
              Undo
            </button>
            <button type="button" disabled={!h.future.length} onClick={redo}>
              Redo
            </button>
          </span>
        </header>
        <div className="lab-preview">
          <canvas ref={canvasRef} aria-label="Preview" />
          {!lab.gpu && (
            <p className="lab-problem">WebGL2 isn’t available in this browser, so effects can’t be drawn.</p>
          )}
        </div>
        <div className="lab-transport">
          <button type="button" onClick={() => playerRef.current?.togglePlay()}>
            {lab.playing ? 'Pause' : 'Play'}
          </button>
          <input
            type="range"
            aria-label="Effect time"
            min={0}
            max={loop}
            step={0.01}
            value={Math.min(lab.t, loop)}
            onChange={e => playerRef.current?.seek(+e.target.value)}
          />
          <output>
            {lab.t.toFixed(2)} / {loop.toFixed(1)}s
          </output>
        </div>
        <div className="lab-transport">
          <label className="lab-check">
            <input
              type="checkbox"
              checked={compare}
              onChange={e => {
                setCompare(e.target.checked);
                playerRef.current?.setCompare(e.target.checked);
              }}
            />
            Before / after
          </label>
          <button type="button" onClick={() => clipRef.current?.click()}>
            {lab.clip ? 'Other clip' : 'Load a test clip'}
          </button>
          {lab.clip && (
            <button type="button" onClick={() => playerRef.current?.useScene()}>
              Test scene
            </button>
          )}
        </div>
      </div>

      <div className="lab-panel">
        <section className="lab-card">
          <div className="lab-params">
            <label className="lab-param">
              <span>Start from</span>
              <select value="" onChange={e => startFrom(e.target.value)}>
                <option value="" disabled>
                  Pick one…
                </option>
                <option value="new">A new one</option>
                {shipped.map(x => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="lab-param">
              <span>Name</span>
              <input
                type="text"
                value={p.name}
                onChange={e => change(setMeta(p, { name: e.target.value }), 'name')}
              />
              <output className="lab-id">{p.id}</output>
            </label>
            {group === 'screen' && (
              <label className="lab-param">
                <span>Category</span>
                <input
                  type="text"
                  value={p.category}
                  onChange={e => change(setMeta(p, { category: e.target.value }), 'category')}
                />
              </label>
            )}
            <Seconds
              label="Length"
              value={p.length}
              min={0.1}
              onSet={v => change(setMeta(p, { length: v }), 'length')}
            />
            <Seconds
              label="Fade in"
              value={p.fade.in}
              min={0}
              onSet={v => change(setMeta(p, { fadeIn: v }), 'fadein')}
            />
            <Seconds
              label="Fade out"
              value={p.fade.out}
              min={0}
              onSet={v => change(setMeta(p, { fadeOut: v }), 'fadeout')}
            />
          </div>
        </section>

        {p.passes.map((x, k) => (
          <PassCard
            key={k}
            pass={x}
            index={k}
            count={p.passes.length}
            strength={strength}
            exposed={param => !!exposedBy(p, k, param)}
            on={{
              set: (param, v) => change(setParam(p, k, param, v), `set:${k}:${param}`),
              expose: (param, on) => change(expose(p, k, param, on)),
              motion: m => change(setMotion(p, k, m), `motion:${k}`),
              move: by => change(movePass(p, k, by)),
              remove: () => change(removePass(p, k)),
            }}
          />
        ))}
        <label className="lab-add">
          <span>Add a pass</span>
          <select
            value=""
            onChange={e => {
              const k = kindsOf(page)[+e.target.value];
              if (k) change(addPass(p, k.engine, k.kind));
            }}
          >
            <option value="" disabled>
              Pick one…
            </option>
            {kindsOf(page).map((k, n) => (
              <option key={`${k.engine}:${k.kind}`} value={n}>
                {LAB_PAGES[page].offers.length > 1 ? `${k.label} (${k.engine})` : k.label}
              </option>
            ))}
          </select>
        </label>

        <section className="lab-card" aria-label="Sliders users get">
          <header className="lab-card-head">
            <strong>Sliders users get</strong>
          </header>
          <div className="lab-params">
            <label className="lab-check">
              <input
                type="checkbox"
                checked={strength}
                onChange={e => change(withStrength(p, e.target.checked))}
              />
              Strength (every pass, from off to as set)
            </label>
            {others.map(c => (
              <div key={c.id} className="lab-row">
                <label className="lab-param">
                  <span>{c.type === 'color' ? 'Color' : 'Slider'}</span>
                  <input
                    type="text"
                    value={c.label}
                    aria-label="Its name"
                    onChange={e => change(renameControl(p, c.id, e.target.value), `label:${c.id}`)}
                  />
                </label>
                <button
                  type="button"
                  aria-label={`Remove ${c.label}`}
                  onClick={() => change(removeControl(p, c.id))}
                >
                  ✕
                </button>
              </div>
            ))}
            {!others.length && (
              <p className="lab-note">Tick a setting’s box to give users a slider for it.</p>
            )}
          </div>
        </section>

        <div className="lab-save">
          <button type="button" className="primary" onClick={download}>
            Download {p.id}.json
          </button>
          <button type="button" onClick={() => fileRef.current?.click()}>
            Open a preset file
          </button>
          {problem && <p className="lab-problem">{problem}</p>}
          <p className="lab-note">
            To ship it, put the file in src/domain/effects/library/ and list it in files.ts there.
          </p>
        </div>
      </div>

      <input
        ref={clipRef}
        className="file-input"
        type="file"
        accept="video/*"
        tabIndex={-1}
        aria-hidden="true"
        onChange={e => {
          const f = e.target.files?.[0];
          if (f) playerRef.current?.loadFile(f);
          e.target.value = '';
        }}
      />
      <input
        ref={fileRef}
        className="file-input"
        type="file"
        accept="application/json,.json"
        tabIndex={-1}
        aria-hidden="true"
        onChange={e => {
          const f = e.target.files?.[0];
          if (f) void loadFile(f);
          e.target.value = '';
        }}
      />
    </div>
  );
}

function Seconds({
  label,
  value,
  min,
  onSet,
}: {
  label: string;
  value: number;
  min: number;
  onSet(v: number): void;
}) {
  return (
    <label className="lab-param">
      <span>{label}</span>
      <input
        type="number"
        min={min}
        max={60}
        step={0.1}
        value={value}
        onChange={e => e.target.value !== '' && onSet(+e.target.value)}
      />
      <output>s</output>
    </label>
  );
}
