// The roto screen's timeline: just the stretch of video the cutout is cut from, as a filmstrip,
// with grips on its ends. Dragging a grip in trims it; dragging it on past the end takes in more of
// the video (the view holds still while dragging, and fits the new stretch once let go). Under it,
// the frames that look wrong are marked (red: not found or lost, yellow: the outline jumped in
// size), and dots mark the frames fixed. A press anywhere shows that moment. It zooms like the
// main timeline (see useRotoZoom.ts).
import { useRef, useState } from 'react';
import { timeLabel } from '@/domain/tracking/timeLabels';
import type { MakeThumbs, ReelUi, ReviewUi } from '../player';
import { useFilmstrip } from '../timeline/useFilmstrip';
import { useRotoZoom } from './useRotoZoom';

// thumbnails across the stretch shown, and at most this many for the whole video
const TILES = 12,
  MAX_TILES = 120,
  TILE_H = 64;

type Drag = 'seek' | 's' | 'e';

export function RotoTimeline({
  review,
  reel,
  makeThumbs,
  on,
}: {
  review: ReviewUi;
  reel: ReelUi | undefined;
  makeThumbs: MakeThumbs;
  on: {
    seek(t: number): void;
    setRange(r: { s?: number; e?: number }): void;
    commitRange(): void;
  };
}) {
  const { range, length, times, flags, keys, s: first, now } = review;
  const L = length || 1;
  // the stretch shown: the cutout's, or while a grip is dragged, what it was when the drag began
  const [held, setHeld] = useState<{ s: number; e: number } | null>(null);
  const view = held ?? range;
  const V = Math.max(1e-3, view.e - view.s);
  const at = (t: number) => Math.max(0, Math.min(1, (t - view.s) / V));
  const pct = (t: number) => `${at(t) * 100}%`;
  // where a stretch of time [a, b] sits on the strip
  const place = (a: number, b: number) => ({ left: pct(a), width: `${(at(b) - at(a)) * 100}%` });
  const step = Math.max(V / TILES, L / MAX_TILES);
  const thumbs = useFilmstrip(
    makeThumbs,
    reel?.src || null,
    reel?.srcDuration ?? 0,
    reel?.videoStart ?? 0,
    step,
    Math.round((TILE_H * 16) / 9),
    TILE_H,
  );

  const scroller = useRef<HTMLDivElement>(null);
  const zoom = useRotoZoom(scroller, at(now));

  // what a press is doing, and the time under the finger
  const box = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const timeAt = (x: number) => {
    const r = box.current?.getBoundingClientRect();
    return r && r.width ? Math.max(0, Math.min(L, view.s + ((x - r.left) / r.width) * V)) : view.s;
  };
  // (each part says what a press on it drags: data-drag)
  const moveTo = (d: Drag, x: number) => {
    const t = timeAt(x);
    if (d !== 'seek') on.setRange({ [d]: t });
    on.seek(t);
  };
  const onPointerDown = (e: React.PointerEvent<HTMLElement>) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    const d = (e.currentTarget.dataset.drag ?? 'seek') as Drag;
    drag.current = d;
    if (d !== 'seek') setHeld({ ...range });
    moveTo(d, e.clientX);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (drag.current) moveTo(drag.current, e.clientX);
  };
  const release = () => {
    if (drag.current === 's' || drag.current === 'e') on.commitRange();
    drag.current = null;
    setHeld(null);
  };
  const handlers = { onPointerDown, onPointerMove, onPointerUp: release, onPointerCancel: release };

  // the frames that look wrong, as runs
  const runs: { s: number; e: number; flag: string }[] = [];
  flags.forEach((f, k) => {
    if (f === 'ok') return;
    const s = times[k],
      e = times[k + 1] ?? range.e;
    const last = runs[runs.length - 1];
    if (last && last.flag === f && Math.abs(last.e - s) < 1e-6) last.e = e;
    else runs.push({ s, e, flag: f });
  });

  return (
    <div className="roto-tl">
      <div className="roto-times">
        <span>{timeLabel(range.s, 0.1)}</span>
        <span>{timeLabel(range.e - range.s, 0.1)} cut out</span>
        <span>{timeLabel(range.e, 0.1)}</span>
      </div>
      <div ref={scroller} className="roto-scroll">
        <div className="roto-zoom" style={{ width: `${zoom * 100}%` }}>
          <div ref={box} className="roto-strip" data-drag="seek" {...handlers}>
            {thumbs.map(
              (url, i) =>
                url &&
                (i + 1) * step > view.s &&
                i * step < view.e && (
                  <span
                    key={i}
                    className="thumb"
                    style={{ ...place(i * step, (i + 1) * step), backgroundImage: `url(${url})` }}
                  />
                ),
            )}
            {/* (while a grip is dragged in, what's trimmed off is shaded) */}
            <span className="roto-shade" style={{ left: 0, width: pct(range.s) }} />
            <span className="roto-shade" style={{ left: pct(range.e), right: 0 }} />
            <span className="roto-window" style={place(range.s, range.e)} />
            <span
              className="roto-handle"
              role="slider"
              aria-label="Cutout starts"
              aria-valuenow={range.s}
              style={{ left: pct(range.s) }}
              data-drag="s"
              {...handlers}
            />
            <span
              className="roto-handle end"
              role="slider"
              aria-label="Cutout ends"
              aria-valuenow={range.e}
              style={{ left: pct(range.e) }}
              data-drag="e"
              {...handlers}
            />
            {/* (outside the stretch shown, the frame note says so instead) */}
            {now >= view.s && now < view.e && <span className="roto-head" style={{ left: pct(now) }} />}
          </div>
          <div className="roto-flags">
            <span className="roto-cut" style={place(range.s, range.e)} />
            {runs.map(r => (
              <span key={r.s} className={`roto-flag ${r.flag}`} style={place(r.s, r.e)} />
            ))}
            {keys.map(i => (
              <span key={i} className="roto-key" style={{ left: pct(times[i - first] ?? 0) }} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
