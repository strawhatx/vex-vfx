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
import { Project, type Film, type ProjectState } from '@/application/project';
import { familyOf, type ImpactStyle } from '@/domain/effects/impacts';
import type { Background, Transform } from '@/domain/project/cutout';
import { fitRect } from '@/domain/project/overlay';
import type { EdgeSettings } from '@/domain/project/edge';
import type { PartOp } from '@/domain/project/parts';
import { nextFlagged, type Flag } from '@/domain/project/review';
import { canPin } from '@/domain/project/spot';
import type { Effect, FxSettings } from '@/domain/effects/palettes';
import type { Lane } from '@/domain/project/track';
import type { BodyPart } from '@/domain/tracking/bodyParts';
import { workSize, type Selection } from '@/domain/tracking/types';
import { AnalysisClient } from '@/infrastructure/analysis/client';
import { Mixer } from '@/infrastructure/audio/mixer';
import { clipPeaks, laneSound, type ClipWave } from '@/infrastructure/audio/waveform';
import { OverlayPainter } from '@/infrastructure/rendering/overlays';
import { Renderer } from '@/infrastructure/rendering/renderer';
import type { Fonts } from '@/infrastructure/rendering/fonts';
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
  // a cutout's outlines being checked before it's cut out (see openReview)
  review: ReviewUi | null;
}

// a cutout being checked: the overlay, the video it's cut from and its cutout there, the frames it's
// cut from [s, e) (the video's) and when each starts, that stretch of the video (its own seconds)
// and the video's length, which frames look wrong, the frames it was picked or changed on, its edge
// settings, the frame showing and when it starts, and what taps and loops on the preview do now:
// add pieces, or take them out
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

// what to add on the next tap: an effect with these settings, or an impact of this style
export type AddChoice =
  | { kind: 'effect'; fx: Partial<FxSettings> }
  | { kind: 'impact'; style: ImpactStyle; fx?: Partial<FxSettings> }
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
  private overlays = new OverlayPainter();
  private ctx: CanvasRenderingContext2D;
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

  private camVideo: HTMLVideoElement | null = null;
  private camera: Awaited<ReturnType<typeof startCameraCapture>> | null = null;
  private recorder: ReturnType<typeof startCanvasRecording> | null = null;
  private events = new AbortController();
  private destroyed = false;

  constructor(
    private view: HTMLCanvasElement,
    private onUi: (ui: UiState) => void,
  ) {
    this.ctx = view.getContext('2d')!;
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
    if (this.project.overlay(id)) this.project.moveOverlayRow(id, row);
    else this.clip(id)?.ed.moveToRow(id, row);
  }

  // a copy of the clip, selected
  duplicate(id: number) {
    const d = this.project.overlay(id)
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
    if (this.project.overlay(id)) this.project.deleteOverlay(id);
    else this.clip(id)?.ed.deleteTrack(id);
    if (this.ui.selected === id) this.select(null);
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
    if (this.project.overlay(id)) return this.project.setOverlayRange(id, r);
    const c = this.clip(id);
    if (!c) return;
    c.ed.setRange(id, {
      ...(r.s !== undefined && { s: r.s - c.at }),
      ...(r.e !== undefined && { e: r.e - c.at }),
    });
  }

  commitRange(id: number) {
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
    this.camera?.cancel();
    this.recorder?.stop();
    this.mixer.destroy();
    if (this.ui.result) URL.revokeObjectURL(this.ui.result.url);
  }

  // ---------- internals ----------

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
    video.addEventListener('pause', () => mine() && !this.jumping && this.set({ playing: false }), {
      signal,
    });
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
    this.view.width = this.CW;
    this.view.height = this.CH;
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
      canRecord: s.hasEffects && s.length > 0 && canRecord(this.view),
    });
    this.refreshReels();
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
  }

  private drawCamera() {
    const v = this.camVideo;
    if (!v || !this.CW) return;
    const r = fitRect(v.videoWidth / (v.videoHeight || 1), this.CW, this.CH);
    this.drawEmpty();
    this.ctx.drawImage(v, r.x, r.y, r.w, r.h);
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
    if (r.w < this.CW || r.h < this.CH) {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, this.CW, this.CH);
    }
    ctx.drawImage(rv.renderer.canvas, r.x, r.y, r.w, r.h);
    const now = this.project.startOf(rv.id) + ed.toProgram(t - rv.start);
    // (checking a cutout, just the footage and its outlines)
    if (!review)
      this.overlays.draw(ctx, this.CW, this.CH, this.project.overlayList, now, {
        selected: this.ui.selected,
        outline,
        isolate: this.recorder ? null : this.ui.isolated,
      });
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

  // the pointer's spot in preview pixels
  private canvasPt(e: PointerEvent): [number, number] {
    const r = this.view.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * this.CW, ((e.clientY - r.top) / r.height) * this.CH];
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
    const spot = canPin(effect);
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
        ? ed.addImpact(i, at, choice.style, choice.fx)
        : ed.addTrack(i, at, choice.fx, part);
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
