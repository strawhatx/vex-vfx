// Editor controller: plays the clip, renders the effect for exactly the frame the video is
// showing (from track data), starts analyses, and handles picking what the effect follows.
// React drives it through its methods and gets UI state back through onUi.
import { DEFAULT_PAL, type Effect, type FxSettings } from '@/effects/palettes';
import { Renderer } from '@/compositor/renderer';
import { AnalysisClient } from '@/tracking/client';
import type { Selection as ObjectSelection } from '@/tracking/protocol';
import { frameIndexAt, workSize, type BodyPart, type Subject, type TrackFrame, type TrackMeta } from '@/tracking/types';
import { canRecord, startCameraCapture, startCanvasRecording, type Recording } from '@/video/recorder';

export type { Subject };

export interface UiState {
  subject: Subject;
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
  canReplay: boolean;
  canRecord: boolean;
  result: Recording | null;
}

const NOUN: Record<BodyPart, string> = { hand: 'hands', body: 'people', face: 'faces' };
const ONE: Record<BodyPart, string> = { hand: 'hand', body: 'person', face: 'face' };
const OBJECT_TAP = 'Pause on a clear frame and click the hand or body. It traces the outline for you.';

export const INITIAL_UI: UiState = {
  subject: 'object', ready: false, playing: false, time: 0, duration: 0, hint: '', status: '', tapStatus: OBJECT_TAP,
  progress: null, analyzed: false, camera: false, recording: false, canReplay: false, canRecord: false, result: null,
};

type VideoWithFrameCallback = HTMLVideoElement & {
  requestVideoFrameCallback?: (cb: (now: number, meta: { mediaTime: number }) => void) => number;
};

