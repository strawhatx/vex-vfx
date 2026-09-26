// MediaPipe's interactive segmenter, for the analysis worker. The runtime and model are
// served from public/ (see scripts/setup-mediapipe.mjs), never from another site.
type MP = typeof import('@mediapipe/tasks-vision');
type Fileset = Awaited<ReturnType<MP['FilesetResolver']['forVisionTasks']>>;

const abs = (path: string) => new URL(path, self.location.origin).href;
const SEGMENT_MODEL = '/models/magic_touch.tflite';

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

// Outlines whatever object is at a point: returns a mask the size of the image, 1 = object.
export interface Segmenter { segment(image: OffscreenCanvas, x: number, y: number): Uint8Array; close(): void }

export async function createSegmenter(): Promise<Segmenter> {
  const { mp } = await loadRuntime();
  const t = await createTask((fs, d) => mp.InteractiveSegmenterLegacy.createFromOptions(fs, {
    baseOptions: { modelAssetPath: abs(SEGMENT_MODEL), delegate: d }, ...gpuCanvas(d), outputCategoryMask: true, outputConfidenceMasks: false }));
  return {
    segment(image, x, y) {
      const r = t.segment(image, { keypoint: { x: x / image.width, y: y / image.height } });
      try {
        // the category mask marks the selected object with 0
        const m = r.categoryMask!.getAsUint8Array(), out = new Uint8Array(m.length);
        for (let i = 0; i < m.length; i++) out[i] = m[i] === 0 ? 1 : 0;
        return out;
      } finally { r.close(); }
    },
    close: () => t.close(),
  };
}
