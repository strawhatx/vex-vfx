// The page's controller and composition root: plugs the browser adapters (worker, renderer,
// mixer, recorder) into the Editor, plays the clip, draws each frame, turns taps on the preview
// into editing actions, and exports. React drives it through its methods and gets UI state back
// through onUi. It is the only UI module that imports infrastructure/.
import { Editor, type EditorState } from '@/application/editor';
import type { ImpactStyle } from '@/domain/effects/impacts';
import type { Effect, FxSettings } from '@/domain/effects/palettes';
import type { Lane } from '@/domain/project/track';
import type { BodyPart } from '@/domain/tracking/bodyParts';
import { workSize, type Selection } from '@/domain/tracking/types';
import { AnalysisClient } from '@/infrastructure/analysis/client';
import { Mixer } from '@/infrastructure/audio/mixer';
import { clipPeaks, laneSound, type ClipWave } from '@/infrastructure/audio/waveform';
import { Renderer } from '@/infrastructure/rendering/renderer';
import { makeFilmstrip } from '@/infrastructure/video/filmstrip';
import { onEachFrame, seekVideo, settleDuration } from '@/infrastructure/video/playback';
import {
  canRecord,
  startCameraCapture,
  startCanvasRecording,
  type Recording,
} from '@/infrastructure/video/recorder';
import { hintFor } from '@/application/hints';

export type { Lane };

export interface UiState extends Omit<EditorState, 'hasEffects'> {
  ready: boolean;
  playing: boolean;
  time: number;
  duration: number; // clip length the player can play
  videoStart: number; // the video element's time at the clip's first frame
  hint: string;
  status: string;
  selected: number | null; // selected clip; taps on the preview fix its tracking
  adding: AddChoice | null; // what the next tap on the preview adds
  // a person was tapped while adding: which body part should it follow? (suggested: the nearest)
  choosing: { suggested: BodyPart } | null;
  aiming: number | null; // a laser whose target the next tap on the preview sets
  camera: boolean;
  recording: boolean;
  muted: boolean; // the clip's own sound is off
  // the clip's own sound along its length; undefined while it's still being read
  wave: ClipWave | undefined;
  canRecord: boolean;
  result: Recording | null;
  src: string | null;
}

// makes the clip's thumbnails, one per `step` seconds, reporting each as it's ready
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

// what to add on the next tap: an effect with these settings, or an impact of this style
export type AddChoice =
  | { kind: 'effect'; fx: Partial<FxSettings> }
  | { kind: 'impact'; style: ImpactStyle; fx?: Partial<FxSettings> };

export const INITIAL_UI: UiState = {
  ready: false,
  playing: false,
  time: 0,
  duration: 0,
  videoStart: 0,
  hint: '',
  status: '',
  scan: null,
  job: null,
  lanes: [],
  rows: 0,
  selected: null,
  adding: null,
  choosing: null,
  aiming: null,
  camera: false,
  recording: false,
  muted: false,
  wave: undefined,
  canRecord: false,
  result: null,
  src: null,
};

// a finger or mouse press on the preview: a tap unless it moves this far (px) or a second finger
// joins (a pinch)
const TAP_SLOP = 10;

export class Player {
  private ui: UiState = { ...INITIAL_UI };
  private renderer: Renderer;
  private analysis = new AnalysisClient();
  private mixer: Mixer;
  private editor: Editor;

  // the clip
  private srcUrl: string | null = null;
  private loads = 0; // counts clips loaded, so a slow waveform for an old clip is dropped
  private workW = 0; // analysis frame width
  // Everything outside this class works in clip time: 0 at the first frame. The video element's
  // clock may start later (Chrome keeps a file's own timestamps), so convert at the edge.
  private start = 0;

  // drawing
  private showOutline = true;
  private lastT = 0; // the video time last drawn

  // tapping
  private press: { x: number; y: number; cx: number; cy: number } | null = null;
  private fingers = new Set<number>();
  // what's waiting for a body part to be picked
  private pendingAdd: { choice: AddChoice; i: number; at: Selection } | null = null;

  private camera: Awaited<ReturnType<typeof startCameraCapture>> | null = null;
  private recorder: ReturnType<typeof startCanvasRecording> | null = null;
  private events = new AbortController();
  private destroyed = false;

