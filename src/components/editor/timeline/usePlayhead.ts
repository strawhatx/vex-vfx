// The playhead: where it's drawn (following the video every frame while playing), scrolling the
// timeline to keep it in view, and scrubbing (tap or drag on the ruler or the playhead's handle).
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
  type RefObject,
} from 'react';
import { PAD } from './layout';

export function usePlayhead({
  scrollRef,
  ppsRef,
  playing,
  time,
  duration,
  ready,
  currentTime,
  seek,
}: {
  scrollRef: RefObject<HTMLDivElement | null>;
  ppsRef: RefObject<number>; // the zoom, read by event handlers
  playing: boolean;
  time: number; // the time shown while paused
  duration: number;
  ready: boolean;
  currentTime(): number; // the clip time being shown, read every frame while playing
  seek(t: number): void;
}) {
  const [clock, setClock] = useState(0);
  const shownTime = playing ? clock : time;

  // scrolls just enough to bring the playhead back into view (with a little room to its right)
  const follow = useCallback(
    (t: number, pps: number) => {
      const el = scrollRef.current;
      if (!el) return;
      const px = PAD + t * pps;
      if (px < el.scrollLeft + 8 || px > el.scrollLeft + el.clientWidth - 48) {
        el.scrollLeft = px - el.clientWidth * 0.2;
      }
    },
    [scrollRef],
  );

  // while playing, follow the video every frame (timeupdate is too coarse)
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const tick = () => {
      const t = currentTime();
      setClock(t);
      follow(t, ppsRef.current);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, follow, currentTime, ppsRef]);

  useEffect(() => {
    if (!playing) follow(time, ppsRef.current);
  }, [time, playing, follow, ppsRef]);

  // ---------- scrubbing ----------
  // seeks at most once a frame, to the latest time asked for
  const scrubbing = useRef(false);
  const pending = useRef<number | null>(null);
  const seekSoon = (t: number) => {
    if (pending.current === null) {
      requestAnimationFrame(() => {
        if (pending.current !== null) seek(pending.current);
        pending.current = null;
      });
    }
    pending.current = t;
  };
  const timeAt = (clientX: number) => {
    const inner = scrollRef.current?.firstElementChild?.getBoundingClientRect();
    if (!inner) return 0;
    return Math.max(0, Math.min(duration, (clientX - inner.left - PAD) / ppsRef.current));
  };
  const stopScrub = () => {
    scrubbing.current = false;
  };

  // spread onto the ruler and the playhead's handle
  const scrubbable = {
    onPointerDown(e: PointerEvent) {
      if (!ready) return;
      e.stopPropagation();
      e.preventDefault();
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      scrubbing.current = true;
      seekSoon(timeAt(e.clientX));
    },
    onPointerMove(e: PointerEvent) {
      if (scrubbing.current) seekSoon(timeAt(e.clientX));
    },
    onPointerUp: stopScrub,
    onPointerCancel: stopScrub,
    onClick: (e: MouseEvent) => e.stopPropagation(),
  };

  return { shownTime, scrubbable };
}
