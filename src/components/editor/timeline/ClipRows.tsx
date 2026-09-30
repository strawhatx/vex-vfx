// The videos' rows: their filmstrips (a film per kept scene, each with its own stretch of its
// video), one video after another, and their own sound under them. A + at the end adds a video;
// a button at each join between films picks its transition.
import type { MouseEvent } from 'react';
import { Icon, I } from '../icons';
import type { MakeThumbs, ReelUi, UiState } from '../player';
import { BASE_PPS, THUMB_H, type Scale } from './layout';
import { useFilmstrip } from './useFilmstrip';
import { Wave } from './Wave';

const MAX_THUMBS = 60;

const stop = (f: () => void) => (e: MouseEvent) => {
  e.stopPropagation();
  f();
};

// a video's kept films (k: index into the film's films, -1 until its frames are listed), in the
// film's time
// (and how fast each plays: its stretch of the video takes up (e - s) / speed of the timeline)
function piecesOf(ui: UiState, r: ReelUi) {
  if (!r.scanned) return [{ k: -1, s: 0, e: r.srcDuration, at: r.at, speed: 1 }];
  return ui.films.flatMap((f, k) =>
    f.reel === r.id ? [{ k, s: f.s, e: f.e, at: f.at, speed: f.speed }] : [],
  );
}

// how fast a film plays, to mark it: '' at normal speed, else e.g. 2× or 0.5×
const speedMark = (speed: number) => (Math.abs(speed - 1) < 1e-3 ? '' : `${+speed.toFixed(2)}×`);

// whether the film has anything to show
export const hasFilm = (ui: UiState) => ui.ready && ui.reels.some(r => !r.scanned || r.length > 0);

// the filmstrips; with nothing to show, a button to add a clip
export function VideoRow({
  ui,
  scale,
  selected,
  onSelect,
  onChooseFile,
  onJoin,
  joined,
  makeThumbs,
}: {
  ui: UiState;
  scale: Scale;
  selected: number | null; // the film selected
  onSelect(film: number): void;
  onChooseFile(): void;
  // the join into film k tapped (joined: the one whose transition is open)
  onJoin(film: number): void;
  joined: number | null;
  makeThumbs: MakeThumbs;
}) {
  if (!hasFilm(ui)) {
    return (
      <div className="tl-row">
        <button type="button" className="add-clip" onClick={stop(onChooseFile)}>
          <Icon d={I.plus} size={18} />
          Add clip
        </button>
      </div>
    );
  }
  const count = ui.films.length;
  return (
    <div className="tl-row main-row">
      {ui.reels.map(r => (
        <ReelStrip
          key={r.id}
          ui={ui}
          reel={r}
          scale={scale}
          selected={selected}
          count={count}
          onSelect={onSelect}
          makeThumbs={makeThumbs}
        />
      ))}
      {ui.films.map((f, k) => {
        if (k === 0) return null;
        const set = ui.transitions.some(tr => tr.reel === f.reel && Math.abs(tr.s - f.s) < 1e-6);
        return (
          <button
            key={`join:${f.reel}:${f.s}`}
            type="button"
            className={`join${set ? ' set' : ''}`}
            style={{ left: scale.x(f.at) }}
            aria-pressed={joined === k}
            aria-label={`Transition into film ${k + 1}${set ? ' (set)' : ''}`}
            onClick={stop(() => onJoin(k))}
          >
            <Icon d={I.join} size={12} />
          </button>
        );
      })}
      <button
        type="button"
        className="add-end"
        style={{ left: scale.x(ui.duration || 0) }}
        aria-label="Add a video"
        onClick={stop(onChooseFile)}
      >
        <Icon d={I.plus} size={22} />
      </button>
    </div>
  );
}

