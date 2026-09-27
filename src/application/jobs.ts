// The analysis work behind the editor, run one job at a time:
//   1. a probe: what's at a tapped spot (a person, and which body part), answered first
//   2. the camera's path through the clip, worked out once when something needs it
//   3. tracking: following a clip's object from one keyframe, in the order asked
//   4. cutting out: a cutout's object cut out of each frame along its outlines (and the background
//      rebuilt behind it), once all its tracking is done
// Anything newer and more urgent stops the running job, which is queued to run again after.
import { inSpan, ownedRange, type Key } from '@/domain/project/keyframes';
import { clearShapes, refreshFrames, trackSpan, type Track } from '@/domain/project/track';
import type { Cam } from '@/domain/effects/laser';
import type { BodyPart } from '@/domain/tracking/bodyParts';
import type { ClipFrame, Selection } from '@/domain/tracking/types';
import type { Analysis, CutFrame } from './ports';

// tracking one clip's object from one of its keyframes
export type TrackJob = { id: number; key: Key };

// what the user sees of the job in progress
export type JobStatus = { label: string; progress: number };

// what the jobs need from the editor
export interface JobHost {
  readonly source: Blob | null;
  readonly ready: boolean;
  readonly clip: ClipFrame[];
  track(id: number): Track | null;
  showJob(job: JobStatus | null, drawn?: boolean): void;
  // a track's shapes changed; publish: tell the UI too, not just the renderer
  shapesChanged(t: Track, publish: boolean): void;
  cameraMoved(path: ({ i: number } & Cam)[]): void;
  // the camera's path so far, one entry per clip frame
  readonly camPath: readonly (Cam | null)[];
  // a cutout's frames, as they're cut out (i: clip frame); first, span: the frames it's cut from
  cutoutFrames(id: number, frames: CutFrame[]): void;
  cutoutStarted(id: number, span: { s: number; e: number }): void;
  status(message: string): void;
}

type CameraState = 'none' | 'queued' | 'running' | 'done';

export class Jobs {
  private queue: TrackJob[] = [];
  private running: TrackJob | null = null;
  private camera: CameraState = 'none';
  // cutouts to cut out again, in the order asked, and the one being cut out
  private renders: number[] = [];
  private rendering: number | null = null;
  // a probe in progress: how to answer it (with null if another probe replaces it)
  private probing: ((part: BodyPart | null) => void) | null = null;

  constructor(
    private analysis: Analysis,
    private host: JobHost,
  ) {}

  // drops everything, for a new clip
  reset() {
    this.analysis.cancel();
    this.queue = [];
    this.running = null;
    this.camera = 'none';
    this.renders = [];
    this.rendering = null;
    this.probing?.(null);
  }

  // ---------- tracking ----------

  // tracks these after what's already asked for
  add(...jobs: TrackJob[]) {
    this.queue.push(...jobs);
    if (jobs.length) this.pauseRender();
    this.pump();
  }

  // tracks this next. Tracking in progress for the same clip may cover frames this job now owns,
  // so it stops and runs again after (unless it's from the same frame).
  addFirst(job: TrackJob) {
    this.queue.unshift(job);
    this.pauseRender();
    const r = this.running;
    if (r && r.id === job.id) {
      this.stopRunning();
      if (r.key.i !== job.key.i) this.queue.splice(1, 0, r);
    }
    this.pump();
  }

  // forgets the jobs that match, stopping the running one if it matches; call pump after
  drop(match: (job: TrackJob) => boolean) {
    this.queue = this.queue.filter(j => !match(j));
    if (this.running && match(this.running)) this.stopRunning();
  }

  // ---------- undo ----------

  // the tracking still to do: running, then queued
  pending(): TrackJob[] {
    return [...(this.running ? [this.running] : []), ...this.queue];
  }

  // the project went back (or forward) to how it was: its tracking still to do replaces what's
  // here, and nothing is being cut out (the editor asks again for what needs it)
  restore(jobs: readonly TrackJob[]) {
    if (this.running || this.rendering !== null) this.analysis.cancel();
    this.running = null;
    this.rendering = null;
    this.renders = [];
    this.queue = [...jobs];
    this.pump();
  }

  // ---------- cutting out ----------

  // cuts the cutout out again once its tracking is done (anything it was cut from has changed)
  render(id: number) {
    if (this.rendering === id) {
      this.analysis.cancel();
      this.rendering = null;
    }
    if (!this.renders.includes(id)) this.renders.push(id);
    this.pump();
  }

  // forgets the cutout: it was deleted
  dropRender(id: number) {
    this.renders = this.renders.filter(r => r !== id);
    if (this.rendering === id) {
      this.analysis.cancel();
      this.rendering = null;
    }
  }

  // tracking comes first: a cutout being cut out stops, to start again after
  private pauseRender() {
    const r = this.rendering;
    if (r === null) return;
    this.analysis.cancel();
    this.rendering = null;
    if (!this.renders.includes(r)) this.renders.unshift(r);
  }

  // ---------- the camera ----------

  needCamera() {
    if (this.camera !== 'none') return;
    this.camera = 'queued';
    this.pump();
  }

  // ---------- probing ----------

