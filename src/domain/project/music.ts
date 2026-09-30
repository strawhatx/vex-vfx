// Music on the film's Audio layer: a stretch of a sound file (a song, a recording), placed at a
// time in the film. It plays that stretch from where it's placed, at its own speed and at its own
// volume, under the videos' sound. Like an overlay (see overlay.ts), trimming an end keeps what
// plays where it is; dragging it moves the whole of it.

export interface MusicClip {
  id: number;
  name: string;
  row: number | null; // the Audio row the user put it on (null: wherever it fits)
  at: number; // when it starts, in the film's time
  src: { s: number; e: number }; // the stretch of the file it plays (the file's own time)
  length: number; // the file's
  volume: number; // 0..MAX_VOLUME, 1 = as recorded
}

export const MAX_VOLUME = 2,
  // the shortest it can be trimmed to
  MIN_MUSIC_S = 0.1;

// when it plays, in the film's time
export const musicRange = (m: Pick<MusicClip, 'at' | 'src'>) => ({ s: m.at, e: m.at + (m.src.e - m.src.s) });

// new music placed at film time `at`: the whole file, or as much as fits before the film ends
export function newMusic(
  id: number,
  name: string,
  length: number,
  at: number,
  filmLength: number,
): MusicClip {
  const room = filmLength - at;
  return {
    id,
    name,
    row: null,
    at,
    src: { s: 0, e: room > MIN_MUSIC_S ? Math.min(length, room) : length },
    length,
    volume: 1,
  };
}

// what's playing at film time t: each clip sounding then, and the time in its file there
export function musicAt(clips: readonly MusicClip[], t: number) {
  return clips.flatMap(m => {
    const r = musicRange(m);
    return t >= r.s - 1e-6 && t < r.e - 1e-6 ? [{ clip: m, offset: m.src.s + (t - m.at) }] : [];
  });
}

// its start or end moved to film time s or e, keeping what plays where it is: moving the start
// later plays from later in the file. It can't reach past the file's ends, or before the film's
// start.
export function trimMusic(m: MusicClip, r: { s?: number; e?: number }): MusicClip {
  const shown = musicRange(m);
  let s = r.s ?? shown.s;
  const e = r.e ?? shown.e;
  let ss = m.src.s + (s - m.at),
    se = m.src.s + (e - m.at);
  if (ss < 0) {
    s -= ss;
    ss = 0;
  }
  if (s < 0) {
    ss -= s;
    s = 0;
  }
  se = Math.min(se, m.length);
  if (se - ss < MIN_MUSIC_S) {
    if (r.s !== undefined) ss = se - MIN_MUSIC_S;
    else se = ss + MIN_MUSIC_S;
    s = m.at + (ss - m.src.s);
  }
  return { ...m, at: s, src: { s: ss, e: se } };
}

// the whole of it moved to start at film time `at` (not before the film's start)
export const placeMusic = (m: MusicClip, at: number): MusicClip => ({ ...m, at: Math.max(0, at) });

export const withVolume = (m: MusicClip, volume: number): MusicClip => ({
  ...m,
  volume: Math.max(0, Math.min(MAX_VOLUME, volume)),
});
