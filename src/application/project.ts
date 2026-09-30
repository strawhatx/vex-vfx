// The film: the videos added to it, played one after another (see domain/project/sequence), each
// edited by an Editor of its own, with its subject layers (objects cut out of it: see
// domain/project/overlay), music under them (see domain/project/music), and looks over everything
// (filters and screen effects: see domain/project/looks). One history to undo covers all of it.
//
// Times: everything in and out is the film's time unless said otherwise. Clip ids are unique across
// the film: each video numbers its clips from its own base (REEL_IDS apart); an overlay takes the
// id of the cutout that cuts it (a copy of one gets a number of the film's own, below REEL_IDS).
import { DEFAULT_FX, Editor, type EditorSave, type EditorState } from './editor';
import {
  STILL,
  setTransformAt,
  toggleKey,
  resetTransform,
  keyAt,
  type Background,
  type Transform,
} from '@/domain/project/cutout';
import {
  overlayAt,
  overlayTransform,
  showingAt,
  trimSpan,
  upgradeOverlay,
  type Overlay,
} from '@/domain/project/overlay';
import { filmLength, layoutReels, nextReel, reelAt } from '@/domain/project/sequence';
import { NO_ANIM, hasAnim, type AnimKind, type AnimSlot, type ClipAnim } from '@/domain/effects/animation';
import { FULL, type Crop } from '@/domain/project/crop';
import {
  musicRange,
  newMusic,
  placeMusic,
  trimMusic,
  withVolume,
  type MusicClip,
} from '@/domain/project/music';
import {
  looksAt,
  lookRange,
  particlesAt,
  newLook,
  placeLook,
  trimLook,
  textsAt,
  withControl,
  withPlace,
  withPreset,
  withScope,
  withText,
  backgroundOnly,
  type LookClip,
  type Scope,
} from '@/domain/project/looks';
import type { Place } from '@/domain/project/drawOrder';
import type { ParamValue } from '@/domain/effects/params';
import { controlDefaults, upToDate, type LookGroup, type Preset } from '@/domain/effects/presets';
import { ownCopy } from '@/domain/effects/custom';
import type { TextPlace } from '@/domain/effects/typeset';
import {
  effectRange,
  effectsAt,
  newEffectClip,
  placeEffect,
  trimEffect,
  withLook,
  type EffectClip,
  type PackItem,
} from '@/domain/project/effectClips';
import { transitionAt, withTransition, type Played, type Transition } from '@/domain/project/transitions';
import {
  assignLayerRows,
  assignRows,
  copiedInto,
  layerOf,
  type Lane,
  type Track,
} from '@/domain/project/track';
import type { Selection, TrackMeta } from '@/domain/tracking/types';
import type { JobStatus } from './jobs';
import type { Analysis, CutFrame, EffectLayers, OverlayPictures } from './ports';

export const REEL_IDS = 100000;
// music is numbered from here, apart from every clip
export const MUSIC_IDS = 1_000_000_000;
// and looks from here, and effect clips from here
export const LOOK_IDS = 1_500_000_000;
export const EFFECT_IDS = 1_800_000_000;

// what each video needs from the outside: its own analysis and its own drawing
export interface ReelPorts {
  analysis: Analysis;
  layers: EffectLayers;
}

// a video of the film: where it plays, for how long, and whether its frames are listed yet
export interface ReelInfo {
  id: number;
  at: number;
  length: number;
  scanned: boolean;
}

// film k of video `reel` (a kept scene of it: see edit.ts): the stretch of the video it plays (s, e:
// the video's own time), where it starts in the film, and how fast it plays (so how long it plays
// for: see filmLength); pitch: its sound's pitch changes with its speed
export interface Film {
  reel: number;
  k: number;
  s: number;
  e: number;
  at: number;
  speed: number;
  pitch: boolean;
  anim: ClipAnim;
  noBackground: boolean; // its background hidden: just what's cut out of it shows
}

// how long a film plays for
export const playTime = (f: Pick<Film, 's' | 'e' | 'speed'>) => (f.e - f.s) / f.speed;

export interface ProjectState {
  reels: ReelInfo[];
  films: Film[];
  lanes: Lane[]; // effects and impacts (on `rows`), then overlays (on `cutRows`)
  rows: number;
  cutRows: number;
  music: (MusicClip & { row: number })[]; // on the Audio layer, on `audioRows`
  audioRows: number;
  transitions: Transition[]; // at the joins between films (see transitions.ts)
  effectClips: (EffectClip & { row: number })[]; // on the Effect clips layer, on `effectRows`
  effectRows: number;
  looks: (LookClip & { row: number })[]; // filters and screen effects, each on its group's layer
  lookRows: Record<LookGroup, number>;
  crop: Crop; // the film's frame, cropped (see crop.ts)
  length: number;
  scan: number | null; // a video's frames being listed: how far
  job: JobStatus | null; // analysis work in progress
  hasEffects: boolean;
  canUndo: boolean;
  canRedo: boolean;
}

export interface ProjectEvents {
  changed(state: ProjectState, drawn: boolean): void;
  status(message: string): void;
  // a video's frame size for analysis is known
  meta(reel: number, meta: TrackMeta): void;
}

interface Reel {
  id: number;
  editor: Editor;
  state: EditorState;
  srcLength: number; // its own length, as the player plays it
  file: Blob; // the video
  source: string; // its file's fingerprint ('': not known yet): uses of the same file share their tracing
}

// the film as it's kept to open again later: its videos (the files and each one's edits and
// tracking), what's over and under them, and where numbering carries on from. What can be undone
// isn't kept.
export interface SavedFilm {
  version: typeof SAVE_VERSION;
  reels: { id: number; file: Blob; editor: EditorSave; source?: string }[];
  overlays: Overlay[];
  music: { clip: MusicClip; file: Blob }[];
  looks: LookClip[];
  transitions: Transition[];
  effectClips: EffectClip[];
  packs: { id: string; file: Blob }[]; // the library videos the effect clips play
  crop: Crop;
  next: { reel: number; overlay: number; music: number; look: number; effect: number };
}

export const SAVE_VERSION = 1;

// the film as it was, to go back to (each video's own edits are undone by its editor)
interface Snap {
  reels: Reel[];
  overlays: Overlay[];
  nextOverlay: number;
  music: MusicClip[];
  looks: LookClip[];
  transitions: Transition[];
  effectClips: EffectClip[];
  crop: Crop;
}

