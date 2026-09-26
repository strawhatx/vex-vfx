// Messages between the editor and the analysis worker. The worker runs one job at a time:
// scan the clip for its frames and cuts, track an object from a keyframe, or look for an
// object in a frame by how it looks.
import type { Appearance } from '@/domain/tracking/appearance';
import type { ClipFrame, Selection, Shape, TrackMeta } from '@/domain/tracking/types';

export type ScanRequest = { type: 'scan'; jobId: number; file: Blob };
// times: the frames to cover, in order; key: index in times of the frame the object was tapped
// on. Tracks forward from the key to the end of times, then backward to the start.
export type TrackRequest = { type: 'track'; jobId: number; file: Blob; times: number[]; key: number; select: Selection };
export type FindRequest = { type: 'find'; jobId: number; file: Blob; t: number; want: Appearance };
export type JobRequest = ScanRequest | TrackRequest | FindRequest;
export type WorkerRequest = JobRequest | { type: 'cancel' };

export type Found = { x: number; y: number; score: number } | null;

export type WorkerMessage =
  | { type: 'progress'; jobId: number; done: number; total: number }
  | { type: 'scanned'; jobId: number; meta: TrackMeta; frames: ClipFrame[]; cuts: number[] }
  // i: index into the request's times
  | { type: 'shapes'; jobId: number; shapes: { i: number; shape: Shape }[] }
  | { type: 'appearance'; jobId: number; appearance: Appearance | null }
  | { type: 'found'; jobId: number; hit: Found }
  | { type: 'done'; jobId: number }
  | { type: 'error'; jobId: number; message: string };
