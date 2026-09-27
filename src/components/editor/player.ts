// The page's controller and composition root: plugs the browser adapters (worker, renderer,
// recorder) into the Editor, plays the clip, draws each frame, turns taps on the preview into
// editing actions, and exports. React drives it through its methods and gets UI state back
// through onUi. It is the only UI module that imports infrastructure/.
import { Editor, type EditorState } from '@/application/editor';
import type { ImpactStyle } from '@/domain/effects/impacts';
import type { Effect, FxSettings } from '@/domain/effects/palettes';
import type { BodyPart } from '@/domain/tracking/bodyParts';
import { workSize, type Selection } from '@/domain/tracking/types';
import { AnalysisClient } from '@/infrastructure/analysis/client';
import { Mixer } from '@/infrastructure/audio/mixer';
import { clipPeaks, hitPeaks, loopPeaks, WAVE_PER_S, type ClipWave } from '@/infrastructure/audio/waveform';
import { Renderer } from '@/infrastructure/rendering/renderer';
import { canRecord, startCameraCapture, startCanvasRecording, type Recording } from '@/infrastructure/video/recorder';

import type { Lane } from '@/domain/project/track';
export type { Lane };

export interface UiState extends Omit<EditorState, 'hasEffects'> {
  ready: boolean;
  playing: boolean;
  time: number;
  duration: number;   // clip length the player can play
  videoStart: number; // the video element's time at the clip's first frame
  hint: string;
  status: string;
  selected: number | null; // selected object; taps on the preview fix it
  adding: AddChoice | null; // what the next tap on the preview adds
  // a person was tapped while adding: which body part should it follow? (suggested: the nearest)
  choosing: { suggested: BodyPart } | null;
  camera: boolean;
  recording: boolean;
  muted: boolean;          // the clip's own sound is off
  // the clip's own sound along its length (WAVE_PER_S levels a second, 0..1); 'none' = no audio
  // track, 'unreadable' = can't be drawn here, undefined = still reading
  wave: ClipWave | undefined;
  canRecord: boolean;
  result: Recording | null;
  src: string | null;
}

// what to add on the next tap: an effect with these settings, or an impact of this style
export type AddChoice = { kind: 'effect'; fx: Partial<FxSettings> } | { kind: 'impact'; style: ImpactStyle; fx?: Partial<FxSettings> };

export const INITIAL_UI: UiState = {
  ready: false, playing: false, time: 0, duration: 0, videoStart: 0, hint: '', status: '', scan: null, job: null,
  lanes: [], rows: 0, selected: null, adding: null, choosing: null, camera: false, recording: false, muted: false, wave: undefined, canRecord: false, result: null, src: null,
};

type VideoWithFrameCallback = HTMLVideoElement & {
  requestVideoFrameCallback?: (cb: (now: number, meta: { mediaTime: number }) => void) => number;
};

export class Player {
  private ui: UiState = { ...INITIAL_UI };
  private showOutline = true;
  private renderer: Renderer;
  private analysis = new AnalysisClient();
  private editor: Editor;
  private workW = 0; // analysis frame width
  // Everything outside this class works in clip time: 0 at the first frame. The video element's
  // clock may start later (Chrome keeps a file's own timestamps), so convert at the edge.
  private start = 0;
  private srcUrl: string | null = null;
  private lastT = 0;
  // a finger or mouse press on the preview: a tap unless it moves or a second finger joins (pinch)
  private press: { x: number; y: number; cx: number; cy: number } | null = null;
  private fingers = new Set<number>();
  private camera: Awaited<ReturnType<typeof startCameraCapture>> | null = null;
  private recorder: ReturnType<typeof startCanvasRecording> | null = null;
  private mixer: Mixer;
  // what's waiting for a body part to be picked
  private pendingAdd: { choice: AddChoice; i: number; at: Selection } | null = null;
  private loads = 0; // counts clips loaded, so a slow waveform for an old clip is dropped
  private events = new AbortController();
  private destroyed = false;

