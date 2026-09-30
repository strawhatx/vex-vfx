// The editor's sound: the videos' own audio, the effects' sound effects and the music on the Audio
// layer, mixed together. The mix
// goes to the speakers and to a stream the exporter records, so the exported video has the same
// sound on every browser (instead of relying on grabbing audio from the video element, which
// Safari can't do).
//
// Browsers only start audio from a tap or click, so start() must first be called from one; until
// then the video plays its own sound as usual.
import { hitsBetween, soundingAt, type SoundClip } from '@/domain/effects/sound';
import { musicAt, type MusicClip } from '@/domain/project/music';
import type { Effect } from '@/domain/effects/palettes';
import { effectLoop, impactHit, LOOP_S } from './synth';

// effect loops sit under the clip's own sound; hits cut through
const LOOP_LEVEL = 0.8,
  HIT_LEVEL = 1.2,
  FADE_S = 0.04;

type Voice = { effect: Effect; src: AudioBufferSourceNode; gain: GainNode };
// music playing: from `offset` in its file, since `startedAt` (the mix's clock)
type MusicVoice = { src: AudioBufferSourceNode; gain: GainNode; startedAt: number; offset: number };
// music that's this far (s) off where the film is has fallen behind or been skipped: it starts again there
const MUSIC_DRIFT = 0.15;

export class Mixer {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private original: GainNode | null = null;
  private out: MediaStreamAudioDestinationNode | null = null;
  private buffers = new Map<string, AudioBuffer>();
  private voices = new Map<number, Voice>();
  private clips: SoundClip[] = [];
  private originalLevel = 1;
  private lastT: number | null = null;
  private videos = new Set<HTMLVideoElement>();
  private wired = new Set<HTMLVideoElement>();
  // music: each file (decoded once the mix is up), what's on the Audio layer, and what's playing
  private files = new Map<number, { file: Blob; buffer: AudioBuffer | null; decoding: boolean }>();
  private music: readonly MusicClip[] = [];
  private musicVoices = new Map<number, MusicVoice>();

  // a video whose sound goes into the mix (each of the film's videos)
  addVideo(video: HTMLVideoElement) {
    this.videos.add(video);
    video.muted = !this.ctx && this.originalLevel === 0;
    this.wire();
  }

  // once the mix is set up, each video's sound goes through it (a video can only be taken in once)
  private wire() {
    if (!this.ctx || !this.original) return;
    for (const v of this.videos) {
      if (this.wired.has(v)) continue;
      this.wired.add(v);
      this.ctx.createMediaElementSource(v).connect(this.original);
    }
  }

