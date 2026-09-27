// Analysis worker. Three jobs, one at a time:
// - scan: decodes the whole clip tiny and lists every frame, in clip time
// - probe: says whether a tap landed on a person, and which body part is nearest
// - track: from the frame the object (or body part) was tapped on, follows it forward to the end
//   of the given frames, then backward to their start, streaming the track data back in batches
import { ALL_FORMATS, BlobSource, CanvasSink, Input, type InputVideoTrack } from 'mediabunny';
import { toClipTime } from '@/domain/tracking/timeline';
import { BodyPartTracker, modelsFor } from './bodyTracker';
import { createFaces, createHands, createPoses, createSegmenter, type Landmarks, type Segmenter } from './mediapipe';
import { ObjectTracker } from './objectTracker';
import type { JobRequest, ProbeRequest, ScanRequest, TrackRequest, WorkerMessage, WorkerRequest } from './protocol';
import { partNearest, person, personAt } from '@/domain/tracking/bodyParts';
import { workSize, type ClipFrame, type Selection, type Shape } from '@/domain/tracking/types';

const POST_EVERY_MS = 120, BACK_CHUNK = 24, SCAN_W = 16;

let current = 0;
let segmenter: Promise<Segmenter> | null = null;
let poses: Promise<Landmarks> | null = null, hands: Promise<Landmarks> | null = null, faces: Promise<Landmarks> | null = null;
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
  return job.type === 'scan' ? scan(job) : job.type === 'probe' ? probe(job) : track(job);
}

// ---------- the open clip, reused across jobs ----------
// shift: seconds from clip time to file time, found by the scan; every time in and out of the
// worker is clip time (0 at the first frame the player shows)
type Clip = { file: Blob; track: InputVideoTrack; vw: number; vh: number; W: number; H: number; sink: CanvasSink;
  work: OffscreenCanvas; wctx: OffscreenCanvasRenderingContext2D; shift: number };
// jobs name their clip by id: every message carries a fresh copy of the file, so the Blob itself can't be compared
let clip: Promise<Clip> | null = null, clipId = -1;

function open(job: JobRequest) {
  const file = job.file;
  if (clip && clipId === job.clipId) return clip;
  clipId = job.clipId;
  return clip = (async () => {
    const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(file) });
    const track = await input.getPrimaryVideoTrack();
    if (!track) throw new Error('This file has no video in it.');
    if (!(await track.canDecode())) throw new Error('This browser can’t decode this video. Try exporting it as MP4 (H.264).');
    const vw = track.displayWidth, vh = track.displayHeight, { W, H } = workSize(vw, vh);
    // frames are decoded straight at analysis size
    const sink = new CanvasSink(track, { width: W, height: H, fit: 'fill', poolSize: 2 });
    const work = new OffscreenCanvas(W, H), wctx = work.getContext('2d', { willReadFrequently: true }) as OffscreenCanvasRenderingContext2D;
    return { file, track, vw, vh, W, H, sink, work, wctx, shift: 0 };
  })();
}

// something that follows what was tapped from frame to frame: the object under the tap (outlined
// and followed), or a body part of the person tapped. Both look at c.work, which must hold the frame.
interface Follower { start(rgba: Uint8ClampedArray, sel: Selection): Shape | null; step(rgba: Uint8ClampedArray): Shape | null }

async function makeFollower(c: Clip, job: TrackRequest): Promise<() => Follower> {
  const part = job.part;
  if (part && part !== 'body') {
    const need = modelsFor(part);
    const models = {
      poses: await (poses ??= createPoses()),
      hands: need.hands ? await (hands ??= createHands()) : null,
      faces: need.faces ? await (faces ??= createFaces()) : null,
    };
    return () => { const t = new BodyPartTracker(c.W, c.H, part, models, c.work); return { start: (_rgba, sel) => t.start(sel), step: () => t.step() }; };
  }
  const seg = await (segmenter ??= createSegmenter());
  return () => {
    const t = new ObjectTracker(c.W, c.H, (x, y) => seg.segment(c.work, x, y));
    return { start: (rgba, sel) => t.start(rgba, sel, job.pin), step: rgba => t.step(rgba) };
  };
}

