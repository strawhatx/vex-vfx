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

// Outlines whatever object is at a point: returns a mask the size of the image, 1 = object.
export interface Segmenter {
  segment(image: OffscreenCanvas, x: number, y: number): Uint8Array;
  close(): void;
}

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
  return {
    segment(image, x, y) {
      const r = t.segment(image, { keypoint: { x: x / image.width, y: y / image.height } });
      try {
        // the category mask marks the selected object with 0
        const m = r.categoryMask!.getAsUint8Array(),
          out = new Uint8Array(m.length);
        for (let i = 0; i < m.length; i++) out[i] = m[i] === 0 ? 1 : 0;
        return out;
      } finally {
        r.close();
      }
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
