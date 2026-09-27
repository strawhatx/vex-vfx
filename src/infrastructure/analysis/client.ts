// The Analysis port, backed by a Web Worker. One worker is kept for the session so loaded
// models and the open clip are reused. It runs one job at a time; starting a job cancels the
// one in progress.
import type { Analysis } from '@/application/ports';
import type { JobRequest, WorkerMessage } from './protocol';

type Handlers = { [K in WorkerMessage['type']]?: (m: Extract<WorkerMessage, { type: K }>) => void };
type Job<T extends JobRequest = JobRequest> = T extends JobRequest ? Omit<T, 'jobId'> : never;

export class AnalysisClient implements Analysis {
  private worker: Worker | null = null;
  private jobId = 0;
  private handlers: Handlers | null = null;
  private clipIds = new WeakMap<Blob, number>();
  private nextClipId = 1;

  scan: Analysis['scan'] = (file, playerLength, on) =>
    this.start(
      { type: 'scan', clipId: this.clipId(file), file, playerLength },
      {
        progress: m => on.progress(m.done, m.total),
        scanned: m => on.scanned(m.meta, m.frames),
        done: on.done,
        error: m => on.error(m.message),
      },
    );

  track: Analysis['track'] = (file, req, on) =>
    this.start(
      { type: 'track', clipId: this.clipId(file), file, ...req },
      {
        progress: m => on.progress(m.done, m.total),
        shapes: m => on.shapes(m.shapes),
        done: on.done,
        error: m => on.error(m.message),
      },
    );

  probe: Analysis['probe'] = (file, req, on) =>
    this.start(
      { type: 'probe', clipId: this.clipId(file), file, ...req },
      {
        probed: m => on.probed(m.part),
        done: on.done,
        error: m => on.error(m.message),
      },
    );

  camera: Analysis['camera'] = (file, times, on) =>
    this.start(
      { type: 'camera', clipId: this.clipId(file), file, times },
      {
        progress: m => on.progress(m.done, m.total),
        camera: m => on.path(m.path),
        done: on.done,
        error: m => on.error(m.message),
      },
    );

  cancel() {
    this.handlers = null;
    this.jobId++;
    this.worker?.postMessage({ type: 'cancel' });
  }

  terminate() {
    this.handlers = null;
    this.worker?.terminate();
    this.worker = null;
  }

  private clipId(file: Blob) {
    let id = this.clipIds.get(file);
    if (id === undefined) {
      id = this.nextClipId++;
      this.clipIds.set(file, id);
    }
    return id;
  }

  private start(req: Job, handlers: Handlers) {
    const w = (this.worker ??= this.spawn());
    this.handlers = handlers;
    w.postMessage({ ...req, jobId: ++this.jobId } as JobRequest);
  }

  private spawn() {
    const w = new Worker(new URL('./analysis.worker.ts', import.meta.url), { type: 'module' });
    w.onmessage = (e: MessageEvent<WorkerMessage>) => {
      const m = e.data,
        h = this.handlers;
      if (!h || m.jobId !== this.jobId) return; // a cancelled job
      // done and error end the job
      if (m.type === 'done' || m.type === 'error') this.handlers = null;
      (h[m.type] as ((m: WorkerMessage) => void) | undefined)?.(m);
    };
    w.onerror = e => {
      const h = this.handlers;
      this.handlers = null;
      h?.error?.({ type: 'error', jobId: this.jobId, message: e.message || 'The analysis worker crashed.' });
    };
    return w;
  }
}
