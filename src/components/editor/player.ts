// The page's controller and composition root: plugs the browser adapters (workers, renderers,
// mixer, recorder) into the Project, plays the film, draws each frame, turns taps on the preview
// into editing actions, and exports. React drives it through its methods and gets UI state back
// through onUi. It is the only UI module that imports infrastructure/.
//
// The film is its videos one after another (see application/project.ts). Each video has its own
// <video> element, analysis worker and renderer (which draws its frame and effects on a canvas of
// its own); the one playing is drawn into the preview, fitted, with the film's overlays (objects
// cut out) on top. Playing on past a video's end goes on to the next.
import { DEFAULT_FX, type Editor } from '@/application/editor';
import { Project, playTime, type Film, type ProjectState } from '@/application/project';
import {
  REST_POSE,
  combinePoses,
  hasAnim,
  poseAt,
  type AnimKind,
  type ClipAnim,
} from '@/domain/effects/animation';
import { overlayLength } from '@/domain/project/overlay';
import type { Transition } from '@/domain/project/transitions';
import { guessBlend, type EffectClip, type PackItem } from '@/domain/project/effectClips';
import { familyOf, type ImpactStyle } from '@/domain/effects/impacts';
import type { Background, Transform } from '@/domain/project/cutout';
import { fitRect } from '@/domain/project/overlay';
import type { EdgeSettings } from '@/domain/project/edge';
import {
  FULL,
  MAX_ROT,
  RATIOS,
  coverZoom,
  dragCorner,
  fromCropped,
  isFull,
  moveBox,
  withRatio,
  type Crop,
  type RatioId,
} from '@/domain/project/crop';
import type { MusicClip } from '@/domain/project/music';
import { presetById, presets } from '@/domain/effects/library';
import type { ParamValue } from '@/domain/effects/params';
import type { LookGroup, Preset, PresetGroup } from '@/domain/effects/presets';
import { MY_OWN, blankEffect } from '@/domain/effects/custom';
import {
  lookGroup,
  newLook,
  particlesAt,
  previewOf,
  textPreviewOf,
  type LookClip,
} from '@/domain/project/looks';
import type { TextPlace } from '@/domain/effects/typeset';
import type { PartOp } from '@/domain/project/parts';
import { nextFlagged, type Flag } from '@/domain/project/review';
import { canPin } from '@/domain/project/spot';
import type { Effect, FxSettings } from '@/domain/effects/palettes';
import type { Lane } from '@/domain/project/track';
import type { BodyPart } from '@/domain/tracking/bodyParts';
import { workSize, type Selection } from '@/domain/tracking/types';
import { AnalysisClient } from '@/infrastructure/analysis/client';
import { Mixer } from '@/infrastructure/audio/mixer';
import { soundLength } from '@/infrastructure/audio/soundFile';
import { clipPeaks, laneSound, WAVE_PER_S, type ClipWave } from '@/infrastructure/audio/waveform';
import { OverlayPainter } from '@/infrastructure/rendering/overlays';
import { IndexedDbFilmStore } from '@/infrastructure/storage/filmStore';
import { IndexedDbPackLibrary } from '@/infrastructure/storage/packLibrary';
import { EffectClipPainter } from '@/infrastructure/rendering/effectClips';
import { probeVideo } from '@/infrastructure/video/probe';
import { applyPose } from '@/infrastructure/rendering/pose';
import { LookPainter } from '@/infrastructure/rendering/gpu/looks';
import { TextClipPainter } from '@/infrastructure/rendering/textClips';
import { FrameParticles } from '@/infrastructure/rendering/frameParticles';
import { EffectPreviews, personSquare } from '@/infrastructure/rendering/effectPreviews';
import { Renderer } from '@/infrastructure/rendering/renderer';
import { FALLBACK_FONTS, type Fonts } from '@/infrastructure/rendering/fonts';
import { loadFonts } from './fonts';
import { makeFilmstrip } from '@/infrastructure/video/filmstrip';
import { onEachFrame, seekVideo, settleDuration } from '@/infrastructure/video/playback';
import {
  canRecord,
  startCameraCapture,
  startCanvasRecording,
  type Recording,
} from '@/infrastructure/video/recorder';
import { hintFor, type HintQueries, type HintState } from '@/application/hints';

export type { Lane, Film };

// a video of the film, as the timeline shows it: where it plays, and what's needed to show its
// filmstrip and sound
export interface ReelUi {
  id: number;
  at: number;
  length: number;
  scanned: boolean;
  src: string;
  videoStart: number; // the video element's time at its first frame
  srcDuration: number; // its own length the player can play
  wave: ClipWave | undefined; // its sound along its length; undefined while it's read
}

export interface UiState {
  ready: boolean; // a video is loaded
  playing: boolean;
  time: number;
  duration: number; // how long the film plays
  hint: string;
  status: string;
  // the film
  reels: ReelUi[];
  films: Film[];
  lanes: Lane[];
  rows: number;
  cutRows: number;
  scan: number | null;
  job: ProjectState['job'];
  canUndo: boolean;
  canRedo: boolean;
  // editing
  selected: number | null; // selected clip; taps on the preview fix its tracking
  adding: AddChoice | null; // what the next tap on the preview adds
  // where a new effect should come from, asked after the tap: a person's body part (suggested:
  // the nearest; null when it isn't a person), or (spot) the spot tapped, for effects that can
  // (for a glitch, the whole frame)
  choosing: { suggested: BodyPart | null; spot: boolean; effect: Effect } | null;
  // a new cutout was tapped: what to leave in the footage where it's cut from is being picked
  cutting: boolean;
  // the selected cutout at the playhead: its transform, whether a keyframe is there, and whether
  // it has any
  cutoutNow: { transform: Transform; onKey: boolean; keyed: boolean } | null;
  isolated: number | null; // a cutout shown on its own, without the footage or anything else
  aiming: number | null; // a laser whose target the next tap on the preview sets
  camera: boolean;
  recording: boolean;
  muted: boolean; // the videos' own sound is off
  canRecord: boolean;
  result: Recording | null;
  // the Audio layer: its music, each with its file's waveform (undefined while it's read), and rows
  music: MusicUi[];
  audioRows: number;
  // filters and screen effects on the film, each group on a layer of its own, and a picture of each
  // preset on the frame showing (by preset id; missing until made, or where the GPU can't)
  looks: LookUi[];
  lookRows: Record<LookGroup, number>;
  lookThumbs: Record<string, string>;
  transitions: Transition[]; // at the joins between films
  // effect clips on the film, on `effectRows`, and the library of effect videos they're from (each
  // with a picture of it, if there was one)
  effectClips: (EffectClip & { row: number })[];
  effectRows: number;
  packs: (PackItem & { picture: string | null })[];
  // the preview's size (px): the film's frame, cropped
  frame: { w: number; h: number };
  // the frame being cropped (see startCrop): the box and turn so far, and the ratio it's held to
  cropping: { crop: Crop; ratio: RatioId } | null;
  // a cutout's outlines being checked before it's cut out (see openReview)
  review: ReviewUi | null;
}

// a cutout being checked: the overlay, the video it's cut from and its cutout there, the frames it's
// cut from [s, e) (the video's) and when each starts, that stretch of the video (its own seconds)
// and the video's length, which frames look wrong, the frames it was picked or changed on, its edge
// settings, the frame showing and when it starts, and what taps and loops on the preview do now:
// add pieces, or take them out
// music on the Audio layer, with the waveform of the stretch it plays (empty until it's read)
export type MusicUi = MusicClip & { row: number; wave: number[] };
export type LookUi = LookClip & { row: number };

export interface ReviewUi {
  id: number;
  reel: number;
  track: number;
  name: string;
  s: number;
  e: number;
  times: number[];
  range: { s: number; e: number };
  length: number;
  flags: Flag[];
  keys: number[];
  edge: EdgeSettings;
  at: number;
  now: number;
  tool: PartOp;
  // the pen: taps place points of a shape one by one (points: how many so far)
  pen: { on: boolean; points: number };
  // the hand: a drag moves the zoomed preview about, and taps do nothing
  hand: boolean;
}

// makes a video's thumbnails, one per `step` seconds, reporting each as it's ready
export type MakeThumbs = (
  src: string,
  duration: number,
  videoStart: number,
  step: number,
  thumbW: number,
  thumbH: number,
  signal: AbortSignal,
  onThumb: (i: number, url: string) => void,
) => Promise<void>;

// where a new effect comes from: a body part, the object tapped, or the spot tapped
export type Source = BodyPart | 'object' | 'spot';

// a clip that can be animated: a film of the film (by its index), an overlay, or a text
export type AnimTarget = { film: number } | { overlay: number } | { look: number };

// what to add on the next tap: an effect with these settings (or made from body preset `body`), or
// an impact of this style
export type AddChoice =
  | { kind: 'effect'; fx: Partial<FxSettings>; body?: string }
  | { kind: 'impact'; style: ImpactStyle; fx?: Partial<FxSettings>; burst?: string }
  | { kind: 'cutout' };

// what the next tap adds, for the hint
const addingWhat = (a: AddChoice | null): HintState['adding'] => {
  if (!a || a.kind === 'effect' || a.kind === 'cutout') return a?.kind ?? null;
  const family = familyOf(a.style);
  return family === 'hit' ? 'impact' : family;
};

export const INITIAL_UI: UiState = {
  ready: false,
  playing: false,
  time: 0,
  duration: 0,
  hint: '',
  status: '',
  reels: [],
  films: [],
  lanes: [],
  rows: 0,
  cutRows: 0,
  scan: null,
  job: null,
  canUndo: false,
  canRedo: false,
  selected: null,
  adding: null,
  choosing: null,
  cutting: false,
  cutoutNow: null,
  isolated: null,
  aiming: null,
  camera: false,
  recording: false,
  muted: false,
  canRecord: false,
  result: null,
  music: [],
  audioRows: 0,
  looks: [],
  lookRows: { filter: 0, screen: 0, text: 0 },
  lookThumbs: {},
  transitions: [],
  effectClips: [],
  effectRows: 0,
  packs: [],
  frame: { w: 0, h: 0 },
  cropping: null,
  review: null,
};

const PEN_HINT = 'Pen: tap point by point round the piece. Tap the first point, or Close, to finish.';
// a tap this near a shape's first point (preview px) closes it
const CLOSE_PX = 12;
// the pointer over the preview with the pen: a pen, its tip on the spot
const PEN_CURSOR =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'%3E%3Cpath d='M3 21l1.5-5L16 4.5 19.5 8 8 19.5z' fill='%23fff' stroke='%23000' stroke-width='1.5' stroke-linejoin='round'/%3E%3Cpath d='M3 21l1.5-5 3.5 3.5z'/%3E%3C/svg%3E\") 3 21, crosshair";
// the pointer with Add and Remove: cross hairs (their middle on the spot), with a + or − beside
const markCursor = (mark: string) =>
  `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'%3E%3Cpath d='M12 3v6M12 15v6M3 12h6M15 12h6' stroke='%23000' stroke-width='3.5' stroke-linecap='round'/%3E%3Cpath d='M12 3v6M12 15v6M3 12h6M15 12h6' stroke='%23fff' stroke-width='1.5' stroke-linecap='round'/%3E%3Ccircle cx='18.5' cy='18.5' r='5' fill='%23fff' stroke='%23000'/%3E%3Cpath d='${mark}' stroke='%23000' stroke-width='1.8' stroke-linecap='round'/%3E%3C/svg%3E") 12 12, crosshair`;
const TOOL_CURSORS: Record<PartOp, string> = {
  add: markCursor('M16 18.5h5M18.5 16v5'),
  remove: markCursor('M16 18.5h5'),
};
// the pointer over the preview while checking a cutout (empty: the preview's own)
const cursorOf = (r: ReviewUi | null) =>
  !r ? '' : r.pen.on ? PEN_CURSOR : r.hand ? 'grab' : TOOL_CURSORS[r.tool];