  constructor(
    private video: HTMLVideoElement,
    private view: HTMLCanvasElement,
    private onUi: (ui: UiState) => void,
  ) {
    this.renderer = new Renderer(view);
    this.mixer = new Mixer(video);
    this.editor = new Editor(this.analysis, this.renderer, {
      changed: (s, drawn) => this.editorChanged(s, drawn),
      status: m => this.say(m),
      meta: m => {
        this.workW = m.W;
        const { W, H } = workSize(this.video.videoWidth, this.video.videoHeight);
        if (m.W !== W || m.H !== H) this.renderer.setup(m.videoW, m.videoH, m.W, m.H);
      },
    });
    this.listen();
    onEachFrame(
      video,
      t => this.draw(t),
      () => !this.destroyed,
    );
  }

  // ---------- the clip ----------

  loadFile(f: File) {
    this.stopCamera();
    this.editor.load(f);
    this.set({
      ready: false,
      selected: null,
      adding: null,
      result: null,
      status: 'Loading…',
      wave: undefined,
    });
    this.mixer.setOriginal(this.ui.muted ? 0 : 1);

    const load = ++this.loads;
    void clipPeaks(f).then(wave => {
      if (load === this.loads) this.set({ wave });
    });

    if (this.srcUrl) URL.revokeObjectURL(this.srcUrl);
    this.srcUrl = URL.createObjectURL(f);
    const v = this.video;
    v.srcObject = null;
    v.muted = false;
    v.src = this.srcUrl;
    this.set({ src: this.srcUrl });
    v.onloadeddata = () => {
      v.onloadeddata = null;
      void settleDuration(v).then(() => this.onReady());
    };
    v.load();
  }

