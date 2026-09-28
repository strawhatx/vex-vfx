// The roto timeline's zoom, with the main timeline's gestures: pinch with two fingers, or Ctrl/⌘ +
// scroll (a trackpad pinch). 1 fits the whole video; zooming keeps the playhead where it is on
// screen. Zoomed in, the timeline scrolls sideways, and follows the playhead when it steps off
// screen.
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';

// how far in it zooms: the whole video this many times the timeline's width
const MAX_ZOOM = 40;

// at: the playhead, as a share of the video (0..1)
export function useRotoZoom(scrollRef: RefObject<HTMLDivElement | null>, at: number) {
  const [zoom, setZoom] = useState(1);
  const zoomRef = useRef(zoom);
  const atRef = useRef(at);
  useEffect(() => {
    atRef.current = at;
  });

  // where the playhead sat on screen before a zoom, to put it back there after
  const anchor = useRef<{ f: number; off: number } | null>(null);
  useLayoutEffect(() => {
    zoomRef.current = zoom;
    const el = scrollRef.current,
      a = anchor.current;
    if (el && a) el.scrollLeft = a.f * el.scrollWidth - a.off;
    anchor.current = null;
  }, [zoom, scrollRef]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const zoomTo = (next: number) => {
      const f = atRef.current;
      anchor.current ??= { f, off: f * el.scrollWidth - el.scrollLeft };
      setZoom(Math.max(1, Math.min(MAX_ZOOM, next)));
    };
    let pinch: { d: number; zoom: number } | null = null;
    const dist = (e: TouchEvent) =>
      Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
    const touchStart = (e: TouchEvent) => {
      if (e.touches.length !== 2) return;
      pinch = { d: dist(e), zoom: zoomRef.current };
      e.preventDefault();
    };
    const touchMove = (e: TouchEvent) => {
      if (!pinch || e.touches.length !== 2) return;
      e.preventDefault();
      zoomTo((pinch.zoom * dist(e)) / Math.max(1, pinch.d));
    };
    const touchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) pinch = null;
    };
    const wheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      zoomTo(zoomRef.current * Math.exp(-e.deltaY * 0.01));
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
  }, [scrollRef]);

  // the playhead stepped off screen: scroll to it
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || zoom === 1) return;
    const x = at * el.scrollWidth;
    if (x < el.scrollLeft || x > el.scrollLeft + el.clientWidth) el.scrollLeft = x - el.clientWidth / 2;
  }, [at, zoom, scrollRef]);

  return zoom;
}
