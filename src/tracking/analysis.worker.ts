// Analysis pass: decodes every frame of the clip once, runs the chosen tracker on it, and
// streams the resulting track data back to the editor in small batches.
import { ALL_FORMATS, BlobSource, CanvasSink, Input } from 'mediabunny';
import { Associator, lookOf, type Candidate } from './associate';
import { createDetector, type Detector } from './mediapipe';
import { ObjectTracker } from './objectTracker';
import type { AnalyzeRequest, WorkerMessage, WorkerRequest } from './protocol';
import { DRAW, landmarkBounds } from './silhouettes';
import { encodeRle, workSize, type BodyPart, type Rle, type Shape, type TrackFrame } from './types';

// detectors get frames at up to this size; small people need the extra resolution
const FRAME_LONG_SIDE = 1280;
const POST_EVERY_MS = 120;

let current = 0;
const detectors = new Map<BodyPart, Promise<Detector>>();
const post = (m: WorkerMessage) => self.postMessage(m);

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const m = e.data;
  if (m.type === 'cancel') { current = 0; return; }
  current = m.jobId;
  run(m).catch(err => {
    if (current === m.jobId) post({ type: 'error', jobId: m.jobId, message: err instanceof Error ? err.message : String(err) });
  });
};

async function run(job: AnalyzeRequest) {
  const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(job.file) });
  const track = await input.getPrimaryVideoTrack();
  if (!track) throw new Error('This file has no video in it.');
  if (!(await track.canDecode())) throw new Error('This browser can’t decode this video. Try exporting it as MP4 (H.264).');
  const vw = track.displayWidth, vh = track.displayHeight, { W, H } = workSize(vw, vh);
  const duration = await input.computeDuration();
  const stats = await track.computePacketStats(60);
  if (current !== job.jobId) return;
  post({ type: 'meta', jobId: job.jobId, meta: { subject: job.subject, videoW: vw, videoH: vh, W, H, duration,
    frameCount: Math.max(1, Math.round(duration * stats.averagePacketRate)) } });

  const s = Math.min(1, FRAME_LONG_SIDE / Math.max(vw, vh));
  const sink = new CanvasSink(track, { width: Math.round(vw * s), height: Math.round(vh * s), fit: 'fill', poolSize: 2 });
  const work = new OffscreenCanvas(W, H), wctx = work.getContext('2d', { willReadFrequently: true }) as OffscreenCanvasRenderingContext2D;

  let start = 0, step: (frame: OffscreenCanvas, rgba: Uint8ClampedArray, t: number) => Shape[];
  if (job.subject === 'object') {
    // start on the exact frame the user clicked
    const first = await sink.getCanvas(job.start ?? 0);
    start = first ? first.timestamp : 0;
    const tracker = new ObjectTracker(W, H);
    let begun = false;
    step = (_f, rgba) => {
      if (begun) return [tracker.step(rgba)];
      begun = true;
      return [tracker.start(rgba, job.select!, job.tol ?? 28)];
    };
  } else {
    const part = job.subject;
    if (!detectors.has(part)) detectors.set(part, createDetector(part));
    const det = await detectors.get(part)!;
    if (current !== job.jobId) return;
    det.reset();
    step = landmarkStep(part, det, new Associator(), W, H);
  }

  let batch: TrackFrame[] = [], done = 0, lastPost = 0;
  const flush = () => {
    if (!batch.length) return;
    post({ type: 'frames', jobId: job.jobId, frames: batch, done }); batch = []; lastPost = performance.now();
  };
  for await (const { canvas, timestamp, duration: dur } of sink.canvases(start)) {
    if (current !== job.jobId) return;
    const frame = canvas as OffscreenCanvas;
    wctx.drawImage(frame, 0, 0, W, H);
    const rgba = wctx.getImageData(0, 0, W, H).data;
    batch.push({ t: timestamp, dur, shapes: step(frame, rgba, timestamp) });
    done++;
    // the first frame goes out straight away so the paused preview shows the trace
    if (done === 1 || performance.now() - lastPost > POST_EVERY_MS) flush();
  }
  flush();
  post({ type: 'done', jobId: job.jobId });
}

// paints each person's silhouette on its own, turns it into a mask, and gives it an id
function landmarkStep(part: BodyPart, det: Detector, assoc: Associator, W: number, H: number) {
  const paint = new OffscreenCanvas(W, H), pctx = paint.getContext('2d', { willReadFrequently: true }) as OffscreenCanvasRenderingContext2D;
  return (frame: OffscreenCanvas, rgba: Uint8ClampedArray, t: number): Shape[] => {
    const cands: Candidate[] = [], masks: Rle[] = [];
    for (const lm of det.detect(frame, t * 1000)) {
      const b = landmarkBounds(part, lm, W, H);
      const x0 = Math.max(0, Math.floor(b.x0)), y0 = Math.max(0, Math.floor(b.y0));
      const x1 = Math.min(W - 1, Math.ceil(b.x1)), y1 = Math.min(H - 1, Math.ceil(b.y1));
      if (x1 <= x0 || y1 <= y0) continue;
      pctx.setTransform(1, 0, 0, 1, 0, 0); pctx.clearRect(0, 0, W, H);
      pctx.fillStyle = pctx.strokeStyle = '#fff'; pctx.lineCap = pctx.lineJoin = 'round';
      DRAW[part](pctx, lm, W, H);
      const bw = x1 - x0 + 1, bh = y1 - y0 + 1, px = pctx.getImageData(x0, y0, bw, bh).data, local = new Uint8Array(bw * bh);
      let tx0 = bw, ty0 = bh, tx1 = -1, ty1 = -1;
      for (let y = 0, i = 0; y < bh; y++) for (let x = 0; x < bw; x++, i++) {
        if (px[i * 4 + 3] <= 127) continue;
        local[i] = 1;
        if (x < tx0) tx0 = x; if (x > tx1) tx1 = x; if (y < ty0) ty0 = y; if (y > ty1) ty1 = y;
      }
      if (tx1 < 0) continue;
      const rle = encodeRle(local, bw, tx0, ty0, tx1, ty1);
      rle.x0 += x0; rle.y0 += y0;
      const w = tx1 - tx0 + 1, h = ty1 - ty0 + 1, cx = x0 + tx0 + w / 2, cy = y0 + ty0 + h / 2;
      cands.push({ cx, cy, w, h, look: lookOf(rgba, W, H, cx, cy, w, h) }); masks.push(rle);
    }
    const ids = assoc.assign(cands);
    return cands.map((c, i) => ({ id: ids[i], cx: c.cx, cy: c.cy, w: c.w, h: c.h, mask: masks[i] }));
  };
}
