// What the editor needs from the outside world, named by what it does. The browser adapters
// in infrastructure/ implement these; tests use in-memory fakes.
import type { ImpactLook, ImpactStyle } from '@/domain/effects/impacts';
import type { FxSettings } from '@/domain/effects/palettes';
import type { ObjectPass } from '@/domain/effects/passes';
import type { PackItem } from '@/domain/project/effectClips';
import type { SavedFilm } from './project';
import type { Aim, Cam } from '@/domain/effects/laser';
import type { Background } from '@/domain/project/cutout';
import type { EdgeSettings } from '@/domain/project/edge';
import type { BodyPart } from '@/domain/tracking/bodyParts';
import type { ClipFrame, Rle, Selection, Shape, TrackFrame, TrackMeta } from '@/domain/tracking/types';

interface JobEvents {
  progress(done: number, total: number): void;
  done(): void;
  error(message: string): void;
}

// Analyses the clip, one job at a time; starting a job cancels the one in progress.
export interface Analysis {
  // lists every frame the player can show, in clip time (0 at its first frame; playerLength: how
  // long the player can play)
  scan(
    source: Blob,
    playerLength: number,
    on: JobEvents & { scanned(meta: TrackMeta, frames: ClipFrame[]): void },
  ): void;
  // follows the object at `select` in frame times[key], forward to the end of times then back to the
  // start; part: follows that body part of the person at `select` instead of the object there
  // ('body': the whole person); focus: only looks for the object in a box this size around it (see
  // Track.focus); wholePerson: if `select` is on a person, follows the whole of them instead
  track(
    source: Blob,
    req: {
      times: number[];
      key: number;
      select: Selection;
      part?: BodyPart;
      focus?: { w: number; h: number };
      wholePerson?: boolean;
    },
    on: JobEvents & { shapes(shapes: { i: number; shape: Shape }[]): void },
  ): void;
  // whether the tap at `at` in the frame at t is on a person, and the body part nearest it
  probe(
    source: Blob,
    req: { t: number; at: Selection },
    on: Omit<JobEvents, 'progress'> & { probed(part: BodyPart | null): void },
  ): void;
  // the camera's path through the clip (frames `times`, in order), from the first frame
  camera(source: Blob, times: number[], on: JobEvents & { path(path: ({ i: number } & Cam)[]): void }): void;
  // cuts the object out of frames `times` along its outlines (`masks`, one per frame; null where it
  // wasn't found) and, with `plate`, rebuilds the background behind it from the frames around
  // (`cam`: the camera's path at each frame, to line them up). Frames come back with i indexing times.
  cutout(
    source: Blob,
    // feather: how soft the cut's edge is (output pixels)
    req: { times: number[]; masks: (Rle | null)[]; plate: boolean; cam: (Cam | null)[]; feather: number },
    on: JobEvents & { frames(frames: CutFrame[]): void },
  ): void;
  cancel(): void;
}

// a picture cut from a frame, and where it sits in that frame (work pixels; the picture itself can
// be sharper than that)
export interface Sprite {
  image: ImageBitmap;
  x: number;
  y: number;
  w: number;
  h: number;
}

// one frame of a cutout: the object cut out, and the background rebuilt where it was (for a
// cutout that removes it). Either can come on its own: left out, what the frame had stays; null,
// there's none.
export interface CutFrame {
  i: number;
  cut?: Sprite | null;
  plate?: Sprite | null;
}

// one clip for the renderer: an effect (drawn continuously) or an impact (just its burst); its
// track data (one entry per clip frame), settings, outline color, when it starts and ends (seconds;
// outside that it draws nothing at all), and its impacts (frame of the hit and style; each plays
// out for its style's duration; tap: where on the object it was tapped, frame and work pixels,
// so the burst lands on that spot rather than the middle of the object)
// A cutout's range is the frames it's cut from; `cutout` says what's left in the footage there (the
// layer itself is drawn by the film: see Overlays).
export interface LayerSpec {
  id: number;
  kind: 'effect' | 'impact' | 'cutout';
  pinned: boolean; // at a spot in the scene (an impact, or an effect from a spot)
  frames: TrackFrame[];
  settings: FxSettings;
  // what it draws on its object, back to front (see effects/body.ts); null: drawn its own way
  // (water, lasers, text, a glitch over the whole frame, impacts, cutouts)
  passes: ObjectPass[] | null;
  color: string;
  range: { s: number; e: number };
  aim: Aim; // for a laser
  tap: { i: number; x: number; y: number } | null; // where it was first tapped (a laser on an object fires from there)
  // (look: what the burst is, from its style or its burst preset)
  impacts: {
    id: number;
    i: number;
    style: ImpactStyle;
    look: ImpactLook;
    tap?: { i: number; x: number; y: number };
  }[];
  cutout: { bg: Background; edge: EdgeSettings } | null;
}

// Draws each effect over the video.
export interface EffectLayers {
  // every frame of the clip, and for each frame the first frame of its scene (effects restart
  // at a scene's first frame; unsplit, the whole clip is one scene)
  setClip(frames: TrackFrame[], segmentStart: Int32Array): void;
  setLayers(specs: LayerSpec[]): void;
  // the camera's path through the clip (one entry per clip frame, filled in as it's worked out), so
  // spots can stay put in the scene
  setCamera(path: (Cam | null)[]): void;
  // a layer's track data changed in place
  changed(id: number): void;
  // a cutout's frames, as they're cut out (i: clip frame); they replace any it had for those frames
  cutoutFrames(id: number, frames: CutFrame[]): void;
  // drops a cutout's frames outside [s, e) (clip frames), when it's cut from fewer
  trimCutout(id: number, span: { s: number; e: number }): void;
}

// a cut-out picture of an overlay, and where it sits in the frame it was cut from (fractions of
// that frame)
export interface OverlaySprite {
  image: ImageBitmap;
  x: number;
  y: number;
  w: number;
  h: number;
}

// Keeps the pictures cut for each overlay (see domain/project/overlay), so it can be drawn without
// the video it was cut from.
export interface OverlayPictures {
  // pictures for times of its video (seconds); null: nothing was cut there
  put(id: number, frames: { t: number; cut: OverlaySprite | null }[]): void;
  // drops its pictures outside [s, e) (its video's time)
  trim(id: number, span: { s: number; e: number }): void;
  // gives overlay `to` the same pictures as `from` (a copy of it)
  copy(from: number, to: number): void;
}

// what's shown of a saved film in a list of them: its name, when it was saved, and a small picture
// of it (null if there wasn't one to take)
export interface FilmInfo {
  id: string;
  name: string;
  savedAt: number; // ms since 1970
  picture: Blob | null;
}

// Keeps films on this device, to open again later (the clips never leave it).
export interface FilmStore {
  // the film saved under this id, or null if there's none (or it can't be read)
  load(id: string): Promise<SavedFilm | null>;
  save(id: string, film: SavedFilm, info: Omit<FilmInfo, 'id'>): Promise<void>;
  // every film kept, the last saved first
  list(): Promise<FilmInfo[]>;
  remove(id: string): Promise<void>;
}

// The library of effect videos the user has added, kept on this device for any project.
export interface PackLibrary {
  // the last added first; picture: a small one of it (null if there wasn't one to take)
  list(): Promise<{ item: PackItem; file: Blob; picture: Blob | null }[]>;
  add(item: PackItem, file: Blob, picture: Blob | null): Promise<void>;
  remove(id: string): Promise<void>;
}
