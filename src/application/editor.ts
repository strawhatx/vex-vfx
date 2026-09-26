// The editing use cases: scan a clip, track tapped objects, find them again after cuts, fix
// them with keyframes, and set each one's effect. Tracking work goes through a queue, one job at
// a time. It knows nothing about the page: it talks to the outside only through the Analysis
// and EffectLayers ports, and reports back through `events`.
import { DEFAULT_PAL, type Effect, type FxSettings } from '@/domain/effects/palettes';
import { hasKeyIn, insertKey, neighboursTakingOver, ownedRange, ownerOf, type Key } from '@/domain/project/keyframes';
import { makeShots, shotIndex, shotPreviewFrame, shotSearchFrame, type Shot } from '@/domain/project/shots';
import {
  clearShapes, nearestOther, newTrack, refreshFrames, setRange, swapFrom, toLane, trackAt, type Lane, type Track,
} from '@/domain/project/track';
import { frameIndexAt, type ClipFrame, type Selection, type TrackMeta } from '@/domain/tracking/types';
import type { Analysis, EffectLayers } from './ports';

export interface EditorState {
  scan: number | null; // scan progress 0..1 while the clip is being scanned
  job: { label: string; progress: number } | null; // tracking work in progress
  cuts: number[];      // times where a new shot starts
  lanes: Lane[];
  hasEffects: boolean; // some effect has something to follow
}

export interface EditorEvents {
  // state changed; drawn = the effects drawn on some frames changed too
  changed(state: EditorState, drawn: boolean): void;
  status(message: string): void;
  // the clip's frame size for analysis is known
  meta(meta: TrackMeta): void;
}

type Job = { kind: 'track'; id: number; key: Key } | { kind: 'find'; id: number; shot: number };

export const DEFAULT_FX: FxSettings = { effect: 'fire', pal: 0, size: 1, intensity: 1 };

export class Editor {
  private source: Blob | null = null;
  private duration = 0;
  private clip: ClipFrame[] = [];
  private shots: Shot[] = [];
  private tracks: Track[] = [];
  private nextId = 1;
  private queue: Job[] = [];
  private running: Job | null = null;
  private lastFx: FxSettings = { ...DEFAULT_FX };
  private state: EditorState = { scan: null, job: null, cuts: [], lanes: [], hasEffects: false };

  constructor(private analysis: Analysis, private layers: EffectLayers, private events: EditorEvents) {}

  // ---------- queries ----------
  get ready() { return this.clip.length > 0 && this.state.scan === null; }
  get trackCount() { return this.tracks.length; }
  frameAt(t: number) { return frameIndexAt(this.clip, t); }
  frameTime(i: number) { return this.clip[i]?.t ?? 0; }
  name(id: number) { return this.track(id)?.name ?? ''; }
  // settings for the given object, or the only object, or the next one tapped
  fx(id: number | null) { return this.fxTarget(id)?.fx ?? this.lastFx; }
  hasShapeAt(id: number, i: number) { return !!this.track(id)?.shapes[i]; }
  lostAt(i: number) { return this.tracks.some(t => t.frames[i]?.shapes.some(s => s.lost)); }
  trackAt(i: number, p: Selection) { return trackAt(this.tracks, i, p.x, p.y)?.id ?? null; }
  // the first time any effect has something to follow
  firstEffectTime() {
    let best: number | null = null;
    for (const t of this.tracks) {
      const f = t.frames.find(fr => fr.shapes.length);
      if (f && (best === null || f.t < best)) best = f.t;
    }
    return best;
  }
  // a time in the shot to show when jumping to it
  shotTime(shot: number) { const s = this.shots[shot]; return s ? this.clip[shotPreviewFrame(s)].t : null; }

  // ---------- clip ----------
  // a new clip (or none): drops everything
  load(source: Blob | null) {
    this.stopJobs();
    this.source = source; this.clip = []; this.shots = []; this.tracks = [];
    this.syncLayers();
    this.update({ scan: null, job: null, cuts: [], lanes: [], hasEffects: false }, true);
  }

