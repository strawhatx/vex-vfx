// MediaPipe detectors for the analysis worker. The runtime and models are served from
// public/ (see scripts/setup-mediapipe.mjs), never from another site.
import type { NormalizedLandmark } from '@mediapipe/tasks-vision';
import type { BodyPart } from './types';

type MP = typeof import('@mediapipe/tasks-vision');
type Fileset = Awaited<ReturnType<MP['FilesetResolver']['forVisionTasks']>>;

const abs = (path: string) => new URL(path, self.location.origin).href;
const MODELS: Record<BodyPart, string> = {
  hand: '/models/hand_landmarker.task',
  body: '/models/pose_landmarker_full.task',
  face: '/models/face_landmarker.task',
};
const PERSON_MODEL = '/models/efficientdet_lite0.tflite';

const MAX_PEOPLE = 5, MAX_HANDS = 6;
// bodies: an object detector proposes candidates every few frames, then pose runs on a
// zoomed-in crop of each (the pose model alone misses people who don't fill the frame);
// candidates aren't limited to the "person" label, since blurred people often get another
const REDETECT_EVERY = 6, MAX_CANDIDATES = 8, CROP = 256;

// Landmarks for every hand / body / face found in one frame, normalized to that frame.
export interface Detector {
  detect(frame: OffscreenCanvas, tMs: number): NormalizedLandmark[][];
  // call when starting a new pass over a clip
  reset(): void;
  close(): void;
}

let runtime: Promise<{ mp: MP; fileset: Fileset; factory: unknown }> | null = null;
function loadRuntime() {
  return runtime ??= (async () => {
    const mp = await import('@mediapipe/tasks-vision');
    // the bundler may start this worker as a classic script or as an ES module; MediaPipe
    // has a build for each
    const isModule = typeof (self as unknown as { importScripts?: unknown }).importScripts !== 'function';
    const fileset = await mp.FilesetResolver.forVisionTasks(abs('/mediapipe/wasm'), isModule);
    // in a module worker MediaPipe reads the wasm factory from a global that it clears after
    // each task is created, and a module only runs once, so keep it to restore before each task
    const factory = isModule ? (await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ fileset.wasmLoaderPath)).default : null;
    return { mp, fileset, factory };
  })();
}

async function createTask<T>(create: (fileset: Fileset, delegate: 'GPU' | 'CPU') => Promise<T>): Promise<T> {
  const { fileset, factory } = await loadRuntime();
  const g = self as unknown as { ModuleFactory?: unknown };
  const restore = () => { if (factory) g.ModuleFactory = factory; };
  try { restore(); return await create(fileset, 'GPU'); }
  catch { restore(); return create(fileset, 'CPU'); }
}
const gpuCanvas = (delegate: 'GPU' | 'CPU') => delegate === 'GPU' ? { canvas: new OffscreenCanvas(1, 1) } : {};

// VIDEO-mode tasks need strictly increasing timestamps, including across passes
function clock() {
  let base = 0, last = 0;
  return { ts: (tMs: number) => (last = Math.max(last + 1, base + Math.round(tMs))), reset: () => { base = last + 1000; } };
}