// one step to undo: the editors that kept a step of their own for it, in order, and the film as it
// was, if the step changed it
interface Step {
  editors: Editor[];
  snap: Snap | null;
}

const HISTORY = 60;
const MERGE_MS = 1200;

const EMPTY: ProjectState = {
  reels: [],
  films: [],
  lanes: [],
  rows: 0,
  cutRows: 0,
  music: [],
  audioRows: 0,
  transitions: [],
  effectClips: [],
  effectRows: 0,
  looks: [],
  lookRows: { filter: 0, screen: 0, text: 0 },
  crop: FULL,
  length: 0,
  scan: null,
  job: null,
  hasEffects: false,
  canUndo: false,
  canRedo: false,
};

export class Project {
  private reels: Reel[] = [];
  private overlays: Overlay[] = [];
  private music: MusicClip[] = [];
  // each music clip's sound file (kept after it's deleted, as it can come back with undo)
  private musicFiles = new Map<number, Blob>();
  private looks: LookClip[] = [];
  private transitions: Transition[] = [];
  private effectClips: EffectClip[] = [];
  // each library video an effect clip plays (kept after it's deleted, as it can come back with undo)
  private packFiles = new Map<string, Blob>();
  private nextEffect = EFFECT_IDS;
  private crop: Crop = FULL;
  private nextMusic = MUSIC_IDS;
  private nextLook = LOOK_IDS;
  private nextReel = 1;
  // what was traced in videos taken out of the film, by file, for a use of the same file to reuse
  // (kept until the film is closed: see docs/timeline-rules.md, rule 10)
  private tracedOut = new Map<string, readonly Track[]>();
  private nextOverlay = 1;
  private undos: Step[] = [];
  private redos: Step[] = [];
  private capture: Step | null = null; // the step being made: editors that record join it
  private merge: { key: string; at: number } | null = null;
  private state: ProjectState = EMPTY;

  constructor(
    private ports: (reel: number) => ReelPorts,
    private pictures: OverlayPictures,
    private events: ProjectEvents,
  ) {}

  // ---------- the videos ----------

  // adds a video to the film (at the end, or before video `index`); its frames are listed once the
  // player knows how long it is (see scanVideo)
  addVideo(file: Blob, index = this.reels.length) {
    return this.step(undefined, () => this.insertReel(file, index));
  }

  // how long the video plays in the player: its frames are listed from there
  scanVideo(id: number, length: number) {
    const r = this.reel(id);
    if (!r) return;
    r.srcLength = length;
    r.editor.scan(length);
    this.publish(true);
  }

  // the fingerprint of video `id`'s file, once it's worked out: from then on, it shares what's traced
  // with every other use of the same file (see Editor.addTrack)
  identify(id: number, source: string) {
    const r = this.reel(id);
    if (r) r.source = source;
  }

  // takes a video out of the film, and the subject layers cut from it (undo brings them back)
  removeVideo(id: number) {
    const k = this.reels.findIndex(r => r.id === id);
    if (k < 0) return false;
    this.step(undefined, () => {
      this.keepTraced(this.reels[k]);
      this.reels.splice(k, 1);
      this.overlays = this.overlays.filter(o => o.source.reel !== id);
      this.publish(true);
    });
    return true;
  }

  // moves a video to position `index` in the film
  moveVideo(id: number, index: number) {
    const k = this.reels.findIndex(r => r.id === id);
    const to = Math.max(0, Math.min(this.reels.length - 1, index));
    if (k < 0 || k === to) return false;
    this.step(undefined, () => {
      const [r] = this.reels.splice(k, 1);
      this.reels.splice(to, 0, r);
      this.publish(true);
    });
    return true;
  }

  // a copy of film k (of state.films) straight after its video: the same video again, with just
  // that stretch of it kept, at the same speed and moving the same way, and a copy of the effects,
  // impacts and cutouts on it, tracked as they were (each cutout's subject layers copied too, cut
  // out again for the copy). The copy's id, to load its video into; null if there's no such film
  duplicateFilm(k: number) {
    const f = this.state.films[k];
    const at = this.reels.findIndex(r => r.id === f?.reel);
    if (!f || at < 0) return null;
    const from = this.reels[at];
    const edits = from.editor.saved();
    return this.step(undefined, () => {
      const id = this.insertReel(from.file, at + 1, undefined, from.source);
      const ed = this.reel(id)!.editor;
      const first = ed.saved().nextId;
      const copies = copiedInto(edits.tracks, f, first);
      const tracks = copies.map(c => c.track);
      // (each copy's tracked frames are its original's)
      const spans = new Map(edits.tracked);
      // (every scene but this one taken out)
      const starts = [0, ...edits.cuts];
      ed.restoreSaved({
        ...ed.saved(),
        tracks,
        nextId: first + tracks.length,
        tracked: copies.flatMap(c => {
          const span = spans.get(c.from);
          return span ? [[c.track.id, span] as const] : [];
        }),
        cuts: edits.cuts,
        gone: starts.filter(s => Math.abs(s - f.s) > 1e-6),
        speeds: edits.speeds.filter(x => Math.abs(x.s - f.s) < 1e-6),
        anims: edits.anims.filter(x => Math.abs(x.s - f.s) < 1e-6),
        hidden: f.noBackground ? [f.s] : [],
      });
      // each copied cutout's subject layers, placed and animated as they were (their frames and
      // pictures come once the copy is listed and cut out: see sync)
      for (const c of copies) {
        if (c.track.kind !== 'cutout') continue;
        for (const o of this.overlays.filter(x => x.source.reel === from.id && x.source.track === c.from))
          this.overlays.push({
            ...o,
            id: o.id === c.from ? c.track.id : this.nextOverlay++,
            source: { reel: id, track: c.track.id },
            src: { ...c.track.range },
            frames: [],
            row: null,
          });
      }
      this.publish(true);
      return id;
    });
  }

