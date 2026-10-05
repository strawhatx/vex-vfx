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
