// The user's music, decoded in the browser: played under the preview, and mixed into the export
// (trimmed to the video and faded out at the end).
export class MusicTrack {
  buffer: AudioBuffer | null = null;
  url: string | null = null;
  name = '';

  async load(file: File) {
    this.clear();
    const ctx = new AudioContext();
    try {
      this.buffer = await ctx.decodeAudioData(await file.arrayBuffer());
    } finally {
      void ctx.close();
    }
    this.url = URL.createObjectURL(file);
    this.name = file.name;
  }

  clear() {
    if (this.url) URL.revokeObjectURL(this.url);
    this.buffer = null;
    this.url = null;
    this.name = '';
  }

  // the first `seconds` of the music, with a fade out over the last `fade` seconds
  fitted(seconds: number, fade = 1.2): AudioBuffer | null {
    const b = this.buffer;
    if (!b) return null;
    const length = Math.min(b.length, Math.round(seconds * b.sampleRate));
    const out = new AudioBuffer({ length, numberOfChannels: b.numberOfChannels, sampleRate: b.sampleRate });
    const fadeFrom = Math.max(0, length - fade * b.sampleRate);
    for (let c = 0; c < b.numberOfChannels; c++) {
      const src = b.getChannelData(c).subarray(0, length);
      const dst = out.getChannelData(c);
      dst.set(src);
      for (let i = Math.floor(fadeFrom); i < length; i++) dst[i] *= (length - i) / (length - fadeFrom);
    }
    return out;
  }
}
