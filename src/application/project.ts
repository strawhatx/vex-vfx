// The film: the videos added to it, played one after another (see domain/project/sequence), each
// edited by an Editor of its own, the overlays over them all (objects cut out of them: see
// domain/project/overlay), music under them (see domain/project/music), and looks over everything
// (filters and screen effects: see domain/project/looks). One history to undo covers all of it.
//
// Times: everything in and out is the film's time unless said otherwise. Clip ids are unique across
// the film: each video numbers its clips from its own base (REEL_IDS apart); an overlay takes the
// id of the cutout that cuts it (a copy of one gets a number of the film's own, below REEL_IDS).
import { DEFAULT_FX, Editor, type EditorState } from './editor';
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
  overlayLength,
  overlayTransform,
  showingAt,
  shownRange,
  trimmed,
  type Overlay,
} from '@/domain/project/overlay';
import { filmLength, layoutReels, nextReel, reelAt } from '@/domain/project/sequence';
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
  newLook,
  placeLook,
  trimLook,
  withControl,
  withPreset,
  type LookClip,
} from '@/domain/project/looks';
import type { ParamValue } from '@/domain/effects/params';
import type { Preset, PresetGroup } from '@/domain/effects/presets';
import { assignLayerRows, assignRows, layerOf, type Lane } from '@/domain/project/track';
import type { Selection, TrackMeta } from '@/domain/tracking/types';
import type { JobStatus } from './jobs';
import type { Analysis, CutFrame, EffectLayers, OverlayPictures } from './ports';

export const REEL_IDS = 100000;
// music is numbered from here, apart from every clip
export const MUSIC_IDS = 1_000_000_000;
// and looks from here
export const LOOK_IDS = 1_500_000_000;

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
}

// how long a film plays for
export const playTime = (f: Pick<Film, 's' | 'e' | 'speed'>) => (f.e - f.s) / f.speed;

export interface ProjectState {
  reels: ReelInfo[];
  films: Film[];
  lanes: Lane[]; // effects and impacts (on `rows`), text (on `textRows`), then overlays (on `cutRows`)
  rows: number;
  textRows: number;
  cutRows: number;
  music: (MusicClip & { row: number })[]; // on the Audio layer, on `audioRows`
  audioRows: number;
  looks: (LookClip & { row: number })[]; // filters and screen effects, each on its group's layer
  lookRows: Record<PresetGroup, number>;
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
}

// the film as it was, to go back to (each video's own edits are undone by its editor)
interface Snap {
  reels: Reel[];
  overlays: Overlay[];
  nextOverlay: number;
  music: MusicClip[];
  looks: LookClip[];
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
  textRows: 0,
  cutRows: 0,
  music: [],
  audioRows: 0,
  looks: [],
  lookRows: { filter: 0, screen: 0 },
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
  private looks: LookClip[] = [];
  private crop: Crop = FULL;
  private nextMusic = MUSIC_IDS;
  private nextLook = LOOK_IDS;
  private nextReel = 1;
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

