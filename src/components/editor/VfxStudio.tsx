'use client';

// The editor page: top bar, preview, playback controls, and the dock (timeline, toolbar and tool
// panels). It keeps what's selected (a film, or a clip on it) and which panel is open; all editing
// goes through the Player. The main tools, like CapCut's: Edit (the footage: split, delete, replace),
// Text, Effects (effects, impacts, and video effects over the whole frame), Filters, and Overlay (an
// object cut out of the footage). Each kind of clip has a layer of its own on the timeline.
import { useCallback, useEffect, useRef, useState } from 'react';
import { DEFAULT_FX } from '@/application/editor';
import { IMPACTS, familyOf, type ImpactStyle } from '@/domain/effects/impacts';
import type { Effect, FxSettings } from '@/domain/effects/palettes';
import { ExportResult } from './ExportResult';
import { PresetControls, PresetSheet, type MenuGroup } from './LookSheet';
import { CustomizeSheet } from './custom/CustomizeSheet';
import { MY_OWN } from '@/domain/effects/custom';
import { AnimSheet } from './AnimSheet';
import { TransitionSheet } from './TransitionSheet';
import { EffectClipControls, PackSheet } from './PackSheet';
import { playTime } from '@/application/project';
import { fitDuration } from '@/domain/project/transitions';
import { lookGroup } from '@/domain/project/looks';
import { Icon, I } from './icons';
import { INITIAL_UI, Player, type AnimTarget, type Lane, type MakeThumbs, type UiState } from './player';
import { Preview } from './Preview';
import { RotoDock, RotoHeader, type RotoActions } from './roto/RotoScreen';
import { CropDock, CropHeader, type CropActions } from './CropScreen';
import { Timeline } from './timeline/Timeline';
import { OBJECT_CATEGORIES, Toolbar, toolsFor, type Mode, type ToolKey } from './Toolbar';
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

// the tools whose panels aren't ToolSheet's
const SHEETS_OF_THEIR_OWN = new Set<Tool>(['presets', 'controls', 'customize', 'animation']);

// which list of categories the toolbar shows, if any
type Catalog = 'effects' | 'custom' | null;

