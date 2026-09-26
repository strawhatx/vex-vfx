// Analysis worker. Three jobs, one at a time:
// - scan: decodes the whole clip small, lists every frame and finds the cuts
// - track: from the frame the object was tapped on, follows it forward to the end of the
//   given frames, then backward to their start, streaming the track data back in batches
// - find: outlines everything in one frame and returns the best match for an appearance
import { ALL_FORMATS, BlobSource, CanvasSink, Input, type InputVideoTrack } from 'mediabunny';
import { describe, similarity } from '@/domain/tracking/appearance';
import { findCuts, frameDelta, toHsv } from '@/domain/tracking/cuts';
import { createSegmenter, type Segmenter } from './mediapipe';
import { ObjectTracker } from './objectTracker';
import type { FindRequest, JobRequest, ScanRequest, TrackRequest, WorkerMessage, WorkerRequest } from './protocol';
import { paintRle, workSize, type ClipFrame, type Shape } from '@/domain/tracking/types';

const POST_EVERY_MS = 120, BACK_CHUNK = 24, SCAN_W = 48, MIN_SHOT_S = 0.4, MIN_MATCH = 0.7;

let current = 0;
let segmenter: Promise<Segmenter> | null = null;
const post = (m: WorkerMessage) => self.postMessage(m);

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const m = e.data;
  if (m.type === 'cancel') { current = 0; return; }
  current = m.jobId;
  run(m).catch(err => {
    if (current === m.jobId) post({ type: 'error', jobId: m.jobId, message: err instanceof Error ? err.message : String(err) });
  });
};

function run(job: JobRequest) {
  return job.type === 'scan' ? scan(job) : job.type === 'track' ? track(job) : find(job);
}

// ---------- the open clip, reused across jobs ----------
type Clip = { file: Blob; track: InputVideoTrack; vw: number; vh: number; W: number; H: number; sink: CanvasSink;
  work: OffscreenCanvas; wctx: OffscreenCanvasRenderingContext2D };
let clip: Promise<Clip> | null = null, clipFile: Blob | null = null;

function open(file: Blob) {
  if (clip && clipFile === file) return clip;
  clipFile = file;
  return clip = (async () => {
    const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(file) });
    const track = await input.getPrimaryVideoTrack();
    if (!track) throw new Error('This file has no video in it.');
    if (!(await track.canDecode())) throw new Error('This browser can’t decode this video. Try exporting it as MP4 (H.264).');
    const vw = track.displayWidth, vh = track.displayHeight, { W, H } = workSize(vw, vh);
    // frames are decoded straight at analysis size
    const sink = new CanvasSink(track, { width: W, height: H, fit: 'fill', poolSize: 2 });
    const work = new OffscreenCanvas(W, H), wctx = work.getContext('2d', { willReadFrequently: true }) as OffscreenCanvasRenderingContext2D;
    return { file, track, vw, vh, W, H, sink, work, wctx };
  })();
}

// the tracker segments c.work, which must hold the frame being processed
async function makeTracker(c: Clip) {
  const seg = await (segmenter ??= createSegmenter());
  return () => new ObjectTracker(c.W, c.H, (x, y) => seg.segment(c.work, x, y));
}

// the frame starting at t (nudged so rounding never picks the frame before)
const at = (t: number) => t + 1e-4;

// ---------- scan ----------
async function scan(job: ScanRequest) {
  const c = await open(job.file);
  const duration = await c.track.computeDuration();
  const stats = await c.track.computePacketStats(60);
  if (current !== job.jobId) return;
  const total = Math.max(1, Math.round(duration * stats.averagePacketRate));
  const sw = SCAN_W, sh = Math.max(8, Math.round(SCAN_W * c.H / c.W));
  const sink = new CanvasSink(c.track, { width: sw, height: sh, fit: 'fill', poolSize: 2 });
  const small = new OffscreenCanvas(sw, sh), sctx = small.getContext('2d', { willReadFrequently: true }) as OffscreenCanvasRenderingContext2D;
  let prev = new Uint8Array(sw * sh * 3), cur = new Uint8Array(sw * sh * 3), lastPost = 0;
  const frames: ClipFrame[] = [], deltas: number[] = [];
  for await (const { canvas, timestamp, duration: dur } of sink.canvases()) {
    if (current !== job.jobId) return;
    sctx.drawImage(canvas, 0, 0);
    toHsv(sctx.getImageData(0, 0, sw, sh).data, cur);
    deltas.push(frames.length ? frameDelta(prev, cur) : 0);
    frames.push({ t: timestamp, dur });
    [prev, cur] = [cur, prev];
    if (performance.now() - lastPost > POST_EVERY_MS) { post({ type: 'progress', jobId: job.jobId, done: frames.length, total }); lastPost = performance.now(); }
  }
  const fps = frames.length / Math.max(0.001, duration);
  post({ type: 'scanned', jobId: job.jobId, frames, cuts: findCuts(deltas, Math.max(2, Math.round(MIN_SHOT_S * fps))),
    meta: { videoW: c.vw, videoH: c.vh, W: c.W, H: c.H, duration, frameCount: frames.length } });
  post({ type: 'done', jobId: job.jobId });
}

