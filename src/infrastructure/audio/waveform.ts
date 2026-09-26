// Waveforms for the timeline: how loud the clip's own sound is along its length, and the shape of
// each sound effect. Each is a list of peak levels (0..1), `perSecond` of them per second.
import { ALL_FORMATS, AudioSampleSink, BlobSource, Input } from 'mediabunny';
import type { ImpactStyle } from '@/domain/effects/impacts';
import type { Effect } from '@/domain/effects/palettes';
import { effectLoop, impactHit } from './synth';

export const WAVE_PER_S = 20;
const SFX_RATE = 4000; // plenty for drawing, cheap to make

// peak level per 1/WAVE_PER_S s; scaled so the loudest is 1 unless `raw`
function peaks(data: Float32Array, sampleRate: number, raw = false) {
  const perSecond = WAVE_PER_S;
  const step = Math.max(1, Math.floor(sampleRate / perSecond)), out: number[] = [];
  for (let i = 0; i < data.length; i += step) {
    let m = 0;
    for (let k = i; k < Math.min(data.length, i + step); k++) m = Math.max(m, Math.abs(data[k]));
    out.push(m);
  }
  if (raw) return out;
  const top = Math.max(1e-6, ...out);
  return out.map(v => Math.min(1, v / top));
}

// the clip's own sound: its levels, or 'none' when the file has no audio track, or 'unreadable'
// when it has one this browser can't decode for drawing (it may still play)
export type ClipWave = number[] | 'none' | 'unreadable';

export async function clipPeaks(file: Blob): Promise<ClipWave> {
  // demux the file ourselves (phone videos are often .mov, which some browsers' audio decoders
  // won't open), and pick an audio track the browser can decode: newer phones add extra tracks
  // (spatial audio) that most browsers can't
  try {
    const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(file) });
    const tracks = await input.getAudioTracks();
    if (!tracks.length) return 'none';
    for (const track of tracks) {
      if (!(await track.canDecode())) continue;
      const levels: number[] = [];
      for await (const sample of new AudioSampleSink(track).samples()) {
        const n = sample.numberOfFrames, buf = new Float32Array(n), rate = sample.sampleRate;
        sample.copyTo(buf, { planeIndex: 0, format: 'f32-planar' });
        for (let k = 0; k < n; k += 16) {
          const at = Math.floor((sample.timestamp + k / rate) * WAVE_PER_S);
          if (at >= 0) levels[at] = Math.max(levels[at] ?? 0, Math.abs(buf[k]));
        }
        sample.close();
      }
      return scale(Array.from(levels, v => v ?? 0));
    }
  } catch { /* fall back to the browser's own decoder */ }
  try {
    const Offline = window.OfflineAudioContext ?? (window as unknown as { webkitOfflineAudioContext?: typeof OfflineAudioContext }).webkitOfflineAudioContext;
    if (!Offline) return 'unreadable';
    const audio = await new Offline(1, 1, 44100).decodeAudioData(await file.arrayBuffer());
    return scale(peaks(audio.getChannelData(0), audio.sampleRate, true));
  } catch {
    return 'unreadable';
  }
}

// levels relative to the loudest; a silent track is flat
function scale(levels: number[]): number[] {
  const top = Math.max(0, ...levels);
  return top < 0.003 ? levels.map(() => 0) : levels.map(v => Math.min(1, v / top));
}

const cache = new Map<string, number[]>();
const cached = (key: string, make: () => number[]) => { let v = cache.get(key); if (!v) { v = make(); cache.set(key, v); } return v; };

// one run of an effect's loop
export const loopPeaks = (effect: Effect) => cached(`loop:${effect}`, () => peaks(effectLoop(effect, SFX_RATE), SFX_RATE));

// an impact's hit, at its speed
export const hitPeaks = (style: ImpactStyle, speed: number) => {
  const s = Math.round(speed * 20) / 20;
  return cached(`hit:${style}:${s}`, () => peaks(impactHit(style, s, SFX_RATE), SFX_RATE));
};