// id: the project's, which it's saved under on this device
export default function VfxStudio({ id }: { id: string }) {
  const viewRef = useRef<HTMLCanvasElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLInputElement>(null);
  const playerRef = useRef<Player | null>(null);
  const [ui, setUi] = useState<UiState>(INITIAL_UI);

  // what the dock shows
  const [tool, setTool] = useState<Tool | null>(null); // the open panel
  const [scene, setScene] = useState<number | null>(null); // the film (scene) selected
  // the toolbar lists the effect categories, or the impact families
  const [catalog, setCatalog] = useState<Catalog>(null);
  // an effect made from nothing is being placed: once it's there, straight on to making it
  const [customizeNext, setCustomizeNext] = useState(false);
  const [category, setCategory] = useState<Category | null>(null); // the category whose styles are open
  // a group's presets open to add a look from (filters, or video effects)
  const [lookMenu, setLookMenu] = useState<MenuGroup | null>(null);
  // the join (into this film) whose transition is being picked
  const [join, setJoin] = useState<number | null>(null);
  // the effects library open, to place one of its clips
  const [packMenu, setPackMenu] = useState(false);

  const [full, setFull] = useState(false);
  const [showOutline, setShowOutline] = useState(true);
  // settings for the next clip added, when none is selected
  const [draftFx, setDraftFx] = useState<FxSettings>(DEFAULT_FX);

  useEffect(() => {
    const player = new Player(viewRef.current!, setUi, id);
    playerRef.current = player;
    return () => {
      player.destroy();
      playerRef.current = null;
    };
  }, [id]);

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
  const music = ui.music.find(m => m.id === ui.selected) ?? null;
  const look = ui.looks.find(c => c.id === ui.selected) ?? null;
  const effectClip = ui.effectClips.find(c => c.id === ui.selected) ?? null;
  // the settings the panels show and change: the selected clip's, or the only clip's
  const fxLane = lane ?? (ui.lanes.length === 1 ? ui.lanes[0] : null);
  const fx = fxLane?.fx ?? draftFx;
  const mode = music
    ? 'music'
    : look
      ? 'look'
      : effectClip
        ? 'effectclip'
        : modeFor(lane, scene !== null, catalog);
  // the presets menu showing: one to add a look from, or the selected look's to swap it for
  // (a body effect selected: its body presets)
  const bodyLane = lane?.kind === 'effect' && lane.body ? lane : null;
  // (an impact made from a burst preset selected: the burst presets)
  const burstLane = lane?.kind === 'impact' && lane.burst ? lane : null;
  const presetLane = bodyLane ?? burstLane;
  const presetOf = presetLane ? (presetLane.body ?? presetLane.burst) : null;
  const menuGroup: MenuGroup | null =
    lookMenu ??
    (tool === 'presets' ? (look ? lookGroup(look) : bodyLane ? 'body' : burstLane ? 'impact' : null) : null);
  const cutout = lane?.kind === 'cutout' ? lane : null;
  // an effect made from nothing, just placed: its layers, to make it (set while rendering, once)
  if (customizeNext && presetOf?.preset.id === MY_OWN) {
    setCustomizeNext(false);
    setTool('customize');
  }

  // ---------- actions ----------

  // cropping the film's frame (see CropScreen.tsx)
  const cropping = ui.cropping;
  const crop: CropActions = {
    cancel: () => player()?.cancelCrop(),
    apply: () => player()?.applyCrop(),
    rotate: deg => player()?.setCropRot(deg),
    ratio: id => player()?.setCropRatio(id),
    reset: () => player()?.resetCrop(),
  };

  // the roto screen: checking a cutout's outline (see roto/RotoScreen.tsx)
  const review = ui.review;
  const roto: RotoActions = {
    seekFrame: i => player()?.seekFrame(i),
    seekClip: t => player()?.seekClip(t),
    stepFrame: d => player()?.stepFrame(d),
    seekFlagged: d => player()?.seekFlagged(d),
    setRange: r => player()?.setReviewRange(r),
    commitRange: () => player()?.commitReviewRange(),
    setTool: tool => player()?.setReviewTool(tool),
    togglePen: () => player()?.togglePen(),
    toggleHand: () => player()?.toggleHand(),
    penBack: () => player()?.penBack(),
    penCancel: () => player()?.penCancel(),
    penClose: () => player()?.penClose(),
    setEdge: p => player()?.setReviewEdge(p),
    undo: () => player()?.undo(),
    redo: () => player()?.redo(),
    done: () => player()?.closeReview(),
  };

  function changeFx(p: Partial<FxSettings>) {
    setDraftFx(cur => ({ ...cur, ...p }));
    player()?.setFx(p);
  }

  // picks a video: added to the end of the film, or (replacing) put in place of video `replacing`
  const replacing = useRef<number | null>(null);
  function chooseFile(replace: number | null = null) {
    replacing.current = replace;
    fileRef.current?.click();
  }

  function fileChosen(f: File) {
    player()?.loadFile(f, replacing.current);
    replacing.current = null;
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
    setLookMenu(null);
    setJoin(null);
    setPackMenu(false);
    player()?.select(null);
  }

  // a join between films tapped: its transition (tapped again, closed)
  function selectJoin(k: number) {
    setTool(null);
    setScene(null);
    setCatalog(null);
    setLookMenu(null);
    player()?.select(null);
    setJoin(cur => (cur === k ? null : k));
  }

  // a film tapped on the timeline: its footage tools, with the playhead moved into it
  function selectScene(k: number) {
    setJoin(null);
    setTool(null);
    setCatalog(null);
    player()?.select(null);
    if (scene === k) return setScene(null);
    setScene(k);
    const sc = ui.films[k],
      t = player()?.time() ?? 0;
    if (sc && (t < sc.at || t >= sc.at + (sc.e - sc.s) / sc.speed)) player()?.seek(sc.at);
  }

  function selectLane(id: number) {
    setTool(null);
    setLookMenu(null);
    setJoin(null);
    setPackMenu(false);
    setScene(null);
    setCatalog(null);
    player()?.select(id);
  }

  // Effects: list the categories in the toolbar; Cancel while waiting for the tap
  function addEffect() {
    setScene(null);
    setTool(null);
    player()?.select(null);
    if (ui.adding) player()?.cancelAdding();
    else setCatalog('effects');
  }

  // Overlay: an object cut out of the footage, on a layer of its own
  function addOverlay() {
    setScene(null);
    setCatalog(null);
    setTool(null);
    if (ui.adding) return player()?.cancelAdding();
    player()?.startAdding({ kind: 'cutout' });
  }

  // Filters, Video effects, Text or Body effects: the group's presets; picking one adds it at the
  // playhead (a body effect, where the person or object is tapped next)
  function openLooks(group: MenuGroup) {
    setJoin(null);
    setPackMenu(false);
    setScene(null);
    setCatalog(null);
    setTool(null);
    player()?.select(null);
    if (ui.adding) player()?.cancelAdding();
    setLookMenu(group);
  }

  // My clips: the effects library, to place one of its clips at the playhead
  function openPacks() {
    setJoin(null);
    setScene(null);
    setCatalog(null);
    setTool(null);
    setLookMenu(null);
    player()?.select(null);
    if (ui.adding) player()?.cancelAdding();
    setPackMenu(true);
  }

  // a preset picked: added at the playhead, or, while the look it added (or any of its group) is
  // selected, swapped in for it, so presets can be tried one after another
  function pickLook(group: MenuGroup, presetId: string) {
    const own = presetId === MY_OWN;
    if (group === 'impact') {
      if (burstLane) player()?.setBurst(burstLane.id, presetId);
      if (own) setTool('customize');
      return;
    }
    if (group === 'body') {
      if (bodyLane) {
        player()?.setBody(bodyLane.id, presetId);
        if (own) setTool('customize');
        return;
      }
      setLookMenu(null);
      setCustomizeNext(own);
      return player()?.startAdding({ kind: 'effect', fx: {}, body: presetId });
    }
    if (look && lookGroup(look) === group) player()?.setLookPreset(look.id, presetId);
    else player()?.addLook(presetId, group);
    // (one made from nothing: straight on to making it)
    if (own) {
      setLookMenu(null);
      setTool('customize');
    }
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
        ? { kind: 'impact', style: p.style, fx: startPal(p.style), burst: p.burst }
        : { kind: 'effect', fx: { effect: p.effect, pal: p.pal, ...p.fx } },
    );
  }

  // the film selected, and its video
  const film = scene !== null ? (ui.films[scene] ?? null) : null;
  // the join being picked for: the film it goes into, and its transition
  const joinFilm = join !== null && join > 0 ? (ui.films[join] ?? null) : null;
  const joinCut = joinFilm
    ? (ui.transitions.find(tr => tr.reel === joinFilm.reel && Math.abs(tr.s - joinFilm.s) < 1e-6) ?? null)
    : null;
  // what the Animation panel animates: the film selected, the cutout's overlay, or a text; its animation,
  // and how long it plays
  const animTarget: AnimTarget | null =
    film && scene !== null
      ? { film: scene }
      : cutout
        ? { overlay: cutout.id }
        : look?.text
          ? { look: look.id }
          : null;
  const animOf =
    film && scene !== null
      ? { anim: film.anim, length: (film.e - film.s) / film.speed }
      : cutout?.cutout
        ? { anim: cutout.cutout.anim, length: cutout.range.e - cutout.range.s }
        : look?.text
          ? { anim: look.anim, length: look.len }
          : null;
  const filmVideo = film?.reel ?? null;

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
    pinned: !!lane?.pinned,
    objects: ui.lanes.filter(l => l.kind === 'effect' && !l.pinned).length,
    laser: lane?.kind === 'effect' && lane.fx.effect === 'laser',
    looks: lane?.kind === 'effect' && hasLooks(lane.fx.effect),
    text: !!look?.text,
    body: !!bodyLane,
    burst: !!burstLane,
    tunable: !!presetOf?.preset.controls.length,
    words: lane?.kind === 'effect' && lane.fx.effect === 'text',
    colors: lane?.kind === 'impact' || (lane?.fx.effect !== 'glitch' && lane?.fx.effect !== 'water'),
    impact: lane?.kind === 'impact' && lane.impact ? familyOf(lane.impact) : null,
    moveKey: !!cutout && !!ui.cutoutNow?.onKey,
    isolated: !!cutout && ui.isolated === cutout.id,
    films: ui.films.length,
    video:
      filmVideo !== null ? { at: ui.reels.findIndex(r => r.id === filmVideo), of: ui.reels.length } : null,
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
      case 'removevideo':
        if (filmVideo !== null) pl?.removeVideo(filmVideo);
        return setScene(null);
      case 'videoearlier':
      case 'videolater':
        if (filmVideo !== null) pl?.moveVideo(filmVideo, key === 'videoearlier' ? -1 : 1);
        return setScene(null);
      case 'deletescene':
        if (scene !== null) pl?.deleteScene(scene);
        return setScene(null);
      case 'cutout':
        if (lane) break; // (a cutout's own tools don't have this)
        return addOverlay();
      case 'catalog':
        return addEffect();
      case 'filters':
        return openLooks('filter');
      case 'screenfx':
        return openLooks('screen');
      case 'body':
        return openLooks('body');
      case 'packs':
        return openPacks();
      case 'addtext':
        return openLooks('text');
      case 'crop':
        setTool(null);
        return pl?.startCrop();
      case 'ownimpact':
        setTool(null);
        setCatalog(null);
        setCustomizeNext(true);
        return pl?.startAdding({ kind: 'impact', style: 'punch', fx: {}, burst: MY_OWN });
      case 'objects':
        return openLooks('body');
      case 'custom':
        setTool(null);
        return setCatalog(key);
      case 'cancel':
        return pl?.cancelAdding();
      case 'replace':
        return chooseFile((scene !== null ? ui.films[scene]?.reel : null) ?? player()?.activeVideo ?? null);
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
      case 'volume':
      case 'speed':
      case 'presets':
      case 'controls':
      case 'customize':
      case 'animation':
        setLookMenu(null);
        return setTool(cur => (cur === key ? null : key));
    }
    if (effectClip) {
      switch (key) {
        case 'start':
          return pl?.rangeHere(effectClip.id, 's');
        case 'end':
          return pl?.rangeHere(effectClip.id, 'e');
        case 'place':
          return pl?.placeEffect(effectClip.id);
        case 'duplicate':
          setTool(null);
          return pl?.duplicate(effectClip.id);
        case 'delete':
          setTool(null);
          return pl?.deleteTrack(effectClip.id);
      }
      return;
    }
    if (look) {
      switch (key) {
        case 'start':
          return pl?.rangeHere(look.id, 's');
        case 'end':
          return pl?.rangeHere(look.id, 'e');
        case 'place':
          return pl?.placeLook(look.id);
        case 'duplicate':
          setTool(null);
          return pl?.duplicate(look.id);
        case 'delete':
          setTool(null);
          return pl?.deleteTrack(look.id);
      }
      return;
    }
    if (music && key === 'delete') {
      setTool(null);
      return pl?.deleteTrack(music.id);
    }
    if (!lane) return;
    switch (key) {
      case 'duplicate':
        setTool(null);
        return pl?.duplicate(lane.id);
      case 'isolate':
        return pl?.toggleIsolated(lane.id);
      case 'review':
        setTool(null);
        return pl?.openReview(lane.id);
      case 'movekey':
        return pl?.toggleMoveKey(lane.id);
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
    <div className={`editor${full ? ' full' : ''}${review ? ' roto-mode' : ''}`}>
      {/* (the preview stays in its place, so its canvas stays the same) */}
      {review ? (
        <RotoHeader review={review} job={ui.job} canUndo={ui.canUndo} canRedo={ui.canRedo} on={roto} />
      ) : cropping ? (
        <CropHeader on={crop} />
      ) : (
        <header className="topbar">
          <div className="top-tools">
            <button type="button" className="icon-btn" aria-label="Add a video" onClick={() => chooseFile()}>
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
      )}

      <Preview
        ui={ui}
        canvasRef={viewRef}
        full={full}
        pointer={!!ui.lanes.length && !ui.adding && !lane}
        onChooseFile={() => chooseFile()}
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

      {review && (
        <div className="dock">
          <RotoDock
            review={review}
            reel={ui.reels.find(r => r.id === review.reel)}
            makeThumbs={makeThumbs}
            on={roto}
          />
        </div>
      )}

      {cropping && (
        <div className="dock">
          <CropDock rot={cropping.crop.rot} ratio={cropping.ratio} on={crop} />
        </div>
      )}

      <div className="dock" hidden={!!ui.review || !!cropping}>
        <Timeline
          ui={ui}
          scene={scene}
          join={join}
          busy={busy}
          currentTime={currentTime}
          soundShape={l => player()?.soundShape(l) ?? []}
          makeThumbs={makeThumbs}
          on={{
            seek: t => player()?.seek(t),
            deselect,
            selectScene,
            selectJoin,
            selectLane,
            chooseFile: () => chooseFile(),
            addEffect,
            addOverlay,
            addAudio: () => audioRef.current?.click(),
            addLook: openLooks,
            addEffectClip: openPacks,
            moveEffect: (id, t) => player()?.placeEffect(id, t),
            moveMusic: (id, t) => player()?.placeMusic(id, t),
            moveLook: (id, t) => player()?.placeLook(id, t),
            setRange: (id, r) => player()?.setRange(id, r),
            commitRange: id => player()?.commitRange(id),
            moveImpact: (id, t) => player()?.moveImpact(id, t),
            moveCutout: (id, t) => player()?.placeCutout(id, t),
            moveRow: (id, row) => player()?.moveToRow(id, row),
          }}
        />
        <Toolbar
          label={
            music
              ? `${music.name} tools`
              : look
                ? `${look.name} tools`
                : effectClip
                  ? `${effectClip.name} tools`
                  : toolbarLabel(mode, lane)
          }
          buttons={buttons}
          onPress={runTool}
          onBack={mode === 'custom' ? backToCatalog : mode ? deselect : undefined}
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
        {menuGroup && !ui.choosing && !ui.cutting && (
          <PresetSheet
            key={menuGroup}
            group={menuGroup}
            current={
              menuGroup === 'body' || menuGroup === 'impact'
                ? (presetOf?.preset.id ?? null)
                : look && lookGroup(look) === menuGroup
                  ? look.preset.id
                  : null
            }
            thumbs={ui.lookThumbs}
            // (adding an object effect: the ones with styles of their own too)
            extras={menuGroup === 'body' && !bodyLane ? OBJECT_CATEGORIES : []}
            onExtra={id => {
              setLookMenu(null);
              runTool(`cat-${id as Category}`);
            }}
            onPick={id => pickLook(menuGroup, id)}
            onClose={() => {
              setLookMenu(null);
              setTool(null);
            }}
            onShown={() =>
              menuGroup !== 'body' && menuGroup !== 'impact' && player()?.makeLookThumbs(menuGroup)
            }
          />
        )}
        {tool === 'controls' && look && (
          <PresetControls
            name={look.name}
            preset={look.preset}
            values={look.values}
            text={look.text}
            onChange={(c, v) => player()?.setLookControl(look.id, c, v)}
            onText={p => player()?.setLookText(look.id, p)}
            onClose={() => setTool(null)}
          />
        )}
        {tool === 'customize' && ui.selected !== null && (look || presetOf) && (
          <CustomizeSheet
            key={ui.selected}
            name={look?.name ?? presetLane?.name ?? ''}
            preset={look ? look.preset : presetOf!.preset}
            values={look ? look.values : presetOf!.values}
            onEdit={(edit, merge) => player()?.customize(ui.selected!, edit, merge)}
            onClose={() => setTool(null)}
          />
        )}
        {tool === 'controls' && presetLane && presetOf && (
          <PresetControls
            name={presetLane.name}
            preset={presetOf.preset}
            values={presetOf.values}
            onChange={(c, v) =>
              presetLane.kind === 'impact'
                ? player()?.setBurstControl(presetLane.id, c, v)
                : player()?.setBodyControl(presetLane.id, c, v)
            }
            onClose={() => setTool(null)}
          />
        )}
        {packMenu && !ui.choosing && !ui.cutting && (
          <PackSheet
            packs={ui.packs}
            onAdd={f => void player()?.addPack(f)}
            onPick={id => {
              setPackMenu(false);
              player()?.addEffectClip(id);
            }}
            onRemove={id => void player()?.removePack(id)}
            onClose={() => setPackMenu(false)}
          />
        )}
        {tool === 'controls' && effectClip && (
          <EffectClipControls
            clip={effectClip}
            onChange={p => player()?.setEffectLook(effectClip.id, p)}
            onClose={() => setTool(null)}
          />
        )}
        {join !== null && joinFilm && !ui.choosing && !ui.cutting && (
          <TransitionSheet
            key={join}
            current={joinCut?.preset.id ?? null}
            duration={joinCut?.duration ?? 0}
            most={fitDuration(
              ui.films.map(f => ({ ...f, length: playTime(f) })),
              join,
              Infinity,
            )}
            onPick={id => player()?.setTransition(join, id)}
            onDuration={s => player()?.setTransitionDuration(join, s)}
            onEverywhere={() => player()?.setTransitionEverywhere(joinCut?.preset.id ?? null)}
            onClose={() => setJoin(null)}
          />
        )}
        {tool === 'animation' && animTarget && animOf && (
          <AnimSheet
            anim={animOf.anim}
            length={animOf.length}
            onPick={(kind, p) => player()?.setClipAnim(animTarget, kind, p?.id ?? null)}
            onDuration={(kind, s) => player()?.setAnimDuration(animTarget, kind, s)}
            onClose={() => setTool(null)}
          />
        )}
        {tool && !SHEETS_OF_THEIR_OWN.has(tool) && !ui.choosing && !ui.cutting && (
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
            speed={film ? { speed: film.speed, pitch: film.pitch, length: film.e - film.s } : undefined}
            onSpeed={p =>
              film &&
              scene !== null &&
              player()?.setSpeed(scene, p.speed ?? film.speed, p.pitch ?? film.pitch)
            }
            volume={music?.volume}
            onVolume={v => music && player()?.setMusicVolume(music.id, v)}
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
      {/* music for the Audio layer */}
      <input
        ref={audioRef}
        className="file-input"
        type="file"
        accept="audio/*"
        tabIndex={-1}
        aria-hidden="true"
        onChange={e => {
          const f = e.target.files?.[0];
          if (f) void player()?.addMusic(f);
          e.target.value = '';
        }}
      />
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
  if (catalog === 'custom') return 'custom';
  if (catalog) return 'catalog';
  return null;
}

function toolbarLabel(mode: Mode, lane: Lane | null) {
  if (mode === 'catalog') return 'Effects';
  if (mode === 'custom') return 'Custom effects';
  if (mode === 'clip') return 'Edit';
  return lane ? `${lane.name} tools` : 'Tools';
}