  // lists every frame and finds the cuts; nothing can be tracked until this is done
  scan(duration: number) {
    if (!this.source) return;
    this.duration = duration;
    this.update({ scan: 0 });
    this.analysis.scan(this.source, {
      progress: (done, total) => this.update({ scan: Math.min(0.99, done / total) }),
      scanned: (meta, frames, cuts) => {
        this.clip = frames;
        this.duration = meta.duration || duration;
        const { shots, start } = makeShots(frames.length, cuts);
        this.shots = shots;
        this.events.meta(meta);
        this.layers.setClip(frames.map(f => ({ t: f.t, dur: f.dur, shapes: [] })), start);
        this.update({ cuts: cuts.filter(i => i > 0 && i < frames.length).map(i => frames[i].t) });
        if (cuts.length) this.events.status(`Found ${cuts.length} cut${cuts.length > 1 ? 's' : ''}: ${shots.length} shots.`);
      },
      done: () => { this.update({ scan: null }, true); this.pump(); },
      error: message => { this.update({ scan: null }); this.events.status(message); },
    });
  }

  // ---------- tracks ----------
  // starts tracking the object tapped at frame i, then looks for it in every other shot
  addTrack(i: number, sel: Selection) {
    const shot = shotIndex(this.shots, i);
    if (shot < 0) return null;
    const t = newTrack(this.nextId++, this.clip, this.lastFx, this.duration);
    const key: Key = { i, x: sel.x, y: sel.y, auto: false };
    t.keys = [key]; t.searched.add(shot);
    this.tracks.push(t);
    this.syncLayers();
    this.queue.push({ kind: 'track', id: t.id, key });
    for (let s = 0; s < this.shots.length; s++) if (s !== shot) this.queue.push({ kind: 'find', id: t.id, shot: s });
    this.publish(); this.pump();
    return t.id;
  }

  // a tap on the object at frame i: a keyframe that re-tracks the frames around it
  fixAt(id: number, i: number, sel: Selection) {
    const t = this.track(id), shot = shotIndex(this.shots, i);
    if (!t || shot < 0) return;
    const key: Key = { i, x: sel.x, y: sel.y, auto: false };
    t.keys = insertKey(t.keys, key); t.searched.add(shot);
    // a pending search of this shot is no longer needed
    this.queue = this.queue.filter(j => !(j.id === id && j.kind === 'find' && j.shot === shot));
    this.queue.unshift({ kind: 'track', id, key });
    const r = this.running;
    // a search can wait: the fix goes first, then the search runs again
    const preempt = r?.kind === 'find'
      // tracking in this shot may cover frames this key now owns; run it again after
      || (r?.kind === 'track' && r.id === id && shotIndex(this.shots, r.key.i) === shot);
    if (r && preempt) {
      this.analysis.cancel(); this.running = null;
      if (r.kind === 'find' || r.key.i !== i) this.queue.splice(1, 0, r);
    }
    this.publish(); this.pump();
  }

  // removes the keyframe that tracks frame i; its neighbours take its frames over
  removeFixAt(id: number, i: number) {
    const t = this.track(id);
    const key = t && ownerOf(t.keys, this.shots, i);
    if (!t || !key) return false;
    const shot = this.shots[shotIndex(this.shots, key.i)], [a, b] = ownedRange(t.keys, key, shot);
    t.keys = t.keys.filter(k => k !== key);
    this.queue = this.queue.filter(j => !(j.kind === 'track' && j.key === key));
    if (this.running?.kind === 'track' && this.running.key === key) { this.analysis.cancel(); this.running = null; }
    clearShapes(t, this.clip, a, b); this.layers.changed(id);
    for (const k of neighboursTakingOver(t.keys, shot, a, b)) this.queue.push({ kind: 'track', id, key: k });
    this.publish(true); this.pump();
    this.events.status(key.auto ? 'Removed the automatic match here.' : 'Removed the fix here.');
    return true;
  }

  // swaps the object with the nearest other one from frame i on (for when the tracker mixed
  // them up as they crossed)
  swapAt(id: number, i: number) {
    const a = this.track(id), b = a && nearestOther(this.tracks, a, i);
    if (!a || !b) return false;
    swapFrom(a, b, i, this.clip);
    this.layers.changed(a.id); this.layers.changed(b.id);
    this.publish(true);
    this.events.status(`Swapped ${a.name} and ${b.name} from here on.`);
    return true;
  }

  // the effect's start and/or end, in seconds
  setRange(id: number, r: { s?: number; e?: number }) {
    const t = this.track(id);
    if (!t || !setRange(t, r, this.duration, this.clip)) return;
    this.layers.changed(id);
    this.publish(true);
  }

