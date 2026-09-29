// The timeline: a ruler, the film's filmstrip and sound, then a layer for each kind of clip, like
// CapCut's: Overlay (objects cut out), Audio (music), Text, Effects (effects and impacts), Video
// effects and Filters (looks over the whole frame), each
// marked with its
// icon on the left and its clips named on their bars, stacked in rows of its own where they
// overlap. An empty layer shows a button to add one. It starts at the left;
// the playhead moves across as the video plays, and the timeline scrolls along to keep it in view.
// Tap or drag the ruler (or the playhead's handle) to scrub; scrolling just scrolls. Pinch (or
// Ctrl/⌘ + scroll) zooms it, keeping the playhead where it is on screen.
import { useEffect, useRef } from 'react';
import { Icon, I } from '../icons';
import { layerOf, type LayerKind } from '@/domain/project/track';
import type { Lane, MakeThumbs, UiState } from '../player';
import { AudioRow, VideoRow, hasFilm as filmShowing } from './ClipRows';
import { CutoutClip, EffectClip, ImpactClip } from './FxClips';
import type { LookGroup } from '@/domain/effects/presets';
import { LookClip } from './LookClip';
import { EffectClipBar } from './EffectClipBar';
import { MusicClip } from './MusicClip';
import { PAD, type Scale } from './layout';
import { Ruler } from './Ruler';
import { usePlayhead } from './usePlayhead';
import { useTimelineZoom } from './useTimelineZoom';

export function Timeline({
  ui,
  scene,
  join,
  busy,
  currentTime,
  soundShape,
  makeThumbs,
  on,
}: {
  ui: UiState;
  scene: number | null; // the film selected
  join: number | null; // the join whose transition is open (into this film)
  busy: boolean;
  soundShape(l: Lane): number[]; // each clip's sound effect, for its waveform
  makeThumbs: MakeThumbs; // the clip's filmstrip
  currentTime(): number; // the clip time being shown, read every frame while playing
  on: {
    seek(t: number): void;
    deselect(): void;
    selectScene(scene: number): void;
    // the join into film k tapped
    selectJoin(film: number): void;
    selectLane(id: number): void;
    chooseFile(): void;
    addEffect(): void;
    addOverlay(): void;
    addAudio(): void;
    addLook(group: LookGroup): void;
    addEffectClip(): void;
    // an effect clip dragged to start at time t
    moveEffect(id: number, t: number): void;
    // music dragged to start at time t
    moveMusic(id: number, t: number): void;
    // a look dragged to start at time t
    moveLook(id: number, t: number): void;
    // live while dragging a clip's end; commit once the drag ends
    setRange(id: number, r: { s?: number; e?: number }): void;
    commitRange(id: number): void;
    // an impact dragged to hit at time t
    moveImpact(id: number, t: number): void;
    // a cutout dragged to start at time t
    moveCutout(id: number, t: number): void;
    // a clip dragged onto another row (-1: a new one on top)
    moveRow(id: number, row: number): void;
  };
}) {
  const dur = ui.duration || 0;
  const scrollRef = useRef<HTMLDivElement>(null);
  const playheadRef = useRef(0);
  const { pps, ppsRef } = useTimelineZoom(scrollRef, playheadRef);
  const { shownTime, scrubbable } = usePlayhead({
    scrollRef,
    ppsRef,
    playing: ui.playing,
    time: ui.time,
    duration: dur,
    ready: ui.ready,
    currentTime,
    seek: on.seek,
  });
  useEffect(() => {
    playheadRef.current = shownTime;
  }, [shownTime]);

  const scale: Scale = { pps, x: t => t * pps };
  // every film deleted: nothing but the button to add a clip
  const hasFilm = filmShowing(ui);
  // each layer's rows of clips
  const rowsOf = (layer: LayerKind, count: number) => {
    const mine = ui.lanes.filter(l => layerOf(l) === layer);
    return Array.from({ length: count }, (_, r) => mine.filter(l => l.row === r));
  };
  // what the next tap adds, on the layer it goes on
  const adding = (layer: LayerKind) => {
    const a = ui.adding;
    if (!a) return null;
    if ((a.kind === 'cutout' ? 'overlay' : 'effects') !== layer) return null;
    return a.kind === 'cutout' ? 'Drag a box round the object' : 'Tap the object in the preview';
  };
  // a layer of looks: text, video effects or filters
  const lookLayer = (group: LookGroup) => (
    <Layer
      key={group}
      layer={group}
      rows={Array.from({ length: ui.lookRows[group] }, (_, r) =>
        ui.looks.filter(c => c.preset.group === group && c.row === r),
      )}
      add={{ label: ADD_LOOK[group], on: false, run: () => on.addLook(group) }}
      busy={busy}
      clip={c => (
        <LookClip
          key={c.id}
          look={c}
          scale={scale}
          selected={c.id === ui.selected}
          duration={dur}
          on={clipActions}
          moveTo={t => on.moveLook(c.id, t)}
        />
      )}
    />
  );
  const clipActions = {
    select: on.selectLane,
    setRange: on.setRange,
    commitRange: on.commitRange,
    moveImpact: on.moveImpact,
    moveCutout: on.moveCutout,
    moveRow: on.moveRow,
  };

  return (
    <div className="timeline" onClick={on.deselect}>
      <div
        ref={scrollRef}
        className="tl-scroll"
        aria-label="Timeline. Drag the ruler to scrub, pinch to zoom."
      >
        <div className="tl-inner" style={{ width: scale.x(dur) }}>
          <Ruler scale={scale} duration={dur} time={shownTime} scrubbable={scrubbable} />

          <VideoRow
            ui={ui}
            scale={scale}
            selected={scene}
            onSelect={on.selectScene}
            onChooseFile={on.chooseFile}
            onJoin={on.selectJoin}
            joined={join}
            makeThumbs={makeThumbs}
          />
          {hasFilm && (
            <AudioRow
              ui={ui}
              scale={scale}
              selected={scene !== null}
              onSelect={() => on.selectScene(scene ?? 0)}
            />
          )}

          {hasFilm && (
            <>
              <Layer
                layer="overlay"
                rows={rowsOf('overlay', ui.cutRows)}
                add={{
                  label: adding('overlay') ?? 'Add overlay',
                  on: ui.adding?.kind === 'cutout',
                  run: on.addOverlay,
                }}
                busy={busy}
                clip={l => (
                  <CutoutClip
                    key={l.id}
                    lane={l}
                    scale={scale}
                    selected={l.id === ui.selected}
                    duration={dur}
                    on={clipActions}
                  />
                )}
              />
              <Layer
                layer="audio"
                rows={Array.from({ length: ui.audioRows }, (_, r) => ui.music.filter(m => m.row === r))}
                add={{ label: 'Add audio', on: false, run: on.addAudio }}
                busy={busy}
                clip={m => (
                  <MusicClip
                    key={m.id}
                    music={m}
                    scale={scale}
                    selected={m.id === ui.selected}
                    duration={dur}
                    on={clipActions}
                    moveTo={t => on.moveMusic(m.id, t)}
                  />
                )}
              />
              {lookLayer('text')}
              <Layer
                layer="clips"
                rows={Array.from({ length: ui.effectRows }, (_, r) =>
                  ui.effectClips.filter(c => c.row === r),
                )}
                add={{ label: 'Add effect clip', on: false, run: on.addEffectClip }}
                busy={busy}
                clip={c => (
                  <EffectClipBar
                    key={c.id}
                    clip={c}
                    scale={scale}
                    selected={c.id === ui.selected}
                    duration={dur}
                    on={clipActions}
                    moveTo={t => on.moveEffect(c.id, t)}
                  />
                )}
              />
              <Layer
                layer="effects"
                rows={rowsOf('effects', ui.rows)}
                add={{
                  label: adding('effects') ?? 'Add effect',
                  on: !!ui.adding && ui.adding.kind !== 'cutout',
                  run: on.addEffect,
                }}
                busy={busy}
                clip={l => {
                  const Clip = l.kind === 'impact' ? ImpactClip : EffectClip;
                  return (
                    <Clip
                      key={l.id}
                      lane={l}
                      scale={scale}
                      selected={l.id === ui.selected}
                      duration={dur}
                      sound={soundShape(l)}
                      on={clipActions}
                    />
                  );
                }}
              />
              {lookLayer('screen')}
              {lookLayer('filter')}
            </>
          )}

          {/* the playhead: moves across as the video plays; drag its handle to scrub */}
          <div className="playhead" style={{ left: PAD + scale.x(shownTime) }}>
            <span className="playhead-knob" {...scrubbable} aria-hidden="true" />
          </div>
        </div>
      </div>
    </div>
  );
}

