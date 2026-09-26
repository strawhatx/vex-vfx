// Copies the MediaPipe WASM runtime into public/ and downloads the segmentation
// model into public/models, so the app never loads them from another site
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
  'magic_touch.tflite': 'https://storage.googleapis.com/mediapipe-models/interactive_segmenter/magic_touch/float32/latest/magic_touch.tflite',
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
