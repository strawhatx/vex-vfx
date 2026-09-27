// Records the preview canvas plus the sound (the editor's mix, or failing that the clip's own audio
// when the browser allows) with MediaRecorder. Stand-in until the frame-by-frame MP4 exporter
// replaces it.
type CapturableVideo = HTMLVideoElement & {
  captureStream?: () => MediaStream;
  mozCaptureStream?: () => MediaStream;
};

export interface Recording {
  url: string;
  ext: string;
  hasAudio: boolean;
}

export function recordingType() {
  if (typeof MediaRecorder === 'undefined') return null;
  for (const t of [
    'video/mp4;codecs=avc1',
    'video/mp4',
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
  ])
    if (MediaRecorder.isTypeSupported(t)) return t;
  return '';
}

export function canRecord(canvas: HTMLCanvasElement) {
  return recordingType() !== null && !!canvas.captureStream;
}

// records until stop() is called; resolves with the finished clip. audio: the sound to record; without
// it, the video element's own audio is tried
export function startCanvasRecording(
  canvas: HTMLCanvasElement,
  audio: MediaStreamTrack | null,
  video: HTMLVideoElement,
) {
  const type = recordingType() ?? '',
    ext = type.startsWith('video/mp4') ? 'mp4' : 'webm';
  const stream = canvas.captureStream(30);
  let hasAudio = false;
  if (audio) {
    stream.addTrack(audio);
    hasAudio = true;
  } else
    try {
      const cv = video as CapturableVideo;
      const vs = cv.captureStream ? cv.captureStream() : cv.mozCaptureStream ? cv.mozCaptureStream() : null;
      vs?.getAudioTracks().forEach(t => {
        stream.addTrack(t);
        hasAudio = true;
      });
    } catch {
      /* no audio track available */
    }
  const chunks: Blob[] = [];
  const recorder = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
  recorder.ondataavailable = e => {
    if (e.data.size) chunks.push(e.data);
  };
  const finished = new Promise<Recording>(res => {
    recorder.onstop = () =>
      res({ url: URL.createObjectURL(new Blob(chunks, { type: type || 'video/webm' })), ext, hasAudio });
  });
  recorder.start(250);
  return {
    finished,
    stop: () => {
      if (recorder.state !== 'inactive') recorder.stop();
    },
  };
}

// records the camera (with sound) into a clip that is then edited like any other file
export async function startCameraCapture(video: HTMLVideoElement) {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'user', width: { ideal: 1280 } },
    audio: true,
  });
  video.srcObject = stream;
  video.muted = true;
  await video.play();
  const type = recordingType() ?? '',
    chunks: Blob[] = [];
  const recorder = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
  recorder.ondataavailable = e => {
    if (e.data.size) chunks.push(e.data);
  };
  const finished = new Promise<File>(res => {
    recorder.onstop = () => {
      stream.getTracks().forEach(t => t.stop());
      const mime = type.split(';')[0] || 'video/webm';
      res(new File(chunks, `camera.${mime === 'video/mp4' ? 'mp4' : 'webm'}`, { type: mime }));
    };
  });
  recorder.start(250);
  return {
    finished,
    stop: () => {
      if (recorder.state !== 'inactive') recorder.stop();
    },
    cancel: () => {
      recorder.onstop = null;
      stream.getTracks().forEach(t => t.stop());
    },
  };
}
