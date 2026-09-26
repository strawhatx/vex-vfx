// Editor controller: plays the clip, renders the effect for exactly the frame the video is
// showing (from track data), and starts an analysis when the user clicks an object.
// React drives it through its methods and gets UI state back through onUi.
import { DEFAULT_PAL, type Effect, type FxSettings } from '@/effects/palettes';
import { Renderer } from '@/compositor/renderer';
import { AnalysisClient } from '@/tracking/client';
import type { Selection as ObjectSelection } from '@/tracking/protocol';
import { workSize, type TrackFrame, type TrackMeta } from '@/tracking/types';
import { canRecord, startCameraCapture, startCanvasRecording, type Recording } from '@/video/recorder';

export interface UiState {
  ready: boolean;
  playing: boolean;
  time: number;
  duration: number;
  hint: string;
  status: string;
  tapStatus: string;
  progress: number | null; // analysis progress 0..1 while it runs
  analyzed: boolean;
  camera: boolean; // recording from the camera
  recording: boolean;
  tracked: boolean; // an object has been picked; clicking the video now plays/pauses
  canRecord: boolean;
  result: Recording | null;
}

const OBJECT_TAP = 'Pause on a clear frame and click the object. It outlines the whole object and follows it through the clip.';

export const INITIAL_UI: UiState = {
  ready: false, playing: false, time: 0, duration: 0, hint: '', status: '', tapStatus: OBJECT_TAP,
  progress: null, analyzed: false, camera: false, recording: false, tracked: false, canRecord: false, result: null,
};

type VideoWithFrameCallback = HTMLVideoElement & {
  requestVideoFrameCallback?: (cb: (now: number, meta: { mediaTime: number }) => void) => number;
};

export class Player {
  private ui: UiState = { ...INITIAL_UI };
  private settings: FxSettings = { effect: 'fire', pal: 0, size: 1, intensity: 1 };
  private showOutline = true;
  private renderer: Renderer;
  private analysis = new AnalysisClient();
  private file: File | null = null;
  private srcUrl: string | null = null;
  private meta: TrackMeta | null = null;
  private frames: TrackFrame[] = [];
  private objectJob: { start: number; select: ObjectSelection } | null = null;
  private lastT = 0;
  private press: { x: number; y: number } | null = null;
  private camera: Awaited<ReturnType<typeof startCameraCapture>> | null = null;
  private recorder: ReturnType<typeof startCanvasRecording> | null = null;
  private events = new AbortController();
  private destroyed = false;