  async toggleCamera() {
    if (this.camera) {
      this.camera.stop();
      return;
    }
    try {
      this.editor.load(null);
      this.set({ ready: false, selected: null, adding: null, result: null });
      const v = this.video;
      v.removeAttribute('src');
      v.load();
      this.camera = await startCameraCapture(v);
      this.setupRenderer(v.videoWidth, v.videoHeight);
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
    if (!this.ui.ready || this.ui.scan !== null) return;
    this.mixer.start(); // a tap or click: audio can start now
    if (this.video.paused) void this.video.play();
    else this.video.pause();
  }

  // the clip's own sound on or off (effect sounds keep playing)
  setMuted(muted: boolean) {
    this.mixer.setOriginal(muted ? 0 : 1);
    this.set({ muted });
  }

  seek(t: number) {
    this.video.pause();
    this.video.currentTime = t + this.start;
    this.set({ time: t });
  }

  // the clip time being shown
  time() {
    return Math.max(0, this.video.currentTime - this.start);
  }

  // ---------- adding and selecting clips ----------

  select(id: number | null) {
    this.set({ selected: id, adding: null, aiming: null });
    this.redraw();
  }

  // the next tap on the preview adds a new clip on what's tapped
  startAdding(choice: AddChoice) {
    this.video.pause();
    this.set({ adding: choice, selected: null });
    this.redraw();
  }

  cancelAdding() {
    this.pendingAdd = null;
    this.set({ adding: null, choosing: null, aiming: null });
    this.redraw();
  }

  // the body part picked for the person tapped ('body' = the whole person)
  choosePart(part: BodyPart) {
    const p = this.pendingAdd;
    this.pendingAdd = null;
    this.set({ choosing: null });
    if (p) this.addNow(p.choice, p.i, p.at, part === 'body' ? null : part);
  }

  deleteTrack(id: number) {
    this.editor.deleteTrack(id);
    if (this.ui.selected === id) this.select(null);
  }

  // ---------- fixing the selected clip at the playhead ----------

  removeFixHere() {
    if (this.ui.selected !== null) this.editor.removeFixAt(this.ui.selected, this.frameNow());
  }

  swapHere() {
    if (this.ui.selected !== null) this.editor.swapAt(this.ui.selected, this.frameNow());
  }

  // ---------- timing ----------

  // live while dragging a clip's ends; commitRange when the drag ends tracks what it uncovered
  setRange(id: number, r: { s?: number; e?: number }) {
    this.editor.setRange(id, r);
  }

  commitRange(id: number) {
    this.editor.commitRange(id);
  }

  // sets the clip's start or end to the playhead
  rangeHere(id: number, end: 's' | 'e') {
    this.editor.setRange(id, { [end]: this.time() });
    this.editor.commitRange(id);
  }

  // moves an impact to hit at time t (the playhead, or where it was dragged)
  moveImpact(id: number, t = this.time()) {
    this.editor.moveImpactTo(id, t);
  }

  // ---------- look ----------

  // settings apply to the selected clip (or the only one, or the next one added)
  fx(): FxSettings {
    return this.editor.fx(this.ui.selected);
  }

  setEffect(effect: Effect) {
    this.editor.setEffect(this.ui.selected, effect);
    this.redraw();
  }

  setFx(p: Partial<FxSettings>) {
    this.editor.setFx(this.ui.selected, p);
    this.redraw();
  }

  setImpactStyle(id: number, style: ImpactStyle) {
    this.editor.setImpactStyle(id, style);
    this.redraw();
  }

  get impactStyle() {
    return this.editor.impactStyle;
  }

  setShowOutline(on: boolean) {
    this.showOutline = on;
    this.redraw();
  }

  // a clip's sound effect along its length, for the timeline
  soundShape(l: Lane): number[] {
    return laneSound(l);
  }

  // thumbnails of the clip for the timeline, one per `step` seconds
  readonly filmstrip: MakeThumbs = makeFilmstrip;

  // ---------- lasers ----------

  setAimAngle(id: number, deg: number) {
    this.editor.setAimAngle(id, deg);
    this.redraw();
  }

  // the next tap on the preview sets where the laser hits
  startAiming(id: number) {
    this.video.pause();
    this.set({ aiming: id });
    this.redraw();
  }

  clearAimTarget(id: number) {
    this.editor.clearAimTarget(id);
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
    this.analysis.terminate();
    this.camera?.cancel();
    this.recorder?.stop();
    this.mixer.destroy();
    this.video.onloadeddata = null;
    if (this.srcUrl) URL.revokeObjectURL(this.srcUrl);
    if (this.ui.result) URL.revokeObjectURL(this.ui.result.url);
  }

  // ---------- internals ----------

  private set(p: Partial<UiState>) {
    Object.assign(this.ui, p);
    if (!this.destroyed) this.onUi({ ...this.ui });
  }

  private editorChanged(s: EditorState, drawn: boolean) {
    const { hasEffects, ...rest } = s;
    this.set({ ...rest, canRecord: hasEffects && canRecord(this.view) });
    this.mixer.setClips(
      s.lanes.map(l => ({
        id: l.id,
        kind: l.kind,
        effect: l.fx.effect,
        impact: l.impact,
        s: l.range.s,
        e: l.range.e,
        volume: l.fx.volume,
        speed: l.speed,
      })),
    );
    if (drawn && this.video.paused) this.redraw();
  }

  private listen() {
    const signal = this.events.signal;
    const v = this.video;
    v.addEventListener('play', () => this.set({ playing: true }), { signal });
    v.addEventListener('pause', () => this.set({ playing: false }), { signal });
    v.addEventListener('timeupdate', () => this.set({ time: this.time() }), { signal });
    v.addEventListener('seeked', () => this.draw(v.currentTime), { signal });
    v.addEventListener(
      'error',
      () =>
        this.say(
          'This video can’t be played in this browser. Try another clip, or export it as MP4 (H.264).',
        ),
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
        this.pointerUp();
      },
      { signal },
    );
    view.addEventListener(
      'pointercancel',
      e => {
        this.fingers.delete(e.pointerId);
        this.press = null;
      },
      { signal },
    );
  }

  private frameNow() {
    return this.editor.frameAt(this.time());
  }

  private setupRenderer(vw: number, vh: number) {
    const { W, H } = workSize(vw, vh);
    this.workW = W;
    this.renderer.setup(vw, vh, W, H);
  }

  private async onReady() {
    const v = this.video;
    if (!v.videoWidth) return;
    this.setupRenderer(v.videoWidth, v.videoHeight);
    // seeking to 0 lands on the first frame, wherever the element's clock puts it
    await seekVideo(v, 0);
    this.start = v.currentTime;
    const length = Math.max(0, (v.duration || 0) - this.start);
    this.set({ ready: true, duration: length, videoStart: this.start, time: 0, status: 'Video loaded.' });
    this.redraw();
    this.editor.scan(length);
  }

  private stopCamera() {
    this.camera?.cancel();
    this.camera = null;
    if (this.ui.camera) this.set({ camera: false });
  }

  // ---------- drawing ----------

  private redraw() {
    this.draw(this.video.paused ? this.video.currentTime : this.lastT);
  }