  // film k (of state.films) played backwards: `reversed` (its stretch of video made backwards) in
  // its place, as a video of its own straight after its video, at the same speed and moving the
  // same way; the film itself is taken out (the effects on it stay with that video). The new
  // video's id, to load it into; null if there's no such film
  reverseFilm(k: number, reversed: Blob) {
    const f = this.state.films[k];
    const at = this.reels.findIndex(r => r.id === f?.reel);
    if (!f || at < 0) return null;
    return this.step(undefined, () => {
      const id = this.insertReel(reversed, at + 1);
      const ed = this.reel(id)!.editor;
      const moves = hasAnim(f.anim);
      ed.restoreSaved({
        ...ed.saved(),
        speeds: f.speed !== 1 || f.pitch ? [{ s: 0, speed: f.speed, pitch: f.pitch }] : [],
        anims: moves ? [{ s: 0, anim: f.anim }] : [],
        hidden: f.noBackground ? [0] : [],
      });
      this.reels[at].editor.deleteScene(f.k);
      return id;
    });
  }

  // video `id`'s file
  videoFile(id: number) {
    return this.reel(id)?.file ?? null;
  }

  // where a video is in the film (-1: not in it)
  indexOf(id: number) {
    return this.reels.findIndex(r => r.id === id);
  }

  // puts another video in its place
  replaceVideo(id: number, file: Blob) {
    const k = this.reels.findIndex(r => r.id === id);
    if (k < 0) return this.addVideo(file);
    return this.step(undefined, () => {
      this.keepTraced(this.reels[k]);
      this.reels.splice(k, 1);
      // (what was cut out of the old footage goes with it)
      this.overlays = this.overlays.filter(o => o.source.reel !== id);
      return this.insertReel(file, k);
    });
  }

  get videoCount() {
    return this.reels.length;
  }

  // the editor of a video in the film
  editorOf(reel: number) {
    return this.reel(reel)?.editor ?? null;
  }

  // the video a clip is on (an overlay: the one it's cut from), if it's in the film
  videoOf(id: number) {
    const o = this.overlay(id);
    const reel = o ? o.source.reel : Math.floor(id / REEL_IDS);
    return this.reel(reel) ? reel : null;
  }

  // ---------- time ----------

  get length() {
    return filmLength(this.spans());
  }

  // where film time t plays: the video, the time in it (its own program time: see edit.ts), and
  // where it starts in the film; null when there's nothing to play
  locate(t: number) {
    const spans = this.spans(),
      k = reelAt(spans, t);
    if (k < 0) return null;
    return { reel: this.reels[k].id, t: Math.max(0, t - spans[k].at), at: spans[k].at };
  }

  // where video `reel` starts in the film
  startOf(reel: number) {
    const k = this.reels.findIndex(r => r.id === reel);
    return k < 0 ? 0 : this.spans()[k].at;
  }

  // the video that plays after `reel`, or null at the end
  nextVideo(reel: number) {
    const k = this.reels.findIndex(r => r.id === reel);
    const n = k < 0 ? -1 : nextReel(this.spans(), k);
    return n < 0 ? null : this.reels[n].id;
  }

  // ---------- the footage ----------

  // splits the film playing at t into two
  split(t: number) {
    const at = this.locate(t);
    const ed = at && this.editorOf(at.reel);
    return !!ed && ed.split(ed.frameAt(at.t));
  }

  // film k (of this.state.films) plays at `speed`; pitch: its sound's pitch changes with it
  setSpeed(k: number, speed: number, pitch: boolean) {
    const f = this.state.films[k];
    return !!f && !!this.editorOf(f.reel)?.setSpeed(f.k, speed, pitch);
  }

  // film k's animation of this kind (in, out or combo) set, or taken off (null)
  setFilmAnim(k: number, kind: AnimKind, slot: AnimSlot | null) {
    const f = this.state.films[k];
    return !!f && !!this.editorOf(f.reel)?.setAnim(f.k, kind, slot);
  }

  // film k's background hidden (on), leaving what's cut out of it, or shown again
  setNoBackground(k: number, on: boolean) {
    const f = this.state.films[k];
    return !!f && !!this.editorOf(f.reel)?.setNoBackground(f.k, on);
  }

  // deletes film k (of this.state.films)
  deleteFilm(k: number) {
    const f = this.state.films[k];
    return !!f && !!this.editorOf(f.reel)?.deleteScene(f.k);
  }

  // the film playing at t (index into films)
  filmAt(t: number) {
    const films = this.state.films;
    const k = films.findIndex(f => t >= f.at - 1e-6 && t < f.at + playTime(f) - 1e-6);
    return k >= 0 ? k : Math.max(0, films.length - 1);
  }

  // ---------- subject layers ----------
  // What's cut out of a video: the clip seen through its object's outline (see overlay.ts). Each
  // belongs to its video and shows only while the frames it's cut from play there.

  // cuts out the object tapped at frame i of video `reel` (see Editor.addCutout): it's tracked and
  // cut there, and becomes a subject layer of that video
  addCutout(reel: number, i: number, sel: Selection, bg: Background, focus: { w: number; h: number } | null) {
    const r = this.reel(reel);
    if (!r) return null;
    return this.step(undefined, () => {
      const track = r.editor.addCutout(i, sel, bg, focus);
      const cut = track !== null ? r.editor.cutoutOf(track) : null;
      if (track === null || !cut) return null;
      const { W, H } = r.editor.frameSize;
      const o: Overlay = {
        ...STILL,
        id: track,
        name: r.editor.name(track),
        color: r.editor.color(track),
        row: null,
        source: { reel, track },
        aspect: W && H ? W / H : 16 / 9,
        src: { ...cut.range },
        frames: cut.frames,
        anim: NO_ANIM,
      };
      this.overlays.push(o);
      this.publish(true);
      return o.id;
    });
  }

  overlay(id: number | null) {
    return this.overlays.find(o => o.id === id) ?? null;
  }

  // the subject layers, top last
  get overlayList(): readonly Overlay[] {
    return this.overlays;
  }

  // the subject layers of the video playing at film time t, and the time in that video (null: none
  // plays there)
  subjectsAt(t: number): { overlays: Overlay[]; time: number } | null {
    const at = this.locate(t);
    const time = at && this.videoTime(at.reel, t);
    if (!at || time === null || time === undefined) return null;
    return { overlays: this.overlays.filter(o => o.source.reel === at.reel), time };
  }

  // ---------- checking a cutout's outlines ----------
  // A subject layer is cut out once its outlines have been checked (see Editor.startReview): the
  // frames of its video, fixed with taps like an effect's.