const HINTS: Record<PartOp, string> = {
  add: 'Tap a piece to add it, or draw a loop round it. It’s kept in every frame.',
  remove: 'Tap a piece to take it out, or draw a loop round it. It’s left out of every frame.',
};
// a loop drawn to add a piece, and one to take a piece out
const LOOP_COLORS: Record<PartOp, string> = { add: '#fff', remove: '#ff8a80' };
// a drawn loop's points are kept at least this far apart (preview px)
const LASSO_STEP = 3;

// a finger or mouse press on the preview: a tap unless it moves this far (px) or a second finger
// joins (a pinch)
const TAP_SLOP = 10;
// the preview is the film's first video scaled to at most this wide
const MAX_W = 960;
// how wide a project's picture in the list of them is (px)
const PICTURE_W = 160;
// changes are saved this long after they stop, and at least this often while they don't (ms)
const SAVE_AFTER_MS = 1000,
  SAVE_AT_LEAST_MS = 5000;
// how wide the presets' pictures are (px)
// the template with this id, or (MY_OWN) a new effect of the group made from nothing
const presetFor = (id: string, group: PresetGroup) => (id === MY_OWN ? blankEffect(group) : presetById(id));

const LOOK_THUMB_W = 144;
// how far into a preset its thumbnail shows its particles (s)
const THUMB_PARTICLES_AT = 1.5;

// one video of the film, in the player
interface ReelView {
  id: number;
  video: HTMLVideoElement;
  renderer: Renderer; // draws its frame and effects, on a canvas of its own
  analysis: AnalysisClient;
  url: string | null;
  // Outside, a video's times are its own: 0 at its first frame. The element's clock may start
  // later (Chrome keeps a file's own timestamps): start is its time at the first frame.
  start: number;
  srcLength: number;
  workW: number; // analysis frame width
  wave: ClipWave | undefined;
  ready: boolean;
}

export class Player {
  private ui: UiState = { ...INITIAL_UI };
  private project: Project;
  private views = new Map<number, ReelView>();
  private active: number | null = null; // the video being shown
  private mixer = new Mixer();
  // each music clip's file's waveform
  private waves = new Map<number, ClipWave>();
  private overlays = new OverlayPainter();
  // the looks, drawn over the whole frame on the GPU, then the film's text over them
  private looks = new LookPainter();
  private textClips = new TextClipPainter();
  private frameParticles = new FrameParticles();
  // drawing the frame without them (for the presets' pictures)
  private plain = false;
  // a group whose presets' pictures are wanted, made once a frame is drawn
  private thumbsFor: LookGroup | null = null;
  private objectThumbs = false; // the object effects' pictures made (or being made)
  private photoThumbs = new Set<LookGroup>(); // the groups whose pictures on the photo are made
  // stops an animation's preview (see previewAnim)
  private previewTimer = 0;
  // saving the project on this device: whether what was saved has been opened yet (nothing's saved
  // before, so it isn't written over), whether there are changes to save, and when it last was
  private store = new IndexedDbFilmStore();
  // the effects library, its videos by id, and the film's effect clips drawn (a paused one's video
  // getting to its frame draws the frame again)
  private library = new IndexedDbPackLibrary();
  private packFiles = new Map<string, Blob>();
  private effectPainter = new EffectClipPainter(() => this.paused() && this.redraw());
  private opened = false;
  private unsaved = false;
  private saveTimer = 0;
  private savedAt = 0;
  // everything is drawn on the stage (the film's whole frame, CW x CH), then shown on the preview
  // cropped (see present)
  private stage = document.createElement('canvas');
  private ctx: CanvasRenderingContext2D;
  private out: CanvasRenderingContext2D;
  private crop: Crop = FULL;
  // a crop box handle (or the box) being dragged: where the press started and the box then
  private cropDrag: { part: 'nw' | 'ne' | 'sw' | 'se' | 'move'; x: number; y: number; from: Crop } | null =
    null;
  private CW = 0; // the preview's size
  private CH = 0;
  private fonts: Fonts | null = null;
  private state: ProjectState | null = null;

  // drawing
  private showOutline = true;
  private jumping = false; // skipping over a deleted film, or on to the next video

  // tapping
  private press: { x: number; y: number; cx: number; cy: number } | null = null;
  private fingers = new Set<number>();
  // what's waiting for a body part (or a cutout's background) to be picked
  private pendingAdd: {
    choice: AddChoice;
    reel: number;
    i: number;
    at: Selection;
    focus?: { w: number; h: number };
  } | null = null;
  // a box being drawn round the object to cut out: where it started and where the finger is
  // (preview pixels)
  private boxing: { x0: number; y0: number; x1: number; y1: number } | null = null;
  // a loop being drawn round a piece of a cutout, while checking it (preview pixels)
  private lasso: { x: number; y: number }[] | null = null;
  // the pen's shape so far, and where the pointer is (preview pixels)
  private path: { x: number; y: number }[] = [];
  private hover: { x: number; y: number } | null = null;
  // the selected cutout being dragged about the preview: where the press started (preview pixels)
  // and its move then
  private grab: { id: number; x: number; y: number; from: Transform; moved: boolean } | null = null;
  // a text or effect clip being dragged about the preview: where the press started (stage px) and
  // where it was
  private placeGrab: {
    kind: 'text' | 'effect';
    id: number;
    x: number;
    y: number;
    from: { x: number; y: number };
    moved: boolean;
  } | null = null;

  private camVideo: HTMLVideoElement | null = null;
  private camera: Awaited<ReturnType<typeof startCameraCapture>> | null = null;
  private recorder: ReturnType<typeof startCanvasRecording> | null = null;
  private events = new AbortController();
  private destroyed = false;

  // filmId: the project this is, saved on this device as it's edited and opened again from there
  constructor(
    private view: HTMLCanvasElement,
    private onUi: (ui: UiState) => void,
    private filmId: string | null = null,
  ) {
    this.ctx = this.stage.getContext('2d')!;
    this.out = view.getContext('2d')!;
    this.project = new Project(reel => this.newReel(reel), this.overlays, {
      changed: (s, drawn) => this.projectChanged(s, drawn),
      status: m => this.say(m),
      meta: (reel, m) => {
        const rv = this.views.get(reel);
        if (!rv) return;
        rv.workW = m.W;
        const { W, H } = workSize(rv.video.videoWidth, rv.video.videoHeight);
        if (m.W !== W || m.H !== H) rv.renderer.setup(m.videoW, m.videoH, m.W, m.H);
      },
    });
    this.listen();
    if (filmId) void this.openSaved();
    else this.opened = true;
    void this.loadPacks();
    void loadFonts().then(fonts => {
      if (this.destroyed) return;
      this.fonts = fonts;
      for (const rv of this.views.values()) rv.renderer.setFonts(fonts);
      this.redraw();
    });
  }

  // ---------- the videos ----------

  // adds a video to the end of the film; or in place of video `replace`
  loadFile(f: File, replace: number | null = null) {
    this.stopCamera();
    const id = replace !== null ? this.project.replaceVideo(replace, f) : this.project.addVideo(f);
    this.set({ adding: null, result: null, status: 'Loading…' });
    this.playVideo(id, f);
  }

  // video `id`'s file into its element, and its sound's waveform read
  private playVideo(id: number, f: Blob) {
    const rv = this.views.get(id);
    if (!rv) return;
    this.mixer.setOriginal(this.ui.muted ? 0 : 1);
    void clipPeaks(f).then(wave => {
      rv.wave = wave;
      this.refreshReels();
    });
    rv.url = URL.createObjectURL(f);
    const v = rv.video;
    v.src = rv.url;
    v.onloadeddata = () => {
      v.onloadeddata = null;
      void settleDuration(v).then(() => this.reelReady(rv));
    };
    v.load();
  }

  // takes a video out of the film (what was cut out of it stays)
  removeVideo(reel: number) {
    this.pause();
    if (this.project.removeVideo(reel)) this.seek(Math.min(this.time(), this.project.length));
  }

  // moves a video one place earlier (-1) or later (+1) in the film
  moveVideo(reel: number, by: number) {
    this.pause();
    this.project.moveVideo(reel, this.project.indexOf(reel) + by);
    this.redraw();
  }

  // the video playing (or first), to replace
  get activeVideo() {
    return this.active;
  }

  async toggleCamera() {
    if (this.camera) {
      this.camera.stop();
      return;
    }
    try {
      this.pause();
      const v = (this.camVideo ??= makeVideo());
      this.camera = await startCameraCapture(v);
      if (!this.CW) this.setupPreview(v.videoWidth, v.videoHeight);
      onEachFrame(
        v,
        () => this.drawCamera(),
        () => !!this.camera && !this.destroyed,
      );
      this.set({ camera: true, status: 'Recording from the camera. Press Stop when you’re done.' });
      const file = await this.camera.finished;
      this.camera = null;
      this.set({ camera: false });
      if (!this.destroyed) this.loadFile(file);
    } catch {
      this.camera = null;
      this.set({ camera: false, status: 'The camera is blocked here. Load a video file instead.' });
    }
  }

  // ---------- playback ----------

  togglePlay() {
    const rv = this.rv();
    if (!rv || !this.ui.ready || this.ui.scan !== null || this.project.length <= 0) return;
    this.mixer.start(); // a tap or click: audio can start now
    if (!rv.video.paused) return rv.video.pause();
    // at the end of the film: from the top
    if (this.time() >= this.project.length - 1 / 30) {
      void this.seekAndWait(0).then(() => void this.rv()?.video.play());
      return;
    }
    void rv.video.play();
  }

  // the videos' own sound on or off (effect sounds keep playing)
  setMuted(muted: boolean) {
    this.mixer.setOriginal(muted ? 0 : 1);
    this.set({ muted });
  }

  // film time t: the video there is shown, at its time there
  seek(t: number) {
    const at = this.project.locate(t);
    if (!at) {
      this.set({ time: 0 });
      this.redraw();
      return;
    }
    const rv = this.show(at.reel);
    const ed = this.editor(at.reel);
    if (!rv || !ed) return;
    rv.video.pause();
    rv.video.currentTime = ed.toSource(at.t) + rv.start;
    this.set({ time: t });
  }

  // seeks, resolving once the frame is there
  private async seekAndWait(t: number) {
    const at = this.project.locate(t);
    if (!at) return;
    const rv = this.show(at.reel);
    const ed = this.editor(at.reel);
    if (!rv || !ed) return;
    await seekVideo(rv.video, ed.toSource(at.t) + rv.start);
    this.set({ time: t });
  }

  // the film time being shown
  time() {
    const rv = this.rv(),
      ed = rv && this.editor(rv.id);
    if (!rv || !ed) return 0;
    return this.project.startOf(rv.id) + ed.toProgram(this.srcTime(rv));
  }

  private srcTime(rv: ReelView) {
    return Math.max(0, rv.video.currentTime - rv.start);
  }

  private pause() {
    this.rv()?.video.pause();
  }

  // ---------- undo ----------

  undo() {
    if (this.project.undo()) this.afterHistory();
  }

  redo() {
    if (this.project.redo()) this.afterHistory();
  }

  // the selection may be gone, and the playhead in a film that's gone
  private afterHistory() {
    const sel = this.ui.selected;
    if (sel !== null && !this.ui.lanes.some(l => l.id === sel)) this.select(null);
    if (this.rv()?.video.paused ?? true) this.seek(Math.min(this.time(), this.project.length));
    this.redraw();
  }

  // ---------- adding and selecting clips ----------

