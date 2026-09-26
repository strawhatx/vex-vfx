// Analysis pass: decodes every frame of the clip once from the clicked frame on, outlines and
// follows the clicked object, and streams the track data back to the editor in small batches.
import { ALL_FORMATS, BlobSource, CanvasSink, Input } from 'mediabunny';
import { createSegmenter, type Segmenter } from './mediapipe';
import { ObjectTracker } from './objectTracker';
import type { AnalyzeRequest, WorkerMessage, WorkerRequest } from './protocol';
import { workSize, type TrackFrame } from './types';

const POST_EVERY_MS = 120;

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

async function run(job: AnalyzeRequest) {
  const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(job.file) });
  const track = await input.getPrimaryVideoTrack();
  if (!track) throw new Error('This file has no video in it.');
  if (!(await track.canDecode())) throw new Error('This browser can’t decode this video. Try exporting it as MP4 (H.264).');
  const vw = track.displayWidth, vh = track.displayHeight, { W, H } = workSize(vw, vh);
  const duration = await input.computeDuration();
  const stats = await track.computePacketStats(60);
  if (current !== job.jobId) return;
  post({ type: 'meta', jobId: job.jobId, meta: { videoW: vw, videoH: vh, W, H, duration,
    frameCount: Math.max(1, Math.round(duration * stats.averagePacketRate)) } });

  // frames are decoded straight at analysis size
  const sink = new CanvasSink(track, { width: W, height: H, fit: 'fill', poolSize: 2 });
  const work = new OffscreenCanvas(W, H), wctx = work.getContext('2d', { willReadFrequently: true }) as OffscreenCanvasRenderingContext2D;
  const seg = await (segmenter ??= createSegmenter());
  if (current !== job.jobId) return;
  // the tracker segments `work`, which holds the current frame at each step
  const tracker = new ObjectTracker(W, H, (x, y) => seg.segment(work, x, y));

  // start on the exact frame the user clicked
  const first = await sink.getCanvas(job.start);
  let batch: TrackFrame[] = [], done = 0, lastPost = 0;
  const flush = () => {
    if (!batch.length) return;
    post({ type: 'frames', jobId: job.jobId, frames: batch, done }); batch = []; lastPost = performance.now();
  };
  for await (const { canvas, timestamp, duration: dur } of sink.canvases(first ? first.timestamp : 0)) {
    if (current !== job.jobId) return;
    wctx.drawImage(canvas, 0, 0, W, H);
    const rgba = wctx.getImageData(0, 0, W, H).data;
    batch.push({ t: timestamp, dur, shapes: [done === 0 ? tracker.start(rgba, job.select) : tracker.step(rgba)] });
    done++;
    // the first frame goes out straight away so the paused preview shows the outline
    if (done === 1 || performance.now() - lastPost > POST_EVERY_MS) flush();
  }
  flush();
  post({ type: 'done', jobId: job.jobId });
}
