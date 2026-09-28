// Analysis worker. Three jobs, one at a time:
// - scan: decodes the whole clip tiny and lists every frame, in clip time
// - probe: says whether a tap landed on a person, and which body part is nearest
// - camera: the camera's movement through the whole clip
// - cutout: cuts an object out of its frames along its outlines, at output size, and rebuilds the
//   background behind it (a clean plate) when asked
// - track: from the frame the object (or body part) was tapped on, follows it forward to the end
//   of the given frames, then backward to their start, streaming the track data back in batches
import { ALL_FORMATS, BlobSource, CanvasSink, Input, type InputVideoTrack } from 'mediabunny';
import { toClipTime } from '@/domain/tracking/timeline';
import { BodyPartTracker, modelsFor } from './bodyTracker';
import { CameraTracker } from './camera';
import { refineMatte } from './matte';
import { cleanPlate, holeOf, type PlateFrame } from './cleanPlate';
import { NO_MOVE } from '@/domain/effects/laser';
import {
  createFaces,
  createHands,
  createPoses,
  createSegmenter,
  type Landmarks,
  type Segmenter,
} from './mediapipe';
import { ObjectTracker } from './objectTracker';
import type {
  CameraRequest,
  CutoutRequest,
  SpriteMsg,
  JobRequest,
  ProbeRequest,
  ScanRequest,
  TrackRequest,
  WorkerMessage,
  WorkerRequest,
} from './protocol';
import { partNearest, person, personAt } from '@/domain/tracking/bodyParts';
import { paintRle, workSize, type ClipFrame, type Selection, type Shape } from '@/domain/tracking/types';

const POST_EVERY_MS = 120,
  BACK_CHUNK = 24,
  SCAN_W = 16,
  // cutouts are cut at the size the editor draws at (see Renderer.setup)
  CUT_MAX_W = 960,
  // a clean plate borrows from frames up to this many either side
  PLATE_REACH = 30;

let current = 0;
let segmenter: Promise<Segmenter> | null = null;
let poses: Promise<Landmarks> | null = null,
  hands: Promise<Landmarks> | null = null,
  faces: Promise<Landmarks> | null = null;
const post = (m: WorkerMessage, transfer: Transferable[] = []) => self.postMessage(m, { transfer });

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const m = e.data;
  if (m.type === 'cancel') {
    current = 0;
    return;
  }
  current = m.jobId;
  run(m).catch(err => {
    if (current === m.jobId)
      post({ type: 'error', jobId: m.jobId, message: err instanceof Error ? err.message : String(err) });
  });
};

function run(job: JobRequest) {
  return job.type === 'scan'
    ? scan(job)
    : job.type === 'probe'
      ? probe(job)
      : job.type === 'camera'
        ? camera(job)
        : job.type === 'cutout'
          ? cutout(job)
          : track(job);
}

// ---------- the open clip, reused across jobs ----------
// shift: seconds from clip time to file time, found by the scan; every time in and out of the
// worker is clip time (0 at the first frame the player shows)
type Clip = {
  file: Blob;
  track: InputVideoTrack;
  vw: number;
  vh: number;
  W: number;
  H: number;
  sink: CanvasSink;
  work: OffscreenCanvas;
  wctx: OffscreenCanvasRenderingContext2D;
  shift: number;
};
// jobs name their clip by id: every message carries a fresh copy of the file, so the Blob itself can't be compared
let clip: Promise<Clip> | null = null,
  clipId = -1;

function open(job: JobRequest) {
  const file = job.file;
  if (clip && clipId === job.clipId) return clip;
  clipId = job.clipId;
  return (clip = (async () => {
    const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(file) });
    const track = await input.getPrimaryVideoTrack();
    if (!track) throw new Error('This file has no video in it.');
    if (!(await track.canDecode()))
      throw new Error('This browser can’t decode this video. Try exporting it as MP4 (H.264).');
    const vw = track.displayWidth,
      vh = track.displayHeight,
      { W, H } = workSize(vw, vh);
    // frames are decoded straight at analysis size
    const sink = new CanvasSink(track, { width: W, height: H, fit: 'fill', poolSize: 2 });
    const work = new OffscreenCanvas(W, H),
      wctx = work.getContext('2d', { willReadFrequently: true }) as OffscreenCanvasRenderingContext2D;
    return { file, track, vw, vh, W, H, sink, work, wctx, shift: 0 };
  })());
}

