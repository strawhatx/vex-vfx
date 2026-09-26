// Messages between the editor and the analysis worker.
import type { Selection } from './objectTracker';
import type { TrackFrame, TrackMeta } from './types';

export type { Selection };

export type AnalyzeRequest = {
  type: 'analyze'; jobId: number; file: Blob;
  // where the user clicked, and the time of that frame
  start: number; select: Selection;
};
export type WorkerRequest = AnalyzeRequest | { type: 'cancel' };

export type WorkerMessage =
  | { type: 'meta'; jobId: number; meta: TrackMeta }
  | { type: 'frames'; jobId: number; frames: TrackFrame[]; done: number }
  | { type: 'done'; jobId: number }
  | { type: 'error'; jobId: number; message: string };
