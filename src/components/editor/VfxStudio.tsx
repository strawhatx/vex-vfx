'use client';

// The editor page: top bar, preview, playback controls, and the dock (timeline, toolbar and tool
// panels). It keeps what's selected (a film, or a clip on it) and which panel is open; all editing
// goes through the Player. The toolbar's two menus keep effects and the footage apart: Effects
// adds effects and impacts; Footage splits the film and cuts objects out of it.
import { useCallback, useEffect, useRef, useState } from 'react';
import { DEFAULT_FX } from '@/application/editor';
import { IMPACTS, familyOf, type ImpactStyle } from '@/domain/effects/impacts';
import type { Effect, FxSettings } from '@/domain/effects/palettes';
import { ExportResult } from './ExportResult';
import { Icon, I } from './icons';
import { INITIAL_UI, Player, type Lane, type MakeThumbs, type UiState } from './player';
import { Preview } from './Preview';
import { Timeline } from './timeline/Timeline';
import { Toolbar, toolsFor, type Mode, type ToolKey } from './Toolbar';
import {
  TOOL_TITLES,
  ToolSheet,
  categoryName,
  hasLooks,
  type Category,
  type Pick,
  type Tool,
} from './ToolSheet';
import { Transport } from './Transport';

// which list of categories the toolbar shows, if any
type Catalog = 'effects' | 'elements' | 'impacts' | null;

