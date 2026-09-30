// Helpers for playing a clip in a <video> element. Times are the element's own.

type VideoWithFrameCallback = HTMLVideoElement & {
  requestVideoFrameCallback?: (cb: (now: number, meta: { mediaTime: number }) => void) => number;
};

// calls draw(t) for each frame the video shows, until alive() is false. Where the browser can say
// exactly which frame it presents, t is that frame's time; otherwise it's drawn on each animation
// frame while playing.
export function onEachFrame(video: HTMLVideoElement, draw: (t: number) => void, alive: () => boolean) {
  const v = video as VideoWithFrameCallback;
  const request = v.requestVideoFrameCallback?.bind(v);
  if (request) {
    const onFrame = (_now: number, meta: { mediaTime: number }) => {
      if (!alive()) return;
      draw(meta.mediaTime);
      request(onFrame);
    };
    request(onFrame);
    return;
  }
  const tick = () => {
    if (!alive()) return;
    if (!v.paused) draw(v.currentTime);
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

// MediaRecorder files can report an infinite duration until the end has been seen: seeks there
// so the browser finds it, then back to the start
export function settleDuration(video: HTMLVideoElement) {
  if (Number.isFinite(video.duration)) return Promise.resolve();
  return new Promise<void>(resolve => {
    const done = () => {
      if (!Number.isFinite(video.duration)) return;
      video.removeEventListener('durationchange', done);
      video.currentTime = 0;
      resolve();
    };
    video.addEventListener('durationchange', done);
    video.currentTime = 1e101;
  });
}

// pauses and seeks to t, resolving once the frame there is ready
export function seekVideo(video: HTMLVideoElement, t: number) {
  return new Promise<void>(resolve => {
    video.pause();
    if (Math.abs(video.currentTime - t) < 0.001) return resolve();
    video.addEventListener('seeked', () => resolve(), { once: true });
    video.currentTime = t;
  });
}