  select(id: number | null) {
    this.set({ selected: id, adding: null, aiming: null, isolated: id === this.ui.isolated ? id : null });
    this.redraw();
  }

  // puts the clip on another timeline row
  moveToRow(id: number, row: number) {
    if (this.project.effectClip(id)) this.project.moveEffectRow(id, row);
    else if (this.project.look(id)) this.project.moveLookRow(id, row);
    else if (this.project.musicClip(id)) this.project.moveMusicRow(id, row);
    else if (this.project.overlay(id)) this.project.moveOverlayRow(id, row);
    else this.clip(id)?.ed.moveToRow(id, row);
  }

  // a copy of the clip, selected
  duplicate(id: number) {
    const d = this.project.effectClip(id)
      ? this.project.duplicateEffect(id)
      : this.project.look(id)
        ? this.project.duplicateLook(id)
        : this.project.overlay(id)
          ? this.project.duplicateOverlay(id)
          : (this.clip(id)?.ed.duplicate(id) ?? null);
    if (d !== null) this.select(d);
  }

  // shows the cutout on its own (or everything again)
  toggleIsolated(id: number) {
    this.set({ isolated: this.ui.isolated === id ? null : id });
    this.redraw();
  }

  // the next tap on the preview adds a new clip on what's tapped
  startAdding(choice: AddChoice) {
    this.pause();
    this.set({ adding: choice, selected: null });
    this.redraw();
  }

  cancelAdding() {
    this.pendingAdd = null;
    this.set({ adding: null, choosing: null, cutting: false, aiming: null });
    this.redraw();
  }

  // where the new effect comes from: the spot tapped, the object there, or a body part of the
  // person there ('body' = the whole person)
  choosePart(from: Source) {
    const p = this.pendingAdd;
    this.pendingAdd = null;
    this.set({ choosing: null });
    if (!p) return;
    const ed = this.editor(p.reel);
    if (from === 'spot' && p.choice.kind === 'effect' && ed) {
      const id = ed.addSpotEffect(p.i, p.at, p.choice.fx);
      if (id !== null) this.select(id);
      return;
    }
    this.addNow(p.choice, p.reel, p.i, p.at, from === 'object' || from === 'spot' ? null : from);
  }

  // ---------- the footage ----------

  // film k plays at `speed`; pitch: its sound's pitch changes with it
  setSpeed(k: number, speed: number, pitch: boolean) {
    this.project.setSpeed(k, speed, pitch);
    this.redraw();
  }

  // splits the film at the playhead into two
  splitHere() {
    this.pause();
    if (this.project.split(this.time())) this.say('Split into two films.');
  }

  // deletes film k: the playhead moves on to what plays there now
  deleteScene(k: number) {
    this.pause();
    if (this.project.deleteFilm(k)) this.seek(Math.min(this.time(), this.project.length));
  }

  // the film playing at the playhead
  sceneNow() {
    return this.project.filmAt(this.time());
  }

  // what the new cutout leaves in the footage where it's cut from: it's added now
  chooseBackground(bg: Background) {
    const p = this.pendingAdd;
    this.pendingAdd = null;
    this.set({ cutting: false, adding: null });
    if (!p) return;
    const id = this.project.addCutout(p.reel, p.i, p.at, bg, p.focus ?? null);
    if (id !== null) this.openReview(id);
  }

  // ---------- checking a cutout's outlines ----------

  // opens a cutout's outlines to check frame by frame, from its first frame. Taps on its object fix
  // them; it's cut out when closed.
  openReview(id: number) {
    const src = this.project.sourceOf(id);
    const view = src?.editor.reviewOf(src.track);
    if (!src || !view || !this.project.startReview(id)) return;
    this.pause();
    this.set({
      selected: id,
      adding: null,
      aiming: null,
      isolated: null,
      review: {
        id,
        reel: src.reel,
        track: src.track,
        name: src.editor.name(src.track),
        ...view,
        at: -1,
        now: view.range.s,
        tool: 'add',
        pen: { on: false, points: 0 },
        hand: false,
      },
    });
    this.seekFrame(view.s);
  }

  // done checking: it's cut out, and stays selected
  closeReview() {
    const r = this.ui.review;
    if (!r) return;
    this.project.finishReview(r.id);
    this.path = [];
    this.set({ review: null });
    this.redraw();
  }

  // shows frame i of the cutout's video (anywhere in it, not just the frames it's cut from)
  seekFrame(i: number) {
    const r = this.ui.review,
      ed = r && this.editor(r.reel);
    if (!r || !ed) return;
    const k = Math.max(0, Math.min(ed.frameCount - 1, i));
    this.seek(this.project.startOf(r.reel) + ed.toProgram(ed.frameTime(k) + 1e-4));
  }

  // the frame after (1) or before (-1) the one showing
  stepFrame(dir: 1 | -1) {
    const r = this.ui.review;
    if (r) this.seekFrame(r.at < 0 ? r.s : r.at + dir);
  }

  // the next (1) or previous (-1) frame that looks wrong
  seekFlagged(dir: 1 | -1) {
    const r = this.ui.review;
    if (!r) return;
    const k = nextFlagged(r.flags, r.at < 0 ? (dir > 0 ? -1 : r.flags.length) : r.at - r.s, dir);
    if (k >= 0) this.seekFrame(r.s + k);
  }

  // shows the video's own time t
  seekClip(t: number) {
    const r = this.ui.review,
      ed = r && this.editor(r.reel);
    if (!r || !ed) return;
    this.seek(this.project.startOf(r.reel) + ed.toProgram(Math.max(0, Math.min(r.length - 1e-3, t))));
  }

  // cuts it from another stretch of its video (its own seconds): live while dragging;
  // commitReviewRange when the drag ends tracks what it grew into
  setReviewRange(r: { s?: number; e?: number }) {
    const rv = this.ui.review;
    if (rv) this.project.setCutoutSpan(rv.id, r);
  }

  commitReviewRange() {
    const rv = this.ui.review;
    if (rv) this.project.commitOverlayRange(rv.id);
  }

  // what taps and loops on the preview do: add pieces, or take them out
  setReviewTool(tool: PartOp) {
    const r = this.ui.review;
    if (r) this.set({ review: { ...r, tool } });
    this.redraw();
  }

  // its edge: feathered, smoothed, grown or shrunk, steadied
  setReviewEdge(p: Partial<EdgeSettings>) {
    const r = this.ui.review;
    if (r) this.editor(r.reel)?.setEdge(r.track, p);
  }

  // ---------- the pen ----------
  // For pieces whose edge tracking can't find (the same colour as what's behind): taps place a
  // shape's points one at a time, for exact control (zoom in for more). Closing it adds the shape,
  // or takes it out, like a loop.

  togglePen() {
    const r = this.ui.review;
    if (!r) return;
    this.pause();
    this.path = [];
    this.setPen(!r.pen.on);
  }

  // the hand: drags move the zoomed preview about (pinch, or Ctrl/⌘ + scroll, zooms it)
  toggleHand() {
    const r = this.ui.review;
    if (!r) return;
    this.path = [];
    this.set({ review: { ...r, hand: !r.hand, pen: { on: false, points: 0 } } });
    this.redraw();
  }

  // takes the last point back
  penBack() {
    this.path.pop();
    this.setPen(true);
  }

  // drops the shape so far
  penCancel() {
    this.path = [];
    this.setPen(true);
  }

  // finishes the shape: it's added (or taken out) on the frame showing
  penClose() {
    const r = this.ui.review,
      rv = this.rv(),
      i = this.frameNow();
    if (!r || !rv || rv.id !== r.reel || i < 0 || this.path.length < 3) return;
    const shape = this.path.map(p => this.toWorkClamped(p.x, p.y));
    this.path = [];
    this.editor(r.reel)?.addPart(r.track, i, r.tool, { loop: shape });
    this.setPen(true);
  }

  private setPen(on: boolean) {
    const r = this.ui.review;
    if (r) this.set({ review: { ...r, pen: { on, points: this.path.length }, hand: on ? false : r.hand } });
    this.redraw();
  }

  // a tap with the pen: the next point, or (on the first) closing the shape
  private penTap(x: number, y: number) {
    const first = this.path[0];
    if (first && this.path.length >= 3 && Math.hypot(x - first.x, y - first.y) < CLOSE_PX)
      return this.penClose();
    this.path.push({ x, y });
    this.setPen(true);
  }