  // the video a subject layer is cut from, its cutout there, and that video's editor
  sourceOf(id: number) {
    const o = this.overlay(id);
    const r = o && this.reel(o.source.reel);
    return o && r ? { reel: o.source.reel, track: o.source.track, editor: r.editor } : null;
  }

  startReview(id: number) {
    const src = this.sourceOf(id);
    return !!src && src.editor.startReview(src.track);
  }

  // done checking: it's cut out
  finishReview(id: number) {
    this.sourceOf(id)?.editor.finishReview();
  }

  // which stretch of its video it's cut from (the video's own time); commitOverlayRange once the
  // change is done tracks what it grew into
  setCutoutSpan(id: number, r: { s?: number; e?: number }) {
    const src = this.sourceOf(id);
    const o = this.overlay(id);
    if (!src || !o) return;
    this.step(`range:${id}`, () => {
      src.editor.setCutoutRange(src.track, trimSpan(o.src, r, { s: 0, e: src.editor.sourceLength }));
      this.publish(true);
    });
  }

  // the top subject layer whose object is under (x, y) at film time t, in a W x H picture
  overlayAt(t: number, x: number, y: number, W: number, H: number) {
    const at = this.subjectsAt(t);
    return (at && overlayAt(at.overlays, at.time, x, y, W, H)?.id) ?? null;
  }

  showing(id: number, t: number) {
    const o = this.overlay(id);
    const time = o && this.videoTime(o.source.reel, t);
    return !!o && time !== null && showingAt(o, time);
  }

  transformAt(id: number, t: number): Transform | null {
    const o = this.overlay(id);
    return o ? overlayTransform(o, this.videoTime(o.source.reel, t) ?? o.src.s) : null;
  }

  // whether it has a transform keyframe at film time t; and whether it has any
  moveKeyAt(id: number, t: number) {
    const o = this.overlay(id);
    const time = o && this.videoTime(o.source.reel, t);
    return !!o && time !== null && !!keyAt(o, time);
  }
  hasMoveKeys(id: number) {
    return !!this.overlay(id)?.keys.length;
  }

  // moves, scales, turns or fades it at film time t (while it shows): the whole layer, or with
  // keyframes, the one there
  setTransform(id: number, t: number, p: Partial<Transform>) {
    this.changeAt(id, t, (o, time) => setTransformAt(o, time, p), `move:${id}`);
  }

  toggleMoveKey(id: number, t: number) {
    this.changeAt(id, t, (o, time) => toggleKey(o, time));
  }

  resetTransform(id: number) {
    this.changeOverlay(id, o => resetTransform(o));
  }

  // moves its start or end to film time s or e: which frames of its video it's cut from (it can grow
  // into more of the video, cut once commitOverlayRange is called)
  setOverlayRange(id: number, r: { s?: number; e?: number }) {
    const o = this.overlay(id);
    const v = o && this.reel(o.source.reel);
    if (!o || !v) return;
    const start = this.startOf(v.id);
    const time = (t: number, end: boolean) => v.editor.toSource(Math.max(0, t - start), end);
    this.setCutoutSpan(id, {
      ...(r.s !== undefined && { s: time(r.s, false) }),
      ...(r.e !== undefined && { e: time(r.e, true) }),
    });
  }

  // the change to its range is done: what it grew into is cut out
  commitOverlayRange(id: number) {
    this.merge = null;
    const src = this.sourceOf(id);
    if (src) src.editor.commitRange(src.track);
  }

  // what it leaves in its video where it was cut from
  background(id: number): Background | null {
    const src = this.sourceOf(id);
    return (src && src.editor.cutoutOf(src.track)?.bg) ?? null;
  }

  setBackground(id: number, bg: Background) {
    const src = this.sourceOf(id);
    if (src) src.editor.setBackground(src.track, bg);
  }

  // a copy of it (moved, animated and faded on its own), on the row below: the same object in the
  // same frames of the same video
  duplicateOverlay(id: number) {
    const o = this.overlay(id);
    if (!o) return null;
    return this.step(undefined, () => {
      const d: Overlay = {
        ...o,
        id: this.nextOverlay++,
        name: `${o.name} copy`,
        row: o.row === null ? null : o.row + 1,
      };
      this.pictures.copy(o.id, d.id);
      this.overlays.push(d);
      this.publish(true);
      return d.id;
    });
  }

  // puts it on another row of the Cutouts layer (-1: a new one on top)
  moveOverlayRow(id: number, row: number) {
    this.changeOverlay(id, o => ({ ...o, row }));
  }

  deleteOverlay(id: number) {
    const o = this.overlay(id);
    if (!o) return;
    this.step(undefined, () => {
      this.overlays = this.overlays.filter(x => x !== o);
      // the cutout cutting it goes too, unless a copy still shows what it cuts
      const shared = this.overlays.some(
        x => x.source.reel === o.source.reel && x.source.track === o.source.track,
      );
      if (!shared) this.reel(o.source.reel)?.editor.deleteTrack(o.source.track);
      this.publish(true);
    });
  }

  // a subject layer's animation of this kind set, or taken off (null)
  setOverlayAnim(id: number, kind: AnimKind, slot: AnimSlot | null) {
    this.changeOverlay(id, o => ({ ...o, anim: { ...o.anim, [kind]: slot } }), `anim:${id}:${kind}`);
  }

  private changeOverlay(id: number, change: (o: Overlay) => Overlay, merge?: string) {
    const o = this.overlay(id);
    if (!o) return;
    this.step(merge, () => {
      const next = change(o);
      this.overlays = this.overlays.map(x => (x.id === id ? next : x));
      this.publish(true);
    });
  }

  // changeOverlay at film time t, given the time in its video then (nothing, if it isn't playing)
  private changeAt(id: number, t: number, change: (o: Overlay, time: number) => Overlay, merge?: string) {
    const o = this.overlay(id);
    const time = o && this.videoTime(o.source.reel, t);
    if (o && time !== null && time !== undefined) this.changeOverlay(id, x => change(x, time), merge);
  }

  // the time in video `reel` shown at film time t: null if another video plays then, or none
  private videoTime(reel: number, t: number) {
    const at = this.locate(t);
    const ed = at?.reel === reel ? this.reel(reel)?.editor : null;
    if (!at || !ed) return null;
    const time = ed.toSource(at.t);
    return ed.jumpFrom(time) === null ? time : null;
  }