  constructor(private video: HTMLVideoElement, private view: HTMLCanvasElement, private onUi: (ui: UiState) => void) {
    this.renderer = new Renderer(view, this.settings);
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

  // ---------- public API ----------
  loadFile(f: File) {
    this.stopCamera();
    this.analysis.cancel();
    this.file = f; this.meta = null; this.objectJob = null;
    this.resetTrack();
    this.set({ ready: false, analyzed: false, progress: null, result: null, status: 'Loading…' });
    if (this.srcUrl) URL.revokeObjectURL(this.srcUrl);
    const v = this.video;
    v.srcObject = null; v.muted = false;
    v.src = this.srcUrl = URL.createObjectURL(f);
    v.onloadeddata = () => {
      v.onloadeddata = null;
      this.fixDuration().then(() => this.onReady());
    };
    v.load();
  }

  async toggleCamera() {
    if (this.camera) { this.camera.stop(); return; }
    try {
      this.analysis.cancel(); this.resetTrack(); this.file = null;
      this.set({ ready: false, analyzed: false, progress: null, result: null });
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

  togglePlay() { if (this.ui.ready && this.ui.progress === null) { if (this.video.paused) void this.video.play(); else this.video.pause(); } }
  seek(t: number) { this.video.pause(); this.video.currentTime = t; this.set({ time: t }); }

  // drops the tracked object so a different one can be clicked; settings are kept
  clearTarget() {
    this.analysis.cancel();
    this.objectJob = null;
    this.resetTrack();
    this.set({ progress: null, analyzed: false, tapStatus: OBJECT_TAP });
    this.redraw();
  }

  toggleRecord() {
    if (this.recorder) { this.recorder.stop(); return; }
    void this.record();
  }
  closeResult() { this.set({ result: null }); }

  setEffect(fx: Effect) { this.updateSettings({ effect: fx, pal: DEFAULT_PAL[fx] }); }
  setPalette(pal: number) { this.updateSettings({ pal }); }
  setSize(size: number) { this.updateSettings({ size }); }
  setIntensity(intensity: number) { this.updateSettings({ intensity }); }
  setShowOutline(on: boolean) { this.showOutline = on; this.redraw(); }

  destroy() {
    this.destroyed = true; this.events.abort(); this.analysis.terminate();
    this.camera?.cancel(); this.recorder?.stop();
    this.video.onloadeddata = null;
    if (this.srcUrl) URL.revokeObjectURL(this.srcUrl);
    if (this.ui.result) URL.revokeObjectURL(this.ui.result.url);
  }

  // ---------- state ----------
  private set(p: Partial<UiState>) { Object.assign(this.ui, p); if (!this.destroyed) this.onUi({ ...this.ui }); }
  private say(status: string) { this.set({ status }); }

  private updateSettings(p: Partial<FxSettings>) {
    this.settings = { ...this.settings, ...p };
    this.renderer.setSettings(this.settings);
    this.redraw();
  }

  private resetTrack() {
    this.frames = []; this.renderer.setFrames(this.frames);
    this.set({ tracked: false, canRecord: false });
  }

  private setupRenderer(vw: number, vh: number) {
    const { W, H } = workSize(vw, vh);
    this.renderer.setup(vw, vh, W, H);
  }

  private async onReady() {
    const v = this.video;
    if (!v.videoWidth) return;
    this.setupRenderer(v.videoWidth, v.videoHeight);
    this.set({ ready: true, duration: v.duration || 0, status: 'Video loaded.' });
    await this.seekTo(0);
    this.set({ tapStatus: OBJECT_TAP });
    this.redraw();
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

  // ---------- analysis ----------
  // outlines the object clicked at time `start` and follows it to the end of the clip
  private analyzeObject(start: number, select: ObjectSelection) {
    if (!this.file) return;
    this.objectJob = { start, select };
    this.analysis.cancel();
    this.resetTrack();
    this.video.pause();
    this.set({ progress: 0, analyzed: false, tracked: true, tapStatus: 'Outlining…' });
    this.analysis.start({ file: this.file, start, select }, {
      meta: meta => {
        this.meta = meta;
        const { W, H } = workSize(this.video.videoWidth, this.video.videoHeight);
        if (meta.W !== W || meta.H !== H) this.renderer.setup(meta.videoW, meta.videoH, meta.W, meta.H);
      },
      frames: (frames) => {
        const prev = this.frames.length;
        const first = prev === 0 ? frames[0] : null;
        this.frames.push(...frames);
        this.renderer.framesAppended(prev);
        const last = this.frames[this.frames.length - 1], dur = this.meta?.duration || this.ui.duration || 1;
        this.set({ progress: Math.min(0.99, (last.t + last.dur - start) / Math.max(0.001, dur - start)) });
        if (first) this.set({ tapStatus: first.shapes[0]?.mask
          ? 'Outlined. It’s following the object through the clip; press Play to watch. Wrong object? Press Reset and click it again.'
          : 'Couldn’t find an object there, so it’s following a box instead. Press Reset and try clicking the middle of the object.' });
        if (this.video.paused) this.redraw();
      },
      done: () => {
        this.renderer.invalidate();
        const any = this.frames.some(f => f.shapes.length);
        this.set({ progress: null, analyzed: true, canRecord: any && canRecord(this.view) });
        this.redraw();
      },
      error: message => { this.set({ progress: null }); this.say(message); },
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
    const idx = this.renderer.render(this.video, t, { outline: this.showOutline && !this.recorder, paused: this.video.paused });
    this.updateHint(idx);
  }

  private updateHint(idx: number) {
    let m = '';
    if (this.camera) m = 'Recording from the camera.';
    else if (!this.ui.ready) m = '';
    else if (!this.objectJob) m = 'Click the object you want the effect to follow.';
    else if (idx >= 0 && this.frames[idx].shapes.some(sh => sh.lost)) m = 'Searching for the object…';
    if (m !== this.ui.hint) this.set({ hint: m });
  }

  // ---------- clicking ----------
  private canvasPt(e: PointerEvent): [number, number] {
    const r = this.view.getBoundingClientRect();
    return [(e.clientX - r.left) / r.width * this.renderer.CW, (e.clientY - r.top) / r.height * this.renderer.CH];
  }
  private toWork(x: number, y: number) {
    const { W } = workSize(this.video.videoWidth, this.video.videoHeight), q = this.renderer.CW / W;
    return [x / q, y / q] as const;
  }
  private pointerDown(e: PointerEvent) {
    if (!this.ui.ready || this.camera || this.recorder) return;
    const [x, y] = this.canvasPt(e);
    this.press = { x, y };
  }
  private pointerUp() {
    const p = this.press;
    if (!p) return;
    this.press = null;
    // once something is tracked, clicking the video plays/pauses; Reset is how to pick again
    if (this.objectJob) { this.togglePlay(); return; }
    const [x, y] = this.toWork(p.x, p.y);
    this.analyzeObject(this.video.currentTime, { x, y });
  }

  // ---------- recording ----------
  // where recording starts: the first frame the effect has something to follow
  private startTime() {
    const f = this.frames.find(fr => fr.shapes.length);
    return f ? f.t : null;
  }

  private seekTo(t: number) {
    const v = this.video;
    return new Promise<void>(res => {
      v.pause();
      if (Math.abs(v.currentTime - t) < 0.001) return res();
      v.addEventListener('seeked', () => res(), { once: true }); v.currentTime = t;
    });
  }

  private async record() {
    const start = this.startTime();
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
