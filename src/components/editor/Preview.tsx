// The video preview: the canvas the player draws on, fitted to the stage and zoomable, with what's
// shown over it (the empty state, progress, the recording light and short messages).
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from 'react';
import { Icon, I } from './icons';
import type { UiState } from './player';
import { usePreviewZoom } from './usePreviewZoom';

// statuses that don't need a message of their own
const QUIET = new Set(['Loading…', 'Video loaded.']);
const TOAST_MS = 3500;

export function Preview({
  ui,
  canvasRef,
  full,
  pointer,
  onChooseFile,
}: {
  ui: UiState;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  full: boolean; // full screen: the stage is a different size
  pointer: boolean; // taps on the preview select what's tapped
  onChooseFile(): void;
}) {
  const stageRef = useRef<HTMLElement>(null);
  const scanning = ui.scan !== null;
  const { zoom, resetZoom } = usePreviewZoom(stageRef, canvasRef, ui.reels[0]?.src ?? null);

  // fit the canvas inside the stage, keeping its aspect
  const fit = useCallback(() => {
    const stage = stageRef.current;
    const canvas = canvasRef.current;
    if (!stage || !canvas || !canvas.width) return;
    const r = stage.getBoundingClientRect();
    const k = Math.min(r.width / canvas.width, r.height / canvas.height);
    canvas.style.width = `${Math.floor(canvas.width * k)}px`;
    canvas.style.height = `${Math.floor(canvas.height * k)}px`;
  }, [canvasRef]);
  useLayoutEffect(() => {
    const ro = new ResizeObserver(fit);
    if (stageRef.current) ro.observe(stageRef.current);
    return () => ro.disconnect();
  }, [fit]);
  useLayoutEffect(fit, [fit, ui.ready, scanning, full, ui.lanes.length]);

  // a new status shows for a few seconds
  const [seenStatus, setSeenStatus] = useState('');
  const toast = ui.status && ui.status !== seenStatus && !QUIET.has(ui.status) ? ui.status : '';
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setSeenStatus(toast), TOAST_MS);
    return () => clearTimeout(id);
  }, [toast]);

  const scanPct = Math.round((ui.scan ?? 0) * 100);

  return (
    <section ref={stageRef} className={`stage${zoom.k > 1 ? ' zoomed' : ''}`} aria-label="Video preview">
      <canvas
        ref={canvasRef}
        className={`view${pointer ? ' tracked' : ''}${ui.ready ? '' : ' hidden'}`}
        width={960}
        height={540}
        style={zoom.k > 1 ? { transform: `translate(${zoom.x}px, ${zoom.y}px) scale(${zoom.k})` } : undefined}
        aria-label="Video. Tap an object to track it. Pinch to zoom, then drag to move around."
      />

      {zoom.k > 1 && (
        <button type="button" className="zoom-reset" onClick={resetZoom} aria-label="Reset zoom">
          <Icon d={I.shrink} size={16} />
          {Math.round(zoom.k * 100)}%
        </button>
      )}

      {!ui.ready && !ui.camera && (
        <div className="empty">
          <button type="button" className="import" onClick={() => onChooseFile()}>
            <Icon d={I.plus} size={28} />
          </button>
          <strong>New project</strong>
          <span>Import a clip under 20 seconds, then tap what the effect should follow.</span>
        </div>
      )}

      {scanning && (
        <div
          className="analyzing"
          role="progressbar"
          aria-label="Reading the clip"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={scanPct}
        >
          <div className="ring" style={{ '--p': `${scanPct}%` } as CSSProperties}>
            <span>{scanPct}%</span>
          </div>
          Reading clip…
        </div>
      )}

      {ui.job && !scanning && (
        <div className="job" role="status">
          <span
            className="job-bar"
            style={{ '--p': `${Math.round(ui.job.progress * 100)}%` } as CSSProperties}
          />
          {ui.job.label}
        </div>
      )}

      <div className={`rec${ui.recording || ui.camera ? ' on' : ''}`}>REC</div>

      {/* hints aren't shown over the video (they got in the way); screen readers still hear them */}
      <div className="sr-only" aria-live="polite">
        {ui.hint}
      </div>

      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </section>
  );
}
