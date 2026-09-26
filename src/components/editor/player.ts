// The page's controller and composition root: plugs the browser adapters (worker, renderer,
// recorder) into the Editor, plays the clip, draws each frame, turns taps on the preview into
// editing actions, and exports. React drives it through its methods and gets UI state back
// through onUi. It is the only UI module that imports infrastructure/.
import { Editor, type EditorState } from '@/application/editor';
import type { Effect, FxSettings } from '@/domain/effects/palettes';
import { workSize, type Selection } from '@/domain/tracking/types';
import { AnalysisClient } from '@/infrastructure/analysis/client';
import { Renderer } from '@/infrastructure/rendering/renderer';
import { canRecord, startCameraCapture, startCanvasRecording, type Recording } from '@/infrastructure/video/recorder';

export type { Lane } from '@/domain/project/track';

export interface UiState extends Omit<EditorState, 'hasEffects'> {
  ready: boolean;
  playing: boolean;
  time: number;
  duration: number;
  hint: string;
  status: string;
  selected: number | null; // selected object; taps on the preview fix it
  adding: boolean;         // the next tap starts a new object
  camera: boolean;
  recording: boolean;
  canRecord: boolean;
  result: Recording | null;
  src: string | null;
}

export const INITIAL_UI: UiState = {
  ready: false, playing: false, time: 0, duration: 0, hint: '', status: '', scan: null, job: null,
  cuts: [], lanes: [], selected: null, adding: false, camera: false, recording: false, canRecord: false, result: null, src: null,
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
  private srcUrl: string | null = null;
  private lastT = 0;
  private press: { x: number; y: number } | null = null;
  private camera: Awaited<ReturnType<typeof startCameraCapture>> | null = null;
  private recorder: ReturnType<typeof startCanvasRecording> | null = null;
  private events = new AbortController();
  private destroyed = false;

  constructor(private video: HTMLVideoElement, private view: HTMLCanvasElement, private onUi: (ui: UiState) => void) {
    this.renderer = new Renderer(view);
    this.editor = new Editor(this.analysis, this.renderer, {
      changed: (s, drawn) => {
        const { hasEffects, ...rest } = s;
        this.set({ ...rest, canRecord: hasEffects && canRecord(this.view) });
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
    v.addEventListener('timeupdate', () => this.set({ time: v.currentTime }), { signal });
    v.addEventListener('seeked', () => this.draw(v.currentTime), { signal });
    v.addEventListener('error', () => this.say('This video can’t be played in this browser. Try another clip, or export it as MP4 (H.264).'), { signal });
    view.addEventListener('pointerdown', e => this.pointerDown(e), { signal });
    view.addEventListener('pointerup', () => this.pointerUp(), { signal });
    view.addEventListener('pointercancel', () => { this.press = null; }, { signal });
    this.frameLoop();
  }

  // ---------- clip ----------
  loadFile(f: File) {
    this.stopCamera();
    this.editor.load(f);
    this.set({ ready: false, selected: null, adding: false, result: null, status: 'Loading…' });
    if (this.srcUrl) URL.revokeObjectURL(this.srcUrl);
    const v = this.video;
    v.srcObject = null; v.muted = false;
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
      this.set({ ready: false, selected: null, adding: false, result: null });
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

  togglePlay() { if (this.ui.ready && this.ui.scan === null) { if (this.video.paused) void this.video.play(); else this.video.pause(); } }
  seek(t: number) { this.video.pause(); this.video.currentTime = t; this.set({ time: t }); }

  // ---------- objects ----------
  select(id: number | null) { this.set({ selected: id, adding: false }); this.redraw(); }
  // the next tap on the preview starts a new object
  startAdding() { this.video.pause(); this.set({ adding: true, selected: null }); this.redraw(); }
  cancelAdding() { this.set({ adding: false }); this.redraw(); }
  deleteTrack(id: number) { this.editor.deleteTrack(id); if (this.ui.selected === id) this.select(null); }
  removeFixHere() { if (this.ui.selected !== null) this.editor.removeFixAt(this.ui.selected, this.frameNow()); }
  swapHere() { if (this.ui.selected !== null) this.editor.swapAt(this.ui.selected, this.frameNow()); }
  setRange(id: number, r: { s?: number; e?: number }) { this.editor.setRange(id, r); }
  // shows a shot where the object wasn't found and selects it, ready for a tap
  goToShot(id: number, shot: number) {
    const t = this.editor.shotTime(shot);
    if (t === null) return;
    this.set({ selected: id, adding: false });
    this.seek(t + 1e-3);
  }

  // effect settings apply to the selected object (or the only one, or the next one tapped)
  fx(): FxSettings { return this.editor.fx(this.ui.selected); }
  setEffect(effect: Effect) { this.editor.setEffect(this.ui.selected, effect); this.redraw(); }
  setFx(p: Partial<FxSettings>) { this.editor.setFx(this.ui.selected, p); this.redraw(); }
  setShowOutline(on: boolean) { this.showOutline = on; this.redraw(); }

  // ---------- export ----------
  toggleRecord() {
    if (this.recorder) { this.recorder.stop(); return; }
    void this.record();
  }
  closeResult() { this.set({ result: null }); }

  destroy() {
    this.destroyed = true; this.events.abort(); this.analysis.terminate();
    this.camera?.cancel(); this.recorder?.stop();
    this.video.onloadeddata = null;
    if (this.srcUrl) URL.revokeObjectURL(this.srcUrl);
    if (this.ui.result) URL.revokeObjectURL(this.ui.result.url);
  }

  // ---------- internals ----------
  private set(p: Partial<UiState>) { Object.assign(this.ui, p); if (!this.destroyed) this.onUi({ ...this.ui }); }
  private say(status: string) { this.set({ status }); }
  private frameNow() { return this.editor.frameAt(this.video.currentTime); }

  private setupRenderer(vw: number, vh: number) {
    const { W, H } = workSize(vw, vh);
    this.workW = W;
    this.renderer.setup(vw, vh, W, H);
  }

  private async onReady() {
    const v = this.video;
    if (!v.videoWidth) return;
    this.setupRenderer(v.videoWidth, v.videoHeight);
    this.set({ ready: true, duration: v.duration || 0, status: 'Video loaded.' });
    await this.seekTo(0);
    this.redraw();
    this.editor.scan(v.duration || 0);
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

  private draw(t: number) {
    if (!this.renderer.CW || this.video.readyState < 2) return;
    this.lastT = t;
    const idx = this.renderer.render(this.video, t, { outline: this.showOutline && !this.recorder, paused: this.video.paused, selected: this.ui.selected });
    this.updateHint(idx);
  }

  private updateHint(idx: number) {
    const ed = this.editor, sel = this.ui.selected, name = sel !== null ? ed.name(sel) : '';
    let m = '';
    if (this.camera) m = 'Recording from the camera.';
    else if (!this.ui.ready || this.ui.scan !== null || this.recorder) m = '';
    else if (!ed.trackCount) m = 'Tap what the effect should follow.';
    else if (this.ui.adding) m = 'Tap the next object to track.';
    else if (sel !== null && this.video.paused) m = idx >= 0 && !ed.hasShapeAt(sel, idx) ? `${name} isn’t found here. Tap it to fix.` : `Wrong? Tap ${name} to fix this frame.`;
    else if (idx >= 0 && ed.lostAt(idx)) m = 'Searching for the object…';
    if (m !== this.ui.hint) this.set({ hint: m });
  }

  // ---------- tapping ----------
  private canvasPt(e: PointerEvent): [number, number] {
    const r = this.view.getBoundingClientRect();
    return [(e.clientX - r.left) / r.width * this.renderer.CW, (e.clientY - r.top) / r.height * this.renderer.CH];
  }
  private pointerDown(e: PointerEvent) {
    if (!this.ui.ready || this.camera || this.recorder) return;
    const [x, y] = this.canvasPt(e);
    this.press = { x, y };
  }
  private pointerUp() {
    const p = this.press, ed = this.editor;
    this.press = null;
    if (!p || !ed.ready) return;
    // while playing, a tap just pauses
    if (!this.video.paused) { this.video.pause(); return; }
    const i = this.frameNow();
    if (i < 0) return;
    const q = this.renderer.CW / (this.workW || 1), at: Selection = { x: p.x / q, y: p.y / q }, sel = this.ui.selected;
    if (this.ui.adding || !ed.trackCount) { const id = ed.addTrack(i, at); if (id !== null) this.select(id); return; }
    if (sel !== null) { ed.fixAt(sel, i, at); return; }
    // tapping a tracked object selects it; tapping elsewhere plays
    const hit = ed.trackAt(i, at);
    if (hit !== null) this.select(hit); else this.togglePlay();
  }

  // ---------- recording ----------
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
    await this.seekTo(start);
    this.recorder = startCanvasRecording(this.view, this.video);
    this.set({ recording: true, status: 'Recording…' });
    this.redraw();
    const stop = () => this.recorder?.stop();
    this.video.addEventListener('ended', stop, { once: true });
    await this.video.play();
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