  // the pen's shape over the preview: its points and lines, and a line on to the pointer
  private drawPath(color: string) {
    const pts = this.path;
    if (!pts.length) return;
    const ctx = this.ctx,
      r = Math.max(3, this.CW / 200);
    this.drawLoop(this.hover ? [...pts, this.hover] : pts, false, color);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = color;
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    pts.forEach((p, k) => {
      ctx.beginPath();
      // the first point, bigger: tap it to close
      ctx.arc(p.x, p.y, k === 0 && pts.length >= 3 ? r * 1.8 : r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    });
    ctx.restore();
    this.present();
  }

  // the cutout being checked changed (or went, with an undo)
  private refreshReview() {
    const r = this.ui.review;
    if (!r) return;
    const view = this.editor(r.reel)?.reviewOf(r.track);
    this.set({ review: view ? { ...r, ...view } : null });
  }

  setBackground(id: number, bg: Background) {
    this.project.setBackground(id, bg);
    this.redraw();
  }

  setTransform(id: number, p: Partial<Transform>) {
    this.project.setTransform(id, this.time(), p);
    this.redraw();
  }

  toggleMoveKey(id: number) {
    this.pause();
    this.project.toggleMoveKey(id, this.time());
    this.redraw();
  }

  resetTransform(id: number) {
    this.project.resetTransform(id);
    this.redraw();
  }

  // the cutout starts at time t (the playhead, or where it was dragged on the timeline)
  placeCutout(id: number, t = this.time()) {
    this.project.placeAt(id, t);
    this.redraw();
  }

  deleteTrack(id: number) {
    if (this.project.effectClip(id)) this.project.deleteEffect(id);
    else if (this.project.look(id)) this.project.deleteLook(id);
    else if (this.project.musicClip(id)) this.project.deleteMusic(id);
    else if (this.project.overlay(id)) this.project.deleteOverlay(id);
    else this.clip(id)?.ed.deleteTrack(id);
    if (this.ui.selected === id) this.select(null);
  }

  // ---------- music ----------

  // a sound file added to the Audio layer at the playhead, selected
  async addMusic(f: File) {
    this.pause();
    this.mixer.start(); // (a tap or click chose the file)
    const url = URL.createObjectURL(f);
    const length = await soundLength(url);
    URL.revokeObjectURL(url);
    if (this.destroyed) return;
    if (!length) {
      this.say('This sound file can’t be played in this browser. Try an MP3 or M4A.');
      return;
    }
    const id = this.project.addMusic(f.name.replace(/\.[^.]+$/, '') || 'Music', length, this.time(), f);
    this.mixer.addMusicFile(id, f);
    void clipPeaks(f).then(wave => {
      this.waves.set(id, wave);
      this.refreshMusic();
    });
    this.select(id);
  }

  // music starts at time t (the playhead, or where it was dragged on the timeline)
  placeMusic(id: number, t = this.time()) {
    this.project.placeMusic(id, t);
  }

  setMusicVolume(id: number, volume: number) {
    this.project.setMusicVolume(id, volume);
  }

  // the Audio layer, for the timeline
  private refreshMusic() {
    const s = this.state;
    if (!s) return;
    const waveOf = (m: MusicClip) => {
      const w = this.waves.get(m.id);
      return Array.isArray(w)
        ? w.slice(Math.floor(m.src.s * WAVE_PER_S), Math.ceil(m.src.e * WAVE_PER_S))
        : [];
    };
    this.set({ music: s.music.map(m => ({ ...m, wave: waveOf(m) })), audioRows: s.audioRows });
  }

  // ---------- looks ----------

  // a filter, video effect or text from preset `id` (MY_OWN: one made from nothing), at the
  // playhead, selected
  addLook(presetId: string, group: LookGroup) {
    const p = presetFor(presetId, group);
    if (!p) return;
    const id = this.project.addLook(p, this.time());
    this.select(id);
  }

  // look `id` made from another preset (of the same group), keeping its timing
  setLookPreset(id: number, presetId: string) {
    const c = this.project.look(id);
    const p = c && presetFor(presetId, lookGroup(c));
    if (p) this.project.setLookPreset(id, p);
  }

  // its effect customized (see effects/custom.ts): a look's, an object effect's or an impact's
  customize(id: number, edit: (p: Preset) => Preset, merge?: string) {
    if (this.project.look(id)) this.project.customizeLook(id, edit, merge);
    else this.clip(id)?.ed.customize(id, edit, merge);
  }

  setLookControl(id: number, control: string, v: ParamValue) {
    this.project.setLookControl(id, control, v);
  }

  // ---------- body effects ----------

  // the effect made from body preset `presetId` instead, keeping its timing and tracking
  setBody(id: number, presetId: string) {
    const p = presetFor(presetId, 'body');
    if (p) this.clip(id)?.ed.setBody(id, p);
  }

  setBodyControl(id: number, control: string, v: ParamValue) {
    this.clip(id)?.ed.setBodyControl(id, control, v);
  }

  // ---------- effect clips ----------

  // the effects library, with a picture of each
  private async loadPacks() {
    const all = await this.library.list();
    if (this.destroyed) return;
    for (const p of this.ui.packs) if (p.picture) URL.revokeObjectURL(p.picture);
    for (const { item, file } of all) this.packFiles.set(item.id, file);
    this.set({
      packs: all.map(({ item, picture }) => ({
        ...item,
        picture: picture ? URL.createObjectURL(picture) : null,
      })),
    });
  }

  // a video added to the effects library (how it's blended guessed from its first frame)
  async addPack(f: File) {
    this.say('Adding it to your effects…');
    const probe = await probeVideo(f);
    if (this.destroyed) return;
    if (!probe) return this.say('This video can’t be played in this browser. Try an MP4 (H.264).');
    const item: PackItem = {
      id: crypto.randomUUID(),
      name: f.name.replace(/\.[^.]+$/, '') || 'Effect',
      length: probe.length,
      blend: guessBlend(probe.corners),
    };
    await this.library.add(item, f, probe.picture);
    await this.loadPacks();
    this.say(`Added “${item.name}”.`);
  }

  // a video taken out of the library (clips already made from it keep it)
  async removePack(id: string) {
    await this.library.remove(id);
    await this.loadPacks();
  }

  // a clip of library video `packId` at the playhead, in the middle of the frame, selected
  addEffectClip(packId: string) {
    const item = this.ui.packs.find(p => p.id === packId),
      file = this.packFiles.get(packId);
    if (!item || !file) return;
    this.effectPainter.setFiles([{ id: packId, file }]);
    const { picture, ...pack } = item;
    void picture;
    const id = this.project.addEffectClip(pack, file, this.time());
    this.select(id);
  }

  setEffectLook(id: number, p: Parameters<Project['setEffectLook']>[1]) {
    this.project.setEffectLook(id, p);
  }

  // an effect clip starts at time t (the playhead, or where it was dragged on the timeline)
  placeEffect(id: number, t = this.time()) {
    this.project.placeEffect(id, t);
  }

  // ---------- burst impacts ----------

  // the impact made from burst preset `presetId` instead, going off where it did
  setBurst(id: number, presetId: string) {
    const p = presetFor(presetId, 'impact');
    if (p) this.clip(id)?.ed.setBurst(id, p);
  }

  setBurstControl(id: number, control: string, v: ParamValue) {
    this.clip(id)?.ed.setBurstControl(id, control, v);
  }

  // ---------- transitions ----------

  // the transition into film k made from preset `presetId` (null: taken off), then played through
  setTransition(k: number, presetId: string | null) {
    const p = presetId === null ? null : presetById(presetId);
    if (presetId !== null && !p) return;
    const now = this.state?.transitions.find(tr => this.intoFilm(tr, k));
    // (another preset keeps the duration it had)
    if (this.project.setTransition(k, p, p && now ? now.duration : undefined) && p) this.previewCut(k);
  }

  setTransitionDuration(k: number, seconds: number) {
    this.project.setTransitionDuration(k, seconds);
  }

  // the same transition at every join (null: none anywhere)
  setTransitionEverywhere(presetId: string | null) {
    const p = presetId === null ? null : presetById(presetId);
    const at = this.state?.transitions[0];
    this.project.setTransitionEverywhere(p, p && at ? at.duration : undefined);
  }

  private intoFilm(tr: { reel: number; s: number }, k: number) {
    const f = this.state?.films[k];
    return !!f && tr.reel === f.reel && Math.abs(tr.s - f.s) < 1e-6;
  }

  // plays through the join into film k, from a little before it to a little after
  previewCut(k: number) {
    const f = this.state?.films[k],
      tr = this.state?.transitions.find(x => this.intoFilm(x, k));
    if (!f || !tr) return;
    const half = tr.duration / 2;
    this.playStretch(Math.max(0, f.at - half - 0.4), f.at + half + 0.4);
  }

  // ---------- animation ----------

  // the clip's animation of this kind made from preset `presetId` (null: taken off), then played
  setClipAnim(target: AnimTarget, kind: AnimKind, presetId: string | null) {
    const p = presetId === null ? null : presetById(presetId);
    const pass = p && (p.passes.find(x => x.kind === kind) ?? p.passes[0]);
    const slot = p && pass ? { preset: p.id, params: { ...pass.params } } : null;
    if (presetId !== null && !slot) return;
    this.putAnim(target, kind, slot);
    if (slot) this.previewAnim(target, kind);
  }

  // how long its in or out takes (s)
  setAnimDuration(target: AnimTarget, kind: AnimKind, seconds: number) {
    const slot = this.animOf(target)?.[kind];
    if (slot) this.putAnim(target, kind, { ...slot, params: { ...slot.params, duration: seconds } });
  }

  private putAnim(target: AnimTarget, kind: AnimKind, slot: ClipAnim[AnimKind]) {
    if ('film' in target) this.project.setFilmAnim(target.film, kind, slot);
    else if ('overlay' in target) this.project.setOverlayAnim(target.overlay, kind, slot);
    else this.project.setLookAnim(target.look, kind, slot);
  }

  private animOf(target: AnimTarget): ClipAnim | null {
    if ('film' in target) return this.state?.films[target.film]?.anim ?? null;
    if ('look' in target) return this.project.look(target.look)?.anim ?? null;
    return this.project.overlay(target.overlay)?.anim ?? null;
  }

  // when the clip plays, in the film's time
  private spanOf(target: AnimTarget) {
    if ('film' in target) {
      const f = this.state?.films[target.film];
      return f ? { s: f.at, e: f.at + playTime(f) } : null;
    }
    if ('look' in target) {
      const c = this.project.look(target.look);
      return c ? { s: c.at, e: c.at + c.len } : null;
    }
    const o = this.project.overlay(target.overlay);
    return o ? { s: o.at, e: o.at + overlayLength(o) } : null;
  }

  // plays the part of the clip the animation moves: its start (in, and a little of combo), or its end
  previewAnim(target: AnimTarget, kind: AnimKind) {
    const span = this.spanOf(target),
      slot = this.animOf(target)?.[kind];
    if (!span || !slot) return;
    const dur = kind === 'combo' ? 2 : (slot.params.duration as number) + 0.5;
    const from = kind === 'out' ? Math.max(span.s, span.e - dur) : span.s;
    this.playStretch(from, Math.min(span.e - 0.02, from + dur));
  }

  // plays the film from time `from` to `to`, then pauses there
  private playStretch(from: number, to: number) {
    clearTimeout(this.previewTimer);
    this.pause();
    this.seek(from);
    const started = this.rv();
    if (!started) return;
    void started.video.play().catch(() => {});
    // (the film may go on to another video: stop when the film's time gets there)
    const stop = () => {
      const rv = this.rv();
      if (!rv || this.time() >= to - 0.03 || (rv.video.paused && !this.jumping)) this.pause();
      else this.previewTimer = window.setTimeout(stop, 30);
    };
    this.previewTimer = window.setTimeout(stop, 30);
  }

  // a text's words, or where it's placed
  setLookText(id: number, p: Partial<TextPlace>) {
    this.project.setLookText(id, p);
  }

  // a look starts at time t (the playhead, or where it was dragged on the timeline)
  placeLook(id: number, t = this.time()) {
    this.project.placeLook(id, t);
  }

  // a picture of each of a group's presets on the frame showing, for its menu (made once there's a
  // frame to show them on)
  makeLookThumbs(group: LookGroup) {
    this.thumbsFor = group;
    this.redraw();
  }

  // a picture of each object effect, drawn on a photo of a person (made once: they don't depend on
  // the video)
  async makeObjectThumbs() {
    if (this.objectThumbs) return;
    this.objectThumbs = true;
    const previews = await EffectPreviews.load().catch(() => null);
    if (!previews || this.destroyed) {
      this.objectThumbs = false;
      return;
    }
    const made: Record<string, string> = {};
    for (const p of presets()) {
      if (p.group !== 'body') continue;
      const blob = await previews.picture(p, LOOK_THUMB_W);
      if (this.destroyed) return;
      made[p.id] = URL.createObjectURL(blob);
      // (shown as they come)
      if (Object.keys(made).length % 4 === 0) this.set({ lookThumbs: { ...this.ui.lookThumbs, ...made } });
    }
    this.set({ lookThumbs: { ...this.ui.lookThumbs, ...made } });
  }

  private async drawThumbs(group: LookGroup) {
    if (!this.rv() || !this.CW || this.camera) return;
    // filters and video effects on a photo of a person (made once: they don't depend on the video;
    // if it can't be had, on the frame without any looks); text on a dark square
    const onPhoto = group !== 'text';
    if (onPhoto && this.photoThumbs.has(group)) return;
    const w = LOOK_THUMB_W,
      h = w;
    const photo = onPhoto ? await personSquare(w).catch(() => null) : null;
    if (this.destroyed) return;
    if (photo) this.photoThumbs.add(group);
    const frame = new OffscreenCanvas(w, h);
    const fg = frame.getContext('2d')!;
    if (photo) fg.drawImage(photo, 0, 0);
    else if (group === 'text') {
      fg.fillStyle = '#26262a';
      fg.fillRect(0, 0, w, h);
    } else {
      this.plain = true;
      this.redraw();
      this.plain = false;
      fg.drawImage(this.stage, 0, 0, w, h);
      this.redraw();
    }
    const texts = new TextClipPainter(),
      particles = new FrameParticles(),
      fonts = this.fonts ?? FALLBACK_FONTS;
    const made: Record<string, string> = {};
    for (const p of presets()) {
      if (p.group !== group) continue;
      const pic = new OffscreenCanvas(w, h);
      const pg = pic.getContext('2d')!;
      if (group === 'text') {
        pg.drawImage(frame, 0, 0);
        texts.draw(pg, [textPreviewOf(p)], fonts);
      } else {
        const out = this.looks.render(frame, w, h, previewOf(p));
        if (!out) break; // (no GPU here: the menus show swatches)
        pg.drawImage(out, 0, 0);
        // (its particles, a while in)
        const at = Math.min(THUMB_PARTICLES_AT, p.length * 0.6);
        particles.draw(pg, particlesAt([newLook(1, p, 0, p.length)], at));
      }
      const blob = await pic.convertToBlob({ type: 'image/jpeg', quality: 0.8 });
      if (this.destroyed) return;
      made[p.id] = URL.createObjectURL(blob);
    }
    for (const id of Object.keys(made)) {
      const old = this.ui.lookThumbs[id];
      if (old) URL.revokeObjectURL(old);
    }
    this.set({ lookThumbs: { ...this.ui.lookThumbs, ...made } });
  }

  // ---------- fixing the selected clip at the playhead ----------

  removeFixHere() {
    const c = this.selectedHere();
    if (c) c.ed.removeFixAt(c.id, this.frameNow());
  }

  swapHere() {
    const c = this.selectedHere();
    if (c) c.ed.swapAt(c.id, this.frameNow());
  }

  // ---------- timing ----------

  // live while dragging a clip's ends; commitRange when the drag ends tracks what it uncovered
  setRange(id: number, r: { s?: number; e?: number }) {
    if (this.project.effectClip(id)) return this.project.setEffectRange(id, r);
    if (this.project.look(id)) return this.project.setLookRange(id, r);
    if (this.project.musicClip(id)) return this.project.setMusicRange(id, r);
    if (this.project.overlay(id)) return this.project.setOverlayRange(id, r);
    const c = this.clip(id);
    if (!c) return;
    c.ed.setRange(id, {
      ...(r.s !== undefined && { s: r.s - c.at }),
      ...(r.e !== undefined && { e: r.e - c.at }),
    });
  }

  commitRange(id: number) {
    if (this.project.musicClip(id) || this.project.look(id) || this.project.effectClip(id)) return; // (nothing to track)
    if (this.project.overlay(id)) return this.project.commitOverlayRange(id);
    this.clip(id)?.ed.commitRange(id);
  }

  // sets the clip's start or end to the playhead
  rangeHere(id: number, end: 's' | 'e') {
    this.setRange(id, { [end]: this.time() });
    this.commitRange(id);
  }

  // moves an impact to hit at time t (the playhead, or where it was dragged)
  moveImpact(id: number, t = this.time()) {
    const c = this.clip(id);
    c?.ed.moveImpactTo(id, t - c.at);
  }

  // ---------- look ----------

  // settings of the selected clip (or for the next one added)
  fx(): FxSettings {
    const sel = this.ui.selected;
    const c = sel !== null ? this.clip(sel) : null;
    if (c) return c.ed.fx(sel);
    const ed = this.active !== null ? this.editor(this.active) : null;
    return ed?.fx(null) ?? DEFAULT_FX;
  }

  setEffect(effect: Effect) {
    this.lookTarget()?.ed.setEffect(this.ui.selected, effect);
    this.redraw();
  }

  setFx(p: Partial<FxSettings>) {
    this.lookTarget()?.ed.setFx(this.ui.selected, p);
    this.redraw();
  }

  setImpactStyle(id: number, style: ImpactStyle) {
    this.clip(id)?.ed.setImpactStyle(id, style);
    this.redraw();
  }

  get impactStyle() {
    const ed = this.active !== null ? this.editor(this.active) : null;
    return ed?.impactStyle ?? 'punch';
  }

  setShowOutline(on: boolean) {
    this.showOutline = on;
    this.redraw();
  }

  // a clip's sound effect along its length, for the timeline
  soundShape(l: Lane): number[] {
    return laneSound(l);
  }

  // thumbnails of a video for the timeline, one per `step` seconds
  readonly filmstrip: MakeThumbs = makeFilmstrip;

  // ---------- lasers ----------

  setAim(id: number, p: { h?: number; v?: number }) {
    this.clip(id)?.ed.setAim(id, p);
    this.redraw();
  }

  // the next tap on the preview sets where the laser hits
  startAiming(id: number) {
    this.pause();
    this.set({ aiming: id });
    this.redraw();
  }

  clearAimTarget(id: number) {
    this.clip(id)?.ed.clearAimTarget(id);
    this.redraw();
  }

  // ---------- export ----------

  toggleRecord() {
    if (this.recorder) {
      this.recorder.stop();
      return;
    }
    if (this.ui.recording) return; // starting up
    this.mixer.start(); // the Export click: audio can start now, before the async work
    void this.record();
  }

  closeResult() {
    this.set({ result: null });
  }

  // shows a short message over the preview
  say(status: string) {
    this.set({ status });
  }

  destroy() {
    this.destroyed = true;
    this.events.abort();
    for (const rv of this.views.values()) {
      rv.analysis.terminate();
      rv.video.onloadeddata = null;
      rv.video.pause();
      if (rv.url) URL.revokeObjectURL(rv.url);
    }
    this.saveNow();
    this.effectPainter.destroy();
    for (const p of this.ui.packs) if (p.picture) URL.revokeObjectURL(p.picture);
    this.camera?.cancel();
    clearTimeout(this.previewTimer);
    this.recorder?.stop();
    this.mixer.destroy();
    if (this.ui.result) URL.revokeObjectURL(this.ui.result.url);
    for (const url of Object.values(this.ui.lookThumbs)) URL.revokeObjectURL(url);
  }

  // ---------- internals ----------

  // ---------- saving ----------

  // the project saved on this device opened, if there is one; after that, changes are saved
  private async openSaved() {
    const id = this.filmId;
    if (!id) return;
    const saved = await this.store.load(id);
    if (this.destroyed) return;
    if (saved && this.project.open(saved)) {
      this.effectPainter.setFiles(this.project.packsInUse);
      const { reels, music } = this.project.files;
      for (const r of reels) this.playVideo(r.id, r.file);
      for (const m of music) {
        this.mixer.addMusicFile(m.id, m.file);
        void clipPeaks(m.file).then(wave => {
          this.waves.set(m.id, wave);
          this.refreshMusic();
        });
      }
      if (reels.length) this.set({ status: 'Opening…' });
    } else if (saved) this.say('This project was saved by another version of the app and can’t be opened.');
    this.opened = true;
  }

  // a change: saved a second after changes stop (and at least every few seconds while they don't)
  private saveSoon() {
    if (!this.filmId || !this.opened) return;
    this.unsaved = true;
    clearTimeout(this.saveTimer);
    const overdue = Date.now() - this.savedAt > SAVE_AT_LEAST_MS;
    this.saveTimer = window.setTimeout(() => this.saveNow(), overdue ? 0 : SAVE_AFTER_MS);
  }

  private saveNow() {
    clearTimeout(this.saveTimer);
    const id = this.filmId;
    if (!id || !this.unsaved) return;
    this.unsaved = false;
    this.savedAt = Date.now();
    const film = this.project.saved();
    // (a project with no video in it yet isn't worth keeping)
    if (!film.reels.length) return;
    // named after its first video; a small picture of what's showing, for the list of projects
    const first = this.project.files.reels[0]?.file;
    const name = first instanceof File ? first.name.replace(/\.[^.]+$/, '') : 'Untitled';
    void this.picture()
      .then(picture => this.store.save(id, film, { name, savedAt: this.savedAt, picture }))
      .catch(() => this.say('This project couldn’t be saved on this device (it may be out of space).'));
  }

  // the preview, small, as a JPEG (null with nothing on it)
  private async picture() {
    const { width, height } = this.view;
    if (!width || !height || !this.ui.ready) return null;
    const k = Math.min(1, PICTURE_W / width),
      pic = new OffscreenCanvas(Math.round(width * k), Math.round(height * k));
    pic.getContext('2d')!.drawImage(this.view, 0, 0, pic.width, pic.height);
    return pic.convertToBlob({ type: 'image/jpeg', quality: 0.75 });
  }

  private set(p: Partial<UiState>) {
    Object.assign(this.ui, p);
    if ('review' in p) this.view.style.cursor = cursorOf(this.ui.review);
    if (!this.destroyed) this.onUi({ ...this.ui });
  }

  // a new video of the film: its element, worker and renderer
  private newReel(id: number) {
    const video = makeVideo();
    const renderer = new Renderer(new OffscreenCanvas(1, 1));
    if (this.fonts) renderer.setFonts(this.fonts);
    const analysis = new AnalysisClient();
    const rv: ReelView = {
      id,
      video,
      renderer,
      analysis,
      url: null,
      start: 0,
      srcLength: 0,
      workW: 0,
      wave: undefined,
      ready: false,
    };
    this.views.set(id, rv);
    this.mixer.addVideo(video);
    const signal = this.events.signal;
    const mine = () => this.active === id;
    video.addEventListener('play', () => mine() && this.set({ playing: true }), { signal });
    video.addEventListener(
      'pause',
      () => {
        if (!mine() || this.jumping) return;
        this.set({ playing: false });
        this.mixer.tick(this.time(), false); // (the music and effect sounds stop too)
      },
      {
        signal,
      },
    );
    video.addEventListener('timeupdate', () => mine() && this.set({ time: this.time() }), { signal });
    video.addEventListener('seeked', () => mine() && this.draw(video.currentTime), { signal });
    video.addEventListener('ended', () => mine() && this.advance(), { signal });
    video.addEventListener(
      'error',
      () =>
        this.say(
          'This video can’t be played in this browser. Try another clip, or export it as MP4 (H.264).',
        ),
      { signal },
    );
    onEachFrame(
      video,
      t => mine() && this.draw(t),
      () => !this.destroyed && this.views.has(id),
    );
    return { analysis, layers: renderer };
  }

  private async reelReady(rv: ReelView) {
    const v = rv.video;
    if (!v.videoWidth) return;
    const { W, H } = workSize(v.videoWidth, v.videoHeight);
    rv.workW = W;
    rv.renderer.setup(v.videoWidth, v.videoHeight, W, H);
    if (
      !this.CW ||
      !this.state?.reels.length ||
      (this.state.reels.length === 1 && this.state.reels[0].id === rv.id)
    )
      this.setupPreview(v.videoWidth, v.videoHeight);
    // seeking to 0 lands on the first frame, wherever the element's clock puts it
    await seekVideo(v, 0);
    rv.start = v.currentTime;
    rv.srcLength = Math.max(0, (v.duration || 0) - rv.start);
    rv.ready = true;
    this.project.scanVideo(rv.id, rv.srcLength);
    if (this.active === null || !this.views.get(this.active)?.ready) this.show(rv.id);
    this.set({ ready: true, status: 'Video loaded.' });
    this.refreshReels();
    this.redraw();
  }

  // the preview is the first video's size, at most MAX_W wide
  private setupPreview(vw: number, vh: number) {
    const k = Math.min(1, MAX_W / (vw || 1));
    this.CW = Math.round(vw * k);
    this.CH = Math.round(vh * k);
    this.stage.width = this.CW;
    this.stage.height = this.CH;
    this.layoutView();
  }

  // the preview's size: the frame's, cropped (or all of it, while cropping)
  private layoutView() {
    const c = this.ui.cropping ? FULL : this.crop;
    const w = Math.max(1, Math.round(c.w * this.CW)),
      h = Math.max(1, Math.round(c.h * this.CH));
    if (this.view.width !== w || this.view.height !== h) {
      this.view.width = w;
      this.view.height = h;
    }
    if (this.ui.frame.w !== w || this.ui.frame.h !== h) this.set({ frame: { w, h } });
  }

  // shows the stage on the preview: cropped and turned; while cropping, all of it (turned as it
  // will be), with the crop box over it
  private present() {
    const out = this.out,
      { CW, CH } = this;
    if (!CW) return;
    const cropping = this.ui.cropping;
    const c = cropping?.crop ?? this.crop;
    out.setTransform(1, 0, 0, 1, 0, 0);
    if (!cropping && isFull(c)) {
      out.drawImage(this.stage, 0, 0);
      return;
    }
    out.fillStyle = '#000';
    out.fillRect(0, 0, this.view.width, this.view.height);
    const cx = (c.x + c.w / 2) * CW,
      cy = (c.y + c.h / 2) * CH,
      k = coverZoom(c, CW, CH);
    // the frame turned and zoomed about the box's middle (placed where the box is on the preview)
    const at = cropping ? { x: cx, y: cy } : { x: (c.w * CW) / 2, y: (c.h * CH) / 2 };
    out.translate(at.x, at.y);
    out.rotate((c.rot * Math.PI) / 180);
    out.scale(k, k);
    out.translate(-cx, -cy);
    out.drawImage(this.stage, 0, 0);
    out.setTransform(1, 0, 0, 1, 0, 0);
    if (cropping) this.drawCropBox(c);
  }

  // the crop box over the whole frame: outside it dimmed, a grid of thirds, and its corners
  private drawCropBox(c: Crop) {
    const out = this.out,
      x = c.x * this.CW,
      y = c.y * this.CH,
      w = c.w * this.CW,
      h = c.h * this.CH;
    out.save();
    out.fillStyle = 'rgba(0,0,0,0.55)';
    out.beginPath();
    out.rect(0, 0, this.CW, this.CH);
    out.rect(x, y, w, h);
    out.fill('evenodd');
    const line = Math.max(1, this.CW / 640);
    out.strokeStyle = 'rgba(255,255,255,0.6)';
    out.lineWidth = line;
    out.beginPath();
    for (const f of [1 / 3, 2 / 3]) {
      out.moveTo(x + w * f, y);
      out.lineTo(x + w * f, y + h);
      out.moveTo(x, y + h * f);
      out.lineTo(x + w, y + h * f);
    }
    out.stroke();
    out.strokeStyle = '#fff';
    out.lineWidth = line * 1.5;
    out.strokeRect(x, y, w, h);
    // the corners: thick brackets
    const len = Math.min(w, h, this.CW / 12),
      t = line * 4;
    out.lineWidth = t;
    out.beginPath();
    for (const [px, py, dx, dy] of [
      [x, y, 1, 1],
      [x + w, y, -1, 1],
      [x, y + h, 1, -1],
      [x + w, y + h, -1, -1],
    ]) {
      out.moveTo(px + dx * len, py);
      out.lineTo(px, py);
      out.lineTo(px, py + dy * len);
    }
    out.stroke();
    out.restore();
  }

  // ---------- cropping the frame ----------

  // starts cropping: the whole frame shows, with the crop box over it
  startCrop() {
    this.pause();
    this.set({ cropping: { crop: { ...this.crop }, ratio: 'custom' } });
    this.layoutView();
    this.redraw();
  }

  // the crop box held to an aspect ratio (or any, custom)
  setCropRatio(ratio: RatioId) {
    const cr = this.ui.cropping;
    if (!cr) return;
    const r = RATIOS.find(x => x.id === ratio)?.ratio ?? null;
    this.setCropping({ crop: withRatio(cr.crop, r, this.CW, this.CH), ratio });
  }

  // the frame turned (degrees, clockwise)
  setCropRot(rot: number) {
    const cr = this.ui.cropping;
    if (cr)
      this.setCropping({ ...cr, crop: { ...cr.crop, rot: Math.max(-MAX_ROT, Math.min(MAX_ROT, rot)) } });
  }

  resetCrop() {
    if (this.ui.cropping) this.setCropping({ crop: { ...FULL }, ratio: 'custom' });
  }

  // done: the frame is cropped so (a step to undo)
  applyCrop() {
    const cr = this.ui.cropping;
    if (!cr) return;
    this.set({ cropping: null });
    this.project.setCrop(cr.crop);
  }

  cancelCrop() {
    this.set({ cropping: null });
    this.layoutView();
    this.redraw();
  }

  private setCropping(cropping: { crop: Crop; ratio: RatioId }) {
    this.set({ cropping });
    this.present();
  }

  // a press on the crop box: a corner drags it, the box moves it
  private cropPress(x: number, y: number) {
    const cr = this.ui.cropping!,
      c = cr.crop;
    const r = this.view.getBoundingClientRect(),
      reach = (28 * this.CW) / (r.width || 1); // (a finger's width, in frame px)
    const corners = [
      ['nw', c.x, c.y],
      ['ne', c.x + c.w, c.y],
      ['sw', c.x, c.y + c.h],
      ['se', c.x + c.w, c.y + c.h],
    ] as const;
    const hit = corners.find(([, fx, fy]) => Math.hypot(fx * this.CW - x, fy * this.CH - y) < reach);
    const inside =
      x >= c.x * this.CW && x <= (c.x + c.w) * this.CW && y >= c.y * this.CH && y <= (c.y + c.h) * this.CH;
    if (!hit && !inside) return false;
    this.cropDrag = { part: hit ? hit[0] : 'move', x, y, from: c };
    return true;
  }

  private cropMove(x: number, y: number) {
    const d = this.cropDrag,
      cr = this.ui.cropping;
    if (!d || !cr) return;
    const ratio = RATIOS.find(r => r.id === cr.ratio)?.ratio ?? null;
    const crop =
      d.part === 'move'
        ? moveBox(d.from, (x - d.x) / this.CW, (y - d.y) / this.CH)
        : dragCorner(d.from, d.part, x / this.CW, y / this.CH, ratio, this.CW, this.CH);
    this.setCropping({ ...cr, crop: { ...crop, rot: d.from.rot } });
  }

  // shows video `id` (the one playing stops)
  private show(id: number) {
    if (this.active !== id) {
      this.rv()?.video.pause();
      this.active = id;
    }
    return this.rv();
  }

  private rv() {
    return this.active !== null ? (this.views.get(this.active) ?? null) : null;
  }

  private editor(reel: number): Editor | null {
    return this.project.editorOf(reel);
  }

  // an effect or impact's editor, and where its video starts in the film
  private clip(id: number) {
    const reel = this.project.videoOf(id);
    const ed = reel !== null ? this.editor(reel) : null;
    return ed && reel !== null ? { ed, reel, at: this.project.startOf(reel) } : null;
  }

  // the selected effect, if it's on the video showing
  private selectedHere() {
    const id = this.ui.selected;
    const c = id !== null && !this.project.overlay(id) ? this.clip(id) : null;
    return c && c.reel === this.active ? { ...c, id: id! } : null;
  }

  // whose look the settings change: the selected clip's, or the next one added on the video showing
  private lookTarget() {
    const sel = this.ui.selected;
    if (sel !== null) return this.clip(sel);
    const ed = this.active !== null ? this.editor(this.active) : null;
    return ed ? { ed } : null;
  }

  private projectChanged(s: ProjectState, drawn: boolean) {
    this.state = s;
    this.saveSoon();
    // the video shown was taken out: show the one playing where the playhead is
    if (this.active !== null && !s.reels.some(r => r.id === this.active)) {
      this.active = null;
      const at = this.project.locate(Math.min(this.ui.time, s.length));
      const next = at?.reel ?? s.reels[0]?.id;
      if (next !== undefined) this.show(next);
    }
    this.set({
      films: s.films,
      lanes: s.lanes,
      rows: s.rows,
      cutRows: s.cutRows,
      scan: s.scan,
      job: s.job,
      canUndo: s.canUndo,
      canRedo: s.canRedo,
      duration: s.length,
      ready: s.reels.some(r => this.views.get(r.id)?.ready),
      canRecord: s.length > 0 && canRecord(this.view), // (a film just cut, sped up or cropped is worth exporting too)
    });
    this.set({
      looks: s.looks,
      lookRows: s.lookRows,
      transitions: s.transitions,
      effectClips: s.effectClips,
      effectRows: s.effectRows,
    });
    this.refreshReels();
    this.refreshMusic();
    // the frame's crop changed (or came back with an undo)
    if (s.crop !== this.crop) {
      this.crop = s.crop;
      this.layoutView();
      drawn = true;
    }
    this.mixer.setMusic(s.music);
    this.mixer.setClips(
      s.lanes
        .filter(l => l.kind !== 'cutout')
        .map(l => ({
          id: l.id,
          kind: l.kind as 'effect' | 'impact',
          effect: l.fx.effect,
          impact: l.impact,
          s: l.range.s,
          e: l.range.e,
          volume: l.fx.volume,
          speed: l.speed,
        })),
    );
    this.refreshReview();
    if (drawn && (this.rv()?.video.paused ?? true)) this.redraw();
  }

  private refreshReels() {
    const reels = (this.state?.reels ?? []).map(r => {
      const rv = this.views.get(r.id);
      return {
        ...r,
        src: rv?.url ?? '',
        videoStart: rv?.start ?? 0,
        srcDuration: rv?.srcLength ?? 0,
        wave: rv?.wave,
      };
    });
    this.set({ reels });
  }

  private listen() {
    const signal = this.events.signal;
    // the page closed or hidden (a tab switched, the phone locked): what's not saved yet, now
    window.addEventListener('pagehide', () => this.saveNow(), { signal });
    document.addEventListener(
      'visibilitychange',
      () => document.visibilityState === 'hidden' && this.saveNow(),
      { signal },
    );
    // browsers only start sound from a touch, click or key: start it on the first one anywhere
    for (const ev of ['pointerdown', 'touchend', 'click', 'keydown']) {
      document.addEventListener(ev, () => this.mixer.start(), { signal, capture: true });
    }

    const view = this.view;
    view.addEventListener('pointerdown', e => this.pointerDown(e), { signal });
    view.addEventListener('pointermove', e => this.pointerMove(e), { signal });
    view.addEventListener(
      'pointerup',
      e => {
        this.fingers.delete(e.pointerId);
        if (this.ui.cropping) {
          this.cropDrag = null;
          return;
        }
        if (this.ui.review?.hand) this.view.style.cursor = 'grab';
        const dragged = this.grab?.moved;
        this.grab = null;
        if (this.finishBox() || this.finishLasso()) return;
        if (!dragged) this.pointerUp();
      },
      { signal },
    );
    view.addEventListener(
      'pointercancel',
      e => {
        this.fingers.delete(e.pointerId);
        this.press = null;
        this.grab = null;
        this.boxing = null;
        this.lasso = null;
        this.cropDrag = null;
      },
      { signal },
    );
  }

  // the frame of the video showing at the playhead
  private frameNow() {
    const rv = this.rv(),
      ed = rv && this.editor(rv.id);
    return ed ? ed.frameAt(this.time() - this.project.startOf(rv.id)) : -1;
  }

  // ---------- drawing ----------

  private redraw() {
    const rv = this.rv();
    if (rv) this.draw(rv.video.currentTime);
    else this.drawEmpty();
  }

  private drawEmpty() {
    if (!this.CW || this.camera) return;
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, this.CW, this.CH);
    this.present();
  }

