// The screenshots, decoded and kept in memory in this tab. Nothing here is uploaded: the images are
// drawn into the video, sampled for a brand colour, and (only when the user directs with their own
// API key) sent from this browser straight to the AI.
import type { Shot } from '@/application/promo/studio';
import { ctx2d, makeCanvas, type AnyCanvas } from './canvas';

export type ShotImage = ImageBitmap | AnyCanvas | HTMLImageElement;

const ACCEPT = /^image\/(png|jpe?g|webp|gif|avif|svg\+xml)$/;
// the side of the small copy sampled for the brand colour
const SAMPLE = 48;
// screenshots are kept at most this big (px, longest side): plenty for a 1080p video
const MAX_SIDE = 2400;

export class ShotStore {
  private images = new Map<string, ShotImage>();
  private nextId = 1;

  get = (id: string) => this.images.get(id);

  // decodes the image files; skips anything that isn't an image or doesn't decode
  async add(files: File[]): Promise<{ shot: Shot; pixels: Uint8ClampedArray; file: File }[]> {
    const out: { shot: Shot; pixels: Uint8ClampedArray; file: File }[] = [];
    for (const f of files) {
      if (!ACCEPT.test(f.type)) continue;
      try {
        const img = await decode(f);
        const id = `shot-${this.nextId++}`;
        this.images.set(id, img);
        out.push({
          shot: { id, name: f.name, width: img.width, height: img.height },
          pixels: sample(img),
          file: f,
        });
      } catch {
        // not a readable image: skipped
      }
    }
    return out;
  }

  // a built-in image (the demo screenshots) by URL
  async addUrl(url: string, name: string) {
    const img = await loadUrl(url);
    const id = `shot-${this.nextId++}`;
    this.images.set(id, img);
    return { shot: { id, name, width: img.width, height: img.height }, pixels: sample(img) };
  }

  remove(id: string) {
    const img = this.images.get(id);
    if (img && 'close' in img && typeof img.close === 'function') img.close();
    this.images.delete(id);
  }

  // a JPEG of the screenshot, at most `side` px, as base64 (for the AI director)
  async jpegBase64(id: string, side = 1024): Promise<string> {
    const img = this.images.get(id);
    if (!img) throw new Error('Missing screenshot');
    const k = Math.min(1, side / Math.max(img.width, img.height));
    const c = makeCanvas(img.width * k, img.height * k);
    const g = ctx2d(c);
    g.fillStyle = '#fff';
    g.fillRect(0, 0, c.width, c.height);
    g.drawImage(img, 0, 0, c.width, c.height);
    const blob =
      'convertToBlob' in c
        ? await c.convertToBlob({ type: 'image/jpeg', quality: 0.85 })
        : await new Promise<Blob>((ok, fail) =>
            (c as HTMLCanvasElement).toBlob(b => (b ? ok(b) : fail(new Error('encode'))), 'image/jpeg', 0.85),
          );
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000)
      bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }
}

async function decode(f: File): Promise<ShotImage> {
  if (f.type === 'image/svg+xml') return loadUrl(URL.createObjectURL(f), true);
  const bmp = await createImageBitmap(f);
  if (Math.max(bmp.width, bmp.height) <= MAX_SIDE) return bmp;
  const k = MAX_SIDE / Math.max(bmp.width, bmp.height);
  const small = await createImageBitmap(bmp, {
    resizeWidth: Math.round(bmp.width * k),
    resizeHeight: Math.round(bmp.height * k),
    resizeQuality: 'high',
  });
  bmp.close();
  return small;
}

// an image by URL, drawn into a canvas (so SVGs draw at a fixed size everywhere)
function loadUrl(url: string, revoke = false): Promise<ShotImage> {
  return new Promise((ok, fail) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      const w = img.naturalWidth || 1170,
        h = img.naturalHeight || 2532;
      const c = makeCanvas(w, h);
      ctx2d(c).drawImage(img, 0, 0, w, h);
      if (revoke) URL.revokeObjectURL(url);
      ok(c);
    };
    img.onerror = () => fail(new Error(`Could not load ${url}`));
    img.src = url;
  });
}

function sample(img: ShotImage): Uint8ClampedArray {
  const c = makeCanvas(SAMPLE, SAMPLE);
  const g = ctx2d(c);
  g.drawImage(img, 0, 0, SAMPLE, SAMPLE);
  return g.getImageData(0, 0, SAMPLE, SAMPLE).data;
}
