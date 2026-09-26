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
import { TOOL_TITLES, ToolSheet, type Tool } from './ToolSheet';

export default function VfxStudio() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const viewRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const playerRef = useRef<Player | null>(null);
  const [ui, setUi] = useState<UiState>(INITIAL_UI);
  const [tool, setTool] = useState<Tool | null>(null);
  const [clipSel, setClipSel] = useState(false);
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
  const mode: Mode = lane ? 'track' : clipSel ? 'clip' : null;
  const currentTime = useCallback(() => videoRef.current?.currentTime ?? 0, []);

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
  function deselect() { setClipSel(false); setTool(null); player()?.select(null); }
  function selectClip() { setTool(null); player()?.select(null); setClipSel(c => !c); }
  function selectLane(id: number) { setTool(null); setClipSel(false); player()?.select(ui.selected === id ? null : id); }
  function addObject() { setClipSel(false); setTool(null); if (ui.adding) player()?.cancelAdding(); else player()?.startAdding(); }

  const buttons = toolsFor(mode, {
    ready: ui.ready, busy, recording: ui.recording, camera: ui.camera, adding: ui.adding, outline: showOutline,
    open: tool, hasKeys: !!lane?.keys.length, objects: ui.lanes.length,
  });
  function runTool(key: ToolKey) {
    const pl = player(), now = currentTime();
    if (key === 'edit') { if (ui.ready) { setClipSel(true); pl?.select(null); } else chooseFile(); }
    else if (key === 'add') addObject();
    else if (key === 'replace') chooseFile();
    else if (key === 'camera') { void pl?.toggleCamera(); setClipSel(false); }
    else if (key === 'outline') toggleOutline();
    else if (key === 'start' && lane) pl?.setRange(lane.id, { s: now });
    else if (key === 'end' && lane) pl?.setRange(lane.id, { e: now });
    else if (key === 'unfix') pl?.removeFixHere();
    else if (key === 'swap') pl?.swapHere();
    else if (key === 'delete' && lane) { setTool(null); pl?.deleteTrack(lane.id); }
    else if (key === 'effects' || key === 'color' || key === 'adjust') setTool(cur => (cur === key ? null : key));
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
          aria-label="Video. Tap an object to track it." />
        {!ui.ready && !ui.camera && (
          <div className="empty">
            <button type="button" className="import" onClick={chooseFile}><Icon d={I.plus} size={28} /></button>
            <strong>New project</strong>
            <span>Import a clip under 20 seconds, then tap what the effect should follow.</span>
          </div>
        )}
        {scanning && (
          <div className="analyzing" role="progressbar" aria-label="Scanning the clip" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(ui.scan! * 100)}>
            <div className="ring" style={{ '--p': `${Math.round(ui.scan! * 100)}%` } as CSSProperties}><span>{Math.round(ui.scan! * 100)}%</span></div>
            Finding cuts…
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
        <Timeline ui={ui} clipSelected={clipSel} busy={busy} currentTime={currentTime} on={{
          seek: t => player()?.seek(t), deselect, selectClip, selectLane, chooseFile, addObject,
          goToShot: (id, shot) => { setClipSel(false); player()?.goToShot(id, shot); },
          setRange: (id, r) => player()?.setRange(id, r),
        }} />
        <Toolbar label={mode === 'clip' ? 'Clip tools' : lane ? `${lane.name} tools` : 'Tools'} buttons={buttons} onPress={runTool}
          onBack={mode ? deselect : undefined} />
        {tool && (
          <ToolSheet tool={tool} fx={fx} onChange={changeFx} onClose={() => setTool(null)}
            title={TOOL_TITLES[tool] + (fxLane && ui.lanes.length > 1 ? ` · ${fxLane.name}` : '')} />
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