export class Player {
  private ui: UiState = { ...INITIAL_UI };
  private settings: FxSettings = { effect: 'fire', pal: 0, size: 1, intensity: 1 };
  private showOutline = true;
  private tol = 28;
  private renderer: Renderer;
  private analysis = new AnalysisClient();
  private file: File | null = null;
  private srcUrl: string | null = null;
  private meta: TrackMeta | null = null;
  private frames: TrackFrame[] = [];
  private objectJob: { start: number; select: ObjectSelection } | null = null;
  private picked: number | null = null;
  private lastT = 0;
  private drag: { x0: number; y0: number; x1: number; y1: number } | null = null;
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
    view.addEventListener('pointermove', e => this.pointerMove(e), { signal });
    view.addEventListener('pointerup', () => this.pointerUp(), { signal });
    view.addEventListener('pointercancel', () => { this.drag = null; this.redraw(); }, { signal });
    this.frameLoop();
  }

  // ---------- public API ----------
  loadFile(f: File) {
    this.stopCamera();
    this.analysis.cancel();
    this.file = f; this.meta = null; this.objectJob = null; this.picked = null;
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

  setSubject(s: Subject) {
    this.analysis.cancel();
    this.objectJob = null; this.picked = null;
    this.resetTrack();
    this.set({ subject: s, progress: null, analyzed: false,
      tapStatus: s === 'object' ? OBJECT_TAP : `Load a clip and it will find ${NOUN[s]} automatically.` });
    if (s !== 'object' && this.ui.ready) this.analyzeLandmarks();
    this.redraw();
  }

  togglePlay() { if (this.ui.ready) { if (this.video.paused) void this.video.play(); else this.video.pause(); } }
  seek(t: number) { this.video.pause(); this.video.currentTime = t; this.set({ time: t }); }

  async replay() {
    const start = this.startTime();
    if (start === null) return;
    await this.seekTo(start); await this.video.play();
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
  setSpread(v: number) {
    this.tol = v;
    // re-trace from the same click
    if (this.objectJob && 'x' in this.objectJob.select && this.video.paused) this.analyzeObject(this.objectJob.start, this.objectJob.select);
  }

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
    this.frames = []; this.renderer.setFrames(this.frames); this.renderer.setSelection(null);
    this.set({ canReplay: false, canRecord: false });
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
    if (this.ui.subject !== 'object') this.analyzeLandmarks();
    else this.set({ tapStatus: OBJECT_TAP });
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
  private startAnalysis(extra: { start?: number; select?: ObjectSelection; tol?: number }, onFirst?: (f: TrackFrame) => void) {
    if (!this.file) return;
    const subject = this.ui.subject, start = extra.start ?? 0;
    this.analysis.cancel();
    this.resetTrack();
    if (subject !== 'object') this.renderer.setSelection(this.picked === null ? null : new Set([this.picked]));
    this.set({ progress: 0, analyzed: false });
    this.analysis.start({ file: this.file, subject, ...extra }, {
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
        this.set({ progress: Math.min(0.99, (last.t + last.dur - start) / Math.max(0.001, dur - start)), canReplay: true });
        if (first && onFirst) onFirst(first);
        if (this.video.paused) this.redraw();
      },
      done: () => {
        this.renderer.invalidate();
        const any = this.frames.some(f => f.shapes.length);
        this.set({ progress: null, analyzed: true, canRecord: any && canRecord(this.view) });
        if (subject !== 'object') {
          this.set({ tapStatus: any ? `Following all ${NOUN[subject]}. Click one to follow just them.` : `No ${NOUN[subject]} found in this clip.` });
        }
        this.redraw();
      },
      error: message => { this.set({ progress: null }); this.say(message); },
    });
  }

  private analyzeLandmarks() {
    const s = this.ui.subject as BodyPart;
    this.set({ tapStatus: `Finding ${NOUN[s]} in every frame…` });
    this.startAnalysis({});
  }

  private analyzeObject(start: number, select: ObjectSelection) {
    this.objectJob = { start, select };
    this.set({ tapStatus: 'Tracing…' });
    this.startAnalysis({ start, select, tol: this.tol }, first => {
      const shape = first.shapes[0];
      this.set({ tapStatus: !('x' in select) ? 'Box locked. It’s tracking through the clip; press Play to watch it follow.'
        : shape?.mask ? 'Traced. It’s tracking through the clip; press Play to watch it follow. If the outline spills or misses parts, adjust the spread.'
        : 'That spot didn’t trace cleanly, so it’s boxed instead. Raise the spread and click again, or drag a box.' });
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
    if (this.drag) {
      const c = this.renderer.ctx, d = this.drag;
      c.save(); c.strokeStyle = '#fff'; c.lineWidth = 2; c.setLineDash([8, 6]); c.fillStyle = 'rgba(255,255,255,.12)';
      const x = Math.min(d.x0, d.x1), y = Math.min(d.y0, d.y1), w = Math.abs(d.x1 - d.x0), h = Math.abs(d.y1 - d.y0);
      c.fillRect(x, y, w, h); c.strokeRect(x, y, w, h); c.restore();
    }
    this.updateHint(idx);
  }

  private updateHint(idx: number) {
    const s = this.ui.subject;
    let m = '';
    if (this.camera) m = 'Recording from the camera.';
    else if (!this.ui.ready) m = '';
    else if (s === 'object') {
      if (!this.objectJob && !this.drag) m = 'Click the hand or body to trace it, or drag a box.';
      else if (idx >= 0 && this.frames[idx].shapes.some(sh => sh.lost)) m = 'Searching for the object…';
    } else if (idx < 0) {
      if (this.ui.progress !== null) m = 'Analysing… this part of the clip isn’t ready yet.';
    } else if (!this.frames[idx].shapes.some(sh => this.picked === null || sh.id === this.picked)) {
      m = this.picked === null ? `No ${NOUN[s]} in this frame.` : `The ${ONE[s]} you picked isn’t in this frame.`;
    }
    if (m !== this.ui.hint) this.set({ hint: m });
  }

  // ---------- picking ----------
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
    this.drag = { x0: x, y0: y, x1: x, y1: y };
    this.view.setPointerCapture(e.pointerId);
  }
  private pointerMove(e: PointerEvent) {
    if (!this.drag) return;
    [this.drag.x1, this.drag.y1] = this.canvasPt(e);
    if (this.ui.subject === 'object' && this.video.paused) this.redraw();
  }
  private pointerUp() {
    const d = this.drag;
    if (!d) return;
    this.drag = null;
    const t = this.video.currentTime, [x0, y0] = this.toWork(d.x0, d.y0);
    if (this.ui.subject !== 'object') { this.pickAt(x0, y0, t); return; }
    const w = Math.abs(d.x1 - d.x0), h = Math.abs(d.y1 - d.y0);
    if (w < 14 || h < 14) { this.analyzeObject(t, { x: x0, y: y0 }); return; }
    const [cx, cy] = this.toWork((d.x0 + d.x1) / 2, (d.y0 + d.y1) / 2), [bw, bh] = this.toWork(w, h);
    this.analyzeObject(t, { cx, cy, w: bw, h: bh });
  }

  // picks the hand / body / face under the click; empty space goes back to everyone
  private pickAt(x: number, y: number, t: number) {
    const s = this.ui.subject as BodyPart, idx = frameIndexAt(this.frames, t);
    let best: number | null = null, bestArea = Infinity;
    if (idx >= 0) for (const sh of this.frames[idx].shapes) {
      const pad = Math.max(8, Math.max(sh.w, sh.h) * 0.15);
      if (Math.abs(x - sh.cx) <= sh.w / 2 + pad && Math.abs(y - sh.cy) <= sh.h / 2 + pad && sh.w * sh.h < bestArea) { best = sh.id; bestArea = sh.w * sh.h; }
    }
    this.picked = best;
    this.renderer.setSelection(best === null ? null : new Set([best]));
    this.set({ tapStatus: best === null ? `Following all ${NOUN[s]}. Click one to follow just them.`
      : `Following the ${ONE[s]} you clicked. Click empty space to follow all ${NOUN[s]} again.` });
    this.redraw();
  }

  // ---------- replay & recording ----------
  // where replay and recording start: the first frame the effect has something to follow
  private startTime() {
    const f = this.frames.find(fr => fr.shapes.some(sh => this.picked === null || sh.id === this.picked));
    return f ? (this.ui.subject === 'object' ? f.t : this.picked === null ? 0 : f.t) : null;
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
