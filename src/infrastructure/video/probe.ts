// What's needed of a video file to add it to the effects library: how long it is, a small picture
// of it, and the colors in its first frame's corners (to guess how to blend it in). Null if it
// can't be played here.
export interface VideoProbe {
  length: number;
  picture: Blob | null;
  corners: [number, number, number][]; // 0..1
}

// how wide the picture is (px)
const PICTURE_W = 120;

export async function probeVideo(file: Blob): Promise<VideoProbe | null> {
  const url = URL.createObjectURL(file);
  const v = document.createElement('video');
  v.muted = true;
  v.playsInline = true;
  v.preload = 'auto';
  try {
    v.src = url;
    await once(v, 'loadeddata');
    const length = Number.isFinite(v.duration) ? v.duration : 0;
    v.currentTime = Math.min(0.1, length / 2);
    await once(v, 'seeked');
    const w = PICTURE_W,
      h = Math.max(1, Math.round((w * v.videoHeight) / (v.videoWidth || 1)));
    const c = new OffscreenCanvas(w, h),
      g = c.getContext('2d', { willReadFrequently: true })!;
    g.drawImage(v, 0, 0, w, h);
    const at = (x: number, y: number): [number, number, number] => {
      const d = g.getImageData(x, y, 1, 1).data;
      return [d[0] / 255, d[1] / 255, d[2] / 255];
    };
    const corners = [at(2, 2), at(w - 3, 2), at(2, h - 3), at(w - 3, h - 3)];
    const picture = await c.convertToBlob({ type: 'image/jpeg', quality: 0.75 });
    return length > 0 ? { length, picture, corners } : null;
  } catch {
    return null;
  } finally {
    v.removeAttribute('src');
    URL.revokeObjectURL(url);
  }
}

// the element's next `event`, or failing to load (after 10 s at most)
function once(v: HTMLVideoElement, event: string) {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timed out')), 10_000);
    v.addEventListener(event, () => (clearTimeout(timer), resolve()), { once: true });
    v.addEventListener('error', () => (clearTimeout(timer), reject(new Error('unplayable'))), { once: true });
  });
}