  constructor(private video: HTMLVideoElement, private view: HTMLCanvasElement, private onUi: (ui: UiState) => void) {
    this.renderer = new Renderer(view);
    this.mixer = new Mixer(video);
    this.editor = new Editor(this.analysis, this.renderer, {
      changed: (s, drawn) => {
        const { hasEffects, ...rest } = s;
        this.set({ ...rest, canRecord: hasEffects && canRecord(this.view) });
        this.mixer.setClips(s.lanes.map(l => ({ id: l.id, kind: l.kind, effect: l.fx.effect, impact: l.impact, s: l.range.s, e: l.range.e, volume: l.fx.volume, speed: l.speed })));
        if (drawn && this.video.paused) this.redraw();
      },
      status: m => this.say(m),
      meta: m => {
        this.workW = m.W;
        const { W, H } = workSize(this.video.videoWidth, this.video.videoHeight);
        if (m.W !== W || m.H !== H) this.renderer.setup(m.videoW, m.videoH, m.W, m.H);
      },
    });
    const signal = this.events.signal, v = video;
    v.addEventListener('play', () => this.set({ playing: true }), { signal });
    v.addEventListener('pause', () => this.set({ playing: false }), { signal });
    v.addEventListener('timeupdate', () => this.set({ time: this.time() }), { signal });
    v.addEventListener('seeked', () => this.draw(v.currentTime), { signal });
    v.addEventListener('error', () => this.say('This video can’t be played in this browser. Try another clip, or export it as MP4 (H.264).'), { signal });
    // browsers only start sound from a touch, click or key: start it on the first one anywhere
    for (const ev of ['pointerdown', 'touchend', 'click', 'keydown']) document.addEventListener(ev, () => this.mixer.start(), { signal, capture: true });
    view.addEventListener('pointerdown', e => this.pointerDown(e), { signal });
    view.addEventListener('pointermove', e => { if (this.press && Math.hypot(e.clientX - this.press.cx, e.clientY - this.press.cy) > 10) this.press = null; }, { signal });
    view.addEventListener('pointerup', e => { this.fingers.delete(e.pointerId); this.pointerUp(); }, { signal });
    view.addEventListener('pointercancel', e => { this.fingers.delete(e.pointerId); this.press = null; }, { signal });
    this.frameLoop();
  }

  // ---------- clip ----------
  loadFile(f: File) {
    this.stopCamera();
    this.editor.load(f);
    this.set({ ready: false, selected: null, adding: null, result: null, status: 'Loading…' });
    if (this.srcUrl) URL.revokeObjectURL(this.srcUrl);
    const v = this.video;
    v.srcObject = null; v.muted = false;
    this.mixer.setOriginal(this.ui.muted ? 0 : 1);
    this.set({ wave: undefined });
    const load = ++this.loads;
    void clipPeaks(f).then(wave => { if (load === this.loads) this.set({ wave }); });
    v.src = this.srcUrl = URL.createObjectURL(f);
    this.set({ src: this.srcUrl });
    v.onloadeddata = () => {
      v.onloadeddata = null;
      this.fixDuration().then(() => this.onReady());
    };
    v.load();
  }

  async toggleCamera() {
    if (this.camera) { this.camera.stop(); return; }
    try {
      this.editor.load(null);
      this.set({ ready: false, selected: null, adding: null, result: null });
      const v = this.video;
      v.removeAttribute('src'); v.load();
      this.camera = await startCameraCapture(v);
      this.setupRenderer(v.videoWidth, v.videoHeight);
      this.set({ camera: true, status: 'Recording from the camera. Press Stop when you’re done.' });
      const file = await this.camera.finished;
      this.camera = null; this.set({ camera: false });
      if (!this.destroyed) this.loadFile(file);
    } catch {
      this.camera = null;
      this.set({ camera: false, status: 'The camera is blocked here. Load a video file instead.' });
    }
  }

  togglePlay() {
    if (!this.ui.ready || this.ui.scan !== null) return;
    this.mixer.start(); // a tap or click: audio can start now
    if (this.video.paused) void this.video.play(); else this.video.pause();
  }
  // the clip's own sound on or off (effect sounds keep playing)
  setMuted(muted: boolean) { this.mixer.setOriginal(muted ? 0 : 1); this.set({ muted }); }
  seek(t: number) { this.video.pause(); this.video.currentTime = t + this.start; this.set({ time: t }); }
  // the clip time being shown
  time() { return Math.max(0, this.video.currentTime - this.start); }

  // ---------- effects ----------
  select(id: number | null) { this.set({ selected: id, adding: null }); this.redraw(); }
  // the next tap on the preview adds a new effect on what's tapped
  startAdding(choice: AddChoice) { this.video.pause(); this.set({ adding: choice, selected: null }); this.redraw(); }
  cancelAdding() { this.pendingAdd = null; this.set({ adding: null, choosing: null }); this.redraw(); }
  // the body part picked for the person tapped ('body' = the whole person)
  choosePart(part: BodyPart) {
    const p = this.pendingAdd;
    this.pendingAdd = null;
    this.set({ choosing: null });
    if (p) this.addNow(p.choice, p.i, p.at, part === 'body' ? null : part);
  }
  deleteTrack(id: number) { this.editor.deleteTrack(id); if (this.ui.selected === id) this.select(null); }
  removeFixHere() { if (this.ui.selected !== null) this.editor.removeFixAt(this.ui.selected, this.frameNow()); }
  swapHere() { if (this.ui.selected !== null) this.editor.swapAt(this.ui.selected, this.frameNow()); }
  // live while dragging an effect's ends; commitRange when the drag ends tracks what it uncovered
  setRange(id: number, r: { s?: number; e?: number }) { this.editor.setRange(id, r); }
  commitRange(id: number) { this.editor.commitRange(id); }
  // sets the effect's start or end to the playhead
  rangeHere(id: number, end: 's' | 'e') { this.editor.setRange(id, { [end]: this.time() }); this.editor.commitRange(id); }