  // whether the tap at `at` in the frame at time t is on a person, and the body part nearest it.
  // It goes ahead of any work in progress, which runs again after.
  probe(t: number, at: Selection): Promise<BodyPart | null> {
    const source = this.host.source;
    if (!source) return Promise.resolve(null);
    this.probing?.(null);
    if (this.running) {
      this.analysis.cancel();
      this.queue.unshift(this.running);
      this.running = null;
    }
    this.pauseRender();
    if (this.camera === 'running') {
      this.analysis.cancel();
      this.camera = 'queued';
    }
    return new Promise(resolve => {
      let part: BodyPart | null = null;
      const answer = (p: BodyPart | null) => {
        if (this.probing === answer) this.probing = null;
        resolve(p);
      };
      this.probing = answer;
      this.host.showJob({ label: 'Looking at what you tapped', progress: 0 });
      const done = () => {
        if (this.probing !== answer) return;
        answer(part);
        this.host.showJob(null);
        this.pump();
      };
      this.analysis.probe(source, { t, at }, { probed: p => (part = p), done, error: done });
    });
  }

  // ---------- running ----------

  // starts the next job, if nothing is running
  pump() {
    if (this.running || this.probing || this.rendering !== null || this.camera === 'running') return;
    const { source, ready } = this.host;
    if (!source || !ready) return;
    if (this.camera === 'queued') return this.runCamera(source);
    const job = this.queue.shift();
    if (job) {
      if (!this.runTracking(source, job)) this.pump();
      return;
    }
    const id = this.renders.shift();
    if (id === undefined) return this.host.showJob(null);
    if (!this.runRender(source, id)) this.pump();
  }

  private stopRunning() {
    this.analysis.cancel();
    this.running = null;
  }

  // false if the job is out of date: its keyframe was removed, or left outside the tracked frames
  private runTracking(source: Blob, job: TrackJob) {
    const { clip, host } = this;
    const t = host.track(job.id);
    const span = t && trackSpan(t, clip);
    if (!t || !span || !t.keys.includes(job.key) || !inSpan(span, job.key.i)) return false;

    // the frames this keyframe owns: cleared, then filled in as they're tracked
    const key = job.key;
    const [from, to] = ownedRange(t.keys, key, span);
    clearShapes(t, clip, from, to);
    host.shapesChanged(t, false);

    this.running = job;
    const label = `Tracking ${t.name}`;
    host.showJob({ label, progress: 0 });
    const next = () => {
      if (this.running !== job) return;
      this.running = null;
      this.pump();
    };
    const req = {
      times: clip.slice(from, to).map(f => f.t),
      key: key.i - from,
      select: { x: key.x, y: key.y },
      part: t.part ?? undefined,
      focus: t.focus ?? undefined,
    };
    this.analysis.track(source, req, {
      progress: (done, total) => host.showJob({ label, progress: done / total }),
      shapes: shapes => {
        let lo = Infinity;
        let hi = -1;
        for (const { i, shape } of shapes) {
          const k = from + i;
          t.shapes[k] = { ...shape, id: t.id };
          lo = Math.min(lo, k);
          hi = Math.max(hi, k);
        }
        if (hi >= 0) refreshFrames(t, clip, lo, hi + 1);
        host.shapesChanged(t, true);
      },
      done: () => {
        host.shapesChanged(t, true);
        next();
      },
      error: message => {
        host.status(message);
        next();
      },
    });
    return true;
  }

  // cuts a cutout's object out of each frame it's cut from; false if it's gone. Removing the object
  // needs the camera's path, to line the frames around up: that's worked out first.
  private runRender(source: Blob, id: number) {
    const { clip, host } = this;
    const t = host.track(id);
    if (!t?.cutout) return false;
    const plate = t.cutout.bg === 'clean';
    if (plate && this.camera !== 'done') {
      this.renders.unshift(id);
      this.needCamera();
      return true;
    }
    const span = trackSpan(t, clip);
    this.rendering = id;
    host.cutoutStarted(id, span);
    const label = `Cutting out ${t.name}`;
    host.showJob({ label, progress: 0 });
    const next = () => {
      if (this.rendering !== id) return;
      this.rendering = null;
      this.pump();
    };
    const req = {
      times: clip.slice(span.s, span.e).map(f => f.t),
      masks: t.shapes.slice(span.s, span.e).map(s => s?.mask ?? null),
      plate,
      cam: host.camPath.slice(span.s, span.e),
    };
    this.analysis.cutout(source, req, {
      progress: (done, total) => host.showJob({ label, progress: done / total }),
      frames: frames =>
        host.cutoutFrames(
          id,
          frames.map(f => ({ ...f, i: span.s + f.i })),
        ),
      done: () => {
        host.showJob(null, true);
        next();
      },
      error: message => {
        host.status(message);
        next();
      },
    });
    return true;
  }

  // works out the camera's path through the whole clip
  private runCamera(source: Blob) {
    this.camera = 'running';
    const label = 'Following the camera';
    this.host.showJob({ label, progress: 0 });
    const finish = () => {
      if (this.camera !== 'running') return;
      this.camera = 'done';
      this.host.showJob(null, true);
      this.pump();
    };
    this.analysis.camera(
      source,
      this.clip.map(f => f.t),
      {
        progress: (done, total) => this.host.showJob({ label, progress: done / total }),
        path: items => this.host.cameraMoved(items),
        done: finish,
        error: finish, // without it, spots just don't follow the camera
      },
    );
  }

  private get clip() {
    return this.host.clip;
  }
}