  // sets up the mix (the first time) and wakes it; call from a tap or click
  start() {
    if (!this.ctx) {
      const Ctx =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      // on iPhones, play like a video (even with the ring switch on silent), not like a notification
      const nav = navigator as Navigator & { audioSession?: { type: string } };
      if (nav.audioSession)
        try {
          nav.audioSession.type = 'playback';
        } catch {
          /* not supported */
        }
      const ctx = (this.ctx = new Ctx());
      this.master = ctx.createGain();
      // a limiter, so effects on top of a loud clip don't distort
      const limit = ctx.createDynamicsCompressor();
      limit.threshold.value = -6;
      limit.knee.value = 6;
      limit.ratio.value = 12;
      limit.attack.value = 0.003;
      limit.release.value = 0.15;
      this.out = ctx.createMediaStreamDestination();
      this.master.connect(limit);
      limit.connect(ctx.destination);
      limit.connect(this.out);
      this.original = ctx.createGain();
      this.original.gain.value = this.originalLevel;
      this.original.connect(this.master);
      // from now on the videos' sound goes through the mix
      this.wire();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  // the mixed sound, for recording
  get track(): MediaStreamTrack | null {
    return this.out?.stream.getAudioTracks()[0] ?? null;
  }

  setClips(clips: SoundClip[]) {
    this.clips = clips;
  }

  // a sound file for music clip `id`
  addMusicFile(id: number, file: Blob) {
    if (!this.files.has(id)) this.files.set(id, { file, buffer: null, decoding: false });
  }

  // what's on the Audio layer
  setMusic(music: readonly MusicClip[]) {
    this.music = music;
  }

  // the clip's own sound: 0 = muted, 1 = as recorded
  setOriginal(level: number) {
    this.originalLevel = level;
    if (this.original && this.ctx) this.original.gain.setTargetAtTime(level, this.ctx.currentTime, FADE_S);
    else for (const v of this.videos) v.muted = level === 0;
  }

  // called for every frame shown, with its clip time: effect loops follow what's on screen, and
  // hits sound as playback passes them
  tick(t: number, playing: boolean) {
    const ctx = this.ctx,
      prev = this.lastT;
    this.lastT = t;
    if (!ctx || !this.master) return;
    if (playing && prev !== null) for (const c of hitsBetween(this.clips, prev, t)) this.hit(c);
    const on = new Map((playing ? soundingAt(this.clips, t) : []).map(c => [c.id, c]));
    for (const c of this.clips) {
      if (c.kind !== 'effect') continue;
      let v = this.voices.get(c.id);
      if (v && v.effect !== c.effect) {
        this.stopVoice(c.id);
        v = undefined;
      }
      const sounding = on.get(c.id);
      if (!v && !sounding) continue;
      v ??= this.startVoice(c);
      v.gain.gain.setTargetAtTime(sounding ? sounding.volume * LOOP_LEVEL : 0, ctx.currentTime, FADE_S);
    }
    // clips that were deleted
    for (const id of this.voices.keys())
      if (!this.clips.some(c => c.id === id && c.kind === 'effect')) this.stopVoice(id);
    this.tickMusic(t, playing);
  }

  // the music under film time t plays from where it is in its file
  private tickMusic(t: number, playing: boolean) {
    const ctx = this.ctx!;
    const here = new Map(playing ? musicAt(this.music, t).map(p => [p.clip.id, p]) : []);
    for (const id of [...this.musicVoices.keys()]) if (!here.has(id)) this.stopMusic(id);
    for (const [id, { clip, offset }] of here) {
      const f = this.files.get(id);
      if (!f) continue;
      if (!f.buffer) {
        this.decode(f);
        continue;
      }
      const v = this.musicVoices.get(id);
      if (v && Math.abs(v.offset + (ctx.currentTime - v.startedAt) - offset) < MUSIC_DRIFT) {
        v.gain.gain.setTargetAtTime(clip.volume, ctx.currentTime, FADE_S);
        continue;
      }
      if (v) this.stopMusic(id);
      const src = ctx.createBufferSource(),
        gain = ctx.createGain();
      src.buffer = f.buffer;
      gain.gain.value = clip.volume;
      src.connect(gain).connect(this.master!);
      src.start(0, Math.max(0, offset));
      this.musicVoices.set(id, { src, gain, startedAt: ctx.currentTime, offset });
    }
  }

  private decode(f: { file: Blob; buffer: AudioBuffer | null; decoding: boolean }) {
    const ctx = this.ctx;
    if (!ctx || f.decoding) return;
    f.decoding = true;
    void f.file
      .arrayBuffer()
      .then(b => ctx.decodeAudioData(b))
      .then(
        buf => (f.buffer = buf),
        () => {}, // (it can't be played here: it stays silent)
      );
  }

  private stopMusic(id: number) {
    const v = this.musicVoices.get(id);
    if (!v) return;
    this.musicVoices.delete(id);
    const now = this.ctx!.currentTime;
    v.gain.gain.setTargetAtTime(0, now, FADE_S);
    v.src.stop(now + FADE_S * 5);
  }

  destroy() {
    for (const id of [...this.voices.keys()]) this.stopVoice(id);
    for (const id of [...this.musicVoices.keys()]) this.stopMusic(id);
    void this.ctx?.close();
  }

  private buffer(key: string, make: (sr: number) => Float32Array) {
    const ctx = this.ctx!;
    let b = this.buffers.get(key);
    if (!b) {
      const data = make(ctx.sampleRate);
      b = ctx.createBuffer(1, data.length, ctx.sampleRate);
      b.getChannelData(0).set(data);
      this.buffers.set(key, b);
    }
    return b;
  }

  private startVoice(c: SoundClip): Voice {
    const ctx = this.ctx!,
      src = ctx.createBufferSource(),
      gain = ctx.createGain();
    src.buffer = this.buffer(`loop:${c.effect}`, sr => effectLoop(c.effect, sr));
    src.loop = true;
    gain.gain.value = 0;
    src.connect(gain).connect(this.master!);
    // each clip starts somewhere different in the loop, so two fires don't sound identical
    src.start(0, (c.id * 1.37) % LOOP_S);
    const v = { effect: c.effect, src, gain };
    this.voices.set(c.id, v);
    return v;
  }

  private stopVoice(id: number) {
    const v = this.voices.get(id);
    if (!v) return;
    this.voices.delete(id);
    const now = this.ctx!.currentTime;
    v.gain.gain.setTargetAtTime(0, now, FADE_S);
    v.src.stop(now + FADE_S * 5);
  }

  private hit(c: SoundClip) {
    if (!c.impact) return;
    const ctx = this.ctx!,
      speed = Math.round(c.speed * 20) / 20;
    const src = ctx.createBufferSource(),
      gain = ctx.createGain();
    src.buffer = this.buffer(`hit:${c.impact}:${speed}`, sr => impactHit(c.impact!, speed, sr));
    gain.gain.value = c.volume * HIT_LEVEL;
    src.connect(gain).connect(this.master!);
    src.start();
  }
}