// ---------- track ----------
async function track(job: TrackRequest) {
  const c = await open(job.file), newTracker = await makeTracker(c), { W, H, wctx } = c;
  if (current !== job.jobId) return;
  const { times, key } = job, total = times.length;
  let batch: { i: number; shape: Shape }[] = [], done = 0, lastPost = 0;
  const flush = () => {
    if (!batch.length) return;
    post({ type: 'shapes', jobId: job.jobId, shapes: batch });
    post({ type: 'progress', jobId: job.jobId, done, total });
    batch = []; lastPost = performance.now();
  };
  const emit = (i: number, shape: Shape) => {
    batch.push({ i, shape }); done++;
    // the key frame goes out straight away so the paused preview shows the outline
    if (done === 1 || performance.now() - lastPost > POST_EVERY_MS) flush();
  };

  // forward from the key frame
  let keyImage: ImageData | null = null;
  const fwd = newTracker();
  let i = key;
  for await (const wc of c.sink.canvasesAtTimestamps(times.slice(key).map(at))) {
    if (current !== job.jobId) return;
    if (wc) {
      wctx.drawImage(wc.canvas, 0, 0, W, H);
      const img = wctx.getImageData(0, 0, W, H);
      if (i === key) {
        keyImage = img;
        const shape = fwd.start(img.data, job.select);
        post({ type: 'appearance', jobId: job.jobId, appearance: shape.mask ? describe(img.data, W, H, shape.mask) : null });
        emit(i, shape);
      } else emit(i, fwd.step(img.data));
    }
    i++;
  }

  // backward from the key frame, a chunk at a time (decoding only runs forward)
  if (key > 0 && keyImage) {
    const back = newTracker();
    wctx.putImageData(keyImage, 0, 0);
    back.start(keyImage.data, job.select);
    for (let end = key; end > 0; end -= BACK_CHUNK) {
      const a = Math.max(0, end - BACK_CHUNK), imgs: (ImageData | null)[] = [];
      for await (const wc of c.sink.canvasesAtTimestamps(times.slice(a, end).map(at))) {
        if (current !== job.jobId) return;
        if (wc) { wctx.drawImage(wc.canvas, 0, 0, W, H); imgs.push(wctx.getImageData(0, 0, W, H)); } else imgs.push(null);
      }
      for (let k = imgs.length - 1; k >= 0; k--) {
        const img = imgs[k];
        if (!img) continue;
        wctx.putImageData(img, 0, 0);
        emit(a + k, back.step(img.data));
      }
    }
  }
  flush();
  post({ type: 'done', jobId: job.jobId });
}

// ---------- find ----------
// outlines what's under a grid of points and keeps the best match; points inside an outline
// already tried are skipped, so each object is only looked at once
async function find(job: FindRequest) {
  const c = await open(job.file), newTracker = await makeTracker(c), { W, H, wctx } = c;
  const wc = await c.sink.getCanvas(at(job.t));
  if (current !== job.jobId) return;
  if (!wc) { post({ type: 'found', jobId: job.jobId, hit: null }); post({ type: 'done', jobId: job.jobId }); return; }
  wctx.drawImage(wc.canvas, 0, 0, W, H);
  const rgba = wctx.getImageData(0, 0, W, H).data, tracker = newTracker(), seen = new Uint8Array(W * H);
  const N = 96, cols = Math.max(4, Math.round(Math.sqrt(N * W / H))), rows = Math.max(4, Math.ceil(N / cols));
  let best: { x: number; y: number; score: number } | null = null, tried = 0;
  for (let gy = 0; gy < rows; gy++) for (let gx = 0; gx < cols; gx++) {
    if (current !== job.jobId) return;
    const x = Math.round((gx + 0.5) / cols * W), y = Math.round((gy + 0.5) / rows * H);
    tried++;
    if (seen[y * W + x]) continue;
    const shape = tracker.probe(x, y);
    if (!shape?.mask) continue;
    paintRle(shape.mask, seen, W, H);
    // sky, floor and walls run off two or more edges of the frame; objects rarely do
    const m = shape.mask, edges = +(m.x0 <= 0) + +(m.y0 <= 0) + +(m.x0 + m.w >= W) + +(m.y0 + m.h >= H);
    if (edges >= 2) continue;
    const a = describe(rgba, W, H, shape.mask);
    const score = a ? similarity(a, job.want) : 0;
    if (score > (best?.score ?? MIN_MATCH)) best = { x, y, score };
    post({ type: 'progress', jobId: job.jobId, done: tried, total: rows * cols });
  }
  post({ type: 'found', jobId: job.jobId, hit: best });
  post({ type: 'done', jobId: job.jobId });
}
