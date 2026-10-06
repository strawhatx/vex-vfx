// A 2D canvas that works off the page: an OffscreenCanvas where there is one, else a detached element.
export type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;
export type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export function makeCanvas(w: number, h: number): AnyCanvas {
  w = Math.max(1, Math.round(w));
  h = Math.max(1, Math.round(h));
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

export const ctx2d = (c: AnyCanvas) => c.getContext('2d') as Ctx2D;

// anything the engine can draw as a picture (a logo)
export type ImageLike = HTMLImageElement | ImageBitmap | AnyCanvas;

// a picture from a URL (a data: URL from the project, or a file on this site), ready to draw
export function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((ok, fail) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => ok(img);
    img.onerror = () => fail(new Error('Could not load the image'));
    img.src = url;
  });
}

export const sizeOf = (img: ImageLike) =>
  'naturalWidth' in img
    ? { w: img.naturalWidth || 512, h: img.naturalHeight || 512 }
    : { w: img.width, h: img.height };
