// The playback controls under the preview: full screen, the clock, play/pause and outlines.
import { useEffect, useState } from 'react';
import { Icon, I } from './icons';
import { mmss } from '@/domain/tracking/timeLabels';

const PLAY = 'M8 5.5v13a.5.5 0 0 0 .8.4l10-6.5a.5.5 0 0 0 0-.8l-10-6.5a.5.5 0 0 0-.8.4z';
const PAUSE = 'M7 5h3.5v14H7zM13.5 5H17v14h-3.5z';

export function Transport({
  ready,
  canPlay,
  playing,
  time,
  duration,
  currentTime,
  full,
  outline,
  onFull,
  onPlay,
  onOutline,
}: {
  ready: boolean;
  canPlay: boolean;
  playing: boolean;
  time: number;
  duration: number;
  currentTime(): number;
  full: boolean;
  outline: boolean;
  onFull(): void;
  onPlay(): void;
  onOutline(): void;
}) {
  return (
    <div className="transport" aria-label="Playback controls">
      <div className="transport-left">
        <button
          type="button"
          className="icon-btn"
          disabled={!ready}
          aria-label={full ? 'Exit full screen' : 'Full screen'}
          onClick={onFull}
        >
          <Icon d={full ? I.shrink : I.expand} size={20} />
        </button>
        <Clock playing={playing} time={time} duration={duration} currentTime={currentTime} />
      </div>
      <button
        type="button"
        className="play"
        disabled={!canPlay}
        aria-label={playing ? 'Pause' : 'Play'}
        onClick={onPlay}
      >
        <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">
          <path d={playing ? PAUSE : PLAY} fill="currentColor" />
        </svg>
      </button>
      <button
        type="button"
        className="icon-btn"
        disabled={!ready}
        aria-pressed={outline}
        aria-label="Show outlines"
        onClick={onOutline}
      >
        <Icon d={I.eye} size={20} />
      </button>
    </div>
  );
}

// the time shown and the clip's length; while playing it follows the video every frame
function Clock({
  playing,
  time,
  duration,
  currentTime,
}: {
  playing: boolean;
  time: number;
  duration: number;
  currentTime(): number;
}) {
  const [now, setNow] = useState(time);
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const tick = () => {
      setNow(currentTime());
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, currentTime]);
  return (
    <span className="time">
      <b>{mmss(playing ? now : time)}</b> / {mmss(duration)}
    </span>
  );
}
