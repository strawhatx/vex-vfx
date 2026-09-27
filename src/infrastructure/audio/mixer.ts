// The editor's sound: the clip's own audio plus the effects' sound effects, mixed together. The mix
// goes to the speakers and to a stream the exporter records, so the exported video has the same
// sound on every browser (instead of relying on grabbing audio from the video element, which
// Safari can't do).
//
// Browsers only start audio from a tap or click, so start() must first be called from one; until
// then the video plays its own sound as usual.
import { hitsBetween, soundingAt, type SoundClip } from '@/domain/effects/sound';
import type { Effect } from '@/domain/effects/palettes';
import { effectLoop, impactHit, LOOP_S } from './synth';

// effect loops sit under the clip's own sound; hits cut through
const LOOP_LEVEL = 0.8,
  HIT_LEVEL = 1.2,
  FADE_S = 0.04;

type Voice = { effect: Effect; src: AudioBufferSourceNode; gain: GainNode };

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

  constructor(private video: HTMLVideoElement) {}

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
      // from now on the video's sound goes through the mix
      ctx.createMediaElementSource(this.video).connect(this.original);
      this.original.connect(this.master);
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

  // the clip's own sound: 0 = muted, 1 = as recorded
  setOriginal(level: number) {
    this.originalLevel = level;
    if (this.original && this.ctx) this.original.gain.setTargetAtTime(level, this.ctx.currentTime, FADE_S);
    else this.video.muted = level === 0;
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
  }

  destroy() {
    for (const id of [...this.voices.keys()]) this.stopVoice(id);
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
