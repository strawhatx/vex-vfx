// MediaPipe's interactive segmenter and body landmark models (pose, hands, face), for the
// analysis worker. The runtime and models are served from public/ (see
// scripts/setup-mediapipe.mjs), never from another site.
type MP = typeof import('@mediapipe/tasks-vision');
type Fileset = Awaited<ReturnType<MP['FilesetResolver']['forVisionTasks']>>;

const abs = (path: string) => new URL(path, self.location.origin).href;
const SEGMENT_MODEL = '/models/magic_touch.tflite';
const POSE_MODEL = '/models/pose_landmarker_lite.task',
  HAND_MODEL = '/models/hand_landmarker.task',
  FACE_MODEL = '/models/face_landmarker.task';

let runtime: Promise<{ mp: MP; fileset: Fileset; factory: unknown }> | null = null;
function loadRuntime() {
  return (runtime ??= (async () => {
    const mp = await import('@mediapipe/tasks-vision');
    // the bundler may start this worker as a classic script or as an ES module; MediaPipe
    // has a build for each
    const isModule = typeof (self as unknown as { importScripts?: unknown }).importScripts !== 'function';
    const fileset = await mp.FilesetResolver.forVisionTasks(abs('/mediapipe/wasm'), isModule);
    // in a module worker MediaPipe reads the wasm factory from a global that it clears after
    // each task is created, and a module only runs once, so keep it to restore before each task
    const factory = isModule
      ? (await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ fileset.wasmLoaderPath)).default
      : null;
    return { mp, fileset, factory };
  })());
}

async function createTask<T>(create: (fileset: Fileset, delegate: 'GPU' | 'CPU') => Promise<T>): Promise<T> {
  const { fileset, factory } = await loadRuntime();
  const g = self as unknown as { ModuleFactory?: unknown };
  const restore = () => {
    if (factory) g.ModuleFactory = factory;
  };
  try {
    restore();
    return await create(fileset, 'GPU');
  } catch {
    restore();
    return create(fileset, 'CPU');
  }
}
const gpuCanvas = (delegate: 'GPU' | 'CPU') =>
  delegate === 'GPU' ? { canvas: new OffscreenCanvas(1, 1) } : {};

// Outlines whatever object is at a point: returns a mask the size of the image, 1 = object. Given a
// region, only that part of the image is looked at, enlarged so the model sees the object big
// (small objects come out far more exactly), and nothing outside it is marked.
export interface Segmenter {
  segment(image: OffscreenCanvas, x: number, y: number, region?: Region): Uint8Array;
  close(): void;
}

// a box in the image, in its pixels (x1, y1 exclusive)
export type Region = { x0: number; y0: number; x1: number; y1: number };

// the size a region is enlarged to (its longer side), about what the model works at
const REGION_PX = 512;

export async function createSegmenter(): Promise<Segmenter> {
  const { mp } = await loadRuntime();
  const t = await createTask((fs, d) =>
    mp.InteractiveSegmenterLegacy.createFromOptions(fs, {
      baseOptions: { modelAssetPath: abs(SEGMENT_MODEL), delegate: d },
      ...gpuCanvas(d),
      outputCategoryMask: true,
      outputConfidenceMasks: false,
    }),
  );
  // the category mask marks the selected object with 0
  const run = (image: OffscreenCanvas, x: number, y: number) => {
    const r = t.segment(image, { keypoint: { x: x / image.width, y: y / image.height } });
    try {
      return r.categoryMask!.getAsUint8Array().map(v => (v === 0 ? 1 : 0));
    } finally {
      r.close();
    }
  };
  let crop: OffscreenCanvas | null = null;
  return {
    segment(image, x, y, region) {
      if (!region) return run(image, x, y);
      const W = image.width,
        H = image.height;
      const x0 = Math.max(0, Math.floor(region.x0)),
        y0 = Math.max(0, Math.floor(region.y0)),
        x1 = Math.min(W, Math.ceil(region.x1)),
        y1 = Math.min(H, Math.ceil(region.y1));
      const rw = x1 - x0,
        rh = y1 - y0;
      const out = new Uint8Array(W * H);
      if (rw < 4 || rh < 4) return out;
      const k = REGION_PX / Math.max(rw, rh);
      const cw = Math.max(1, Math.round(rw * k)),
        ch = Math.max(1, Math.round(rh * k));
      if (!crop || crop.width !== cw || crop.height !== ch) crop = new OffscreenCanvas(cw, ch);
      const g = crop.getContext('2d')!;
      g.imageSmoothingQuality = 'high';
      g.drawImage(image, x0, y0, rw, rh, 0, 0, cw, ch);
      const m = run(crop, (x - x0) * k, (y - y0) * k);
      // back to the image's pixels: each takes the crop pixel at its middle
      for (let yy = y0; yy < y1; yy++) {
        const cy = Math.min(ch - 1, Math.floor((yy - y0 + 0.5) * k)) * cw;
        for (let xx = x0; xx < x1; xx++)
          out[yy * W + xx] = m[cy + Math.min(cw - 1, Math.floor((xx - x0 + 0.5) * k))];
      }
      return out;
    },
    close: () => t.close(),
  };
}

// ---------- body landmarks ----------
// Each finds every person (hand, face) in an image and returns its points in the image's pixels.
type Pt = { x: number; y: number };
export type Landmarks = (image: OffscreenCanvas) => Pt[][];

const toPixels = (sets: { x: number; y: number }[][], image: OffscreenCanvas) =>
  sets.map(set => set.map(p => ({ x: p.x * image.width, y: p.y * image.height })));

export async function createPoses(): Promise<Landmarks> {
  const { mp } = await loadRuntime();
  const t = await createTask((fs, d) =>
    mp.PoseLandmarker.createFromOptions(fs, {
      baseOptions: { modelAssetPath: abs(POSE_MODEL), delegate: d },
      ...gpuCanvas(d),
      runningMode: 'IMAGE',
      numPoses: 4,
    }),
  );
  return image => {
    const r = t.detect(image);
    try {
      return toPixels(r.landmarks, image);
    } finally {
      r.close();
    }
  };
}

export async function createHands(): Promise<Landmarks> {
  const { mp } = await loadRuntime();
  const t = await createTask((fs, d) =>
    mp.HandLandmarker.createFromOptions(fs, {
      baseOptions: { modelAssetPath: abs(HAND_MODEL), delegate: d },
      ...gpuCanvas(d),
      runningMode: 'IMAGE',
      numHands: 4,
    }),
  );
  return image => toPixels(t.detect(image).landmarks, image);
}

export async function createFaces(): Promise<Landmarks> {
  const { mp } = await loadRuntime();
  const t = await createTask((fs, d) =>
    mp.FaceLandmarker.createFromOptions(fs, {
      baseOptions: { modelAssetPath: abs(FACE_MODEL), delegate: d },
      ...gpuCanvas(d),
      runningMode: 'IMAGE',
      numFaces: 3,
    }),
  );
  return image => toPixels(t.detect(image).faceLandmarks, image);
}