export default function VfxStudio() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const viewRef = useRef<HTMLCanvasElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const playerRef = useRef<Player | null>(null);
  const [ui, setUi] = useState<UiState>(INITIAL_UI);

  // what the dock shows
  const [tool, setTool] = useState<Tool | null>(null); // the open panel
  const [scene, setScene] = useState<number | null>(null); // the film (scene) selected
  // the toolbar lists the effect categories, or the impact families
  const [catalog, setCatalog] = useState<Catalog>(null);
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

  // on desktop: the space bar plays/pauses; Ctrl/⌘+Z undoes, Ctrl/⌘+Shift+Z (or Ctrl+Y) redoes
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement).closest('input[type="text"], textarea');
      const mod = e.metaKey || e.ctrlKey;
      if (mod && !typing && (e.key.toLowerCase() === 'z' || e.key.toLowerCase() === 'y')) {
        e.preventDefault();
        if (e.key.toLowerCase() === 'y' || e.shiftKey) playerRef.current?.redo();
        else playerRef.current?.undo();
        return;
      }
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
  const mode = modeFor(lane, scene !== null, catalog);
  const cutout = lane?.kind === 'cutout' ? lane : null;

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
    setScene(null);
    setTool(null);
  }

  function toggleOutline() {
    const on = !showOutline;
    setShowOutline(on);
    player()?.setShowOutline(on);
  }

  function deselect() {
    setScene(null);
    setCatalog(null);
    setTool(null);
    player()?.select(null);
  }

  // a film tapped on the timeline: its footage tools, with the playhead moved into it
  function selectScene(k: number) {
    setTool(null);
    setCatalog(null);
    player()?.select(null);
    if (scene === k) return setScene(null);
    setScene(k);
    const sc = ui.scenes[k],
      t = player()?.time() ?? 0;
    if (sc && (t < sc.at || t >= sc.at + sc.e - sc.s)) player()?.seek(sc.at);
  }

  function selectLane(id: number) {
    setTool(null);
    setScene(null);
    setCatalog(null);
    player()?.select(ui.selected === id ? null : id);
  }

  // Effects: list the categories in the toolbar; Cancel while waiting for the tap
  function addEffect() {
    setScene(null);
    setTool(null);
    player()?.select(null);
    if (ui.adding) player()?.cancelAdding();
    else setCatalog('effects');
  }

  // Back from the Elements or Impact menu: the effect categories again
  function backToCatalog() {
    setTool(null);
    setCatalog('effects');
  }

  // a style picked in a category: the next tap on the preview adds it there
  function pick(p: Pick) {
    setTool(null);
    setCatalog(null);
    player()?.startAdding(
      p.kind === 'impact'
        ? { kind: 'impact', style: p.style, fx: startPal(p.style) }
        : { kind: 'effect', fx: { effect: p.effect, pal: p.pal, ...p.fx } },
    );
  }

  const buttons = toolsFor(mode, {
    ready: ui.ready,
    busy,
    recording: ui.recording,
    camera: ui.camera,
    adding: !!ui.adding || !!ui.choosing || ui.aiming !== null || ui.attaching !== null,
    outline: showOutline,
    muted: ui.muted,
    open: tool,
    hasKeys: !!lane?.keys.length,
    pinned: !!lane?.pinned,
    objects: ui.lanes.filter(l => l.kind === 'effect' && !l.pinned).length,
    laser: lane?.kind === 'effect' && lane.fx.effect === 'laser',
    looks: lane?.kind === 'effect' && hasLooks(lane.fx.effect),
    words: lane?.kind === 'effect' && lane.fx.effect === 'text',
    colors: lane?.kind === 'impact' || (lane?.fx.effect !== 'glitch' && lane?.fx.effect !== 'water'),
    impact: lane?.kind === 'impact' && lane.impact ? familyOf(lane.impact) : null,
    moveKey: !!cutout && !!ui.cutoutNow?.onKey,
    films: ui.scenes.length,
    path: !!lane?.path,
    pathEnd: !!lane?.path?.end,
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
        setScene(pl?.sceneNow() ?? 0);
        pl?.select(null);
        return;
      case 'split':
        pl?.splitHere();
        return setScene(pl?.sceneNow() ?? null);
      case 'deletescene':
        if (scene !== null) pl?.deleteScene(scene);
        return setScene(null);
      case 'cutout':
        if (lane) break; // (a cutout's own tools don't have this)
        setTool(null);
        setScene(null);
        return pl?.startAdding({ kind: 'cutout' });
      case 'catalog':
        return addEffect();
      case 'elements':
      case 'impacts':
        setTool(null);
        return setCatalog(key);
      case 'cancel':
        return pl?.cancelAdding();
      case 'replace':
        return chooseFile();
      case 'camera':
        void pl?.toggleCamera();
        setScene(null);
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
      case 'look':
      case 'words':
      case 'aim':
      case 'transform':
      case 'background':
      case 'form':
      case 'finish':
      case 'shape':
        return setTool(cur => (cur === key ? null : key));
    }
    if (!lane) return;
    switch (key) {
      case 'movekey':
        return pl?.toggleMoveKey(lane.id);
      case 'attach':
        setTool(null);
        return lane.path?.end ? pl?.freePathEnd(lane.id) : pl?.startAttaching(lane.id);
      case 'place':
        return pl?.placeCutout(lane.id);
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
        <div className="top-tools">
          <button type="button" className="icon-btn" aria-label="Open a video" onClick={chooseFile}>
            <Icon d={I.plus} />
          </button>
          <button
            type="button"
            className="icon-btn"
            aria-label="Undo"
            title="Undo (⌘Z)"
            disabled={!ui.canUndo || ui.recording}
            onClick={() => player()?.undo()}
          >
            <Icon d={I.undo} />
          </button>
          <button
            type="button"
            className="icon-btn"
            aria-label="Redo"
            title="Redo (⇧⌘Z)"
            disabled={!ui.canRedo || ui.recording}
            onClick={() => player()?.redo()}
          >
            <Icon d={I.redo} />
          </button>
        </div>
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
          scene={scene}
          busy={busy}
          currentTime={currentTime}
          soundShape={l => player()?.soundShape(l) ?? []}
          makeThumbs={makeThumbs}
          on={{
            seek: t => player()?.seek(t),
            deselect,
            selectScene,
            selectLane,
            chooseFile,
            addEffect,
            setRange: (id, r) => player()?.setRange(id, r),
            commitRange: id => player()?.commitRange(id),
            moveImpact: (id, t) => player()?.moveImpact(id, t),
            moveCutout: (id, t) => player()?.placeCutout(id, t),
          }}
        />
        <Toolbar
          label={toolbarLabel(mode, lane)}
          buttons={buttons}
          onPress={runTool}
          onBack={mode === 'impacts' || mode === 'elements' ? backToCatalog : mode ? deselect : undefined}
        />
        {ui.choosing && (
          <ToolSheet
            tool="parts"
            title={ui.choosing.spot ? 'Comes from' : TOOL_TITLES.parts}
            fx={fx}
            onChange={changeFx}
            onClose={() => player()?.cancelAdding()}
            suggested={ui.choosing.suggested}
            spot={ui.choosing.spot ? spotName(ui.choosing.effect) : undefined}
            onPart={p => player()?.choosePart(p)}
          />
        )}
        {ui.cutting && (
          <ToolSheet
            tool="background"
            title="Where it was cut from"
            fx={fx}
            onChange={changeFx}
            onClose={() => player()?.cancelAdding()}
            onBackground={bg => player()?.chooseBackground(bg)}
          />
        )}
        {tool && !ui.choosing && !ui.cutting && (
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
                    set: p => player()?.setAim(lane.id, p),
                    target: () => {
                      setTool(null);
                      player()?.startAiming(lane.id);
                    },
                    clear: () => player()?.clearAimTarget(lane.id),
                  }
                : undefined
            }
            bg={cutout?.cutout?.bg}
            onBackground={bg => cutout && player()?.setBackground(cutout.id, bg)}
            transform={cutout ? ui.cutoutNow?.transform : null}
            keyed={!!ui.cutoutNow?.keyed}
            onTransform={p => cutout && player()?.setTransform(cutout.id, p)}
            onReset={() => cutout && player()?.resetTransform(cutout.id)}
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

// what coming from the spot tapped means for this effect: the whole frame for a glitch or water
const spotName = (effect: Effect) =>
  effect === 'glitch' || effect === 'water' ? 'Whole frame' : 'This spot';

// the palette a new impact of this style starts with, if it has its own
function startPal(style: ImpactStyle): Partial<FxSettings> | undefined {
  const pal = IMPACTS[style].pal;
  return pal === undefined ? undefined : { pal };
}

// what the toolbar lists: a selected effect's, impact's or cutout's tools, the footage tools (a
// film selected), the effect categories, or the main tools
function modeFor(lane: Lane | null, clipSelected: boolean, catalog: Catalog): Mode {
  if (lane) return lane.kind === 'impact' ? 'impact' : lane.kind === 'cutout' ? 'cutout' : 'track';
  if (clipSelected) return 'clip';
  if (catalog === 'impacts') return 'impacts';
  if (catalog === 'elements') return 'elements';
  if (catalog) return 'catalog';
  return null;
}

function toolbarLabel(mode: Mode, lane: Lane | null) {
  if (mode === 'catalog') return 'Effects';
  if (mode === 'impacts') return 'Impacts';
  if (mode === 'elements') return 'Elements';
  if (mode === 'clip') return 'Footage';
  return lane ? `${lane.name} tools` : 'Tools';
}
