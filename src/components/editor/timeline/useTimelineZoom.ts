// Timeline zoom: pinch with two fingers, or Ctrl/⌘ + scroll (a trackpad pinch). The playhead stays
// where it is on screen.
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { BASE_PPS, MAX_PPS, MIN_PPS, PAD } from './layout';

// playheadRef: the time the playhead is at
export function useTimelineZoom(scrollRef: RefObject<HTMLDivElement | null>, playheadRef: RefObject<number>) {
  const [pps, setPps] = useState(BASE_PPS);
  const ppsRef = useRef(pps); // the zoom, for event handlers

  // where the playhead sat on screen before a zoom, to put it back there after
  const anchor = useRef<{ t: number; off: number } | null>(null);
  useLayoutEffect(() => {
    ppsRef.current = pps;
    const el = scrollRef.current;
    const a = anchor.current;
    if (el && a) el.scrollLeft = PAD + a.t * pps - a.off;
    anchor.current = null;
  }, [pps, scrollRef]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const zoomTo = (next: number) => {
      const t = playheadRef.current;
      anchor.current ??= { t, off: PAD + t * ppsRef.current - el.scrollLeft };
      setPps(Math.max(MIN_PPS, Math.min(MAX_PPS, next)));
    };

    let pinch: { d: number; pps: number } | null = null;
    const dist = (e: TouchEvent) =>
      Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
    const touchStart = (e: TouchEvent) => {
      if (e.touches.length !== 2) return;
      pinch = { d: dist(e), pps: ppsRef.current };
      e.preventDefault();
    };
    const touchMove = (e: TouchEvent) => {
      if (!pinch || e.touches.length !== 2) return;
      e.preventDefault();
      zoomTo((pinch.pps * dist(e)) / Math.max(1, pinch.d));
    };
    const touchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) pinch = null;
    };
    const wheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      zoomTo(ppsRef.current * Math.exp(-e.deltaY * 0.01));
    };

    el.addEventListener('touchstart', touchStart, { passive: false });
    el.addEventListener('touchmove', touchMove, { passive: false });
    el.addEventListener('touchend', touchEnd);
    el.addEventListener('touchcancel', touchEnd);
    el.addEventListener('wheel', wheel, { passive: false });
    return () => {
      el.removeEventListener('touchstart', touchStart);
      el.removeEventListener('touchmove', touchMove);
      el.removeEventListener('touchend', touchEnd);
      el.removeEventListener('touchcancel', touchEnd);
      el.removeEventListener('wheel', wheel);
    };
  }, [scrollRef, playheadRef]);

  return { pps, ppsRef };
}
