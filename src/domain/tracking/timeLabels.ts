// Showing times: 00:07, or 00:07.5 when steps are finer than a second.

export function mmss(t: number) {
  t = Math.max(0, t || 0);
  const m = String(Math.floor(t / 60)).padStart(2, '0');
  const s = String(Math.floor(t % 60)).padStart(2, '0');
  return `${m}:${s}`;
}

export function timeLabel(t: number, step: number) {
  return step < 1 ? `${mmss(t)}.${Math.round((t % 1) * 10)}` : mmss(t);
}
