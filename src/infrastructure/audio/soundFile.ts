// A sound file's length (seconds), read by the browser; 0 if it can't play it
export function soundLength(url: string): Promise<number> {
  return new Promise(resolve => {
    const a = new Audio();
    a.preload = 'metadata';
    a.onloadedmetadata = () => resolve(Number.isFinite(a.duration) ? a.duration : 0);
    a.onerror = () => resolve(0);
    a.src = url;
  });
}
