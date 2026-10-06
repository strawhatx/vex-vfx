// The export: the plan rendered frame by frame onto an offscreen canvas and encoded as an H.264 MP4
// (with the music as AAC) by WebCodecs through Mediabunny. All on this device.
import {
  AudioBufferSource,
  BufferTarget,
  CanvasSource,
  Mp4OutputFormat,
  Output,
  QUALITY_HIGH,
  getFirstEncodableAudioCodec,
  getFirstEncodableVideoCodec,
} from 'mediabunny';
import type { ExportJob, Exporter } from '@/application/video/ports';
import { loadImage, makeCanvas } from '../canvas';
import { Engine, FPS, frameSize } from '../engine/engine';
import type { FontFamilies } from '../engine/fonts';
import type { MusicTrack } from '../music';

// frames drawn between yields to the page, so it stays responsive while encoding
const YIELD_EVERY = 4;

export class Mp4Exporter implements Exporter {
  constructor(
    private music: MusicTrack,
    private fonts: () => FontFamilies,
  ) {}

  async supported() {
    if (typeof VideoEncoder === 'undefined') return false;
    const [w, h] = frameSize('9:16');
    return !!(await getFirstEncodableVideoCodec(new Mp4OutputFormat().getSupportedVideoCodecs(), {
      width: w,
      height: h,
    }));
  }

  async export(job: ExportJob, progress: (done: number) => void): Promise<Blob> {
    const [w, h] = frameSize(job.plan.format);
    const canvas = makeCanvas(w, h);
    const engine = new Engine(canvas, this.fonts());
    const logo = job.logo ? await loadImage(job.logo).catch(() => null) : null;
    engine.load({ plan: job.plan, logo });

    const format = new Mp4OutputFormat({ fastStart: 'in-memory' });
    const videoCodec = await getFirstEncodableVideoCodec(format.getSupportedVideoCodecs(), {
      width: w,
      height: h,
    });
    if (!videoCodec) throw new Error('No video encoder');
    const output = new Output({ format, target: new BufferTarget() });
    const video = new CanvasSource(canvas, { codec: videoCodec, quality: QUALITY_HIGH });
    output.addVideoTrack(video, { frameRate: FPS });

    const sound = this.music.fitted(engine.duration);
    const audioCodec = sound && (await getFirstEncodableAudioCodec(format.getSupportedAudioCodecs()));
    const audio =
      sound && audioCodec ? new AudioBufferSource({ codec: audioCodec, quality: QUALITY_HIGH }) : null;
    if (audio) output.addAudioTrack(audio);
    await output.start();

    const frames = Math.ceil(engine.duration * FPS);
    for (let i = 0; i < frames; i++) {
      engine.render(i / FPS);
      await video.add(i / FPS, 1 / FPS);
      if (i % YIELD_EVERY === 0) {
        progress((i / frames) * 0.97);
        await new Promise(r => setTimeout(r, 0));
      }
    }
    video.close();
    if (audio && sound) {
      await audio.add(sound);
      audio.close();
    }
    await output.finalize();
    progress(1);
    const buffer = (output.target as BufferTarget).buffer;
    if (!buffer) throw new Error('Nothing was encoded');
    return new Blob([buffer], { type: 'video/mp4' });
  }
}
