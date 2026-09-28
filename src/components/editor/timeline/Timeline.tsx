// The timeline: a ruler, the clip's filmstrip and sound, and the effects and impacts as bars
// covering the stretch each one lasts, stacked in rows where they overlap. It starts at the left;
// the playhead moves across as the video plays, and the timeline scrolls along to keep it in view.
// Tap or drag the ruler (or the playhead's handle) to scrub; scrolling just scrolls. Pinch (or
// Ctrl/⌘ + scroll) zooms it, keeping the playhead where it is on screen.
import { useEffect, useRef } from 'react';
import { Icon, I } from '../icons';
import type { Lane, MakeThumbs, UiState } from '../player';
import { AudioRow, VideoRow, hasFilm as filmShowing } from './ClipRows';
import { CutoutClip, EffectClip, ImpactClip } from './FxClips';
import { PAD, type Scale } from './layout';
import { Ruler } from './Ruler';
import { usePlayhead } from './usePlayhead';
import { useTimelineZoom } from './useTimelineZoom';

export function Timeline({
  ui,
  scene,
  busy,
  currentTime,
  soundShape,
  makeThumbs,
  on,
}: {
  ui: UiState;
  scene: number | null; // the film selected
  busy: boolean;
  soundShape(l: Lane): number[]; // each clip's sound effect, for its waveform
  makeThumbs: MakeThumbs; // the clip's filmstrip
  currentTime(): number; // the clip time being shown, read every frame while playing
  on: {
    seek(t: number): void;
    deselect(): void;
    selectScene(scene: number): void;
    selectLane(id: number): void;
    chooseFile(): void;
    addEffect(): void;
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
  const fxLanes = ui.lanes.filter(l => l.kind !== 'cutout'),
    cutLanes = ui.lanes.filter(l => l.kind === 'cutout');
  const rows = Array.from({ length: ui.rows }, (_, r) => fxLanes.filter(l => l.row === r));
  const cutRows = Array.from({ length: ui.cutRows }, (_, r) => cutLanes.filter(l => l.row === r));
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

          {/* cutouts: layers cut out of the footage, with it */}
          {cutRows.map((lanes, r) => (
            <div key={`c${r}`} className="tl-row fx-row cut-row">
              {lanes.map(l => (
                <CutoutClip
                  key={l.id}
                  lane={l}
                  scale={scale}
                  selected={l.id === ui.selected}
                  duration={dur}
                  on={clipActions}
                />
              ))}
            </div>
          ))}

          {rows.map((lanes, r) => (
            <div key={r} className="tl-row fx-row">
              {lanes.map(l => {
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
              })}
            </div>
          ))}

          {hasFilm && (
            <div className="tl-row add-row">
              <button
                type="button"
                className={`add-hint${ui.adding ? ' on' : ''}`}
                disabled={busy}
                onClick={e => {
                  e.stopPropagation();
                  on.addEffect();
                }}
              >
                <Icon d={I.plus} size={16} />
                {ui.adding?.kind === 'cutout'
                  ? 'Drag a box round the object'
                  : ui.adding
                    ? 'Tap the object in the preview'
                    : 'Add effect'}
              </button>
            </div>
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
