// A stretch of a video, reversed: a new MP4 of its frames played backwards, with its sound reversed
// too, made on the device. Frames are read a few at a time, from the end back (each few decoded in
// order, from their key frame), so however long the stretch, only those few are held at once.
import {
  ALL_FORMATS,
  AudioBufferSink,
  AudioBufferSource,
  BlobSource,
  BufferTarget,
  CanvasSink,
  CanvasSource,
  EncodedPacketSink,
  Input,
  Mp4OutputFormat,
  Output,
  QUALITY_HIGH,
  getFirstEncodableAudioCodec,
  getFirstEncodableVideoCodec,
  type InputAudioTrack,
} from 'mediabunny';

// frames read at once; the longest side of the reversed video (px)
const CHUNK = 12,
  MAX_SIDE = 1920;

// the video `file` from s to e (seconds, its own time) played backwards, as an MP4; progress: 0..1
// as it goes. Null if this browser can't read or make it.
export async function reverseVideo(
  file: Blob,
  s: number,
  e: number,
  progress: (done: number) => void = () => {},
): Promise<Blob | null> {
  const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(file) });
  try {
    const video = await input.getPrimaryVideoTrack();
    if (!video || !(await video.canDecode())) return null;
    // (the frames in the stretch, by when they start, and each one's end)
    const times: { t: number; end: number }[] = [];
    for await (const p of new EncodedPacketSink(video).packets(undefined, undefined, { metadataOnly: true }))
      if (p.timestamp >= s - 1e-6 && p.timestamp < e - 1e-6)
        times.push({ t: p.timestamp, end: Math.min(e, p.timestamp + p.duration) });
    times.sort((a, b) => a.t - b.t);
    if (!times.length) return null;

    const k = Math.min(1, MAX_SIDE / Math.max(video.displayWidth, video.displayHeight));
    const w = even(video.displayWidth * k),
      h = even(video.displayHeight * k);
    const format = new Mp4OutputFormat();
    const videoCodec = await getFirstEncodableVideoCodec(format.getSupportedVideoCodecs(), {
      width: w,
      height: h,
    });
    if (!videoCodec) return null;
    const output = new Output({ format, target: new BufferTarget() });
    const canvas = new OffscreenCanvas(w, h);
    const g = canvas.getContext('2d')!;
    const frames = new CanvasSource(canvas, { codec: videoCodec, quality: QUALITY_HIGH });
    output.addVideoTrack(frames);
    const sound = await reversedSound(await input.getPrimaryAudioTrack(), s, e);
    const audioCodec = sound && (await getFirstEncodableAudioCodec(format.getSupportedAudioCodecs()));
    const audio =
      sound && audioCodec ? new AudioBufferSource({ codec: audioCodec, quality: QUALITY_HIGH }) : null;
    if (audio) output.addAudioTrack(audio);
    await output.start();

    // the frames, last first: each shown as long as it was, from when its time runs out backwards
    const sink = new CanvasSink(video, { width: w, height: h, fit: 'fill', poolSize: 0 });
    let done = 0;
    for (let hi = times.length; hi > 0; hi -= CHUNK) {
      const chunk = times.slice(Math.max(0, hi - CHUNK), hi);
      const pics: ImageBitmap[] = [];
      for await (const c of sink.canvasesAtTimestamps(chunk.map(x => x.t)))
        pics.push(await createImageBitmap(c ? c.canvas : canvas));
      for (let j = chunk.length - 1; j >= 0; j--) {
        g.drawImage(pics[j], 0, 0, w, h);
        pics[j].close();
        await frames.add(e - chunk[j].end, chunk[j].end - chunk[j].t);
        progress(++done / times.length);
      }
    }
    frames.close();
    if (audio && sound) {
      await audio.add(sound);
      audio.close();
    }
    await output.finalize();
    const buffer = (output.target as BufferTarget).buffer;
    return buffer ? new Blob([buffer], { type: 'video/mp4' }) : null;
  } catch {
    return null;
  } finally {
    input.dispose();
  }
}

// the sound from s to e, backwards (null: none, or none this browser can read)
async function reversedSound(track: InputAudioTrack | null, s: number, e: number) {
  if (!track || !(await track.canDecode())) return null;
  let out: AudioBuffer | null = null;
  for await (const { buffer: b, timestamp } of new AudioBufferSink(track).buffers(s, e)) {
    const rate = b.sampleRate;
    out ??= new AudioBuffer({
      length: Math.max(1, Math.round((e - s) * rate)),
      numberOfChannels: b.numberOfChannels,
      sampleRate: rate,
    });
    // (each sample put where it falls in the stretch, counted from its end)
    const from = Math.round((timestamp - s) * rate);
    for (let c = 0; c < out.numberOfChannels; c++) {
      const src = b.getChannelData(Math.min(c, b.numberOfChannels - 1)),
        dst = out.getChannelData(c);
      for (let i = 0; i < src.length; i++) {
        const at = from + i;
        if (at >= 0 && at < dst.length) dst[dst.length - 1 - at] = src[i];
      }
    }
  }
  return out;
}

// the nearest even whole number (encoders want even sizes)
const even = (v: number) => Math.max(2, Math.round(v / 2) * 2);
