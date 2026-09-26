'use client';

// The editor page: top bar, preview, playback controls, and the dock (timeline, toolbar and
// tool panels). All editing goes through the Player.
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import type { FxSettings } from '@/domain/effects/palettes';
import { DEFAULT_FX } from '@/application/editor';
import { INITIAL_UI, Player, type UiState } from './player';
import { Icon, I } from './icons';
import { Timeline } from './Timeline';
import { Toolbar, toolsFor, type Mode, type ToolKey } from './Toolbar';
import { TOOL_TITLES, ToolSheet, categoryName, type Category, type Pick, type Tool } from './ToolSheet';

export default function VfxStudio() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const viewRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const playerRef = useRef<Player | null>(null);
  const [ui, setUi] = useState<UiState>(INITIAL_UI);
  const [tool, setTool] = useState<Tool | null>(null);
  const [clipSel, setClipSel] = useState(false);
  // the toolbar lists the effect categories; the category whose styles are open
  const [catalog, setCatalog] = useState(false);
  const [category, setCategory] = useState<Category | null>(null);
  // preview zoom: scale and pan of the preview (view only; export is unaffected)
  const [zoom, setZoom] = useState({ k: 1, x: 0, y: 0 });
  const [full, setFull] = useState(false);
  // effect settings for the next object tapped, when none is selected
  const [draftFx, setDraftFx] = useState<FxSettings>(DEFAULT_FX);
  const [showOutline, setShowOutline] = useState(true);
  const [seenStatus, setSeenStatus] = useState('');

  useEffect(() => {
    const player = new Player(videoRef.current!, viewRef.current!, setUi);
    playerRef.current = player;
    return () => { player.destroy(); playerRef.current = null; };
  }, []);

  const player = () => playerRef.current;
  const scanning = ui.scan !== null;
  const busy = !ui.ready || scanning || ui.recording;
  const lane = ui.lanes.find(l => l.id === ui.selected) ?? null;
  // the settings the panels show and change: the selected object's, or the only object's
  const fxLane = lane ?? (ui.lanes.length === 1 ? ui.lanes[0] : null);
  const fx = fxLane?.fx ?? draftFx;
  const mode: Mode = lane ? (lane.kind === 'impact' ? 'impact' : 'track') : clipSel ? 'clip' : catalog ? 'catalog' : null;
  const currentTime = useCallback(() => playerRef.current?.time() ?? 0, []);

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
  useLayoutEffect(fit, [fit, ui.ready, scanning, full, ui.lanes.length]);

  // ---------- preview zoom: pinch (or Ctrl/⌘ + scroll) to zoom, two fingers to move around ----------
  // a new clip starts unzoomed
  const [zoomSrc, setZoomSrc] = useState(ui.src);
  if (zoomSrc !== ui.src) { setZoomSrc(ui.src); setZoom({ k: 1, x: 0, y: 0 }); }
  const zoomRef = useRef(zoom);
  useEffect(() => { zoomRef.current = zoom; }, [zoom]);
  useEffect(() => {
    const st = stageRef.current, cv = viewRef.current;
    if (!st || !cv) return;
    const MAX = 5;
    // zoom to k around client point (px, py), then pan by (dx, dy); kept covering the preview
    const zoomAt = (k: number, px: number, py: number, dx = 0, dy = 0) => {
      const z = zoomRef.current, r = cv.getBoundingClientRect(), w = r.width / z.k, h = r.height / z.k;
      const L = r.left - z.x, T = r.top - z.y, nk = Math.max(1, Math.min(MAX, k));
      let x = (px - L) - (px - L - z.x) * nk / z.k + dx, y = (py - T) - (py - T - z.y) * nk / z.k + dy;
      x = Math.min(0, Math.max(w * (1 - nk), x)); y = Math.min(0, Math.max(h * (1 - nk), y));
      const next = nk === 1 ? { k: 1, x: 0, y: 0 } : { k: nk, x, y };
      zoomRef.current = next; setZoom(next);
    };
    let pinch: { d: number; mx: number; my: number } | null = null;
    const two = (e: TouchEvent) => {
      const [a, b] = [e.touches[0], e.touches[1]];
      return { d: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), mx: (a.clientX + b.clientX) / 2, my: (a.clientY + b.clientY) / 2 };
    };
    const start = (e: TouchEvent) => { if (e.touches.length === 2) { pinch = two(e); e.preventDefault(); } };
    const move = (e: TouchEvent) => {
      if (!pinch || e.touches.length !== 2) return;
      e.preventDefault();
      const now = two(e), z = zoomRef.current;
      zoomAt(z.k * now.d / Math.max(1, pinch.d), now.mx, now.my, now.mx - pinch.mx, now.my - pinch.my);
      pinch = now;
    };
    const end = (e: TouchEvent) => { if (e.touches.length < 2) pinch = null; };
    const wheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      zoomAt(zoomRef.current.k * Math.exp(-e.deltaY * 0.01), e.clientX, e.clientY);
    };
    st.addEventListener('touchstart', start, { passive: false });
    st.addEventListener('touchmove', move, { passive: false });
    st.addEventListener('touchend', end);
    st.addEventListener('touchcancel', end);
    st.addEventListener('wheel', wheel, { passive: false });
    return () => {
      st.removeEventListener('touchstart', start); st.removeEventListener('touchmove', move);
      st.removeEventListener('touchend', end); st.removeEventListener('touchcancel', end); st.removeEventListener('wheel', wheel);
    };
  }, []);

  // ---------- messages ----------
  const toast = ui.status && ui.status !== seenStatus && ui.status !== 'Loading…' && ui.status !== 'Video loaded.' ? ui.status : '';
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setSeenStatus(toast), 3500);
    return () => clearTimeout(id);
  }, [toast]);

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
  function changeFx(p: Partial<FxSettings>) { setDraftFx(cur => ({ ...cur, ...p })); player()?.setFx(p); }
  function chooseFile() { fileRef.current?.click(); }
  function toggleOutline() { const on = !showOutline; setShowOutline(on); player()?.setShowOutline(on); }
  function deselect() { setClipSel(false); setCatalog(false); setTool(null); player()?.select(null); }
  function selectClip() { setTool(null); setCatalog(false); player()?.select(null); setClipSel(c => !c); }
  function selectLane(id: number) { setTool(null); setClipSel(false); setCatalog(false); player()?.select(ui.selected === id ? null : id); }
  // Effects: list the categories in the toolbar; Cancel while waiting for the tap
  function addEffect() {
    setClipSel(false); setTool(null); player()?.select(null);
    if (ui.adding) { player()?.cancelAdding(); return; }
    setCatalog(true);
  }
  // a style picked in a category: the next tap on the preview adds it there
  function pick(p: Pick) {
    setTool(null); setCatalog(false);
    player()?.startAdding(p.kind === 'impact' ? { kind: 'impact', style: p.style } : { kind: 'effect', fx: { effect: p.effect, pal: p.pal } });
  }

  const buttons = toolsFor(mode, {
    ready: ui.ready, busy, recording: ui.recording, camera: ui.camera, adding: !!ui.adding, outline: showOutline, muted: ui.muted,
    open: tool, hasKeys: !!lane?.keys.length, objects: ui.lanes.filter(l => l.kind === 'effect').length,
  });
  function runTool(key: ToolKey) {
    const pl = player();
    if (key === 'edit') { if (ui.ready) { setClipSel(true); pl?.select(null); } else chooseFile(); }
    else if (key === 'catalog') addEffect();
    else if (key === 'cancel') pl?.cancelAdding();
    else if (key.startsWith('cat-')) { setCategory(key.slice(4) as Category); setTool('styles'); }
    else if (key === 'hithere' && lane) pl?.moveImpact(lane.id);
    else if (key === 'replace') chooseFile();
    else if (key === 'camera') { void pl?.toggleCamera(); setClipSel(false); }
    else if (key === 'outline') toggleOutline();
    else if (key === 'mute') pl?.setMuted(!ui.muted);
    else if (key === 'start' && lane) pl?.rangeHere(lane.id, 's');
    else if (key === 'end' && lane) pl?.rangeHere(lane.id, 'e');
    else if (key === 'unfix') pl?.removeFixHere();
    else if (key === 'swap') pl?.swapHere();
    else if (key === 'delete' && lane) { setTool(null); pl?.deleteTrack(lane.id); }
    else if (key === 'effects' || key === 'color' || key === 'adjust' || key === 'impact') setTool(cur => (cur === key ? null : key));
  }

  return (
    <div className={`editor${full ? ' full' : ''}`}>
      <header className="topbar">
        <button type="button" className="icon-btn" aria-label="Open a video" onClick={chooseFile}><Icon d={I.plus} /></button>
        <strong className="wordmark" aria-label="FlareCut">FLARE<em>CUT</em></strong>
        <button type="button" className="export" disabled={!ui.canRecord && !ui.recording} onClick={() => player()?.toggleRecord()}>
          {ui.recording ? 'Stop' : 'Export'}
        </button>
      </header>

      <section ref={stageRef} className="stage" aria-label="Video preview">
        <canvas ref={viewRef} className={`view${ui.lanes.length && !ui.adding && !lane ? ' tracked' : ''}${ui.ready ? '' : ' hidden'}`} width={960} height={540}
          style={zoom.k > 1 ? { transform: `translate(${zoom.x}px, ${zoom.y}px) scale(${zoom.k})` } : undefined}
          aria-label="Video. Tap an object to track it. Pinch to zoom." />
        {zoom.k > 1 && (
          <button type="button" className="zoom-reset" onClick={() => setZoom({ k: 1, x: 0, y: 0 })} aria-label="Reset zoom">
            <Icon d={I.shrink} size={16} />{Math.round(zoom.k * 100)}%
          </button>
        )}
        {!ui.ready && !ui.camera && (
          <div className="empty">
            <button type="button" className="import" onClick={chooseFile}><Icon d={I.plus} size={28} /></button>
            <strong>New project</strong>
            <span>Import a clip under 20 seconds, then tap what the effect should follow.</span>
          </div>
        )}
        {scanning && (
          <div className="analyzing" role="progressbar" aria-label="Reading the clip" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(ui.scan! * 100)}>
            <div className="ring" style={{ '--p': `${Math.round(ui.scan! * 100)}%` } as CSSProperties}><span>{Math.round(ui.scan! * 100)}%</span></div>
            Reading clip…
          </div>
        )}
        {ui.job && !scanning && (
          <div className="job" role="status">
            <span className="job-bar" style={{ '--p': `${Math.round(ui.job.progress * 100)}%` } as CSSProperties} />
            {ui.job.label}
          </div>
        )}
        <div className={`rec${ui.recording || ui.camera ? ' on' : ''}`}>REC</div>
        {ui.hint && !ui.job && <div className="tip" aria-live="polite">{ui.hint}</div>}
        {toast && <div className="toast" role="status">{toast}</div>}
      </section>

      <div className="transport" aria-label="Playback controls">
        <button type="button" className="icon-btn" disabled={!ui.ready} aria-label={full ? 'Exit full screen' : 'Full screen'} onClick={() => setFull(f => !f)}>
          <Icon d={full ? I.shrink : I.expand} size={20} />
        </button>
        <button type="button" className="play" disabled={!ui.ready || scanning} aria-label={ui.playing ? 'Pause' : 'Play'} onClick={() => player()?.togglePlay()}>
          <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">
            <path d={ui.playing ? 'M7 5h3.5v14H7zM13.5 5H17v14h-3.5z' : 'M8 5.5v13a.5.5 0 0 0 .8.4l10-6.5a.5.5 0 0 0 0-.8l-10-6.5a.5.5 0 0 0-.8.4z'} fill="currentColor" />
          </svg>
        </button>
        <button type="button" className="icon-btn" disabled={!ui.ready} aria-pressed={showOutline} aria-label="Show outlines" onClick={toggleOutline}>
          <Icon d={I.eye} size={20} />
        </button>
      </div>

      <div className="dock">
        <Timeline ui={ui} clipSelected={clipSel} busy={busy} currentTime={currentTime} soundShape={l => player()?.soundShape(l) ?? []} on={{
          seek: t => player()?.seek(t), toggleMute: () => player()?.setMuted(!ui.muted), deselect, selectClip, selectLane, chooseFile, addEffect,
          setRange: (id, r) => player()?.setRange(id, r),
          commitRange: id => player()?.commitRange(id),
          moveImpact: (id, t) => player()?.moveImpact(id, t),
        }} />
        <Toolbar label={mode === 'catalog' ? 'Effects' : mode === 'clip' ? 'Clip tools' : lane ? `${lane.name} tools` : 'Tools'} buttons={buttons} onPress={runTool}
          onBack={mode ? deselect : undefined} />
        {tool && (
          <ToolSheet tool={tool} fx={fx} onChange={changeFx} onClose={() => setTool(null)}
            category={category} onPick={pick}
            impact={lane?.impact} onImpact={st => lane && player()?.setImpactStyle(lane.id, st)}
            title={tool === 'styles' && category ? categoryName(category) : TOOL_TITLES[tool] + (fxLane && ui.lanes.length > 1 ? ` · ${fxLane.name}` : '')} />
        )}
      </div>

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
        onChange={e => { const f = e.target.files?.[0]; if (f) { player()?.loadFile(f); setClipSel(false); setTool(null); } e.target.value = ''; }} />
      <video ref={videoRef} className="src-video" playsInline preload="auto" />
    </div>
  );
}
