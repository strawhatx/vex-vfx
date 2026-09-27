// Messages between the editor and the analysis worker. The worker runs one job at a time:
// list the clip's frames, or track an object from a keyframe.
import type { BodyPart } from '@/domain/tracking/bodyParts';
import type { ClipFrame, Selection, Shape, TrackMeta } from '@/domain/tracking/types';

// playerLength: how much of the clip the page's video player can play, from its first frame
export type ScanRequest = { type: 'scan'; jobId: number; clipId: number; file: Blob; playerLength: number };
// times: the frames to cover, in order; key: index in times of the frame the object was tapped
// on. Tracks forward from the key to the end of times, then backward to the start. pin: also follow
// the tapped spot itself (for impacts); part: follow that body part of the person tapped instead of
// the object under the tap
export type TrackRequest = { type: 'track'; jobId: number; clipId: number; file: Blob; times: number[]; key: number; select: Selection; pin?: boolean; part?: BodyPart };
// t: the frame's time; at: where it was tapped
export type ProbeRequest = { type: 'probe'; jobId: number; clipId: number; file: Blob; t: number; at: Selection };
// clipId: the same for every job on the same file, so the worker can keep it open between jobs
export type JobRequest = ScanRequest | TrackRequest | ProbeRequest;
export type WorkerRequest = JobRequest | { type: 'cancel' };

export type WorkerMessage =
  | { type: 'progress'; jobId: number; done: number; total: number }
  | { type: 'scanned'; jobId: number; meta: TrackMeta; frames: ClipFrame[] }
  // i: index into the request's times
  | { type: 'shapes'; jobId: number; shapes: { i: number; shape: Shape }[] }
  // the body part nearest the tap, or null when it wasn't on a person
  | { type: 'probed'; jobId: number; part: BodyPart | null }
  | { type: 'done'; jobId: number }
  | { type: 'error'; jobId: number; message: string };