  // changes the effect of the given object (or the only one); also used for the next one tapped
  setFx(id: number | null, p: Partial<FxSettings>) {
    const t = this.fxTarget(id);
    this.lastFx = { ...(t?.fx ?? this.lastFx), ...p };
    if (t) { t.fx = this.lastFx; this.syncLayers(); this.publish(true); }
  }
  setEffect(id: number | null, effect: Effect) { this.setFx(id, { effect, pal: DEFAULT_PAL[effect] }); }

  deleteTrack(id: number) {
    this.tracks = this.tracks.filter(t => t.id !== id);
    this.queue = this.queue.filter(j => j.id !== id);
    if (this.running?.id === id) { this.analysis.cancel(); this.running = null; }
    this.syncLayers();
    this.publish(true); this.pump();
  }

  // ---------- internals ----------
  private track(id: number | null) { return this.tracks.find(t => t.id === id) ?? null; }
  private fxTarget(id: number | null) { return this.track(id) ?? (this.tracks.length === 1 ? this.tracks[0] : null); }

  private update(p: Partial<EditorState>, drawn = false) {
    this.state = { ...this.state, ...p };
    this.events.changed(this.state, drawn);
  }

  private publish(drawn = false) {
    this.update({
      lanes: this.tracks.map(t => toLane(t, this.clip, this.shots)),
      hasEffects: this.tracks.some(t => t.frames.some(f => f.shapes.length)),
    }, drawn);
  }

  private syncLayers() {
    this.layers.setLayers(this.tracks.map(t => ({ id: t.id, frames: t.frames, settings: t.fx, color: t.color })));
  }

  private stopJobs() { this.analysis.cancel(); this.queue = []; this.running = null; }

  private pump() {
    if (this.running) return;
    const source = this.source;
    const job = source && this.ready ? this.queue.shift() : undefined;
    if (!source || !job) { if (this.state.job) this.update({ job: null }); return; }
    const t = this.track(job.id);
    if (!t) { this.pump(); return; }
    const skip = () => { this.publish(); this.pump(); };
    const next = () => { if (this.running === job) { this.running = null; this.pump(); } };
    const fail = (message: string) => { this.events.status(message); next(); };

    if (job.kind === 'track') {
      const key = job.key, shot = this.shots[shotIndex(this.shots, key.i)];
      if (!t.keys.includes(key) || !shot) { skip(); return; }
      const [from, to] = ownedRange(t.keys, key, shot), label = `Tracking ${t.name}`;
      clearShapes(t, this.clip, from, to); this.layers.changed(t.id);
      this.running = job;
      this.update({ job: { label, progress: 0 } });
      this.analysis.track(source, { times: this.clip.slice(from, to).map(f => f.t), key: key.i - from, select: { x: key.x, y: key.y } }, {
        progress: (done, total) => this.update({ job: { label, progress: done / total } }),
        appearance: a => { if (!key.auto && a && !t.appearance) t.appearance = a; },
        shapes: shapes => {
          let lo = Infinity, hi = -1;
          for (const { i, shape } of shapes) { const k = from + i; t.shapes[k] = { ...shape, id: t.id }; lo = Math.min(lo, k); hi = Math.max(hi, k); }
          if (hi >= 0) refreshFrames(t, this.clip, lo, hi + 1);
          this.layers.changed(t.id);
          this.publish(true);
        },
        done: () => { this.publish(true); next(); },
        error: fail,
      });
    } else {
      const shot = this.shots[job.shot];
      // skip shots it already has a keyframe in, and objects with nothing to match against
      if (!shot || hasKeyIn(t.keys, shot) || !t.appearance) { t.searched.add(job.shot); skip(); return; }
      const i = shotSearchFrame(shot), label = `Looking for ${t.name} in shot ${job.shot + 1}`;
      this.running = job;
      this.update({ job: { label, progress: 0 } });
      this.analysis.find(source, { t: this.clip[i].t, want: t.appearance }, {
        progress: (done, total) => this.update({ job: { label, progress: done / total } }),
        found: hit => {
          t.searched.add(job.shot);
          if (hit) {
            const key: Key = { i, x: hit.x, y: hit.y, auto: true };
            t.keys = insertKey(t.keys, key);
            this.queue.unshift({ kind: 'track', id: t.id, key });
          }
          this.publish();
        },
        done: next,
        error: fail,
      });
    }
  }
}