// one video's films, with its thumbnails (made of the whole video, deleted films too)
function ReelStrip({
  ui,
  reel: r,
  scale,
  selected,
  count,
  onSelect,
  makeThumbs,
}: {
  ui: UiState;
  reel: ReelUi;
  scale: Scale;
  selected: number | null;
  count: number;
  onSelect(film: number): void;
  makeThumbs: MakeThumbs;
}) {
  const dur = r.srcDuration || 0;
  const step = dur > MAX_THUMBS ? dur / MAX_THUMBS : 1; // seconds per tile
  const thumbs = useFilmstrip(makeThumbs, r.src || null, dur, r.videoStart, step, step * BASE_PPS, THUMB_H);
  const { x } = scale;
  return piecesOf(ui, r).map(sc => (
    <button
      key={`${r.id}:${sc.k}:${sc.s}`}
      type="button"
      className={`lane clip${sc.k >= 0 && selected === sc.k ? ' sel' : ''}${count > 1 ? ' scene' : ''}`}
      style={{ left: x(sc.at), width: x((sc.e - sc.s) / sc.speed), height: THUMB_H }}
      aria-pressed={sc.k >= 0 && selected === sc.k}
      aria-label={count > 1 ? `Film ${sc.k + 1} of ${count}` : 'Video clip'}
      onClick={stop(() => sc.k >= 0 && onSelect(sc.k))}
    >
      {thumbs.map(
        (url, i) =>
          url &&
          (i + 1) * step > sc.s &&
          i * step < sc.e && (
            <span
              key={i}
              className="thumb"
              style={{
                left: x((i * step - sc.s) / sc.speed),
                width: x(step / sc.speed),
                backgroundImage: `url(${url})`,
              }}
            />
          ),
      )}
      {speedMark(sc.speed) && <span className="speed-mark">{speedMark(sc.speed)}</span>}
    </button>
  ));
}

// the videos' own sound, as waveforms under their films
export function AudioRow({
  ui,
  scale,
  selected,
  onSelect,
}: {
  ui: UiState;
  scale: Scale;
  selected: boolean;
  onSelect(): void;
}) {
  const { muted } = ui;
  const waves = ui.reels.map(r => r.wave);
  const none = waves.every(w => w === 'none');
  const label = none ? 'These clips have no sound' : muted ? 'Clip sound, muted' : 'Clip sound';
  return (
    <div className="tl-row audio-row">
      <button
        type="button"
        className={`audio-clip${muted ? ' muted' : ''}${selected ? ' sel' : ''}`}
        style={{ width: scale.x(ui.duration || 0) }}
        aria-label={label}
        onClick={stop(onSelect)}
      >
        {ui.reels.map(r => (
          <ReelSound key={r.id} ui={ui} reel={r} scale={scale} />
        ))}
        {!none && muted && (
          <span className="muted-tag">
            <Icon d={I.muted} size={12} />
            Muted
          </span>
        )}
      </button>
    </div>
  );
}

// one video's waveform for each of its kept films, or a note where it can't be shown
function ReelSound({ ui, reel: r, scale }: { ui: UiState; reel: ReelUi; scale: Scale }) {
  const dur = r.srcDuration || 0;
  const wave = r.wave;
  if (!dur || r.length <= 0) return null;
  if (!Array.isArray(wave)) {
    const note =
      wave === 'none'
        ? 'No sound'
        : wave === 'unreadable'
          ? 'Clip sound (can’t show its waveform here)'
          : 'Reading sound…';
    return (
      <span className="wave-piece" style={{ left: scale.x(r.at), width: scale.x(r.length) }}>
        <span>{note}</span>
      </span>
    );
  }
  const n = wave.length;
  return piecesOf(ui, r).map(p => (
    <span
      key={`${p.k}:${p.s}`}
      className="wave-piece"
      style={{ left: scale.x(p.at), width: scale.x((p.e - p.s) / p.speed) }}
    >
      <Wave levels={wave.slice(Math.floor((p.s / dur) * n), Math.ceil((p.e / dur) * n))} className="wave" />
    </span>
  ));
}