  // t: the video element's time
  private draw(t: number) {
    if (!this.renderer.CW || this.video.readyState < 2) return;
    this.lastT = t;
    const paused = this.video.paused;
    const idx = this.renderer.render(this.video, t - this.start, {
      outline: this.showOutline && !this.recorder,
      paused,
      selected: this.ui.selected,
    });
    this.mixer.tick(t - this.start, !paused);
    const ui = this.ui;
    const state = {
      ready: ui.ready,
      scanning: ui.scan !== null,
      camera: !!this.camera,
      exporting: !!this.recorder,
      paused,
      choosing: !!ui.choosing,
      aiming: ui.aiming !== null,
      adding: ui.adding?.kind ?? null,
      selected: ui.selected,
    };
    const hint = hintFor(state, this.editor, idx);
    if (hint !== ui.hint) this.set({ hint });
  }

  // ---------- tapping the preview ----------

  // the pointer's spot in canvas pixels
  private canvasPt(e: PointerEvent): [number, number] {
    const r = this.view.getBoundingClientRect();
    return [
      ((e.clientX - r.left) / r.width) * this.renderer.CW,
      ((e.clientY - r.top) / r.height) * this.renderer.CH,
    ];
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
  }

  private pointerMove(e: PointerEvent) {
    const p = this.press;
    if (p && Math.hypot(e.clientX - p.cx, e.clientY - p.cy) > TAP_SLOP) this.press = null;
  }

  // a tap: what it does depends on what's going on
  private pointerUp() {
    this.mixer.start(); // a tap: audio can start now
    const p = this.press;
    const ed = this.editor;
    this.press = null;
    if (!p || !ed.ready) return;

    // while playing, a tap just pauses
    if (!this.video.paused) {
      this.video.pause();
      return;
    }
    const i = this.frameNow();
    if (i < 0) return;
    // the spot tapped, in analysis pixels
    const q = this.renderer.CW / (this.workW || 1);
    const at: Selection = { x: p.x / q, y: p.y / q };

    // picking a body part first
    if (this.ui.choosing) return;

    // setting where a laser hits
    if (this.ui.aiming !== null) {
      ed.aimAt(this.ui.aiming, i, at);
      this.set({ aiming: null });
      this.redraw();
      return;
    }

    // adding a clip (the first tap on a new video adds an effect)
    const add = this.ui.adding;
    if (add || !ed.trackCount) {
      this.tapToAdd(add ?? { kind: 'effect', fx: {} }, i, at);
      return;
    }

    // fixing the selected clip's tracking
    const sel = this.ui.selected;
    if (sel !== null) {
      ed.fixAt(sel, i, at);
      return;
    }

    // tapping a tracked object selects its clip; tapping elsewhere plays
    const hit = ed.trackAt(i, at);
    if (hit !== null) this.select(hit);
    else this.togglePlay();
  }

  // a person? then ask which part it should follow; anything else is added straight away
  private tapToAdd(choice: AddChoice, i: number, at: Selection) {
    const adding = this.ui.adding;
    void this.editor.probe(i, at).then(part => {
      if (this.destroyed || this.ui.adding !== adding) return;
      if (part) {
        this.pendingAdd = { choice, i, at };
        this.set({ choosing: { suggested: part } });
      } else {
        this.addNow(choice, i, at, null);
      }
    });
  }

  private addNow(choice: AddChoice, i: number, at: Selection, part: BodyPart | null) {
    const ed = this.editor;
    const id =
      choice.kind === 'impact'
        ? ed.addImpact(i, at, choice.style, choice.fx, part)
        : ed.addTrack(i, at, choice.fx, part);
    if (id !== null) this.select(id);
  }

  // ---------- recording ----------

  private async record() {
    const start = this.editor.firstEffectTime();
    if (start === null || !canRecord(this.view)) {
      this.say('This browser can’t record video. Try Chrome or Edge.');
      return;
    }
    this.set({ recording: true, status: 'Recording…' });
    const v = this.video;
    await seekVideo(v, start + this.start);
    // start recording once the video is actually playing: some browsers (Safari) take a moment to
    // start, which would otherwise open the export with a frozen frame and put the sound late
    await v.play();
    this.recorder = startCanvasRecording(this.view, this.mixer.track, v);
    this.redraw();

    const stop = () => this.recorder?.stop();
    v.addEventListener('ended', stop, { once: true });
    const rec = await this.recorder.finished;
    v.removeEventListener('ended', stop);
    v.pause();
    this.recorder = null;

    if (this.ui.result) URL.revokeObjectURL(this.ui.result.url);
    this.set({ recording: false, status: 'Recording finished.', result: rec });
    this.redraw();
  }
}