  // ---------- the frame ----------

  // crops the film's frame (and turns it): everything on it is cropped together
  setCrop(crop: Crop) {
    this.step(undefined, () => {
      this.crop = { ...crop };
      this.publish(true);
    });
  }

  // ---------- music ----------

  // a sound file `length` seconds long, placed at film time `at` on the Audio layer (file: the sound,
  // kept to save with the film)
  addMusic(name: string, length: number, at: number, file?: Blob) {
    return this.step(undefined, () => {
      const m = newMusic(this.nextMusic++, name, length, Math.max(0, at), this.length);
      if (file) this.musicFiles.set(m.id, file);
      this.music.push(m);
      this.publish();
      return m.id;
    });
  }

  musicClip(id: number | null) {
    return this.music.find(m => m.id === id) ?? null;
  }

  // what's on the Audio layer
  get musicList(): readonly MusicClip[] {
    return this.music;
  }

  // moves its start or end (film time), keeping what plays where it is; live while dragging
  setMusicRange(id: number, r: { s?: number; e?: number }) {
    this.changeMusic(id, m => trimMusic(m, r), `music:${id}`);
  }

  placeMusic(id: number, at: number) {
    this.changeMusic(id, m => placeMusic(m, at));
  }

  moveMusicRow(id: number, row: number) {
    this.changeMusic(id, m => ({ ...m, row }));
  }

  setMusicVolume(id: number, volume: number) {
    this.changeMusic(id, m => withVolume(m, volume), `volume:${id}`);
  }

  deleteMusic(id: number) {
    if (!this.musicClip(id)) return;
    this.step(undefined, () => {
      this.music = this.music.filter(m => m.id !== id);
      this.publish();
    });
  }

  private changeMusic(id: number, change: (m: MusicClip) => MusicClip, merge?: string) {
    const m = this.musicClip(id);
    if (!m) return;
    this.step(merge, () => {
      const next = change(m);
      this.music = this.music.map(x => (x.id === id ? next : x));
      this.publish();
    });
  }

  // ---------- looks ----------

  // a look made from `preset`, placed at film time `at` on its group's layer
  addLook(preset: Preset, at: number) {
    if (preset.group === 'motion') return null; // (an animation for a clip, not a clip of its own)
    return this.step(undefined, () => {
      const c = newLook(this.nextLook++, preset, Math.max(0, at), this.length);
      this.looks.push(c);
      this.publish(true);
      return c.id;
    });
  }

  look(id: number | null) {
    return this.looks.find(c => c.id === id) ?? null;
  }

  get lookList(): readonly LookClip[] {
    return this.looks;
  }

  // what the looks draw at film time t, in order
  looksAt(t: number, group?: LookGroup, on?: 'background' | 'subject') {
    return looksAt(this.looks, t, group, on);
  }

  // the particle emitters the looks draw over the frame at film time t
  particlesAt(t: number) {
    return particlesAt(this.looks, t);
  }

  // the texts on at film time t, as they're drawn (place: just those behind the subject, or in front)
  textsAt(t: number, place?: Place) {
    return textsAt(this.looks, t, place);
  }

  // what a filter applies to: the whole clip, just its background, or just what's cut out of it
  setLookScope(id: number, scope: Scope) {
    if (this.look(id)?.preset.group === 'filter') this.changeLook(id, c => withScope(c, scope));
  }

  // a text drawn behind what's cut out of the clip, or in front
  setLookPlace(id: number, place: Place) {
    if (this.look(id)?.text) this.changeLook(id, c => withPlace(c, place));
  }

  // how many filters on film k apply to just its background (which it hides: see setNoBackground)
  backgroundOnlyOn(k: number) {
    const f = this.state.films[k];
    return f ? backgroundOnly(this.looks, { s: f.at, e: f.at + playTime(f) }) : 0;
  }

  // a text's words, or where it's placed (live while dragging it)
  setLookText(id: number, p: Partial<TextPlace>) {
    this.changeLook(id, c => withText(c, p), `text:${id}:${Object.keys(p).join()}`);
  }

  // a text's animation of this kind set, or taken off (null)
  setLookAnim(id: number, kind: AnimKind, slot: AnimSlot | null) {
    this.changeLook(id, c => ({ ...c, anim: { ...c.anim, [kind]: slot } }), `anim:${id}:${kind}`);
  }

  // moves its start or end (film time); live while dragging
  setLookRange(id: number, r: { s?: number; e?: number }) {
    this.changeLook(id, c => trimLook(c, r), `look:${id}`);
  }

  placeLook(id: number, at: number) {
    this.changeLook(id, c => placeLook(c, at));
  }

  moveLookRow(id: number, row: number) {
    this.changeLook(id, c => ({ ...c, row }));
  }

  // another preset of the same group in its place, keeping its timing
  setLookPreset(id: number, preset: Preset) {
    const c = this.look(id);
    if (!c || c.preset.group !== preset.group) return false;
    this.changeLook(id, x => withPreset(x, preset));
    return true;
  }

  // its effect customized: `edit` made to its own copy of its template (see effects/custom.ts)
  customizeLook(id: number, edit: (p: Preset) => Preset, merge?: string) {
    this.changeLook(
      id,
      c => {
        const preset = edit(ownCopy(c.preset, c.values));
        return { ...c, preset, values: controlDefaults(preset) };
      },
      merge && `custom:${id}:${merge}`,
    );
  }

  setLookControl(id: number, control: string, v: ParamValue) {
    this.changeLook(id, c => withControl(c, control, v), `control:${id}:${control}`);
  }

  // a copy, straight after it on the same row
  duplicateLook(id: number) {
    const c = this.look(id);
    if (!c) return null;
    return this.step(undefined, () => {
      const d: LookClip = { ...c, id: this.nextLook++, at: c.at + c.len };
      this.looks.push(d);
      this.publish(true);
      return d.id;
    });
  }

  deleteLook(id: number) {
    if (!this.look(id)) return;
    this.step(undefined, () => {
      this.looks = this.looks.filter(c => c.id !== id);
      this.publish(true);
    });
  }