// something that follows what was tapped from frame to frame: the object under the tap (outlined
// and followed), or a body part of the person tapped. Both look at c.work, which must hold the frame.
interface Follower {
  start(rgba: Uint8ClampedArray, sel: Selection): Shape | null;
  step(rgba: Uint8ClampedArray): Shape | null;
}

async function makeFollower(c: Clip, job: TrackRequest): Promise<() => Follower> {
  const part = job.part;
  if (part && part !== 'body') {
    const need = modelsFor(part);
    const models = {
      poses: await (poses ??= createPoses()),
      hands: need.hands ? await (hands ??= createHands()) : null,
      faces: need.faces ? await (faces ??= createFaces()) : null,
    };
    return () => {
      const t = new BodyPartTracker(c.W, c.H, part, models, c.work);
      return { start: (_rgba, sel) => t.start(sel), step: () => t.step() };
    };
  }
  const seg = await (segmenter ??= createSegmenter());
  return () => {
    const t = new ObjectTracker(c.W, c.H, (x, y, region) => seg.segment(c.work, x, y, region), job.focus);
    return { start: (rgba, sel) => t.start(rgba, sel), step: rgba => t.step(rgba) };
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
  const sink = new CanvasSink(c.track, {
    width: SCAN_W,
    height: Math.max(8, Math.round((SCAN_W * c.H) / c.W)),
    fit: 'fill',
    poolSize: 2,
  });
  const raw: ClipFrame[] = [];
  let lastPost = 0;
  for await (const { timestamp, duration: dur } of sink.canvases()) {
    if (current !== job.jobId) return;
    raw.push({ t: timestamp, dur });
    if (performance.now() - lastPost > POST_EVERY_MS) {
      post({ type: 'progress', jobId: job.jobId, done: raw.length, total });
      lastPost = performance.now();
    }
  }
  if (!raw.length) throw new Error('No frames could be read from this video.');
  // clip time, and only the frames the player shows
  const { frames, shift } = toClipTime(raw, job.playerLength);
  c.shift = shift;
  const end = frames.length ? frames[frames.length - 1].t + frames[frames.length - 1].dur : 0;
  post({
    type: 'scanned',
    jobId: job.jobId,
    frames,
    meta: { videoW: c.vw, videoH: c.vh, W: c.W, H: c.H, duration: end, frameCount: frames.length },
  });
  post({ type: 'done', jobId: job.jobId });
}

// ---------- track ----------
async function track(job: TrackRequest) {
  const c = await open(job),
    newTracker = await makeFollower(c, job),
    { W, H, wctx } = c;
  if (current !== job.jobId) return;
  const { times, key } = job,
    total = times.length;
  let batch: { i: number; shape: Shape }[] = [],
    done = 0,
    lastPost = 0;
  const flush = () => {
    if (!batch.length) return;
    post({ type: 'shapes', jobId: job.jobId, shapes: batch });
    post({ type: 'progress', jobId: job.jobId, done, total });
    batch = [];
    lastPost = performance.now();
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
      const a = Math.max(0, end - BACK_CHUNK),
        imgs: (ImageData | null)[] = [];
      for await (const wc of c.sink.canvasesAtTimestamps(times.slice(a, end).map(t => at(c, t)))) {
        if (current !== job.jobId) return;
        if (wc) {
          wctx.drawImage(wc.canvas, 0, 0, W, H);
          imgs.push(wctx.getImageData(0, 0, W, H));
        } else imgs.push(null);
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
  const c = await open(job),
    find = await (poses ??= createPoses());
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

// ---------- camera ----------
// the camera's path from the first frame, for every frame
async function camera(job: CameraRequest) {
  const c = await open(job),
    { W, H, wctx } = c,
    cam = new CameraTracker(W, H),
    total = job.times.length;
  let batch: { i: number; s: number; tx: number; ty: number }[] = [],
    i = 0,
    lastPost = 0;
  const flush = () => {
    if (!batch.length) return;
    post({ type: 'camera', jobId: job.jobId, path: batch });
    post({ type: 'progress', jobId: job.jobId, done: i, total });
    batch = [];
    lastPost = performance.now();
  };
  for await (const wc of c.sink.canvasesAtTimestamps(job.times.map(t => at(c, t)))) {
    if (current !== job.jobId) return;
    if (wc) {
      wctx.drawImage(wc.canvas, 0, 0, W, H);
      const rgba = wctx.getImageData(0, 0, W, H).data;
      batch.push({ i, ...(i === 0 ? cam.first(rgba) : cam.step(rgba)) });
    }
    i++;
    if (performance.now() - lastPost > POST_EVERY_MS) flush();
  }
  flush();
  post({ type: 'done', jobId: job.jobId });
}

// ---------- cutout ----------
// Each frame is decoded at output size. The object is cut out of it along its outline: drawn up from
// analysis size, then its edge redrawn from the picture itself (see matte.ts), so it follows the
// object's real edge rather than the blocky outline's. With a clean plate the frame is also kept at
// analysis size, for PLATE_REACH frames either side, to borrow the background from.
async function cutout(job: CutoutRequest) {
  const c = await open(job),
    { W, H } = c;
  const ow = Math.min(c.vw, CUT_MAX_W),
    oh = Math.round((c.vh * ow) / c.vw),
    q = ow / W;
  const sink = new CanvasSink(c.track, { width: ow, height: oh, fit: 'fill', poolSize: 2 });
  const frame = new OffscreenCanvas(ow, oh),
    fctx = frame.getContext('2d') as OffscreenCanvasRenderingContext2D;
  // the outline as a white-on-clear picture, at analysis size
  const maskCan = new OffscreenCanvas(W, H),
    mctx = maskCan.getContext('2d') as OffscreenCanvasRenderingContext2D,
    maskImg = mctx.createImageData(W, H),
    m32 = new Uint32Array(maskImg.data.buffer),
    mask = new Uint8Array(W * H);
  const total = job.times.length;

  let batch: { i: number; cut?: SpriteMsg | null; plate?: SpriteMsg | null }[] = [],
    transfer: Transferable[] = [],
    done = 0,
    lastPost = 0;
  const flush = () => {
    if (!batch.length) return;
    post({ type: 'cutout', jobId: job.jobId, frames: batch }, transfer);
    post({ type: 'progress', jobId: job.jobId, done, total });
    batch = [];
    transfer = [];
    lastPost = performance.now();
  };
  // what's been made for frame i: its cutout, or its plate
  const emit = (i: number, part: { cut: SpriteMsg | null } | { plate: SpriteMsg | null }) => {
    const at = batch.find(b => b.i === i);
    if (at) Object.assign(at, part);
    else batch.push({ i, ...part });
    const s = 'cut' in part ? part.cut : part.plate;
    if (s) transfer.push(s.image);
  };

  // the object cut out of the frame on `frame`
  const cutOut = (i: number): SpriteMsg | null => {
    const rle = job.masks[i];
    if (!rle) return null;
    mask.fill(0);
    const b = paintRle(rle, mask, W, H);
    if (b.bx1 < 0) return null;
    m32.fill(0);
    for (let y = b.by0; y <= b.by1; y++)
      for (let x = b.bx0; x <= b.bx1; x++) if (mask[y * W + x]) m32[y * W + x] = 0xffffffff;
    mctx.putImageData(maskImg, 0, 0);
    // the box in output pixels, with room round it for the edge to move out to
    const r = Math.max(3, Math.round(2 * q)),
      room = 1 + Math.ceil(r / q);
    const x0 = Math.max(0, Math.floor((b.bx0 - room) * q)),
      y0 = Math.max(0, Math.floor((b.by0 - room) * q)),
      x1 = Math.min(ow, Math.ceil((b.bx1 + 1 + room) * q)),
      y1 = Math.min(oh, Math.ceil((b.by1 + 1 + room) * q));
    const cw = x1 - x0,
      ch = y1 - y0;
    if (cw < 1 || ch < 1) return null;
    const out = new OffscreenCanvas(cw, ch),
      g = out.getContext('2d', { willReadFrequently: true }) as OffscreenCanvasRenderingContext2D;
    // the rough matte, drawn up to output size
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    g.drawImage(maskCan, -x0, -y0, W * q, H * q);
    const rough = g.getImageData(0, 0, cw, ch).data,
      alpha = new Float32Array(cw * ch);
    for (let k = 0; k < alpha.length; k++) alpha[k] = rough[k * 4 + 3] / 255;
    // the picture, and the matte redrawn from it
    g.clearRect(0, 0, cw, ch);
    g.drawImage(frame, -x0, -y0);
    const pic = g.getImageData(0, 0, cw, ch);
    const fine = refineMatte(pic.data, alpha, cw, ch, r);
    for (let k = 0; k < fine.length; k++) pic.data[k * 4 + 3] = Math.round(fine[k] * 255);
    g.putImageData(pic, 0, 0);
    return { image: out.transferToImageBitmap(), x: x0 / q, y: y0 / q, w: cw / q, h: ch / q };
  };

  // the frames kept for clean plates, by index; each is made once PLATE_REACH frames past it are in
  const kept = new Map<number, PlateFrame & { box: ReturnType<typeof holeOf> }>();
  const work = new OffscreenCanvas(W, H),
    wctx = work.getContext('2d', { willReadFrequently: true }) as OffscreenCanvasRenderingContext2D;
  const plateFor = (i: number): SpriteMsg | null => {
    const f = kept.get(i);
    if (!f?.box || !f.hole) return null;
    const others: PlateFrame[] = [];
    for (let d = 1; d <= PLATE_REACH; d++)
      for (const j of [i - d, i + d]) {
        const o = kept.get(j);
        if (o) others.push(o);
      }
    const p = cleanPlate(f, f.box.box, others, W, H);
    const pc = new OffscreenCanvas(p.w, p.h);
    (pc.getContext('2d') as OffscreenCanvasRenderingContext2D).putImageData(
      new ImageData(p.rgba, p.w, p.h),
      0,
      0,
    );
    return { image: pc.transferToImageBitmap(), x: p.x, y: p.y, w: p.w, h: p.h };
  };
  let plated = 0; // the next frame to make a plate for
  const platesUpTo = (end: number) => {
    for (; plated < end; plated++) {
      emit(plated, { plate: plateFor(plated) });
      kept.delete(plated - PLATE_REACH);
    }
  };

  const at_ = (t: number) => at(c, t);
  let i = 0;
  for await (const wc of sink.canvasesAtTimestamps(job.times.map(at_))) {
    if (current !== job.jobId) return;
    if (wc) {
      fctx.drawImage(wc.canvas, 0, 0, ow, oh);
      emit(i, { cut: cutOut(i) });
      if (job.plate) {
        wctx.drawImage(frame, 0, 0, W, H);
        const rle = job.masks[i];
        const box = rle ? holeOf(rle, W, H) : null;
        kept.set(i, {
          rgba: wctx.getImageData(0, 0, W, H).data,
          hole: box?.hole ?? null,
          cam: job.cam[i] ?? NO_MOVE,
          box,
        });
        platesUpTo(i - PLATE_REACH);
      }
    }
    i++;
    done = job.plate ? plated : i;
    if (performance.now() - lastPost > POST_EVERY_MS) flush();
  }
  if (job.plate) platesUpTo(total);
  done = total;
  flush();
  post({ type: 'done', jobId: job.jobId });
}
