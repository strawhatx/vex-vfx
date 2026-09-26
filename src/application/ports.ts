// What the editor needs from the outside world, named by what it does. The browser adapters
// in infrastructure/ implement these; tests use in-memory fakes.
import type { Appearance } from '@/domain/tracking/appearance';
import type { FxSettings } from '@/domain/effects/palettes';
import type { ClipFrame, Selection, Shape, TrackFrame, TrackMeta } from '@/domain/tracking/types';

interface JobEvents {
  progress(done: number, total: number): void;
  done(): void;
  error(message: string): void;
}

// Analyses the clip, one job at a time; starting a job cancels the one in progress.
export interface Analysis {
  // lists every frame of the clip and the frames that start a new shot
  scan(source: Blob, on: JobEvents & { scanned(meta: TrackMeta, frames: ClipFrame[], cuts: number[]): void }): void;
  // follows the object at `select` in frame times[key], forward to the end of times then back to the start
  track(source: Blob, req: { times: number[]; key: number; select: Selection },
    on: JobEvents & { appearance(a: Appearance | null): void; shapes(shapes: { i: number; shape: Shape }[]): void }): void;
  // the point in the frame at t whose object looks most like `want`, if any
  find(source: Blob, req: { t: number; want: Appearance }, on: JobEvents & { found(hit: { x: number; y: number } | null): void }): void;
  cancel(): void;
}

// one tracked object for the renderer: its track data (one entry per clip frame), its effect and outline color
export interface LayerSpec { id: number; frames: TrackFrame[]; settings: FxSettings; color: string }

// Draws each tracked object's effect over the video.
export interface EffectLayers {
  // every frame of the clip, and for each frame the index of the first frame of its shot
  setClip(frames: TrackFrame[], shotStart: Int32Array): void;
  setLayers(specs: LayerSpec[]): void;
  // a layer's track data changed in place
  changed(id: number): void;
}