  private changeLook(id: number, change: (c: LookClip) => LookClip, merge?: string) {
    const c = this.look(id);
    if (!c) return;
    this.step(merge, () => {
      const next = change(c);
      this.looks = this.looks.map(x => (x.id === id ? next : x));
      this.publish(true);
    });
  }

  // ---------- transitions ----------

  // the transition into film k (of this.state.films) made from `preset` (null: taken off), lasting
  // `duration` (its preset's own, if not given)
  setTransition(k: number, preset: Preset | null, duration?: number) {
    if (preset && preset.group !== 'transition') return false;
    const had = this.state.transitions;
    const next = withTransition(this.played(), had, k, preset, duration ?? preset?.length ?? 0);
    if (next.length === had.length && next.every((tr, j) => tr === had[j])) return false;
    this.step(undefined, () => {
      this.transitions = next;
      this.publish(true);
    });
    return true;
  }

  // how long the transition into film k lasts (live while dragging its slider)
  setTransitionDuration(k: number, duration: number) {
    const played = this.played(),
      f = played[k];
    const tr = f && this.transitions.find(x => x.reel === f.reel && Math.abs(x.s - f.s) < 1e-6);
    if (!tr) return;
    this.step(`transition:${f.reel}:${f.s}`, () => {
      this.transitions = withTransition(played, this.transitions, k, tr.preset, duration);
      this.publish(true);
    });
  }

  // the same transition at every join
  setTransitionEverywhere(preset: Preset | null, duration?: number) {
    const played = this.played();
    this.step(undefined, () => {
      let trs = this.transitions;
      for (let k = 1; k < played.length; k++)
        trs = withTransition(played, trs, k, preset, duration ?? preset?.length ?? 0);
      this.transitions = trs;
      this.publish(true);
    });
  }

  // what the transitions do at film time t
  transitionAt(t: number) {
    return transitionAt(this.played(), this.transitions, t);
  }

  // the films as transitions need them
  private played(): Played[] {
    return this.state.films.map(f => ({ reel: f.reel, s: f.s, at: f.at, length: playTime(f) }));
  }

  // ---------- effect clips ----------

  // a clip of library video `item` (its file: `file`), placed at film time `at`
  addEffectClip(item: PackItem, file: Blob, at: number) {
    return this.step(undefined, () => {
      const c = newEffectClip(this.nextEffect++, item, Math.max(0, at), this.length);
      this.packFiles.set(item.id, file);
      this.effectClips.push(c);
      this.publish(true);
      return c.id;
    });
  }

  effectClip(id: number | null) {
    return this.effectClips.find(c => c.id === id) ?? null;
  }

  // the clips playing at film time t, each with the time in its video then
  effectsAt(t: number, place?: Place) {
    return effectsAt(this.effectClips, t, place);
  }

  // an effect clip drawn behind what's cut out of the clip, or in front
  setEffectPlace(id: number, place: Place) {
    this.changeEffect(id, c => ({ ...c, place }));
  }

  setEffectRange(id: number, r: { s?: number; e?: number }) {
    this.changeEffect(id, c => trimEffect(c, r), `effect:${id}`);
  }

  placeEffect(id: number, at: number) {
    this.changeEffect(id, c => placeEffect(c, at));
  }

  moveEffectRow(id: number, row: number) {
    this.changeEffect(id, c => ({ ...c, row }));
  }

  // where it's put in the frame and how it's blended (live while dragging it or a slider)
  setEffectLook(id: number, p: Parameters<typeof withLook>[1]) {
    this.changeEffect(id, c => withLook(c, p), `effectlook:${id}:${Object.keys(p).join()}`);
  }

  // a copy, straight after it on the same row
  duplicateEffect(id: number) {
    const c = this.effectClip(id);
    if (!c) return null;
    return this.step(undefined, () => {
      const d: EffectClip = { ...c, id: this.nextEffect++, at: effectRange(c).e };
      this.effectClips.push(d);
      this.publish(true);
      return d.id;
    });
  }

  deleteEffect(id: number) {
    if (!this.effectClip(id)) return;
    this.step(undefined, () => {
      this.effectClips = this.effectClips.filter(c => c.id !== id);
      this.publish(true);
    });
  }

  // the library videos the effect clips play, by id
  get packsInUse() {
    const ids = new Set(this.effectClips.map(c => c.pack));
    return [...this.packFiles].filter(([id]) => ids.has(id)).map(([id, file]) => ({ id, file }));
  }

  private changeEffect(id: number, change: (c: EffectClip) => EffectClip, merge?: string) {
    const c = this.effectClip(id);
    if (!c) return;
    this.step(merge, () => {
      const next = change(c);
      this.effectClips = this.effectClips.map(x => (x.id === id ? next : x));
      this.publish(true);
    });
  }

  // ---------- saving ----------

  // the film as it's kept to open again later
  saved(): SavedFilm {
    return {
      version: SAVE_VERSION,
      reels: this.reels.map(r => ({ id: r.id, file: r.file, editor: r.editor.saved(), source: r.source })),
      overlays: this.overlays.slice(),
      music: this.music.flatMap(clip => {
        const file = this.musicFiles.get(clip.id);
        return file ? [{ clip, file }] : [];
      }),
      looks: this.looks.slice(),
      transitions: this.transitions.slice(),
      effectClips: this.effectClips.slice(),
      packs: this.packsInUse,
      crop: this.crop,
      next: {
        reel: this.nextReel,
        overlay: this.nextOverlay,
        music: this.nextMusic,
        look: this.nextLook,
        effect: this.nextEffect,
      },
    };
  }

