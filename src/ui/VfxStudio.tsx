'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { DEFAULT_PAL, PALETTES, type Effect } from '@/effects/palettes';
import { INITIAL_UI, Player, type UiState } from './player';

const EFFECTS: { id: Effect; label: string }[] = [
  { id: 'fire', label: 'Fire' },
  { id: 'lightning', label: 'Lightning' },
  { id: 'aura', label: 'Aura' },
  { id: 'sparks', label: 'Sparks' },
];

const fmt = (t: number) => { t = Math.max(0, t || 0); return Math.floor(t / 60) + ':' + String(Math.floor(t % 60)).padStart(2, '0'); };

export default function VfxStudio() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const viewRef = useRef<HTMLCanvasElement>(null);
  const resultRef = useRef<HTMLElement>(null);
  const playerRef = useRef<Player | null>(null);
  const [ui, setUi] = useState<UiState>(INITIAL_UI);
  const [effect, setEffect] = useState<Effect>('fire');
  const [pal, setPal] = useState(0);
  const [size, setSize] = useState(1);
  const [intensity, setIntensity] = useState(1);
  const [showOutline, setShowOutline] = useState(true);

  useEffect(() => {
    const player = new Player(videoRef.current!, viewRef.current!, setUi);
    playerRef.current = player;
    return () => { player.destroy(); playerRef.current = null; };
  }, []);

  const hasResult = !!ui.result;
  useEffect(() => {
    if (hasResult) resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [hasResult]);

  const player = () => playerRef.current;
  const analyzing = ui.progress !== null;

  function pickEffect(fx: Effect) {
    setEffect(fx); setPal(DEFAULT_PAL[fx]); player()?.setEffect(fx);
  }

  // start over on this clip: forget the tracked object and restore the default look
  function reset() {
    player()?.clearTarget();
    pickEffect('fire');
    setSize(1); player()?.setSize(1);
    setIntensity(1); player()?.setIntensity(1);
    setShowOutline(true); player()?.setShowOutline(true);
  }

  const pct = (v: number, min: number, max: number) => ({ '--p': `${((v - min) / (max - min)) * 100}%` }) as CSSProperties;

  return (
    <>
      <header className="topbar">
        <div className="brand">
          <strong>Vex VFX</strong>
          <span>Click it. Pick an effect. Watch it follow.</span>
        </div>
        <div className="actions">
          <button type="button" className="ghost" disabled={!ui.ready || ui.recording} onClick={reset}>
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v4h4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
            Reset
          </button>
          <button type="button" className="primary" disabled={!ui.canRecord && !ui.recording} onClick={() => player()?.toggleRecord()}>
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
              {ui.recording
                ? <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" />
                : <path d="M12 4v11m0 0-4-4m4 4 4-4M5 20h14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />}
            </svg>
            {ui.recording ? 'Stop' : 'Download'}
          </button>
        </div>
      </header>

      <main className="app">
        <div className="canvas-card">
          <section className="stage" aria-label="Video preview">
            <canvas ref={viewRef} className={`view${ui.tracked ? ' tracked' : ''}`} width={960} height={540} aria-label={ui.tracked ? 'Video with effect. Click to play or pause.' : 'Video. Click an object to choose what the effect follows.'} />
            {!ui.ready && !ui.camera && (
              <div className="empty">
                <strong>Load a short clip to start</strong>
                <span>Under 20 seconds works best. Hands, bodies, balls and cars all work. Objects that stand out from the background trace best.</span>
              </div>
            )}
            {analyzing && (
              <div className="analyzing">
                <div className="progress" role="progressbar" aria-label="Analysing the clip" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(ui.progress! * 100)}>
                  <div style={{ width: `${Math.round(ui.progress! * 100)}%` }} />
                  <span>Analysing {Math.round(ui.progress! * 100)}%</span>
                </div>
              </div>
            )}
            <div className={`rec${ui.recording || ui.camera ? ' on' : ''}`}>Recording</div>
            <div className="hint" aria-live="polite">{ui.hint}</div>
          </section>
          <div className="transport" aria-label="Playback controls">
            <button type="button" className="play" disabled={!ui.ready || analyzing} aria-label={ui.playing ? 'Pause' : 'Play'} onClick={() => player()?.togglePlay()}>
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                <path d={ui.playing ? 'M6 5h4v14H6zM14 5h4v14h-4z' : 'M8 5v14l11-7z'} fill="currentColor" />
              </svg>
            </button>
            <span className="time">{fmt(ui.time)}</span>
            <input
              type="range" min={0} max={ui.duration || 1} step={0.01} value={ui.time}
              style={pct(ui.time, 0, ui.duration || 1)}
              disabled={!ui.ready} aria-label="Scrub through video"
              onChange={e => player()?.seek(+e.target.value)}
            />
            <span className="time">{fmt(ui.duration)}</span>
          </div>
        </div>

        <aside className="panel">
          <div className="field">
            <span className="label">Source</span>
            <div className="row">
              <label className="filebtn">
                Choose video
                <input type="file" accept="video/*" onChange={e => { const f = e.target.files?.[0]; if (f) player()?.loadFile(f); e.target.value = ''; }} />
              </label>
              <button type="button" onClick={() => player()?.toggleCamera()}>{ui.camera ? 'Stop and edit' : 'Use camera'}</button>
            </div>
          </div>

          <div className="field">
            <span className="label">Target</span>
            <p className="status" aria-live="polite">{ui.tapStatus || 'Click the object in the video that the effect should follow.'}</p>
          </div>

          <div className="field">
            <span className="label">Effect</span>
            <div className="fx" role="group" aria-label="Effect">
              {EFFECTS.map(fx => (
                <button key={fx.id} type="button" aria-pressed={effect === fx.id} onClick={() => pickEffect(fx.id)}>{fx.label}</button>
              ))}
            </div>
          </div>

          <div className="field">
            <span className="label">Color</span>
            <div className="color-row">
              <span className="chip" style={{ background: PALETTES[pal].c[1] }} />
              <span className="color-name">{PALETTES[pal].name}<em>{PALETTES[pal].c[1]}</em></span>
            </div>
            <div className="swatches" role="group" aria-label="Color">
              {PALETTES.map((p, i) => (
                <button
                  key={p.name} type="button" className="swatch" title={p.name} aria-label={`${p.name} color`} aria-pressed={pal === i}
                  style={{ background: `radial-gradient(circle at 40% 40%, ${p.c[0]}, ${p.c[1]} 35%, ${p.c[2]} 70%, ${p.c[3]})` }}
                  onClick={() => { setPal(i); player()?.setPalette(i); }}
                />
              ))}
            </div>
          </div>

          <label className="field slider">
            <span className="label">Size<output>{Math.round(size * 100)}%</output></span>
            <input type="range" min={0.3} max={2.5} step={0.05} value={size} style={pct(size, 0.3, 2.5)}
              onChange={e => { const v = +e.target.value; setSize(v); player()?.setSize(v); }} />
          </label>
          <label className="field slider">
            <span className="label">Intensity<output>{Math.round(intensity * 100)}%</output></span>
            <input type="range" min={0.2} max={2} step={0.05} value={intensity} style={pct(intensity, 0.2, 2)}
              onChange={e => { const v = +e.target.value; setIntensity(v); player()?.setIntensity(v); }} />
          </label>
          <label className="field check">
            <span className="label">Show outline</span>
            <input type="checkbox" role="switch" checked={showOutline}
              onChange={e => { setShowOutline(e.target.checked); player()?.setShowOutline(e.target.checked); }} />
          </label>

          <p className="status" aria-live="polite">
            {ui.status || (ui.canRecord ? 'Download records from the first tracked frame to the end of the clip.' : 'Download is available once the clip has been analysed.')}
          </p>
        </aside>
      </main>

      <section ref={resultRef} className={`result${ui.result ? ' on' : ''}`} aria-live="polite">
        {ui.result && (
          <div className="card">
            <video src={ui.result.url} controls playsInline />
            <div>
              <h2>Your clip is ready</h2>
              <p>{ui.result.hasAudio ? 'Watch it back, then save it.' : 'Watch it back, then save it. This recording has no sound.'}</p>
              <div className="row">
                <a className="btn primary" href={ui.result.url} download={`effect-clip.${ui.result.ext}`}>Save video</a>
                <button type="button" onClick={() => { player()?.closeResult(); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Record again</button>
              </div>
            </div>
          </div>
        )}
      </section>

      <video ref={videoRef} className="src-video" playsInline preload="auto" />
    </>
  );
}
