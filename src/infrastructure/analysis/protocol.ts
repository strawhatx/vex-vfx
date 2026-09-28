// Messages between the editor and the analysis worker. The worker runs one job at a time:
// list the clip's frames, or track an object from a keyframe.
import type { BodyPart } from '@/domain/tracking/bodyParts';
import type { Cam } from '@/domain/effects/laser';
import type { ClipFrame, Rle, Selection, Shape, TrackMeta } from '@/domain/tracking/types';

// playerLength: how much of the clip the page's video player can play, from its first frame
export type ScanRequest = { type: 'scan'; jobId: number; clipId: number; file: Blob; playerLength: number };
// times: the frames to cover, in order; key: index in times of the frame the object was tapped
// on. Tracks forward from the key to the end of times, then backward to the start. part: follow that
// body part of the person tapped instead of the object under the tap ('body': the whole person);
// wholePerson: if the tap is on a person, follow the whole of them rather than the object there
export type TrackRequest = {
  type: 'track';
  jobId: number;
  clipId: number;
  file: Blob;
  times: number[];
  key: number;
  select: Selection;
  part?: BodyPart;
  focus?: { w: number; h: number };
  wholePerson?: boolean;
};
// times: every frame of the clip, in order
export type CameraRequest = { type: 'camera'; jobId: number; clipId: number; file: Blob; times: number[] };
// t: the frame's time; at: where it was tapped
export type ProbeRequest = {
  type: 'probe';
  jobId: number;
  clipId: number;
  file: Blob;
  t: number;
  at: Selection;
};
// times: the frames to cut the object out of, in order; masks: its outline in each (null: not
// found); plate: rebuild the background behind it too; cam: the camera's path at each frame
export type CutoutRequest = {
  type: 'cutout';
  jobId: number;
  clipId: number;
  file: Blob;
  times: number[];
  masks: (Rle | null)[];
  plate: boolean;
  cam: (Cam | null)[];
  feather: number; // how soft its edge is (output pixels)
};
// a picture and where it sits in its frame, in work pixels
export type SpriteMsg = { image: ImageBitmap; x: number; y: number; w: number; h: number };
// clipId: the same for every job on the same file, so the worker can keep it open between jobs
export type JobRequest = ScanRequest | TrackRequest | ProbeRequest | CameraRequest | CutoutRequest;
export type WorkerRequest = JobRequest | { type: 'cancel' };

export type WorkerMessage =
  | { type: 'progress'; jobId: number; done: number; total: number }
  | { type: 'scanned'; jobId: number; meta: TrackMeta; frames: ClipFrame[] }
  // i: index into the request's times
  | { type: 'shapes'; jobId: number; shapes: { i: number; shape: Shape }[] }
  // the body part nearest the tap, or null when it wasn't on a person
  | { type: 'probed'; jobId: number; part: BodyPart | null }
  // the camera path for frames i of the request's times (see domain/effects/laser Cam)
  | { type: 'camera'; jobId: number; path: { i: number; s: number; tx: number; ty: number }[] }
  // i: index into the request's times; the images are transferred
  | {
      type: 'cutout';
      jobId: number;
      frames: { i: number; cut?: SpriteMsg | null; plate?: SpriteMsg | null }[];
    }
  | { type: 'done'; jobId: number }
  | { type: 'error'; jobId: number; message: string };
