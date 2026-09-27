'use client';

// The editor page: top bar, preview, playback controls, and the dock (timeline, toolbar and tool
// panels). It keeps what's selected and which panel is open; all editing goes through the Player.
import { useCallback, useEffect, useRef, useState } from 'react';
import { DEFAULT_FX } from '@/application/editor';
import type { FxSettings } from '@/domain/effects/palettes';
import { ExportResult } from './ExportResult';
import { Icon, I } from './icons';
import { INITIAL_UI, Player, type Lane, type MakeThumbs, type UiState } from './player';
import { Preview } from './Preview';
import { Timeline } from './timeline/Timeline';
import { Toolbar, toolsFor, type Mode, type ToolKey } from './Toolbar';
import { TOOL_TITLES, ToolSheet, categoryName, type Category, type Pick, type Tool } from './ToolSheet';
import { Transport } from './Transport';

export default function VfxStudio() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const viewRef = useRef<HTMLCanvasElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const playerRef = useRef<Player | null>(null);
  const [ui, setUi] = useState<UiState>(INITIAL_UI);

  // what the dock shows
  const [tool, setTool] = useState<Tool | null>(null); // the open panel
  const [clipSel, setClipSel] = useState(false); // the video clip itself is selected
  const [catalog, setCatalog] = useState(false); // the toolbar lists the effect categories
  const [category, setCategory] = useState<Category | null>(null); // the category whose styles are open

  const [full, setFull] = useState(false);
  const [showOutline, setShowOutline] = useState(true);
  // settings for the next clip added, when none is selected
  const [draftFx, setDraftFx] = useState<FxSettings>(DEFAULT_FX);

  useEffect(() => {
    const player = new Player(videoRef.current!, viewRef.current!, setUi);
    playerRef.current = player;
    return () => {
      player.destroy();
      playerRef.current = null;
    };
  }, []);

  // space bar plays/pauses on desktop
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || (e.target as HTMLElement).closest('input, button, a')) return;
      e.preventDefault();
      playerRef.current?.togglePlay();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const player = () => playerRef.current;
  const currentTime = useCallback(() => playerRef.current?.time() ?? 0, []);
  const makeThumbs = useCallback<MakeThumbs>(async (...args) => playerRef.current?.filmstrip(...args), []);
  const scanning = ui.scan !== null;
  const busy = !ui.ready || scanning || ui.recording;
  const lane = ui.lanes.find(l => l.id === ui.selected) ?? null;
  // the settings the panels show and change: the selected clip's, or the only clip's
  const fxLane = lane ?? (ui.lanes.length === 1 ? ui.lanes[0] : null);
  const fx = fxLane?.fx ?? draftFx;
  const mode = modeFor(lane, clipSel, catalog);

  // ---------- actions ----------

  function changeFx(p: Partial<FxSettings>) {
    setDraftFx(cur => ({ ...cur, ...p }));
    player()?.setFx(p);
  }

  function chooseFile() {
    fileRef.current?.click();
  }

  function fileChosen(f: File) {
    player()?.loadFile(f);
    setClipSel(false);
    setTool(null);
  }

  function toggleOutline() {
    const on = !showOutline;
    setShowOutline(on);
    player()?.setShowOutline(on);
  }

  function deselect() {
    setClipSel(false);
    setCatalog(false);
    setTool(null);
    player()?.select(null);
  }

  function selectClip() {
    setTool(null);
    setCatalog(false);
    player()?.select(null);
    setClipSel(c => !c);
  }

  function selectLane(id: number) {
    setTool(null);
    setClipSel(false);
    setCatalog(false);
    player()?.select(ui.selected === id ? null : id);
  }

  // Effects: list the categories in the toolbar; Cancel while waiting for the tap
  function addEffect() {
    setClipSel(false);
    setTool(null);
    player()?.select(null);
    if (ui.adding) player()?.cancelAdding();
    else setCatalog(true);
  }

  // a style picked in a category: the next tap on the preview adds it there
  function pick(p: Pick) {
    setTool(null);
    setCatalog(false);
    player()?.startAdding(
      p.kind === 'impact'
        ? { kind: 'impact', style: p.style }
        : { kind: 'effect', fx: { effect: p.effect, pal: p.pal } },
    );
  }

  const buttons = toolsFor(mode, {
    ready: ui.ready,
    busy,
    recording: ui.recording,
    camera: ui.camera,
    adding: !!ui.adding || !!ui.choosing || ui.aiming !== null,
    outline: showOutline,
    muted: ui.muted,
    open: tool,
    hasKeys: !!lane?.keys.length,
    objects: ui.lanes.filter(l => l.kind === 'effect').length,
    laser: lane?.kind === 'effect' && lane.fx.effect === 'laser',
  });

  // a toolbar button pressed
  function runTool(key: ToolKey) {
    const pl = player();
    if (key.startsWith('cat-')) {
      setCategory(key.slice(4) as Category);
      setTool('styles');
      return;
    }
    switch (key) {
      case 'edit':
        if (!ui.ready) return chooseFile();
        setClipSel(true);
        pl?.select(null);
        return;
      case 'catalog':
        return addEffect();
      case 'cancel':
        return pl?.cancelAdding();
      case 'replace':
        return chooseFile();
      case 'camera':
        void pl?.toggleCamera();
        setClipSel(false);
        return;
      case 'outline':
        return toggleOutline();
      case 'mute':
        return pl?.setMuted(!ui.muted);
      case 'unfix':
        return pl?.removeFixHere();
      case 'swap':
        return pl?.swapHere();
      case 'effects':
      case 'color':
      case 'adjust':
      case 'impact':
      case 'aim':
        return setTool(cur => (cur === key ? null : key));
    }
    if (!lane) return;
    switch (key) {
      case 'hithere':
        return pl?.moveImpact(lane.id);
      case 'start':
        return pl?.rangeHere(lane.id, 's');
      case 'end':
        return pl?.rangeHere(lane.id, 'e');
      case 'delete':
        setTool(null);
        return pl?.deleteTrack(lane.id);
    }
  }

  return (
    <div className={`editor${full ? ' full' : ''}`}>
      <header className="topbar">
        <button type="button" className="icon-btn" aria-label="Open a video" onClick={chooseFile}>
          <Icon d={I.plus} />
        </button>
        <strong className="wordmark" aria-label="FlareCut">
          FLARE<em>CUT</em>
        </strong>
        <button
          type="button"
          className="export"
          disabled={!ui.canRecord && !ui.recording}
          onClick={() => player()?.toggleRecord()}
        >
          {ui.recording ? 'Stop' : 'Export'}
        </button>
      </header>

      <Preview
        ui={ui}
        canvasRef={viewRef}
        full={full}
        pointer={!!ui.lanes.length && !ui.adding && !lane}
        onChooseFile={chooseFile}
      />

      <Transport
        ready={ui.ready}
        canPlay={ui.ready && !scanning}
        playing={ui.playing}
        time={ui.time}
        duration={ui.duration}
        currentTime={currentTime}
        full={full}
        outline={showOutline}
        onFull={() => setFull(f => !f)}
        onPlay={() => player()?.togglePlay()}
        onOutline={toggleOutline}
      />

      <div className="dock">
        <Timeline
          ui={ui}
          clipSelected={clipSel}
          busy={busy}
          currentTime={currentTime}
          soundShape={l => player()?.soundShape(l) ?? []}
          makeThumbs={makeThumbs}
          on={{
            seek: t => player()?.seek(t),
            deselect,
            selectClip,
            selectLane,
            chooseFile,
            addEffect,
            setRange: (id, r) => player()?.setRange(id, r),
            commitRange: id => player()?.commitRange(id),
            moveImpact: (id, t) => player()?.moveImpact(id, t),
          }}
        />
        <Toolbar
          label={toolbarLabel(mode, lane)}
          buttons={buttons}
          onPress={runTool}
          onBack={mode ? deselect : undefined}
        />
        {ui.choosing && (
          <ToolSheet
            tool="parts"
            title={TOOL_TITLES.parts}
            fx={fx}
            onChange={changeFx}
            onClose={() => player()?.cancelAdding()}
            suggested={ui.choosing.suggested}
            onPart={p => player()?.choosePart(p)}
          />
        )}
        {tool && !ui.choosing && (
          <ToolSheet
            tool={tool}
            title={
              tool === 'styles' && category
                ? categoryName(category)
                : TOOL_TITLES[tool] + (fxLane && ui.lanes.length > 1 ? ` · ${fxLane.name}` : '')
            }
            fx={fx}
            onChange={changeFx}
            onClose={() => setTool(null)}
            category={category}
            onPick={pick}
            impact={lane?.impact}
            onImpact={st => lane && player()?.setImpactStyle(lane.id, st)}
            aim={lane?.aim}
            onAim={
              lane
                ? {
                    angle: deg => player()?.setAimAngle(lane.id, deg),
                    target: () => {
                      setTool(null);
                      player()?.startAiming(lane.id);
                    },
                    clear: () => player()?.clearAimTarget(lane.id),
                  }
                : undefined
            }
          />
        )}
      </div>

      {ui.result && <ExportResult result={ui.result} onClose={() => player()?.closeResult()} />}

      <input
        ref={fileRef}
        className="file-input"
        type="file"
        accept="video/*"
        tabIndex={-1}
        aria-hidden="true"
        onChange={e => {
          const f = e.target.files?.[0];
          if (f) fileChosen(f);
          e.target.value = '';
        }}
      />
      <video ref={videoRef} className="src-video" playsInline preload="auto" />
    </div>
  );
}

// what the toolbar lists: a selected effect's or impact's tools, the video clip's, the effect
// categories, or the main tools
function modeFor(lane: Lane | null, clipSelected: boolean, catalog: boolean): Mode {
  if (lane) return lane.kind === 'impact' ? 'impact' : 'track';
  if (clipSelected) return 'clip';
  if (catalog) return 'catalog';
  return null;
}

function toolbarLabel(mode: Mode, lane: Lane | null) {
  if (mode === 'catalog') return 'Effects';
  if (mode === 'clip') return 'Clip tools';
  return lane ? `${lane.name} tools` : 'Tools';
}