const ADD_LOOK: Record<LookGroup, string> = {
  text: 'Add text',
  screen: 'Add video effect',
  filter: 'Add filter',
};

// how each layer is marked on the left
type LayerName = LayerKind | 'audio' | 'clips' | LookGroup;
const LAYERS: Record<LayerName, { name: string; icon: string }> = {
  overlay: { name: 'Overlay', icon: I.cutout },
  audio: { name: 'Audio', icon: I.sound },
  text: { name: 'Text', icon: I.text },
  effects: { name: 'Effects', icon: I.effects },
  clips: { name: 'Effect clips', icon: I.flame },
  screen: { name: 'Video effects', icon: I.scene },
  filter: { name: 'Filters', icon: I.color },
};

// one layer: its rows of clips, marked with its icon on the left; empty, a button to add one
function Layer<C>({
  layer,
  rows,
  add,
  busy,
  clip,
}: {
  layer: LayerName;
  rows: C[][];
  add: { label: string; on: boolean; run(): void };
  busy: boolean;
  clip(c: C): React.ReactNode;
}) {
  const { name, icon } = LAYERS[layer];
  const tag = (
    <span className="layer-tag" title={name} aria-label={`${name} layer`}>
      <Icon d={icon} size={16} />
    </span>
  );
  if (!rows.length || add.on)
    return (
      <>
        {rows.map((lanes, r) => (
          <div key={r} className={`tl-row fx-row layer-${layer}`}>
            {r === 0 && tag}
            {lanes.map(clip)}
          </div>
        ))}
        <div className={`tl-row add-row layer-${layer}`}>
          {!rows.length && tag}
          <button
            type="button"
            className={`add-hint${add.on ? ' on' : ''}`}
            disabled={busy}
            onClick={e => {
              e.stopPropagation();
              add.run();
            }}
          >
            <Icon d={I.plus} size={16} />
            {add.label}
          </button>
        </div>
      </>
    );
  return rows.map((lanes, r) => (
    <div key={r} className={`tl-row fx-row layer-${layer}`}>
      {r === 0 && tag}
      {lanes.map(clip)}
    </div>
  ));
}
