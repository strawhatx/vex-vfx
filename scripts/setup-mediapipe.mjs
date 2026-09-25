// Copies the MediaPipe WASM runtime into public/ and downloads the landmark
// models into public/models, so the app never loads them from another site
// at runtime. Safe to re-run: existing files are skipped.
import { copyFile, mkdir, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const wasmSrc = join(root, 'node_modules/@mediapipe/tasks-vision/wasm');
const wasmDest = join(root, 'public/mediapipe/wasm');
const modelsDest = join(root, 'public/models');

// MediaPipe runs in the analysis worker, which may be a classic or an ES-module worker
// depending on the bundler, so both builds are served
const WASM_FILES = [
  'vision_wasm_internal.js', 'vision_wasm_internal.wasm',
  'vision_wasm_nosimd_internal.js', 'vision_wasm_nosimd_internal.wasm',
  'vision_wasm_module_internal.js', 'vision_wasm_module_internal.wasm',
];
const MODELS = {
  'hand_landmarker.task': 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task',
  'pose_landmarker_full.task': 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/latest/pose_landmarker_full.task',
  'face_landmarker.task': 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task',
  'efficientdet_lite0.tflite': 'https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float16/latest/efficientdet_lite0.tflite',
};

const exists = p => stat(p).then(() => true, () => false);

await mkdir(wasmDest, { recursive: true });
for (const f of WASM_FILES) await copyFile(join(wasmSrc, f), join(wasmDest, f));

await mkdir(modelsDest, { recursive: true });
for (const [name, url] of Object.entries(MODELS)) {
  const dest = join(modelsDest, name);
  if (await exists(dest)) continue;
  process.stdout.write(`Downloading ${name}… `);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
  await writeFile(dest, Buffer.from(await res.arrayBuffer()));
  console.log('done');
}