  private drawCamera() {
    const v = this.camVideo;
    if (!v || !this.CW) return;
    const r = fitRect(v.videoWidth / (v.videoHeight || 1), this.CW, this.CH);
    this.drawEmpty();
    this.ctx.drawImage(v, r.x, r.y, r.w, r.h);
    this.present();
  }

  // t: the showing video element's time
  private draw(t: number) {
    const rv = this.rv(),
      ed = rv && this.editor(rv.id);
    if (!rv || !ed || !this.CW || this.camera) return;
    if (rv.video.readyState < 2 || !rv.renderer.CW) return;
    // nothing left to play
    if (this.project.length <= 0) {
      this.drawEmpty();
      if (!rv.video.paused) rv.video.pause();
      return;
    }
    const paused = rv.video.paused;
    // playing into a deleted film: skip it, without drawing its frame; past the video's end, on to
    // the next
    if (!paused && !this.jumping) {
      const to = ed.jumpFrom(t - rv.start);
      if (to === 'end') return this.advance();
      if (to !== null) return this.jumpTo(rv, to);
    }
    if (this.jumping) return;
    // the film playing here plays at its speed (with its pitch kept, unless it's asked to change)
    const sp = ed.speedAt(t - rv.start);
    if (rv.video.playbackRate !== sp.speed) rv.video.playbackRate = sp.speed;
    if (rv.video.preservesPitch === sp.pitch) rv.video.preservesPitch = !sp.pitch;
    const review = this.ui.review;
    const outline = (this.showOutline || !!review) && !this.recorder;
    const idx = rv.renderer.render(rv.video, t - rv.start, {
      outline,
      paused,
      selected: review ? review.track : this.ui.selected,
      roto: review && review.reel === rv.id ? review.track : undefined,
    });
    // the video's picture, fitted into the preview, then the overlays over it
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    const r = this.fitOf(rv);
    const now = this.project.startOf(rv.id) + ed.toProgram(t - rv.start);
    // the film playing, moved as its animation and any transition says (about the frame's middle)
    const film = this.state?.films[this.project.filmAt(now)];
    const cut = this.project.transitionAt(now);
    let pose = film && hasAnim(film.anim) ? poseAt(film.anim, now - film.at, playTime(film)) : null;
    if (cut) pose = combinePoses(pose ?? REST_POSE, cut.pose);
    if (pose || r.w < this.CW || r.h < this.CH) {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, this.CW, this.CH);
    }
    if (pose) {
      ctx.save();
      applyPose(ctx, pose, this.CW / 2, this.CH / 2, this.CW, this.CH);
    }
    ctx.drawImage(rv.renderer.canvas, r.x, r.y, r.w, r.h);
    if (pose) ctx.restore();
    // (a transition's flash or blur is over the footage, under what's over it)
    if (cut?.passes.length && !review) this.looks.apply(ctx, cut.passes);
    // (checking a cutout, just the footage and its outlines)
    if (!review) {
      this.overlays.draw(ctx, this.CW, this.CH, this.project.overlayList, now, {
        selected: this.ui.selected,
        outline,
        isolate: this.recorder ? null : this.ui.isolated,
      });
      // the looks over everything (not over a cutout shown on its own)
      // effect clips over the footage and cutouts, under the looks
      if (this.recorder || this.ui.isolated === null)
        this.effectPainter.draw(ctx, this.project.effectsAt(now), {
          playing: !paused,
          selected: this.ui.selected,
          outline: outline && paused,
        });
      if (!this.plain && (this.recorder || this.ui.isolated === null)) {
        this.looks.apply(ctx, this.project.looksAt(now));
        this.frameParticles.draw(ctx, this.project.particlesAt(now));
        this.textClips.draw(ctx, this.project.textsAt(now), this.fonts ?? FALLBACK_FONTS, {
          selected: this.ui.selected,
          outline: outline && paused,
        });
      }
    }
    if (this.plain) return;
    this.mixer.tick(now, !paused);
    const ui = this.ui;
    const state = {
      ready: ui.ready,
      scanning: ui.scan !== null,
      camera: !!this.camera,
      exporting: !!this.recorder,
      paused,
      choosing: !!ui.choosing || ui.cutting,
      aiming: ui.aiming !== null,
      adding: addingWhat(ui.adding),
      selected: ui.selected,
    };
    this.present();
    if (this.thumbsFor) {
      const group = this.thumbsFor;
      this.thumbsFor = null;
      void this.drawThumbs(group);
    }
    if (review?.pen.on) this.drawPath(LOOP_COLORS[review.tool]);
    const hint = review
      ? review.pen.on
        ? PEN_HINT
        : HINTS[review.tool]
      : hintFor(state, this.hints(ed, now), idx);
    if (hint !== ui.hint) this.set({ hint });
    const at = review && rv.id === review.reel ? idx : -1;
    if (review && review.at !== at) this.set({ review: { ...review, at, now: ed.frameTime(at) } });
    this.showCutoutNow(now);
  }

  // what the hint needs to know, about the video showing (at film time now) and the film's overlays
  private hints(ed: Editor, now: number): HintQueries {
    const lane = (id: number) => this.ui.lanes.find(l => l.id === id);
    const here = (id: number) => this.clip(id)?.reel === this.active;
    return {
      trackCount: this.ui.lanes.length,
      name: id => lane(id)?.name ?? '',
      inRange: (id, i) => here(id) && ed.inRange(id, i),
      hasShapeAt: (id, i) => here(id) && ed.hasShapeAt(id, i),
      lostAt: i => ed.lostAt(i),
      pinned: id => !!lane(id)?.pinned,
      kind: id => lane(id)?.kind ?? null,
      cutoutShowing: id => this.project.showing(id, now),
    };
  }

  // where the video's picture sits in the preview
  private fitOf(rv: ReelView) {
    return fitRect(rv.renderer.CW / (rv.renderer.CH || 1), this.CW, this.CH);
  }

  // skips to the video's own time t (the next kept film). An export holds while it skips.
  private jumpTo(rv: ReelView, to: number) {
    this.jumping = true;
    this.recorder?.pause();
    let done = false;
    const landed = () => {
      if (done) return;
      done = true;
      this.jumping = false;
      this.recorder?.resume();
    };
    rv.video.addEventListener('seeked', landed, { once: true });
    // in case the browser never says it got there
    setTimeout(landed, 1500);
    rv.video.currentTime = to + rv.start;
  }

  // the video showing played to its end: on to the next, playing, or the film's over
  private advance() {
    const rv = this.rv();
    if (!rv || this.jumping) return;
    const next = this.project.nextVideo(rv.id);
    if (next === null) {
      rv.video.pause();
      this.recorder?.stop();
      return;
    }
    const nv = this.views.get(next),
      ed = this.editor(next);
    if (!nv || !ed) return;
    this.jumping = true;
    this.recorder?.pause();
    rv.video.pause();
    this.active = next;
    let done = false;
    const go = () => {
      if (done) return;
      done = true;
      this.jumping = false;
      void nv.video.play().then(() => this.recorder?.resume());
    };
    nv.video.addEventListener('seeked', go, { once: true });
    setTimeout(go, 1500);
    nv.video.currentTime = ed.toSource(0) + nv.start;
  }

  // the selected cutout's transform at film time t, for its panel
  private showCutoutNow(t: number) {
    const id = this.ui.selected,
      p = this.project;
    const transform = id !== null ? p.transformAt(id, t) : null;
    const now = transform && { transform, onKey: p.moveKeyAt(id!, t), keyed: p.hasMoveKeys(id!) };
    const was = this.ui.cutoutNow;
    const same =
      now === was ||
      (!!now &&
        !!was &&
        now.onKey === was.onKey &&
        now.keyed === was.keyed &&
        (Object.keys(now.transform) as (keyof Transform)[]).every(
          k => now.transform[k] === was.transform[k],
        ));
    if (!same) this.set({ cutoutNow: now });
  }

  // ---------- tapping the preview ----------

  // the pointer's spot on the stage (the film's whole frame, px): through the crop, unless it's
  // being cropped (then the preview shows the whole frame)
  private canvasPt(e: PointerEvent): [number, number] {
    const r = this.view.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * this.view.width,
      y = ((e.clientY - r.top) / r.height) * this.view.height;
    if (this.ui.cropping || isFull(this.crop)) return [x, y];
    const q = fromCropped(this.crop, this.CW, this.CH, x, y);
    return [q.x, q.y];
  }

  // preview pixels to the showing video's analysis pixels (null outside its picture)
  private toWork(x: number, y: number): Selection | null {
    const rv = this.rv();
    if (!rv || !rv.workW) return null;
    const r = this.fitOf(rv);
    const k = rv.workW / r.w;
    const at = { x: (x - r.x) * k, y: (y - r.y) * k };
    const H = r.h * k;
    return at.x < 0 || at.y < 0 || at.x > rv.workW || at.y > H ? null : at;
  }

  // preview pixels to the showing video's analysis pixels, kept within its picture
  private toWorkClamped(x: number, y: number): Selection {
    const rv = this.rv();
    if (!rv || !rv.workW) return { x: 0, y: 0 };
    const r = this.fitOf(rv),
      k = rv.workW / r.w;
    return {
      x: Math.max(0, Math.min(rv.workW, (x - r.x) * k)),
      y: Math.max(0, Math.min(r.h * k, (y - r.y) * k)),
    };
  }

  // preview pixels to analysis pixels, as a size
  private workScale() {
    const rv = this.rv();
    return rv && rv.workW ? rv.workW / this.fitOf(rv).w : 0;
  }

  private paused() {
    return this.rv()?.video.paused ?? true;
  }

  private pointerDown(e: PointerEvent) {
    this.fingers.add(e.pointerId);
    // a second finger means a pinch, not a tap
    if (this.fingers.size > 1) {
      this.press = null;
      return;
    }
    if (!this.ui.ready || this.camera || this.recorder) return;
    const [x, y] = this.canvasPt(e);
    // cropping: a press drags the crop box (or a corner of it)
    if (this.ui.cropping) {
      this.press = null;
      if (this.cropPress(x, y)) {
        e.stopPropagation();
        this.view.setPointerCapture?.(e.pointerId);
      }
      return;
    }
    this.press = { x, y, cx: e.clientX, cy: e.clientY };
    this.boxing = null;
    this.grab = null;
    // checking a cutout: a tap picks a piece; a drag draws round one (with the pen, taps place
    // points, and a drag moves the zoomed preview)
    if (this.ui.review) {
      // (the hand: the drag goes on to move the zoomed preview)
      if (this.ui.review.hand) this.view.style.cursor = 'grabbing';
      else if (this.paused() && !this.ui.review.pen.on) {
        this.lasso = [{ x, y }];
        e.stopPropagation();
        this.view.setPointerCapture?.(e.pointerId);
      }
      return;
    }
    // cutting something out: a drag draws a box round it (rather than moving the zoomed preview)
    if (this.paused() && this.ui.adding?.kind === 'cutout' && !this.ui.cutting) {
      this.boxing = { x0: x, y0: y, x1: x, y1: y };
      e.stopPropagation();
      this.view.setPointerCapture?.(e.pointerId);
      return;
    }
    // a text or an effect clip: a drag moves it (a tap selects it: see pointerUp)
    this.placeGrab = null;
    const free = this.paused() && !this.ui.adding;
    const onText = free ? this.textClips.hit(x, y) : null;
    const onClip = free && onText === null ? this.effectPainter.hit(x, y) : null;
    const place =
      onText !== null
        ? this.project.look(onText)?.text
        : onClip !== null
          ? this.project.effectClip(onClip)
          : null;
    if (place) {
      const id = (onText ?? onClip)!;
      this.placeGrab = {
        kind: onText !== null ? 'text' : 'effect',
        id,
        x,
        y,
        from: { x: place.x, y: place.y },
        moved: false,
      };
      e.stopPropagation();
      this.view.setPointerCapture?.(e.pointerId);
      return;
    }
    // the selected cutout, showing here: a drag moves it (rather than the zoomed preview)
    const sel = this.ui.selected;
    const now = this.time();
    if (sel !== null && this.paused() && this.project.showing(sel, now)) {
      const from = this.project.transformAt(sel, now);
      if (from) {
        this.grab = { id: sel, x, y, from, moved: false };
        e.stopPropagation();
        this.view.setPointerCapture?.(e.pointerId);
      }
    }
  }

  private pointerMove(e: PointerEvent) {
    if (this.cropDrag) {
      const [x, y] = this.canvasPt(e);
      return this.cropMove(x, y);
    }
    // the pen's line follows the pointer
    if (this.ui.review?.pen.on && this.path.length) {
      const [x, y] = this.canvasPt(e);
      this.hover = { x, y };
      if (this.paused()) this.redraw();
    }
    const lasso = this.lasso;
    if (lasso) {
      const [x, y] = this.canvasPt(e),
        last = lasso[lasso.length - 1];
      // (a press that moves is a drawing, not a tap)
      const p = this.press;
      if (p && Math.hypot(e.clientX - p.cx, e.clientY - p.cy) > TAP_SLOP) this.press = null;
      if (Math.hypot(x - last.x, y - last.y) < LASSO_STEP) return;
      lasso.push({ x, y });
      if (this.press) return;
      this.redraw();
      this.drawLoop(lasso, false, LOOP_COLORS[this.ui.review?.tool ?? 'add']);
      return;
    }
    const p = this.press;
    const g = this.grab;
    const bx = this.boxing;
    if (bx) {
      [bx.x1, bx.y1] = this.canvasPt(e);
      if (p && Math.hypot(e.clientX - p.cx, e.clientY - p.cy) > TAP_SLOP) this.press = null;
      if (!this.press) {
        this.redraw();
        this.drawBox(bx);
      }
      return;
    }
    const tg = this.placeGrab;
    if (tg && (tg.moved || (p && Math.hypot(e.clientX - p.cx, e.clientY - p.cy) > TAP_SLOP))) {
      tg.moved = true;
      this.press = null;
      const [x, y] = this.canvasPt(e);
      const at = { x: tg.from.x + (x - tg.x) / this.CW, y: tg.from.y + (y - tg.y) / this.CH };
      if (tg.kind === 'text') this.project.setLookText(tg.id, at);
      else this.project.setEffectLook(tg.id, at);
      if (this.ui.selected !== tg.id) this.select(tg.id);
      this.redraw();
      return;
    }
    // (once it's moving, the press is over: it keeps following the pointer until let go)
    if (g && (g.moved || (p && Math.hypot(e.clientX - p.cx, e.clientY - p.cy) > TAP_SLOP))) {
      g.moved = true;
      this.press = null;
      const o = this.project.overlay(g.id);
      if (!o) return;
      const [x, y] = this.canvasPt(e);
      const r = fitRect(o.aspect, this.CW, this.CH);
      this.project.setTransform(g.id, this.time(), {
        x: g.from.x + (x - g.x) / r.w,
        y: g.from.y + (y - g.y) / r.h,
      });
      this.redraw();
      return;
    }
    if (p && Math.hypot(e.clientX - p.cx, e.clientY - p.cy) > TAP_SLOP) this.press = null;
  }

  // a tap: what it does depends on what's going on
  private pointerUp() {
    this.mixer.start(); // a tap: audio can start now
    const p = this.press;
    this.press = null;
    const rv = this.rv(),
      ed = rv && this.editor(rv.id);
    if (!p || !rv || !ed || !ed.ready) return;

    // while playing, a tap just pauses
    if (!rv.video.paused) {
      rv.video.pause();
      return;
    }
    const now = this.time();
    const i = this.frameNow();
    // checking a cutout: the piece tapped is added to its outline, or taken out (with the pen, the
    // tap is a point of a shape)
    const review = this.ui.review;
    if (review?.pen.on) return this.penTap(p.x, p.y);
    if (review?.hand) return;
    if (review) {
      const at = this.toWork(p.x, p.y);
      if (at && i >= 0 && rv.id === review.reel) ed.addPart(review.track, i, review.tool, { at });
      return;
    }
    // picking a body part (or a cutout's background) first
    if (this.ui.choosing || this.ui.cutting) return;
    // an overlay tapped, where it's placed
    const onOverlay = this.project.overlayAt(now, p.x, p.y, this.CW, this.CH);
    // the spot tapped, in the video's analysis pixels
    const at = this.toWork(p.x, p.y);

    // setting where a laser hits
    if (this.ui.aiming !== null) {
      if (at && i >= 0) this.clip(this.ui.aiming)?.ed.aimAt(this.ui.aiming, i, at);
      this.set({ aiming: null });
      this.redraw();
      return;
    }

    // a text or effect clip tapped: selected (a tap anywhere else lets a selected one go)
    const tg = this.placeGrab;
    this.placeGrab = null;
    if (tg && !this.ui.adding) return this.select(tg.id);
    const placed = this.ui.selected;
    if (placed !== null && (this.project.look(placed)?.text || this.project.effectClip(placed)))
      return this.select(null);

    // adding a clip (the first tap on a new video adds an effect)
    const add = this.ui.adding;
    if (add || !this.ui.lanes.length) {
      if (at && i >= 0) this.tapToAdd(add ?? { kind: 'effect', fx: {} }, rv.id, i, at);
      return;
    }

    // a cutout selected: it's moved by dragging, not fixed by tapping. A tap on another clip picks
    // that one; anywhere else lets it go.
    const sel = this.ui.selected;
    const hit = onOverlay ?? (at && i >= 0 ? ed.trackAt(i, at) : null);
    if (sel !== null && this.project.overlay(sel)) {
      if (hit !== sel) this.select(hit);
      return;
    }

    // fixing the selected clip's tracking (on the video showing)
    const here = this.selectedHere();
    if (here && at && i >= 0) {
      here.ed.fixAt(here.id, i, at);
      return;
    }
    if (sel !== null) {
      this.select(hit);
      return;
    }

    // tapping a clip's object selects it; tapping elsewhere plays
    if (hit !== null) this.select(hit);
    else this.togglePlay();
  }

  // ---------- boxing in what to cut out ----------

  // a box drawn round the object to cut out: it's cut out from inside it, once what to leave
  // behind is picked. False if it was a tap (which cuts out what's under it).
  private finishBox() {
    const bx = this.boxing;
    this.boxing = null;
    if (!bx || this.press) return false;
    const k = this.workScale(),
      rv = this.rv();
    const w = Math.abs(bx.x1 - bx.x0) * k,
      h = Math.abs(bx.y1 - bx.y0) * k;
    const i = this.frameNow();
    const at = this.toWork((bx.x0 + bx.x1) / 2, (bx.y0 + bx.y1) / 2);
    if (
      !rv ||
      !at ||
      i < 0 ||
      Math.abs(bx.x1 - bx.x0) < TAP_SLOP * 2 ||
      Math.abs(bx.y1 - bx.y0) < TAP_SLOP * 2
    ) {
      this.redraw();
      return true;
    }
    this.pendingAdd = { choice: { kind: 'cutout' }, reel: rv.id, i, at, focus: { w, h } };
    this.set({ cutting: true });
    this.redraw();
    this.drawBox(bx);
    return true;
  }

  // a loop drawn on the cutout: what's inside is added to its outline, or taken out. False if
  // nothing was being drawn, or it was a tap.
  private finishLasso() {
    const lasso = this.lasso,
      r = this.ui.review;
    this.lasso = null;
    if (!lasso || this.press) return false;
    const rv = this.rv(),
      i = this.frameNow();
    const shape = lasso.map(p => this.toWorkClamped(p.x, p.y));
    const ok = !!r && !!rv && rv.id === r.reel && i >= 0 && shape.length >= 3 && area(shape) > 16;
    if (ok) this.editor(r.reel)?.addPart(r.track, i, r.tool, { loop: shape });
    else this.say('Draw a loop right round the piece.');
    this.redraw();
    return true;
  }

  // a loop over the preview (preview pixels): being drawn, or drawn (closed, dashed)
  private drawLoop(pts: readonly { x: number; y: number }[], closed: boolean, color: string) {
    if (pts.length < 2) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (const p of pts.slice(1)) ctx.lineTo(p.x, p.y);
    if (closed) ctx.closePath();
    ctx.lineWidth = Math.max(2, this.CW / 360);
    ctx.lineJoin = ctx.lineCap = 'round';
    ctx.strokeStyle = color;
    ctx.shadowColor = '#000';
    ctx.shadowBlur = 3;
    if (closed) ctx.setLineDash([8, 6]);
    ctx.stroke();
    ctx.restore();
    this.present();
  }

  // the box being drawn, over the preview
  private drawBox(bx: { x0: number; y0: number; x1: number; y1: number }) {
    const ctx = this.ctx;
    const x = Math.min(bx.x0, bx.x1),
      y = Math.min(bx.y0, bx.y1),
      w = Math.abs(bx.x1 - bx.x0),
      h = Math.abs(bx.y1 - bx.y0);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    // everything outside it dimmed
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath();
    ctx.rect(0, 0, this.CW, this.CH);
    ctx.rect(x, y, w, h);
    ctx.fill('evenodd');
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = Math.max(1.5, this.CW / 480);
    ctx.setLineDash([8, 6]);
    ctx.strokeRect(x, y, w, h);
    ctx.restore();
    this.present();
  }

  // a person, or an effect that can come from a spot? then ask where it comes from; anything else
  // is added straight away
  private tapToAdd(choice: AddChoice, reel: number, i: number, at: Selection) {
    // an impact goes off at the spot, whatever's there
    if (choice.kind === 'impact') {
      this.addNow(choice, reel, i, at, null);
      return;
    }
    // a cutout: the object under the tap, once what to leave behind is picked
    if (choice.kind === 'cutout') {
      this.pendingAdd = { choice, reel, i, at };
      this.set({ cutting: true });
      return;
    }
    const ed = this.editor(reel);
    if (!ed) return;
    const effect = choice.fx.effect ?? ed.fx(null).effect;
    // (a body effect is on the person or object: it can't come from a spot)
    const spot = !choice.body && canPin(effect);
    const adding = this.ui.adding;
    void ed.probe(i, at).then(part => {
      if (this.destroyed || this.ui.adding !== adding) return;
      if (part || spot) {
        this.pendingAdd = { choice, reel, i, at };
        this.set({ choosing: { suggested: part, spot, effect } });
      } else {
        this.addNow(choice, reel, i, at, null);
      }
    });
  }

  private addNow(choice: AddChoice, reel: number, i: number, at: Selection, part: BodyPart | null) {
    const ed = this.editor(reel);
    if (!ed || choice.kind === 'cutout') return;
    const id =
      choice.kind === 'impact'
        ? ed.addImpact(
            i,
            at,
            choice.style,
            choice.fx,
            choice.burst ? presetFor(choice.burst, 'impact') : null,
          )
        : ed.addTrack(i, at, choice.fx, part, choice.body ? presetFor(choice.body, 'body') : null);
    if (id !== null) this.select(id);
  }

  // ---------- recording ----------

  // records the whole film, from the start
  private async record() {
    if (!canRecord(this.view) || this.project.length <= 0) {
      this.say('This browser can’t record video. Try Chrome or Edge.');
      return;
    }
    this.set({ recording: true, status: 'Recording…' });
    await this.seekAndWait(0);
    const rv = this.rv();
    if (!rv) return;
    // start recording once the video is actually playing: some browsers (Safari) take a moment to
    // start, which would otherwise open the export with a frozen frame and put the sound late
    await rv.video.play();
    this.recorder = startCanvasRecording(this.view, this.mixer.track, rv.video);
    this.redraw();
    const rec = await this.recorder.finished;
    this.pause();
    this.recorder = null;

    if (this.ui.result) URL.revokeObjectURL(this.ui.result.url);
    this.set({ recording: false, status: 'Recording finished.', result: rec });
    this.redraw();
  }

  private stopCamera() {
    this.camera?.cancel();
    this.camera = null;
    if (this.ui.camera) this.set({ camera: false });
  }
}

// a video element the player plays a clip in (off the page: it's drawn onto the preview)
function makeVideo() {
  const v = document.createElement('video');
  v.playsInline = true;
  v.preload = 'auto';
  return v;
}

// a loop's area (px²)
function area(pts: readonly Selection[]) {
  let a = 0;
  for (let k = 0, j = pts.length - 1; k < pts.length; j = k++)
    a += (pts[j].x + pts[k].x) * (pts[j].y - pts[k].y);
  return Math.abs(a) / 2;
}
