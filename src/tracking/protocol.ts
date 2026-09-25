// Messages between the editor and the analysis worker.
import type { Selection } from './objectTracker';
import type { Subject, TrackFrame, TrackMeta } from './types';

export type { Selection };

export type AnalyzeRequest = {
  type: 'analyze'; jobId: number; file: Blob; subject: Subject;
  // object mode: where the user clicked or dragged, the time of that frame, and the trace tolerance
  start?: number; select?: Selection; tol?: number;
};
export type WorkerRequest = AnalyzeRequest | { type: 'cancel' };

export type WorkerMessage =
  | { type: 'meta'; jobId: number; meta: TrackMeta }
  | { type: 'frames'; jobId: number; frames: TrackFrame[]; done: number }
  | { type: 'done'; jobId: number }
  | { type: 'error'; jobId: number; message: string };
