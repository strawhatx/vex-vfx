// Editor-side handle on the analysis worker. One worker is kept for the session so loaded
// models are reused; starting a new analysis cancels the one in progress.
import type { AnalyzeRequest, WorkerMessage } from './protocol';
import type { TrackFrame, TrackMeta } from './types';

export interface AnalysisHandlers {
  meta(meta: TrackMeta): void;
  frames(frames: TrackFrame[], done: number): void;
  done(): void;
  error(message: string): void;
}

export class AnalysisClient {
  private worker: Worker | null = null;
  private jobId = 0;
  private handlers: AnalysisHandlers | null = null;

  start(req: Omit<AnalyzeRequest, 'type' | 'jobId'>, handlers: AnalysisHandlers) {
    const w = this.worker ??= this.spawn();
    this.handlers = handlers;
    w.postMessage({ type: 'analyze', jobId: ++this.jobId, ...req } satisfies AnalyzeRequest);
  }

  cancel() {
    this.handlers = null; this.jobId++;
    this.worker?.postMessage({ type: 'cancel' });
  }

  terminate() { this.handlers = null; this.worker?.terminate(); this.worker = null; }

  private spawn() {
    const w = new Worker(new URL('./analysis.worker.ts', import.meta.url), { type: 'module' });
    w.onmessage = (e: MessageEvent<WorkerMessage>) => {
      const m = e.data, h = this.handlers;
      if (!h || m.jobId !== this.jobId) return; // a cancelled job
      if (m.type === 'meta') h.meta(m.meta);
      else if (m.type === 'frames') h.frames(m.frames, m.done);
      else if (m.type === 'done') h.done();
      else h.error(m.message);
    };
    w.onerror = e => { this.handlers?.error(e.message || 'The analysis worker crashed.'); };
    return w;
  }
}
