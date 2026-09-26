'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { DEFAULT_PAL, PALETTES, type Effect } from '@/effects/palettes';
import { makeFilmstrip } from './filmstrip';
import { INITIAL_UI, Player, type UiState } from './player';

const EFFECTS: { id: Effect; label: string }[] = [
  { id: 'fire', label: 'Fire' },
  { id: 'lightning', label: 'Lightning' },
  { id: 'aura', label: 'Aura' },
  { id: 'sparks', label: 'Sparks' },
];

type Tool = 'media' | 'effects' | 'color' | 'adjust';

// timeline scale: pixels per second of video, and filmstrip tile height
const PPS = 64, THUMB_H = 52;

const mmss = (t: number) => { t = Math.max(0, t || 0); return String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(Math.floor(t % 60)).padStart(2, '0'); };

const Icon = ({ d, size = 22 }: { d: string; size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
    <path d={d} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const I = {
  plus: 'M12 5v14M5 12h14',
  media: 'M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v11a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 17.5zM10 9v6l5-3z',
  effects: 'M12 3l2.2 5.3L20 9l-4.4 3.8L17 18.5 12 15.6 7 18.5l1.4-5.7L4 9l5.8-.7z',
  color: 'M12 3a9 9 0 1 0 0 18c1.1 0 1.6-.8 1.6-1.6 0-1.3-1.1-1.6-1.1-2.7 0-.9.7-1.5 1.6-1.5H16a5 5 0 0 0 5-5C21 6.3 17 3 12 3zM7.5 11.5h.01M10 7.5h.01M15 7.5h.01',
  adjust: 'M4 7h10M18 7h2M4 17h2M10 17h10M14 5v4M6 15v4',
  outline: 'M5 5h4M15 5h4M5 19h4M15 19h4M5 5v4M19 5v4M5 15v4M19 15v4',
  target: 'M12 3v3M12 18v3M3 12h3M18 12h3M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  close: 'M6 6l12 12M18 6L6 18',
  camera: 'M4 8.5A2.5 2.5 0 0 1 6.5 6h1.8l1.4-2h4.6l1.4 2h1.8A2.5 2.5 0 0 1 20 8.5v8a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5zM12 9.5a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
};

export default function VfxStudio() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const viewRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const playerRef = useRef<Player | null>(null);
  const [ui, setUi] = useState<UiState>(INITIAL_UI);
  const [tool, setTool] = useState<Tool | null>(null);
  const [effect, setEffect] = useState<Effect>('fire');
  const [pal, setPal] = useState(0);
  const [size, setSize] = useState(1);
  const [intensity, setIntensity] = useState(1);
  const [showOutline, setShowOutline] = useState(true);
  const [strip, setStrip] = useState<{ src: string; urls: string[] } | null>(null);
  const [clock, setClock] = useState(0);
  const [seenStatus, setSeenStatus] = useState('');

  useEffect(() => {
    const player = new Player(videoRef.current!, viewRef.current!, setUi);
    playerRef.current = player;
    return () => { player.destroy(); playerRef.current = null; };
  }, []);

  const player = () => playerRef.current;
  const analyzing = ui.progress !== null;
  const dur = ui.duration || 0;

  // ---------- preview sizing: fit the canvas inside the stage, keeping its aspect ----------
  const fit = useCallback(() => {
    const st = stageRef.current, cv = viewRef.current;
    if (!st || !cv || !cv.width) return;
    const r = st.getBoundingClientRect(), k = Math.min(r.width / cv.width, r.height / cv.height);
    cv.style.width = `${Math.floor(cv.width * k)}px`; cv.style.height = `${Math.floor(cv.height * k)}px`;
  }, []);
  useLayoutEffect(() => {
    const ro = new ResizeObserver(fit);
    if (stageRef.current) ro.observe(stageRef.current);
    return () => ro.disconnect();
  }, [fit]);
  useLayoutEffect(fit, [fit, ui.ready, ui.analyzed]);

  // ---------- filmstrip ----------
  const step = dur > 60 ? dur / 60 : 1; // at most 60 tiles
  useEffect(() => {
    const src = ui.src;
    if (!src || !dur) return;
    const ac = new AbortController();
    void makeFilmstrip(src, dur, step, step * PPS, THUMB_H, ac.signal, (i, url) => {
      setStrip(st => { const urls = st?.src === src ? st.urls.slice() : []; urls[i] = url; return { src, urls }; });
    });
    return () => ac.abort();
  }, [ui.src, dur, step]);
  const thumbs = strip && strip.src === ui.src ? strip.urls : [];

  // ---------- timeline <-> playhead ----------
  // the playhead is fixed in the middle; the timeline scrolls under it
  const lastSet = useRef(-1);
  const pending = useRef<number | null>(null);
  const scrollTo = useCallback((t: number) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollLeft = t * PPS;
    lastSet.current = el.scrollLeft;
  }, []);

  // while playing, follow the video every frame (timeupdate is too coarse)
  useEffect(() => {
    if (!ui.playing) return;
    let raf = 0;
    const tick = () => { const t = videoRef.current?.currentTime ?? 0; setClock(t); scrollTo(t); raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [ui.playing, scrollTo]);
  useEffect(() => { if (!ui.playing) scrollTo(ui.time); }, [ui.time, ui.playing, scrollTo]);
  const shownTime = ui.playing ? clock : ui.time;

  function onTimelineScroll() {
    const el = scrollRef.current;
    if (!el || Math.abs(el.scrollLeft - lastSet.current) < 1) return; // our own scroll
    lastSet.current = el.scrollLeft;
    const t = Math.min(dur, el.scrollLeft / PPS);
    if (pending.current === null) requestAnimationFrame(() => { if (pending.current !== null) player()?.seek(pending.current); pending.current = null; });
    pending.current = t;
  }

  // ---------- messages ----------
  const toast = ui.status && ui.status !== seenStatus && ui.status !== 'Loading…' && ui.status !== 'Video loaded.' ? ui.status : '';
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setSeenStatus(toast), 3500);
    return () => clearTimeout(id);
  }, [toast]);
  const tip = ui.hint || (ui.ready && !ui.playing && !analyzing ? ui.tapStatus : '');

  // space bar plays/pauses on desktop
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || (e.target as HTMLElement).closest('input, button, a')) return;
      e.preventDefault(); player()?.togglePlay();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // ---------- actions ----------
  function pickEffect(fx: Effect) { setEffect(fx); setPal(DEFAULT_PAL[fx]); player()?.setEffect(fx); }
  function chooseFile() { fileRef.current?.click(); }
  function reselect() { player()?.clearTarget(); setTool(null); }
  function toggleTool(t: Tool) { setTool(cur => (cur === t ? null : t)); }

  const pct = (v: number, min: number, max: number) => ({ '--p': `${((v - min) / (max - min)) * 100}%` }) as CSSProperties;
  const swatchBg = (i: number) => { const c = PALETTES[i].c; return `radial-gradient(circle at 40% 40%, ${c[0]}, ${c[1]} 35%, ${c[2]} 70%, ${c[3]})`; };
  const fxLabel = EFFECTS.find(e => e.id === effect)!.label;

  const tools: { id: Tool | 'outline' | 'reselect'; label: string; icon: string; on?: boolean; disabled?: boolean }[] = [
    { id: 'media', label: 'Media', icon: I.media },
    { id: 'effects', label: 'Effects', icon: I.effects, disabled: !ui.ready },
    { id: 'color', label: 'Color', icon: I.color, disabled: !ui.ready },
    { id: 'adjust', label: 'Adjust', icon: I.adjust, disabled: !ui.ready },
    { id: 'outline', label: 'Outline', icon: I.outline, on: showOutline, disabled: !ui.ready },
    { id: 'reselect', label: 'Reselect', icon: I.target, disabled: !ui.tracked || ui.recording },
  ];

  let sheet: ReactNode = null;
  if (tool === 'media') sheet = (
    <div className="media-grid">
      <button type="button" className="big" onClick={() => { chooseFile(); setTool(null); }}><Icon d={I.media} size={26} />Choose video</button>
      <button type="button" className="big" onClick={() => { void player()?.toggleCamera(); setTool(null); }}><Icon d={I.camera} size={26} />{ui.camera ? 'Stop and edit' : 'Use camera'}</button>
    </div>
  );
  else if (tool === 'effects') sheet = (
    <div className="tiles" role="group" aria-label="Effect">
      {EFFECTS.map(fx => (
        <button key={fx.id} type="button" className="tile" aria-pressed={effect === fx.id} onClick={() => pickEffect(fx.id)}>
          <span className="tile-art" style={{ background: swatchBg(DEFAULT_PAL[fx.id]) }} />
          {fx.label}
        </button>
      ))}
    </div>
  );
  else if (tool === 'color') sheet = (
    <div className="tiles" role="group" aria-label="Color">
      {PALETTES.map((p, i) => (
        <button key={p.name} type="button" className="tile" aria-pressed={pal === i} onClick={() => { setPal(i); player()?.setPalette(i); }}>
          <span className="tile-art round" style={{ background: swatchBg(i) }} />
          {p.name}
        </button>
      ))}
    </div>
  );
  else if (tool === 'adjust') sheet = (
    <div className="sliders">
      <label className="slider">
        <span>Size</span>
        <input type="range" min={0.3} max={2.5} step={0.05} value={size} style={pct(size, 0.3, 2.5)}
          onChange={e => { const v = +e.target.value; setSize(v); player()?.setSize(v); }} />
        <output>{Math.round(size * 100)}</output>
      </label>
      <label className="slider">
        <span>Intensity</span>
        <input type="range" min={0.2} max={2} step={0.05} value={intensity} style={pct(intensity, 0.2, 2)}
          onChange={e => { const v = +e.target.value; setIntensity(v); player()?.setIntensity(v); }} />
        <output>{Math.round(intensity * 100)}</output>
      </label>
    </div>
  );
  const sheetTitle = tool && { media: 'Media', effects: 'Effects', color: 'Color', adjust: 'Adjust' }[tool];

  // ruler: a label every 2 s, a dot on the odd seconds
  const ticks = [];
  for (let s = 0; s <= Math.floor(dur); s++) ticks.push(
    <span key={s} className={s % 2 ? 'tick dot' : 'tick'} style={{ left: s * PPS }}>{s % 2 ? '' : mmss(s)}</span>,
  );

  return (
    <div className="editor">
      <header className="topbar">
        <button type="button" className="icon-btn" aria-label="Open a video" onClick={chooseFile}><Icon d={I.plus} /></button>
        <strong className="wordmark" aria-label="FlareCut">FLARE<em>CUT</em></strong>
        <button type="button" className="export" disabled={!ui.canRecord && !ui.recording} onClick={() => player()?.toggleRecord()}>
          {ui.recording ? 'Stop' : 'Export'}
        </button>
      </header>

      <section ref={stageRef} className="stage" aria-label="Video preview">
        <canvas ref={viewRef} className={`view${ui.tracked ? ' tracked' : ''}${ui.ready ? '' : ' hidden'}`} width={960} height={540}
          aria-label={ui.tracked ? 'Video with effect. Tap to play or pause.' : 'Video. Tap an object to choose what the effect follows.'} />
        {!ui.ready && !ui.camera && (
          <div className="empty">
            <button type="button" className="import" onClick={chooseFile}><Icon d={I.plus} size={28} /></button>
            <strong>New project</strong>
            <span>Import a clip under 20 seconds, then tap what the effect should follow.</span>
          </div>
        )}
        {analyzing && (
          <div className="analyzing" role="progressbar" aria-label="Tracking the object" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(ui.progress! * 100)}>
            <div className="ring" style={{ '--p': `${Math.round(ui.progress! * 100)}%` } as CSSProperties}><span>{Math.round(ui.progress! * 100)}%</span></div>
            Tracking…
          </div>
        )}
        <div className={`rec${ui.recording || ui.camera ? ' on' : ''}`}>REC</div>
        {tip && <div className="tip" aria-live="polite">{tip}</div>}
        {toast && <div className="toast" role="status">{toast}</div>}
      </section>

      <div className="transport" aria-label="Playback controls">
        <span className="time"><b>{mmss(shownTime)}</b> / {mmss(dur)}</span>
        <button type="button" className="play" disabled={!ui.ready || analyzing} aria-label={ui.playing ? 'Pause' : 'Play'} onClick={() => player()?.togglePlay()}>
          <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">
            <path d={ui.playing ? 'M7 5h3.5v14H7zM13.5 5H17v14h-3.5z' : 'M8 5.5v13a.5.5 0 0 0 .8.4l10-6.5a.5.5 0 0 0 0-.8l-10-6.5a.5.5 0 0 0-.8.4z'} fill="currentColor" />
          </svg>
        </button>
        <span className="time right" />
      </div>

      <div className="dock">
        <div className="timeline">
          <div ref={scrollRef} className="tl-scroll" onScroll={onTimelineScroll} aria-label="Timeline. Drag to scrub.">
            <div className="tl-inner" style={{ width: dur * PPS }}>
              <div className="ruler">{ticks}</div>
              <div className="lane clip" style={{ width: dur * PPS, height: THUMB_H }}>
                {ui.ready ? thumbs.map((u, i) => u && (
                  <span key={i} className="thumb" style={{ left: i * step * PPS, width: step * PPS, backgroundImage: `url(${u})` }} />
                )) : null}
              </div>
              <div className="lane fx-lane">
                {ui.coverage.map((sp, i) => (
                  <span key={i} className={`span${sp.weak ? ' weak' : ''}`} style={{ left: sp.s * PPS, width: Math.max(2, (sp.e - sp.s) * PPS) }}>
                    {!sp.weak && (sp.e - sp.s) * PPS > 70 && <><i style={{ background: PALETTES[pal].c[1] }} />{fxLabel}</>}
                  </span>
                ))}
                {ui.ready && !ui.tracked && <span className="add-hint">Tap an object in the preview to add an effect</span>}
              </div>
            </div>
          </div>
          <div className="playhead" aria-hidden="true" />
        </div>

        <nav className="toolbar" aria-label="Tools">
          {tools.map(t => (
            <button key={t.id} type="button" disabled={t.disabled}
              aria-pressed={t.id === 'outline' ? t.on : tool === t.id}
              onClick={() => {
                if (t.id === 'outline') { const on = !showOutline; setShowOutline(on); player()?.setShowOutline(on); }
                else if (t.id === 'reselect') reselect();
                else toggleTool(t.id);
              }}>
              <Icon d={t.icon} />
              <span>{t.label}</span>
            </button>
          ))}
        </nav>
      </div>

      {tool && (
        <div className="sheet" role="dialog" aria-label={sheetTitle!}>
          <div className="sheet-head">
            <strong>{sheetTitle}</strong>
            <button type="button" className="icon-btn" aria-label="Done" onClick={() => setTool(null)}><Icon d={I.check} /></button>
          </div>
          {sheet}
        </div>
      )}

      {ui.result && (
        <div className="result" role="dialog" aria-label="Your clip is ready">
          <div className="result-card">
            <video src={ui.result.url} controls playsInline autoPlay />
            <h2>Your clip is ready</h2>
            {!ui.result.hasAudio && <p>This recording has no sound.</p>}
            <div className="row">
              <button type="button" onClick={() => player()?.closeResult()}>Back to edit</button>
              <a className="btn primary" href={ui.result.url} download={`flarecut.${ui.result.ext}`}>Save video</a>
            </div>
          </div>
        </div>
      )}

      <input ref={fileRef} className="file-input" type="file" accept="video/*" tabIndex={-1} aria-hidden="true"
        onChange={e => { const f = e.target.files?.[0]; if (f) player()?.loadFile(f); e.target.value = ''; }} />
      <video ref={videoRef} className="src-video" playsInline preload="auto" />
    </div>
  );
}