  // ---------- sound shapes, for the timeline ----------
  // a clip's sound effect across its length: its loop repeated (an effect), or its hit (an impact);
  // WAVE_PER_S levels a second, scaled by its volume
  soundShape(l: Lane): number[] {
    const n = Math.max(1, Math.round((l.range.e - l.range.s) * WAVE_PER_S));
    const src = l.kind === 'impact' && l.impact ? hitPeaks(l.impact, l.speed) : loopPeaks(l.fx.effect);
    const vol = Math.min(1, l.fx.volume);
    return Array.from({ length: n }, (_, k) => (l.kind === 'impact' ? src[k] ?? 0 : src[k % src.length]) * vol);
  }

  // ---------- impacts ----------
  // moves an impact to hit at time t (the playhead, or where it was dragged)
  moveImpact(id: number, t = this.time()) { this.editor.moveImpactTo(id, t); }
  setImpactStyle(id: number, style: ImpactStyle) { this.editor.setImpactStyle(id, style); this.redraw(); }
  get impactStyle() { return this.editor.impactStyle; }

  // effect settings apply to the selected effect (or the only one, or the next one added)
  fx(): FxSettings { return this.editor.fx(this.ui.selected); }
  setEffect(effect: Effect) { this.editor.setEffect(this.ui.selected, effect); this.redraw(); }
  setFx(p: Partial<FxSettings>) { this.editor.setFx(this.ui.selected, p); this.redraw(); }
  setShowOutline(on: boolean) { this.showOutline = on; this.redraw(); }

  // ---------- export ----------
  toggleRecord() {
    if (this.recorder) { this.recorder.stop(); return; }
    if (this.ui.recording) return; // starting up
    this.mixer.start(); // the Export click: audio can start now, before the async work
    void this.record();
  }
  closeResult() { this.set({ result: null }); }

  destroy() {
    this.destroyed = true; this.events.abort(); this.analysis.terminate();
    this.camera?.cancel(); this.recorder?.stop(); this.mixer.destroy();
    this.video.onloadeddata = null;
    if (this.srcUrl) URL.revokeObjectURL(this.srcUrl);
    if (this.ui.result) URL.revokeObjectURL(this.ui.result.url);
  }

