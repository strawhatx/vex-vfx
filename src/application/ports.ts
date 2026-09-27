// What the editor needs from the outside world, named by what it does. The browser adapters
// in infrastructure/ implement these; tests use in-memory fakes.
import type { ImpactStyle } from '@/domain/effects/impacts';
import type { FxSettings } from '@/domain/effects/palettes';
import type { BodyPart } from '@/domain/tracking/bodyParts';
import type { ClipFrame, Selection, Shape, TrackFrame, TrackMeta } from '@/domain/tracking/types';

interface JobEvents {
  progress(done: number, total: number): void;
  done(): void;
  error(message: string): void;
}

// Analyses the clip, one job at a time; starting a job cancels the one in progress.
export interface Analysis {
  // lists every frame the player can show, in clip time (0 at its first frame; playerLength: how
  // long the player can play)
  scan(source: Blob, playerLength: number, on: JobEvents & { scanned(meta: TrackMeta, frames: ClipFrame[]): void }): void;
  // follows the object at `select` in frame times[key], forward to the end of times then back to the
  // start; pin: also follows that exact spot (Shape.pin); part: follows that body part of the
  // person at `select` instead of the object there
  track(source: Blob, req: { times: number[]; key: number; select: Selection; pin?: boolean; part?: BodyPart },
    on: JobEvents & { shapes(shapes: { i: number; shape: Shape }[]): void }): void;
  // whether the tap at `at` in the frame at t is on a person, and the body part nearest it
  probe(source: Blob, req: { t: number; at: Selection }, on: Omit<JobEvents, 'progress'> & { probed(part: BodyPart | null): void }): void;
  cancel(): void;
}

// one clip for the renderer: an effect (drawn continuously) or an impact (just its burst); its
// track data (one entry per clip frame), settings, outline color, when it starts and ends (seconds;
// outside that it draws nothing at all), and its impacts (frame of the hit and style; each plays
// out for its style's duration; tap: where on the object it was tapped, frame and work pixels,
// so the burst lands on that spot rather than the middle of the object)
export interface LayerSpec {
  id: number; kind: 'effect' | 'impact'; frames: TrackFrame[]; settings: FxSettings; color: string; range: { s: number; e: number };
  impacts: { id: number; i: number; style: ImpactStyle; tap?: { i: number; x: number; y: number } }[];
}

// Draws each effect over the video.
export interface EffectLayers {
  // every frame of the clip, and for each frame the first frame of its segment (effects restart
  // at a segment's first frame; the whole clip is one segment)
  setClip(frames: TrackFrame[], segmentStart: Int32Array): void;
  setLayers(specs: LayerSpec[]): void;
  // a layer's track data changed in place
  changed(id: number): void;
}
