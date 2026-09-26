// Timeline filmstrip: grabs one thumbnail per `step` seconds from a second, hidden copy of
// the clip so the editor's own video never seeks.

export async function makeFilmstrip(
  src: string, duration: number, step: number, thumbW: number, thumbH: number,
  signal: AbortSignal, onThumb: (i: number, url: string) => void,
) {
  const v = document.createElement('video');
  v.muted = true; v.playsInline = true; v.preload = 'auto'; v.src = src;
  const can = document.createElement('canvas'), dpr = 2;
  can.width = thumbW * dpr; can.height = thumbH * dpr;
  const g = can.getContext('2d')!;
  const wait = (ev: string) => new Promise<void>((res, rej) => {
    v.addEventListener(ev, () => res(), { once: true });
    v.addEventListener('error', () => rej(new Error('filmstrip')), { once: true });
  });
  try {
    if (v.readyState < 2) await wait('loadeddata');
    const count = Math.ceil(duration / step);
    for (let i = 0; i < count && !signal.aborted; i++) {
      v.currentTime = Math.min(duration - 0.05, (i + 0.5) * step);
      await wait('seeked');
      if (signal.aborted) break;
      // cover-crop the frame into the tile
      const s = Math.max(can.width / v.videoWidth, can.height / v.videoHeight);
      const w = v.videoWidth * s, h = v.videoHeight * s;
      g.drawImage(v, (can.width - w) / 2, (can.height - h) / 2, w, h);
      onThumb(i, can.toDataURL('image/jpeg', 0.7));
    }
  } catch { /* thumbnails are decoration; the editor works without them */ }
  v.removeAttribute('src'); v.load();
}
