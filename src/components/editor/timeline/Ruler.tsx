// The ruler along the top: time labels far enough apart for the zoom, with a dot halfway between.
// Tap or drag it to scrub.
import type { HTMLAttributes } from 'react';
import { timeLabel } from '@/domain/tracking/timeLabels';
import type { Scale } from './layout';

// label spacing, in seconds: the smallest that keeps labels this far apart (px)
const LABEL_STEPS = [0.5, 1, 2, 5, 10, 15, 30, 60, 120];
const LABEL_GAP = 64;

export function Ruler({
  scale,
  duration,
  time,
  scrubbable,
}: {
  scale: Scale;
  duration: number;
  time: number;
  scrubbable: HTMLAttributes<HTMLDivElement>;
}) {
  const every = LABEL_STEPS.find(s => s * scale.pps >= LABEL_GAP) ?? LABEL_STEPS[LABEL_STEPS.length - 1];
  const ticks = [];
  for (let k = 0; (k * every) / 2 <= duration + 1e-6; k++) {
    const t = (k * every) / 2;
    const dot = k % 2 === 1;
    ticks.push(
      <span key={k} className={dot ? 'tick dot' : 'tick'} style={{ left: scale.x(t) }}>
        {dot ? '' : timeLabel(t, every)}
      </span>,
    );
  }
  return (
    <div
      className="ruler"
      {...scrubbable}
      role="slider"
      aria-label="Playhead"
      aria-valuemin={0}
      aria-valuemax={duration}
      aria-valuenow={time}
    >
      {ticks}
    </div>
  );
}
