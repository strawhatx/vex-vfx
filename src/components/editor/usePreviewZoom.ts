// Preview zoom: pinch (or Ctrl/⌘ + scroll) to zoom; once zoomed, drag (one finger, the mouse, or
// scrolling) to move around. A tap without dragging still reaches the canvas, to select or place
// things. It only changes the view: the export is unaffected.
import { useEffect, useRef, useState, type RefObject } from 'react';

export interface Zoom {
  k: number; // scale
  x: number; // pan, in px
  y: number;
}

const NONE: Zoom = { k: 1, x: 0, y: 0 };
const MAX_ZOOM = 5;
const DRAG_SLOP = 10; // px a press moves before it's a drag rather than a tap

// the zoom after zooming to k around client point (px, py), then panning by (dx, dy), kept
// covering the preview. rect: the canvas's on-screen box at zoom z.
export function zoomAround(z: Zoom, rect: DOMRect, k: number, px: number, py: number, dx = 0, dy = 0): Zoom {
  const nk = Math.max(1, Math.min(MAX_ZOOM, k));
  if (nk === 1) return NONE;
  // the canvas's unzoomed size and position
  const w = rect.width / z.k;
  const h = rect.height / z.k;
  const left = rect.left - z.x;
  const top = rect.top - z.y;
  // keep the point under (px, py) where it is
  const x = px - left - ((px - left - z.x) * nk) / z.k + dx;
  const y = py - top - ((py - top - z.y) * nk) / z.k + dy;
  return {
    k: nk,
    x: Math.min(0, Math.max(w * (1 - nk), x)),
    y: Math.min(0, Math.max(h * (1 - nk), y)),
  };
}

// stage: the element gestures are caught on; canvas: the preview that zooms; clip: a new clip
// starts unzoomed
export function usePreviewZoom(
  stageRef: RefObject<HTMLElement | null>,
  canvasRef: RefObject<HTMLCanvasElement | null>,
  clip: string | null,
) {
  const [zoom, setZoom] = useState<Zoom>(NONE);
  const [zoomedClip, setZoomedClip] = useState(clip);
  if (zoomedClip !== clip) {
    setZoomedClip(clip);
    setZoom(NONE);
  }
  // the latest zoom, for the gesture handlers
  const zoomRef = useRef(zoom);
  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  useEffect(() => {
    const stage = stageRef.current;
    const canvas = canvasRef.current;
    if (!stage || !canvas) return;

    const zoomAt = (k: number, px: number, py: number, dx = 0, dy = 0) => {
      const next = zoomAround(zoomRef.current, canvas.getBoundingClientRect(), k, px, py, dx, dy);
      zoomRef.current = next;
      setZoom(next);
    };

    // two fingers: pinch to zoom, moving them pans
    let pinch: { d: number; mx: number; my: number } | null = null;
    const fingers = (e: TouchEvent) => {
      const [a, b] = [e.touches[0], e.touches[1]];
      return {
        d: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
        mx: (a.clientX + b.clientX) / 2,
        my: (a.clientY + b.clientY) / 2,
      };
    };
    const touchStart = (e: TouchEvent) => {
      if (e.touches.length !== 2) return;
      pinch = fingers(e);
      drag = null;
      e.preventDefault();
    };
    const touchMove = (e: TouchEvent) => {
      if (!pinch || e.touches.length !== 2) return;
      e.preventDefault();
      const now = fingers(e);
      const k = (zoomRef.current.k * now.d) / Math.max(1, pinch.d);
      zoomAt(k, now.mx, now.my, now.mx - pinch.mx, now.my - pinch.my);
      pinch = now;
    };
    const touchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) pinch = null;
    };

    // Ctrl/⌘ + scroll (a trackpad pinch) zooms; plain scrolling pans once zoomed
    const wheel = (e: WheelEvent) => {
      const z = zoomRef.current;
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        zoomAt(z.k * Math.exp(-e.deltaY * 0.01), e.clientX, e.clientY);
      } else if (z.k > 1) {
        e.preventDefault();
        zoomAt(z.k, e.clientX, e.clientY, -e.deltaX, -e.deltaY);
      }
    };

    // one finger or the mouse drags the zoomed preview around, once it has moved a little
    let drag: { id: number; x: number; y: number; moved: boolean } | null = null;
    const pointerDown = (e: PointerEvent) => {
      if (zoomRef.current.k > 1 && e.isPrimary && !pinch) {
        drag = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false };
      }
    };
    const pointerMove = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id || pinch) return;
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      if (!drag.moved && Math.hypot(dx, dy) < DRAG_SLOP) return;
      // a drag: keep following the finger even if it slides off the preview
      if (!drag.moved) capture(stage, e.pointerId);
      drag.moved = true;
      zoomAt(zoomRef.current.k, e.clientX, e.clientY, dx, dy);
      drag.x = e.clientX;
      drag.y = e.clientY;
    };
    const pointerUp = (e: PointerEvent) => {
      if (drag?.id === e.pointerId) drag = null;
    };

    const listeners: [string, EventListener, AddEventListenerOptions?][] = [
      ['touchstart', touchStart as EventListener, { passive: false }],
      ['touchmove', touchMove as EventListener, { passive: false }],
      ['touchend', touchEnd as EventListener],
      ['touchcancel', touchEnd as EventListener],
      ['wheel', wheel as EventListener, { passive: false }],
      ['pointerdown', pointerDown as EventListener],
      ['pointermove', pointerMove as EventListener],
      ['pointerup', pointerUp as EventListener],
      ['pointercancel', pointerUp as EventListener],
    ];
    for (const [type, fn, opts] of listeners) stage.addEventListener(type, fn, opts);
    return () => {
      for (const [type, fn] of listeners) stage.removeEventListener(type, fn);
    };
  }, [stageRef, canvasRef]);

  return { zoom, resetZoom: () => setZoom(NONE) };
}

function capture(el: HTMLElement, pointerId: number) {
  try {
    el.setPointerCapture(pointerId);
  } catch {
    // the pointer is already gone
  }
}