export async function createDetector(part: BodyPart): Promise<Detector> {
  const { mp } = await loadRuntime();
  const model = abs(MODELS[part]);
  if (part === 'hand') {
    const t = await createTask((fs, d) => mp.HandLandmarker.createFromOptions(fs, { baseOptions: { modelAssetPath: model, delegate: d }, ...gpuCanvas(d), runningMode: 'VIDEO', numHands: MAX_HANDS }));
    const c = clock();
    return { detect: (f, tMs) => t.detectForVideo(f, c.ts(tMs)).landmarks, reset: c.reset, close: () => t.close() };
  }
  if (part === 'face') {
    const t = await createTask((fs, d) => mp.FaceLandmarker.createFromOptions(fs, { baseOptions: { modelAssetPath: model, delegate: d }, ...gpuCanvas(d), runningMode: 'VIDEO', numFaces: MAX_PEOPLE }));
    const c = clock();
    return { detect: (f, tMs) => t.detectForVideo(f, c.ts(tMs)).faceLandmarks, reset: c.reset, close: () => t.close() };
  }

  const people = await createTask((fs, d) => mp.ObjectDetector.createFromOptions(fs, {
    baseOptions: { modelAssetPath: abs(PERSON_MODEL), delegate: d }, ...gpuCanvas(d), runningMode: 'IMAGE', scoreThreshold: 0.2, maxResults: MAX_CANDIDATES }));
  const pose = await createTask((fs, d) => mp.PoseLandmarker.createFromOptions(fs, {
    baseOptions: { modelAssetPath: model, delegate: d }, ...gpuCanvas(d), runningMode: 'IMAGE', numPoses: 1 }));
  const crop = new OffscreenCanvas(CROP, CROP), cctx = crop.getContext('2d') as OffscreenCanvasRenderingContext2D;
  type Region = { x: number; y: number; w: number; h: number };
  let regions: Region[] = [], frame = 0;
  const iou = (a: Region, b: Region) => {
    const ix = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)), iy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
    return ix * iy / (a.w * a.h + b.w * b.h - ix * iy);
  };
  // bounding box of the confident landmarks, padded to take in the head and limbs
  function regionOf(lm: NormalizedLandmark[], vw: number, vh: number): Region {
    const pts = lm.some(p => p.visibility >= 0.5) ? lm.filter(p => p.visibility >= 0.5) : lm;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of pts) { x0 = Math.min(x0, p.x * vw); x1 = Math.max(x1, p.x * vw); y0 = Math.min(y0, p.y * vh); y1 = Math.max(y1, p.y * vh); }
    const pw = (x1 - x0) * 0.12, ph = (y1 - y0) * 0.12;
    return { x: x0 - pw, y: y0 - ph * 1.5, w: x1 - x0 + pw * 2, h: y1 - y0 + ph * 2.5 };
  }
  // pose on a square crop around r; landmarks come back in whole-frame normalized coords
  function poseIn(src: OffscreenCanvas, r: Region, vw: number, vh: number) {
    const side = Math.max(r.w, r.h) * 1.3, sx = r.x + r.w / 2 - side / 2, sy = r.y + r.h / 2 - side / 2, k = CROP / side;
    const x0 = Math.max(0, sx), y0 = Math.max(0, sy), x1 = Math.min(vw, sx + side), y1 = Math.min(vh, sy + side);
    if (x1 - x0 < 8 || y1 - y0 < 8) return null;
    cctx.fillStyle = '#000'; cctx.fillRect(0, 0, CROP, CROP);
    cctx.drawImage(src, x0, y0, x1 - x0, y1 - y0, (x0 - sx) * k, (y0 - sy) * k, (x1 - x0) * k, (y1 - y0) * k);
    const lm = pose.detect(crop).landmarks[0];
    return lm ? lm.map(p => ({ ...p, x: (sx + p.x * side) / vw, y: (sy + p.y * side) / vh })) : null;
  }
  return {
    detect(src) {
      const vw = src.width, vh = src.height;
      if (frame++ % REDETECT_EVERY === 0 || !regions.length) {
        regions = people.detect(src).detections.flatMap(d => d.boundingBox
          ? [{ x: d.boundingBox.originX, y: d.boundingBox.originY, w: d.boundingBox.width, h: d.boundingBox.height }] : []);
      }
      const sets: NormalizedLandmark[][] = [], next: Region[] = [];
      for (const r of regions) {
        const lm = poseIn(src, r, vw, vh);
        if (!lm) continue;
        const nr = regionOf(lm, vw, vh);
        if (next.some(o => iou(o, nr) > 0.5)) continue; // two crops that settled on the same person
        sets.push(lm); next.push(nr);
        if (sets.length === MAX_PEOPLE) break;
      }
      regions = next;
      return sets;
    },
    reset() { regions = []; frame = 0; },
    close() { people.close(); pose.close(); },
  };
}
