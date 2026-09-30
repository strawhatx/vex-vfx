// A video's thumbnails, one per `step` seconds (thumbW x thumbH px), filled in as they're made
import { useEffect, useState } from 'react';
import type { MakeThumbs } from '../player';

export function useFilmstrip(
  makeThumbs: MakeThumbs,
  src: string | null,
  duration: number,
  videoStart: number,
  step: number,
  thumbW: number,
  thumbH: number,
) {
  const [strip, setStrip] = useState<{ src: string; urls: string[] } | null>(null);
  useEffect(() => {
    if (!src || !duration) return;
    const ac = new AbortController();
    void makeThumbs(src, duration, videoStart, step, thumbW, thumbH, ac.signal, (i, url) => {
      setStrip(st => {
        const urls = st?.src === src ? st.urls.slice() : [];
        urls[i] = url;
        return { src, urls };
      });
    });
    return () => ac.abort();
  }, [makeThumbs, src, duration, videoStart, step, thumbW, thumbH]);
  return strip && strip.src === src ? strip.urls : [];
}
