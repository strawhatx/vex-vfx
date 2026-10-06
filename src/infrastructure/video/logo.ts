// A logo file, made small enough to keep in the browser's storage with the project: SVGs are kept
// as they are (sharp at any size); pictures are drawn into at most 512px and saved as PNG.
import { ctx2d, loadImage, makeCanvas } from './canvas';

const MAX = 512;

export async function logoDataUrl(file: File): Promise<string> {
  if (!/^image\/(png|jpe?g|webp|gif|svg\+xml)$/.test(file.type))
    throw new Error('Use a PNG, JPG, WebP or SVG logo.');
  if (file.size > 2_000_000) throw new Error('That logo is over 2 MB. Try a smaller file or an SVG.');
  const url = await new Promise<string>((ok, fail) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result));
    r.onerror = () => fail(new Error('Could not read that file.'));
    r.readAsDataURL(file);
  });
  if (file.type === 'image/svg+xml') return url;
  const img = await loadImage(url);
  const k = Math.min(1, MAX / Math.max(img.naturalWidth, img.naturalHeight));
  const c = makeCanvas(img.naturalWidth * k, img.naturalHeight * k);
  ctx2d(c).drawImage(img, 0, 0, c.width, c.height);
  const blob =
    'convertToBlob' in c
      ? await c.convertToBlob({ type: 'image/png' })
      : await new Promise<Blob>((ok, fail) =>
          (c as HTMLCanvasElement).toBlob(b => (b ? ok(b) : fail(new Error('encode'))), 'image/png'),
        );
  return new Promise((ok, fail) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result));
    r.onerror = () => fail(new Error('Could not read that file.'));
    r.readAsDataURL(blob);
  });
}
