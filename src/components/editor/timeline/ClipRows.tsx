// The video clip's rows: its filmstrip (a film per scene, once split), and its own sound.
import { useEffect, useState, type MouseEvent } from 'react';
import { Icon, I } from '../icons';
import type { MakeThumbs, UiState } from '../player';
import { BASE_PPS, THUMB_H, type Scale } from './layout';
import { Wave } from './Wave';

const MAX_THUMBS = 60;

const stop = (f: () => void) => (e: MouseEvent) => {
  e.stopPropagation();
  f();
};

// the filmstrip: at most MAX_THUMBS tiles, stretched when zoomed; with nothing loaded, a button to
// add a clip
export function VideoRow({
  ui,
  scale,
  selected,
  onSelect,
  onChooseFile,
  makeThumbs,
}: {
  ui: UiState;
  scale: Scale;
  selected: number | null; // the film (scene) selected
  onSelect(scene: number): void;
  onChooseFile(): void;
  makeThumbs: MakeThumbs;
}) {
  const dur = ui.duration || 0;
  const step = dur > MAX_THUMBS ? dur / MAX_THUMBS : 1; // seconds per tile
  const thumbs = useFilmstrip(makeThumbs, ui.src, dur, ui.videoStart, step);
  const { x } = scale;

  if (!ui.ready) {
    return (
      <div className="tl-row">
        <button type="button" className="add-clip" onClick={stop(onChooseFile)}>
          <Icon d={I.plus} size={18} />
          Add clip
        </button>
      </div>
    );
  }
  const scenes = ui.scenes.length ? ui.scenes : [{ s: 0, e: dur }];
  return (
    <div className="tl-row">
      {scenes.map((sc, k) => (
        <button
          key={k}
          type="button"
          className={`lane clip${selected === k ? ' sel' : ''}${scenes.length > 1 ? ' scene' : ''}`}
          style={{ left: x(sc.s), width: x(sc.e - sc.s), height: THUMB_H }}
          aria-pressed={selected === k}
          aria-label={scenes.length > 1 ? `Film ${k + 1} of ${scenes.length}` : 'Video clip'}
          onClick={stop(() => onSelect(k))}
        >
          {thumbs.map(
            (url, i) =>
              url &&
              (i + 1) * step > sc.s &&
              i * step < sc.e && (
                <span
                  key={i}
                  className="thumb"
                  style={{ left: x(i * step - sc.s), width: x(step), backgroundImage: `url(${url})` }}
                />
              ),
          )}
        </button>
      ))}
      <button
        type="button"
        className="add-end"
        style={{ left: x(dur) }}
        aria-label="Replace clip"
        onClick={stop(onChooseFile)}
      >
        <Icon d={I.plus} size={22} />
      </button>
    </div>
  );
}

// the thumbnails for the clip, filled in as they're made
function useFilmstrip(
  makeThumbs: MakeThumbs,
  src: string | null,
  duration: number,
  videoStart: number,
  step: number,
) {
  const [strip, setStrip] = useState<{ src: string; urls: string[] } | null>(null);
  useEffect(() => {
    if (!src || !duration) return;
    const ac = new AbortController();
    void makeThumbs(src, duration, videoStart, step, step * BASE_PPS, THUMB_H, ac.signal, (i, url) => {
      setStrip(st => {
        const urls = st?.src === src ? st.urls.slice() : [];
        urls[i] = url;
        return { src, urls };
      });
    });
    return () => ac.abort();
  }, [makeThumbs, src, duration, videoStart, step]);
  return strip && strip.src === src ? strip.urls : [];
}

// the clip's own sound, as a waveform
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
  const { wave, muted } = ui;
  const label = wave === 'none' ? 'This clip has no sound' : muted ? 'Clip sound, muted' : 'Clip sound';
  const note =
    wave === 'none'
      ? 'No sound in this clip'
      : wave === 'unreadable'
        ? 'Clip sound (can’t show its waveform here)'
        : 'Reading sound…';
  return (
    <div className="tl-row audio-row">
      <button
        type="button"
        className={`audio-clip${muted ? ' muted' : ''}${selected ? ' sel' : ''}`}
        style={{ width: scale.x(ui.duration || 0) }}
        aria-label={label}
        onClick={stop(onSelect)}
      >
        {Array.isArray(wave) ? <Wave levels={wave} className="wave" /> : <span>{note}</span>}
        {wave !== 'none' && muted && (
          <span className="muted-tag">
            <Icon d={I.muted} size={12} />
            Muted
          </span>
        )}
      </button>
    </div>
  );
}