  // ---------- internals ----------
  private set(p: Partial<UiState>) { Object.assign(this.ui, p); if (!this.destroyed) this.onUi({ ...this.ui }); }
  // shows a short message over the preview
  say(status: string) { this.set({ status }); }
  private frameNow() { return this.editor.frameAt(this.time()); }

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
    await this.seekTo(0);
    this.start = v.currentTime;
    const length = Math.max(0, (v.duration || 0) - this.start);
    this.set({ ready: true, duration: length, videoStart: this.start, time: 0, status: 'Video loaded.' });
    this.redraw();
    this.editor.scan(length);
  }

  // MediaRecorder files can report an infinite duration until the end has been seen
  private fixDuration() {
    const v = this.video;
    if (Number.isFinite(v.duration)) return Promise.resolve();
    return new Promise<void>(res => {
      const done = () => { if (!Number.isFinite(v.duration)) return; v.removeEventListener('durationchange', done); v.currentTime = 0; res(); };
      v.addEventListener('durationchange', done);
      v.currentTime = 1e101;
    });
  }

  // ---------- drawing ----------
  private frameLoop() {
    const v = this.video as VideoWithFrameCallback;
    if (v.requestVideoFrameCallback) {
      // draw exactly the frame the video presents, with that frame's effect
      const onFrame = (_now: number, meta: { mediaTime: number }) => {
        if (this.destroyed) return;
        this.draw(meta.mediaTime);
        v.requestVideoFrameCallback!(onFrame);
      };
      v.requestVideoFrameCallback(onFrame);
    } else {
      const tick = () => {
        if (this.destroyed) return;
        if (!v.paused) this.draw(v.currentTime);
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }
  }

  private redraw() { this.draw(this.video.paused ? this.video.currentTime : this.lastT); }

  // t: the video element's time
  private draw(t: number) {
    if (!this.renderer.CW || this.video.readyState < 2) return;
    this.lastT = t;
    const idx = this.renderer.render(this.video, t - this.start, { outline: this.showOutline && !this.recorder, paused: this.video.paused, selected: this.ui.selected });
    this.mixer.tick(t - this.start, !this.video.paused);
    this.updateHint(idx);
  }

  private updateHint(idx: number) {
    const ed = this.editor, sel = this.ui.selected, name = sel !== null ? ed.name(sel) : '';
    let m = '';
    if (this.camera) m = 'Recording from the camera.';
    else if (!this.ui.ready || this.ui.scan !== null || this.recorder) m = '';
    else if (!ed.trackCount) m = 'Tap what the effect should follow.';
    else if (this.ui.choosing) m = 'Pick which part it should follow.';
    else if (this.ui.adding) m = this.ui.adding.kind === 'impact' ? 'Tap what the impact should hit.' : 'Tap what the effect should follow.';
    else if (sel !== null && this.video.paused) m = idx < 0 ? ''
      : !ed.inRange(sel, idx) ? `Outside ${name}’s effect. Drag its ends to cover this.`
      : !ed.hasShapeAt(sel, idx) ? `${name} isn’t found here. Tap it to fix.` : `Wrong? Tap ${name} to fix this frame.`;
    else if (idx >= 0 && ed.lostAt(idx)) m = 'Searching for the object…';
    if (m !== this.ui.hint) this.set({ hint: m });
  }

  // ---------- tapping ----------
  private canvasPt(e: PointerEvent): [number, number] {
    const r = this.view.getBoundingClientRect();
    return [(e.clientX - r.left) / r.width * this.renderer.CW, (e.clientY - r.top) / r.height * this.renderer.CH];
  }
  private pointerDown(e: PointerEvent) {
    this.fingers.add(e.pointerId);
    // a second finger means a pinch, not a tap
    if (this.fingers.size > 1) { this.press = null; return; }
    if (!this.ui.ready || this.camera || this.recorder) return;
    const [x, y] = this.canvasPt(e);
    this.press = { x, y, cx: e.clientX, cy: e.clientY };
  }
  private pointerUp() {
    this.mixer.start(); // a tap: audio can start now
    const p = this.press, ed = this.editor;
    this.press = null;
    if (!p || !ed.ready) return;
    // while playing, a tap just pauses
    if (!this.video.paused) { this.video.pause(); return; }
    const i = this.frameNow();
    if (i < 0) return;
    const q = this.renderer.CW / (this.workW || 1), at: Selection = { x: p.x / q, y: p.y / q }, sel = this.ui.selected;
    if (this.ui.choosing) return; // picking a body part first
    const add = this.ui.adding;
    if (add || !ed.trackCount) {
      // a person? then ask which part it should follow; anything else is added straight away
      const choice: AddChoice = add ?? { kind: 'effect', fx: {} };
      void ed.probe(i, at).then(part => {
        if (this.destroyed || this.ui.adding !== add) return;
        if (part) { this.pendingAdd = { choice, i, at }; this.set({ choosing: { suggested: part } }); }
        else this.addNow(choice, i, at, null);
      });
      return;
    }
    if (sel !== null) { ed.fixAt(sel, i, at); return; }
    // tapping a tracked object selects it; tapping elsewhere plays
    const hit = ed.trackAt(i, at);
    if (hit !== null) this.select(hit); else this.togglePlay();
  }

  private addNow(choice: AddChoice, i: number, at: Selection, part: BodyPart | null) {
    const ed = this.editor;
    const id = choice.kind === 'impact' ? ed.addImpact(i, at, choice.style, choice.fx, part) : ed.addTrack(i, at, choice.fx, part);
    if (id !== null) this.select(id);
  }

  // ---------- recording ----------
  // t: the video element's time
  private seekTo(t: number) {
    const v = this.video;
    return new Promise<void>(res => {
      v.pause();
      if (Math.abs(v.currentTime - t) < 0.001) return res();
      v.addEventListener('seeked', () => res(), { once: true }); v.currentTime = t;
    });
  }

  private async record() {
    const start = this.editor.firstEffectTime();
    if (start === null || !canRecord(this.view)) { this.say('This browser can’t record video. Try Chrome or Edge.'); return; }
    this.set({ recording: true, status: 'Recording…' });
    await this.seekTo(start + this.start);
    // start recording once the video is actually playing: some browsers (Safari) take a moment to
    // start, which would otherwise open the export with a frozen frame and put the sound late
    await this.video.play();
    this.recorder = startCanvasRecording(this.view, this.mixer.track, this.video);
    this.redraw();
    const stop = () => this.recorder?.stop();
    this.video.addEventListener('ended', stop, { once: true });
    const rec = await this.recorder.finished;
    this.video.removeEventListener('ended', stop);
    this.video.pause();
    this.recorder = null;
    if (this.ui.result) URL.revokeObjectURL(this.ui.result.url);
    this.set({ recording: false, status: 'Recording finished.', result: rec });
    this.redraw();
  }

  private stopCamera() { this.camera?.cancel(); this.camera = null; if (this.ui.camera) this.set({ camera: false }); }
}