  // takes a video out of the film. What was cut out of it stays, as it was cut.
  removeVideo(id: number) {
    const k = this.reels.findIndex(r => r.id === id);
    if (k < 0) return false;
    this.step(undefined, () => {
      this.reels.splice(k, 1);
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

  // where a video is in the film (-1: not in it)
  indexOf(id: number) {
    return this.reels.findIndex(r => r.id === id);
  }

  // puts another video in its place
  replaceVideo(id: number, file: Blob) {
    const k = this.reels.findIndex(r => r.id === id);
    if (k < 0) return this.addVideo(file);
    return this.step(undefined, () => {
      this.reels.splice(k, 1);
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

  // ---------- overlays ----------

  // cuts out the object tapped at frame i of video `reel` (see Editor.addCutout): it's tracked and
  // cut there, and becomes an overlay of the film
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
        at: this.filmTimeOf(r, cut.range.s),
        src: { ...cut.range },
        frames: cut.frames,
      };
      this.overlays.push(o);
      this.publish(true);
      return o.id;
    });
  }

  overlay(id: number | null) {
    return this.overlays.find(o => o.id === id) ?? null;
  }

  // the overlays, top last
  get overlayList(): readonly Overlay[] {
    return this.overlays;
  }

  // ---------- checking a cutout's outlines ----------
  // An overlay is cut out once its outlines have been checked (see Editor.startReview): the frames
  // of the video it's cut from, fixed with taps like an effect's.

  // the video an overlay is cut from, its cutout there, and that video's editor
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

  // which stretch of its video it's cut from (the video's own time), keeping what shows where it is;
  // commitOverlayRange once the change is done tracks what it grew into
  setCutoutSpan(id: number, r: { s?: number; e?: number }) {
    const o = this.overlay(id);
    const ed = o && this.reel(o.source.reel)?.editor;
    if (!o || !ed) return;
    const film = (t: number) => o.at + (t - o.src.s);
    this.step(`range:${id}`, () => {
      const next = trimmed(
        o,
        { ...(r.s !== undefined && { s: film(r.s) }), ...(r.e !== undefined && { e: film(r.e) }) },
        { s: 0, e: ed.sourceLength },
      );
      this.overlays = this.overlays.map(x => (x.id === id ? next : x));
      ed.setCutoutRange(o.source.track, next.src);
      this.publish(true);
    });
  }

  // the top overlay whose object is under (x, y) at time t, in a W x H picture
  overlayAt(t: number, x: number, y: number, W: number, H: number) {
    return overlayAt(this.overlays, t, x, y, W, H)?.id ?? null;
  }

  showing(id: number, t: number) {
    const o = this.overlay(id);
    return !!o && showingAt(o, t);
  }

  transformAt(id: number, t: number): Transform | null {
    const o = this.overlay(id);
    return o ? overlayTransform(o, t) : null;
  }

  // whether it has a transform keyframe at time t; and whether it has any
  moveKeyAt(id: number, t: number) {
    const o = this.overlay(id);
    return !!o && !!keyAt(o, t - o.at);
  }
  hasMoveKeys(id: number) {
    return !!this.overlay(id)?.keys.length;
  }

  // moves, scales, turns or fades it at time t: the whole layer, or with keyframes, the one there
  setTransform(id: number, t: number, p: Partial<Transform>) {
    this.changeOverlay(id, o => setTransformAt(o, t - o.at, p), `move:${id}`);
  }

  toggleMoveKey(id: number, t: number) {
    this.changeOverlay(id, o => toggleKey(o, t - o.at));
  }

  resetTransform(id: number) {
    this.changeOverlay(id, o => resetTransform(o));
  }

  // starts it at time t (kept inside the film where it fits); its keyframes go with it
  placeAt(id: number, t: number) {
    this.changeOverlay(id, o => ({
      ...o,
      at: Math.max(0, Math.min(Math.max(0, this.length - overlayLength(o)), t)),
    }));
  }

  // moves its start or end, keeping what shows where it is (see trimmed). While the video it's cut
  // from is in the film it can grow into more of it (cut out once commitRange is called);
  // otherwise only within what was cut.
  setOverlayRange(id: number, r: { s?: number; e?: number }) {
    const o = this.overlay(id);
    if (!o) return;
    const src = this.reel(o.source.reel);
    const ed = src?.editor;
    const cut = ed?.cutoutOf(o.source.track);
    const f = o.frames;
    const limit =
      ed && cut
        ? { s: 0, e: ed.sourceLength }
        : { s: f[0]?.t ?? o.src.s, e: f.length ? f[f.length - 1].t + 1 / 30 : o.src.e };
    this.step(`range:${id}`, () => {
      const next = trimmed(o, r, limit);
      this.overlays = this.overlays.map(x => (x.id === id ? next : x));
      // more of the video to cut
      if (ed && cut && (next.src.s < cut.range.s - 1e-6 || next.src.e > cut.range.e + 1e-6))
        ed.setCutoutRange(o.source.track, {
          s: Math.min(cut.range.s, next.src.s),
          e: Math.max(cut.range.e, next.src.e),
        });
      this.publish(true);
    });
  }

  // the change to its range is done: what it grew into is cut out
  commitOverlayRange(id: number) {
    this.merge = null;
    const o = this.overlay(id);
    const ed = o && this.reel(o.source.reel)?.editor;
    if (o && ed) ed.commitRange(o.source.track);
  }

  // what it leaves in its video where it was cut from; null once that video is gone
  background(id: number): Background | null {
    const o = this.overlay(id);
    const ed = o && this.reel(o.source.reel)?.editor;
    return (o && ed?.cutoutOf(o.source.track)?.bg) ?? null;
  }

  setBackground(id: number, bg: Background) {
    const o = this.overlay(id);
    const ed = o && this.reel(o.source.reel)?.editor;
    if (o && ed) ed.setBackground(o.source.track, bg);
  }

  // a copy of it, on the row below, at the same time
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

  // puts it on another row of the overlays (-1: a new one on top)
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

  private changeOverlay(id: number, change: (o: Overlay) => Overlay, merge?: string) {
    const o = this.overlay(id);
    if (!o) return;
    this.step(merge, () => {
      const next = change(o);
      this.overlays = this.overlays.map(x => (x.id === id ? next : x));
      this.publish(true);
    });
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

  // a sound file `length` seconds long, placed at film time `at` on the Audio layer
  addMusic(name: string, length: number, at: number) {
    return this.step(undefined, () => {
      const m = newMusic(this.nextMusic++, name, length, Math.max(0, at), this.length);
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
  looksAt(t: number) {
    return looksAt(this.looks, t);
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
      crop: this.crop,
    };
  }

  private restore(s: Snap) {
    this.reels = s.reels.slice();
    this.overlays = s.overlays.slice();
    this.nextOverlay = s.nextOverlay;
    this.music = s.music.slice();
    this.looks = s.looks.slice();
    this.crop = s.crop;
  }

  // ---------- internals ----------

  private insertReel(file: Blob, index: number) {
    const id = this.nextReel++;
    const { analysis, layers } = this.ports(id);
    const reel = { id, srcLength: 0 } as Reel;
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
      return cut ? { ...o, frames: cut.frames } : o;
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
        films.push({ reel: r.id, k: j, s: p.s, e: p.e, at: at + p.at, speed: p.speed, pitch: p.pitch }),
      );
    });
    const { rows, counts } = assignLayerRows(
      lanes.map(l => ({ range: l.range, layer: layerOf(l), row: l.row })),
    );
    lanes.forEach((l, k) => (l.row = rows[k]));
    const cutRows = assignRows(
      this.overlays.map(shownRange),
      this.overlays.map(o => o.row),
    );
    this.overlays.forEach((o, k) => (o.row = cutRows[k]));
    const overlayLanes = this.overlays.map((o, k) => this.overlayLane(o, cutRows[k]));
    const audioRows = assignRows(
      this.music.map(musicRange),
      this.music.map(m => m.row),
    );
    const count = (r: number[]) => (r.length ? Math.max(...r) + 1 : 0);
    // each group's looks on rows of their own
    const lookRow = new Map<number, number>(),
      lookRows: Record<PresetGroup, number> = { filter: 0, screen: 0 };
    for (const group of Object.keys(lookRows) as PresetGroup[]) {
      const mine = this.looks.filter(c => c.preset.group === group);
      const got = assignRows(
        mine.map(lookRange),
        mine.map(c => c.row),
      );
      mine.forEach((c, k) => lookRow.set(c.id, got[k]));
      lookRows[group] = count(got);
    }
    this.looks.forEach(c => (c.row = lookRow.get(c.id) ?? 0));
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
      textRows: counts.text,
      cutRows: count(cutRows),
      music: this.music.map((m, k) => ({ ...m, row: audioRows[k] })),
      audioRows: count(audioRows),
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
        this.reels.some(r => r.state?.hasEffects),
      canUndo: this.undos.length > 0,
      canRedo: this.redos.length > 0,
    };
    this.events.changed(this.state, drawn);
  }

  private overlayLane(o: Overlay, row: number): Lane {
    const range = shownRange(o);
    const src = this.reel(o.source.reel);
    const cut = src?.editor.cutoutOf(o.source.track);
    return {
      id: o.id,
      name: o.name,
      color: o.color,
      kind: 'cutout',
      pinned: false,
      fx: DEFAULT_FX,
      impact: null,
      aim: { h: 90, v: 0, target: null },
      speed: 1,
      range,
      row,
      reel: o.source.reel,
      spans: [{ ...range, weak: false }],
      keys: [],
      cutout: {
        from: src && cut ? this.filmTimeOf(src, o.src.s) : null,
        bg: cut?.bg ?? 'keep',
        moves: o.keys.map(k => o.at + k.t),
      },
    };
  }
}