  // a saved film opened, in place of what's here: its videos come back with the same ids (each
  // one's edits put back once its frames are listed: see scanVideo), and nothing to undo. False if
  // it was saved in a way this can't open.
  open(s: SavedFilm) {
    if (s?.version !== SAVE_VERSION) return false;
    this.reels = [];
    this.tracedOut = new Map();
    s.reels.forEach((r, k) => {
      this.insertReel(r.file, k, r.id, r.source ?? '');
      this.reel(r.id)!.editor.restoreSaved(r.editor);
    });
    // (layers saved before they were kept to their video: timed in it now; any whose video had been
    // taken out have nothing left to show)
    const ids = new Set(s.reels.map(r => r.id));
    this.overlays = s.overlays.map(upgradeOverlay).filter(o => ids.has(o.source.reel));
    const dropped = s.overlays.length - this.overlays.length;
    if (dropped)
      this.events.status(
        `${dropped} cutout${dropped > 1 ? 's' : ''} from videos no longer in the film ${dropped > 1 ? 'were' : 'was'} left out.`,
      );
    this.music = s.music.map(m => m.clip);
    this.musicFiles = new Map(s.music.map(m => [m.clip.id, m.file]));
    this.looks = s.looks.map(c => ({ ...c, preset: upToDate(c.preset) }));
    this.transitions = s.transitions.map(c => ({ ...c, preset: upToDate(c.preset) }));
    this.effectClips = (s.effectClips ?? []).slice();
    this.packFiles = new Map((s.packs ?? []).map(p => [p.id, p.file]));
    this.nextEffect = s.next.effect ?? EFFECT_IDS;
    this.crop = s.crop;
    this.nextReel = s.next.reel;
    this.nextOverlay = s.next.overlay;
    this.nextMusic = s.next.music;
    this.nextLook = s.next.look;
    this.undos = [];
    this.redos = [];
    this.merge = null;
    this.publish(true);
    return true;
  }

  // the videos' files, and the music's, by id (to play them)
  get files() {
    return {
      reels: this.reels.map(r => ({ id: r.id, file: r.file, source: r.source })),
      music: this.music.flatMap(m => {
        const file = this.musicFiles.get(m.id);
        return file ? [{ id: m.id, file }] : [];
      }),
    };
  }

  // ---------- undo ----------

  undo() {
    const st = this.undos.pop();
    if (!st) return false;
    const redo: Step = { editors: st.editors.slice(), snap: st.snap && this.snapshot() };
    for (const ed of [...st.editors].reverse()) ed.undo();
    if (st.snap) this.restore(st.snap);
    this.redos.push(redo);
    this.merge = null;
    this.syncAll();
    this.publish(true);
    return true;
  }

  redo() {
    const st = this.redos.pop();
    if (!st) return false;
    const undo: Step = { editors: st.editors.slice(), snap: st.snap && this.snapshot() };
    if (st.snap) this.restore(st.snap);
    for (const ed of st.editors) ed.redo();
    this.undos.push(undo);
    this.merge = null;
    this.syncAll();
    this.publish(true);
    return true;
  }

  // runs a change to the film as one step to undo (changes of the same kind, `merge`, close
  // together are one step); editors that keep steps of their own while it runs join it
  private step<T>(merge: string | undefined, change: () => T): T {
    const now = Date.now();
    if (merge && this.merge?.key === merge && now - this.merge.at < MERGE_MS) {
      this.merge.at = now;
      return change();
    }
    this.merge = merge ? { key: merge, at: now } : null;
    const step: Step = { editors: [], snap: this.snapshot() };
    this.push(step);
    const outer = this.capture;
    this.capture = step;
    try {
      return change();
    } finally {
      this.capture = outer;
    }
  }

  // an editor kept a step of its own
  private recorded(ed: Editor) {
    if (this.capture) this.capture.editors.push(ed);
    else {
      this.merge = null;
      this.push({ editors: [ed], snap: null });
    }
  }

  private push(step: Step) {
    this.undos.push(step);
    if (this.undos.length > HISTORY) this.undos.shift();
    this.redos = [];
  }

  private snapshot(): Snap {
    return {
      reels: this.reels.slice(),
      overlays: this.overlays.slice(),
      nextOverlay: this.nextOverlay,
      music: this.music.slice(),
      looks: this.looks.slice(),
      transitions: this.transitions.slice(),
      effectClips: this.effectClips.slice(),
      crop: this.crop,
    };
  }

  private restore(s: Snap) {
    this.reels = s.reels.slice();
    this.overlays = s.overlays.slice();
    this.nextOverlay = s.nextOverlay;
    this.music = s.music.slice();
    this.looks = s.looks.slice();
    this.transitions = s.transitions.slice();
    this.effectClips = s.effectClips.slice();
    this.crop = s.crop;
  }

  // ---------- internals ----------

  private insertReel(file: Blob, index: number, id = this.nextReel++, source = '') {
    const { analysis, layers } = this.ports(id);
    const reel = { id, srcLength: 0, file, source } as Reel;
    reel.editor = new Editor(
      analysis,
      layers,
      {
        changed: (s, drawn) => {
          reel.state = s;
          this.reelChanged(reel, drawn);
        },
        status: m => this.events.status(m),
        meta: m => this.events.meta(id, m),
        recorded: () => this.recorded(reel.editor),
        cutoutFrames: (track, frames) => this.cutFrames(reel, track, frames),
        cutoutTrimmed: (track, span) => this.cutTrimmed(reel, track, span),
        traced: () => this.tracedElsewhere(reel),
      },
      id * REEL_IDS,
    );
    reel.editor.load(file);
    this.reels.splice(index, 0, reel);
    this.publish(true);
    return id;
  }

  private reel(id: number) {
    return this.reels.find(r => r.id === id) ?? null;
  }

  // what's been traced in reel r's file by its other uses in the film, and ones taken out of it
  private tracedElsewhere(r: Reel): readonly Track[] {
    if (!r.source) return [];
    const others = this.reels.filter(o => o !== r && o.source === r.source).flatMap(o => o.editor.traced);
    return [...others, ...(this.tracedOut.get(r.source) ?? [])];
  }

  // what reel r traced, kept for a use of the same file to reuse, when it's taken out of the film
  private keepTraced(r: Reel) {
    if (!r.source || !r.editor.traced.length) return;
    const kept = this.tracedOut.get(r.source) ?? [];
    this.tracedOut.set(r.source, [...r.editor.traced, ...kept]);
  }

  private spans() {
    return layoutReels(this.reels.map(r => (r.state?.scanned ? r.state.length : r.srcLength)));
  }

  // the film time of `t` in video r's own time
  private filmTimeOf(r: Reel, t: number) {
    return this.startOf(r.id) + r.editor.toProgram(t);
  }

  private reelChanged(r: Reel, drawn: boolean) {
    if (!this.reels.includes(r)) return;
    this.sync(r);
    this.publish(drawn);
  }

  // overlays cut from video r take what's cut as it's tracked
  private sync(r: Reel) {
    this.overlays = this.overlays.map(o => {
      if (o.source.reel !== r.id) return o;
      const cut = r.editor.cutoutOf(o.source.track);
      return cut ? { ...o, src: { ...cut.range }, frames: cut.frames } : o;
    });
  }