// the file time of the frame starting at clip time t (nudged so rounding never picks the frame before)
const at = (c: Clip, t: number) => t + c.shift + 1e-4;

// ---------- scan ----------
async function scan(job: ScanRequest) {
  const c = await open(job);
  const duration = await c.track.computeDuration();
  const stats = await c.track.computePacketStats(60);
  if (current !== job.jobId) return;
  const total = Math.max(1, Math.round(duration * stats.averagePacketRate));
  // decoding tiny lists exactly the frames the decoder produces, with their times
  const sink = new CanvasSink(c.track, { width: SCAN_W, height: Math.max(8, Math.round(SCAN_W * c.H / c.W)), fit: 'fill', poolSize: 2 });
  const raw: ClipFrame[] = [];
  let lastPost = 0;
  for await (const { timestamp, duration: dur } of sink.canvases()) {
    if (current !== job.jobId) return;
    raw.push({ t: timestamp, dur });
    if (performance.now() - lastPost > POST_EVERY_MS) { post({ type: 'progress', jobId: job.jobId, done: raw.length, total }); lastPost = performance.now(); }
  }
  if (!raw.length) throw new Error('No frames could be read from this video.');
  // clip time, and only the frames the player shows
  const { frames, shift } = toClipTime(raw, job.playerLength);
  c.shift = shift;
  const end = frames.length ? frames[frames.length - 1].t + frames[frames.length - 1].dur : 0;
  post({ type: 'scanned', jobId: job.jobId, frames,
    meta: { videoW: c.vw, videoH: c.vh, W: c.W, H: c.H, duration: end, frameCount: frames.length } });
  post({ type: 'done', jobId: job.jobId });
}

// ---------- track ----------
async function track(job: TrackRequest) {
  const c = await open(job), newTracker = await makeFollower(c, job), { W, H, wctx } = c;
  if (current !== job.jobId) return;
  const { times, key } = job, total = times.length;
  let batch: { i: number; shape: Shape }[] = [], done = 0, lastPost = 0;
  const flush = () => {
    if (!batch.length) return;
    post({ type: 'shapes', jobId: job.jobId, shapes: batch });
    post({ type: 'progress', jobId: job.jobId, done, total });
    batch = []; lastPost = performance.now();
  };
  // frames where the part (or object) isn't found send nothing
  const emit = (i: number, shape: Shape | null) => {
    if (shape) batch.push({ i, shape });
    done++;
    // the key frame goes out straight away so the paused preview shows the outline
    if (done === 1 || performance.now() - lastPost > POST_EVERY_MS) flush();
  };

  // forward from the key frame
  let keyImage: ImageData | null = null;
  const fwd = newTracker();
  let i = key;
  for await (const wc of c.sink.canvasesAtTimestamps(times.slice(key).map(t => at(c, t)))) {
    if (current !== job.jobId) return;
    if (wc) {
      wctx.drawImage(wc.canvas, 0, 0, W, H);
      const img = wctx.getImageData(0, 0, W, H);
      if (i === key) {
        keyImage = img;
        emit(i, fwd.start(img.data, job.select));
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
      for await (const wc of c.sink.canvasesAtTimestamps(times.slice(a, end).map(t => at(c, t)))) {
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

// ---------- probe ----------
// is there a person where the tap landed, and which part of them is nearest?
async function probe(job: ProbeRequest) {
  const c = await open(job), find = await (poses ??= createPoses());
  const wc = await c.sink.getCanvas(at(c, job.t));
  if (current !== job.jobId) return;
  let part = null;
  if (wc) {
    c.wctx.drawImage(wc.canvas, 0, 0, c.W, c.H);
    const who = personAt(find(c.work).map(person), job.at);
    if (who) part = partNearest(who, job.at);
  }
  post({ type: 'probed', jobId: job.jobId, part });
  post({ type: 'done', jobId: job.jobId });
}
