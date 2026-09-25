'use client';

import { useEffect, useRef, useState } from 'react';
import { DEFAULT_PAL, PALETTES, type Effect } from '@/effects/palettes';
import { INITIAL_UI, Player, type Subject, type UiState } from './player';

const SUBJECTS: { id: Subject; label: string }[] = [
  { id: 'hand', label: 'Hands' },
  { id: 'body', label: 'Body' },
  { id: 'face', label: 'Face' },
  { id: 'object', label: 'Click an object' },
];

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
  const [spread, setSpread] = useState(28);
  const [showOutline, setShowOutline] = useState(true);

  useEffect(() => {
    const player = new Player(videoRef.current!, viewRef.current!, setUi);
    playerRef.current = player;
    return () => { player.destroy(); playerRef.current = null; };
  }, []);

  useEffect(() => {
    document.documentElement.style.setProperty('--accent', PALETTES[pal].c[1]);
  }, [pal]);

  const hasResult = !!ui.result;
  useEffect(() => {
    if (hasResult) resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [hasResult]);

  const player = () => playerRef.current;

  function pickEffect(fx: Effect) {
    setEffect(fx); setPal(DEFAULT_PAL[fx]); player()?.setEffect(fx);
  }

  const followsObject = ui.subject === 'object';

  return (
    <>
      <header className="site-header">
        <h1>Click it. Pick an effect. Watch it follow.</h1>
        <p>A working prototype of the effects app: click a hand, a body, or anything else, and it traces the outline and tracks it frame by frame, right in your browser.</p>
      </header>

      <main className="app">
        <div className="player">
          <section className="stage" aria-label="Video preview">
            <canvas ref={viewRef} className="view" width={960} height={540} aria-label="Video with effect. Click to choose what the effect follows." />
            {!ui.ready && !ui.camera && (
              <div className="empty">
                <strong>Load a short clip to start</strong>
                <span>Under 20 seconds works best. Hands, bodies, balls and cars all work. Objects that stand out from the background trace best.</span>
              </div>
            )}
            <div className={`rec${ui.recording || ui.camera ? ' on' : ''}`}>Recording</div>
            <div className="hint" aria-live="polite">{ui.hint}</div>
          </section>
          <div className="transport" aria-label="Playback controls">
            <button type="button" className="play" disabled={!ui.ready} aria-label={ui.playing ? 'Pause' : 'Play'} onClick={() => player()?.togglePlay()}>
              <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
                <path d={ui.playing ? 'M6 5h4v14H6zM14 5h4v14h-4z' : 'M8 5v14l11-7z'} fill="currentColor" />
              </svg>
            </button>
            <span className="time">{fmt(ui.time)}</span>
            <input
              type="range" min={0} max={ui.duration || 1} step={0.01} value={ui.time}
              disabled={!ui.ready} aria-label="Scrub through video"
              onChange={e => player()?.seek(+e.target.value)}
            />
            <span className="time">{fmt(ui.duration)}</span>
            <button type="button" className="replay" disabled={!ui.canReplay} onClick={() => player()?.replay()}>Replay</button>
          </div>
        </div>

        <aside className="panel">
          <div className="step">
            <h2><span>1</span>Load a clip</h2>
            <div className="row">
              <label className="filebtn">
                Choose video
                <input type="file" accept="video/*" onChange={e => { const f = e.target.files?.[0]; if (f) player()?.loadFile(f); e.target.value = ''; }} />
              </label>
              <button type="button" onClick={() => player()?.toggleCamera()}>{ui.camera ? 'Stop and edit' : 'Record with camera'}</button>
            </div>
          </div>

          <div className="step">
            <h2><span>2</span>Choose what the effect follows</h2>
            <div className="fx" role="group" aria-label="Follow">
              {SUBJECTS.map(s => (
                <button key={s.id} type="button" aria-pressed={ui.subject === s.id} onClick={() => player()?.setSubject(s.id)}>{s.label}</button>
              ))}
            </div>
            <p className="status" aria-live="polite">{ui.tapStatus}</p>
            {ui.progress !== null && (
              <div className="progress" role="progressbar" aria-label="Analysing the clip" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(ui.progress * 100)}>
                <div style={{ width: `${Math.round(ui.progress * 100)}%` }} />
                <span>Analysing {Math.round(ui.progress * 100)}%</span>
              </div>
            )}
            {followsObject && (
              <>
                <label className="slider">
                  Spread
                  <input type="range" min={10} max={60} step={1} value={spread}
                    onChange={e => { const v = +e.target.value; setSpread(v); player()?.setSpread(v); }} />
                </label>
                <p className="status" style={{ marginTop: 8 }}>Outline spilling into the background? Lower the spread. Missing parts? Raise it. You can also drag a box instead.</p>
              </>
            )}
          </div>

          <div className="step">
            <h2><span>3</span>Pick an effect</h2>
            <div className="fx" role="group" aria-label="Effect">
              {EFFECTS.map(fx => (
                <button key={fx.id} type="button" aria-pressed={effect === fx.id} onClick={() => pickEffect(fx.id)}>{fx.label}</button>
              ))}
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
            <label className="slider">
              Size
              <input type="range" min={0.3} max={2.5} step={0.05} value={size}
                onChange={e => { const v = +e.target.value; setSize(v); player()?.setSize(v); }} />
            </label>
            <label className="slider">
              Intensity
              <input type="range" min={0.2} max={2} step={0.05} value={intensity}
                onChange={e => { const v = +e.target.value; setIntensity(v); player()?.setIntensity(v); }} />
            </label>
            <label className="check">
              <input type="checkbox" checked={showOutline}
                onChange={e => { setShowOutline(e.target.checked); player()?.setShowOutline(e.target.checked); }} />
              Show outline
            </label>
          </div>

          <div className="step">
            <h2><span>4</span>Export</h2>
            <p className="status" style={{ margin: '0 0 10px' }}>
              {ui.analyzed || ui.progress === null
                ? 'Records from the first frame the effect has something to follow to the end of the clip.'
                : 'Available once the clip has been analysed.'}
            </p>
            <div className="row">
              <button type="button" className="primary" disabled={!ui.canRecord && !ui.recording} onClick={() => player()?.toggleRecord()}>
                {ui.recording ? 'Stop' : 'Record'}
              </button>
            </div>
            <p className="status" aria-live="polite">{ui.status}</p>
          </div>
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