  private syncAll() {
    for (const r of this.reels) this.sync(r);
  }

  // a cutout's pictures, as they're cut: for each overlay showing what it cuts
  private cutFrames(r: Reel, track: number, frames: CutFrame[]) {
    const { W, H } = r.editor.frameSize;
    const pics = frames
      .filter(f => f.cut !== undefined)
      .map(f => ({
        t: r.editor.frameTime(f.i),
        cut: f.cut
          ? { image: f.cut.image, x: f.cut.x / W, y: f.cut.y / H, w: f.cut.w / W, h: f.cut.h / H }
          : null,
      }));
    if (!pics.length) return;
    for (const o of this.overlays)
      if (o.source.reel === r.id && o.source.track === track) this.pictures.put(o.id, pics);
  }

  private cutTrimmed(r: Reel, track: number, span: { s: number; e: number }) {
    const ed = r.editor;
    const s = ed.frameTime(span.s),
      e = span.e < ed.frameCount ? ed.frameTime(span.e) : Infinity;
    for (const o of this.overlays)
      if (o.source.reel === r.id && o.source.track === track) this.pictures.trim(o.id, { s, e });
  }

  // the film as the timeline shows it
  private publish(drawn = false) {
    const spans = this.spans();
    const lanes: Lane[] = [],
      films: Film[] = [];
    this.reels.forEach((r, k) => {
      const s = r.state;
      if (!s) return;
      const at = spans[k].at;
      const shift = <X extends { s: number; e: number }>(x: X): X => ({ ...x, s: x.s + at, e: x.e + at });
      for (const l of s.lanes)
        lanes.push({
          ...l,
          reel: r.id,
          range: shift(l.range),
          spans: l.spans.map(shift),
          keys: l.keys.map(t => t + at),
        });
      s.scenes.forEach((p, j) =>
        films.push({
          reel: r.id,
          k: j,
          s: p.s,
          e: p.e,
          at: at + p.at,
          speed: p.speed,
          pitch: p.pitch,
          anim: p.anim,
          noBackground: p.noBackground,
        }),
      );
    });
    const { rows, counts } = assignLayerRows(
      lanes.map(l => ({ range: l.range, layer: layerOf(l), row: l.row })),
    );
    lanes.forEach((l, k) => (l.row = rows[k]));
    // (a subject layer shows where the frames it's cut from play in the film)
    const shown = this.overlays.map(o => this.shownRange(o));
    const cutRows = assignRows(
      shown,
      this.overlays.map(o => o.row),
    );
    this.overlays.forEach((o, k) => (o.row = cutRows[k]));
    const overlayLanes = this.overlays.flatMap((o, k) =>
      shown[k].e - shown[k].s > 1e-6 ? [this.overlayLane(o, shown[k], cutRows[k])] : [],
    );
    const audioRows = assignRows(
      this.music.map(musicRange),
      this.music.map(m => m.row),
    );
    const count = (r: number[]) => (r.length ? Math.max(...r) + 1 : 0);
    // each group's looks on rows of their own
    const lookRow = new Map<number, number>(),
      lookRows: Record<LookGroup, number> = { filter: 0, screen: 0, text: 0 };
    for (const group of Object.keys(lookRows) as LookGroup[]) {
      const mine = this.looks.filter(c => c.preset.group === group);
      const got = assignRows(
        mine.map(lookRange),
        mine.map(c => c.row),
      );
      mine.forEach((c, k) => lookRow.set(c.id, got[k]));
      lookRows[group] = count(got);
    }
    this.looks.forEach(c => (c.row = lookRow.get(c.id) ?? 0));
    const effectRows = assignRows(
      this.effectClips.map(effectRange),
      this.effectClips.map(c => c.row),
    );
    const reels = this.reels.map((r, k) => ({
      id: r.id,
      at: spans[k].at,
      length: spans[k].length,
      scanned: !!r.state?.scanned,
    }));
    this.state = {
      reels,
      films,
      lanes: [...lanes, ...overlayLanes],
      rows: counts.effects,
      cutRows: count(cutRows),
      music: this.music.map((m, k) => ({ ...m, row: audioRows[k] })),
      audioRows: count(audioRows),
      transitions: this.transitions,
      effectClips: this.effectClips.map((c, k) => ({ ...c, row: effectRows[k] })),
      effectRows: count(effectRows),
      looks: this.looks.map(c => ({ ...c, row: lookRow.get(c.id) ?? 0 })),
      lookRows,
      crop: this.crop,
      length: filmLength(spans),
      scan: this.reels.find(r => r.state?.scan != null)?.state.scan ?? null,
      job: this.reels.find(r => r.state?.job)?.state.job ?? null,
      hasEffects:
        this.overlays.length > 0 ||
        this.music.length > 0 ||
        this.looks.length > 0 ||
        this.effectClips.length > 0 ||
        this.reels.some(r => r.state?.hasEffects),
      canUndo: this.undos.length > 0,
      canRedo: this.redos.length > 0,
    };
    this.events.changed(this.state, drawn);
  }

  // when a subject layer shows in the film: where the frames it's cut from play
  private shownRange(o: Overlay) {
    const r = this.reel(o.source.reel);
    return r ? { s: this.filmTimeOf(r, o.src.s), e: this.filmTimeOf(r, o.src.e) } : { s: 0, e: 0 };
  }

  private overlayLane(o: Overlay, range: { s: number; e: number }, row: number): Lane {
    const r = this.reel(o.source.reel);
    const cut = r?.editor.cutoutOf(o.source.track);
    return {
      id: o.id,
      name: o.name,
      color: o.color,
      kind: 'cutout',
      pinned: false,
      fx: DEFAULT_FX,
      body: null,
      burst: null,
      impact: null,
      aim: { h: 90, v: 0, target: null },
      speed: 1,
      range,
      row,
      reel: o.source.reel,
      spans: [{ ...range, weak: false }],
      keys: [],
      cutout: {
        from: range.s,
        bg: cut?.bg ?? 'keep',
        moves: r ? o.keys.map(k => this.filmTimeOf(r, k.t)) : [],
        anim: o.anim,
      },
    };
  }
}
