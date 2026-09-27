// The editing use cases: load a clip; add clips on tapped objects: effects for a stretch of the
// video (the user sets where each starts and ends, one per scene) and impacts at a moment; track
// the objects, fix them with keyframes, and set each clip's look. Tracking work goes through a queue,
// one job at a time. It knows nothing about the page: it talks to the outside only through the
// Analysis and EffectLayers ports, and reports back through `events`.
import type { ImpactStyle } from '@/domain/effects/impacts';
import { DEFAULT_PAL, type Effect, type FxSettings } from '@/domain/effects/palettes';
import { inSpan, insertKey, keysCovering, keysToRetrack, ownedRange, ownerOf, type FrameSpan, type Key } from '@/domain/project/keyframes';
import {
  DEFAULT_EFFECT_S, clearShapes, hitFrame, nearestOther, newImpact, newTrack, packRows, rangeFrames, refreshFrames, setHit, setRange,
  swapFrom, toLane, trackAt, trackSpan, type Lane, type Track,
} from '@/domain/project/track';
import type { BodyPart } from '@/domain/tracking/bodyParts';
import { frameIndexAt, type ClipFrame, type Selection, type TrackMeta } from '@/domain/tracking/types';
import type { Analysis, EffectLayers } from './ports';

export interface EditorState {
  scan: number | null; // progress 0..1 while the clip is being read
  job: { label: string; progress: number } | null; // tracking work in progress
  lanes: Lane[];
  rows: number;        // timeline rows the effects are stacked on
  hasEffects: boolean; // some effect has something to follow
}

export interface EditorEvents {
  // state changed; drawn = the effects drawn on some frames changed too
  changed(state: EditorState, drawn: boolean): void;
  status(message: string): void;
  // the clip's frame size for analysis is known
  meta(meta: TrackMeta): void;
}

type Job = { id: number; key: Key };

export const DEFAULT_FX: FxSettings = { effect: 'fire', pal: 0, size: 1, intensity: 1, volume: 1 };

export class Editor {
  private source: Blob | null = null;
  private duration = 0;
  private clip: ClipFrame[] = [];
  private tracks: Track[] = [];
  // each clip's tracked frames as of its last tracking, to see what a change uncovers
  private tracked = new Map<number, FrameSpan>();
  private nextId = 1;
  private queue: Job[] = [];
  private running: Job | null = null;
  private lastFx: FxSettings = { ...DEFAULT_FX };
  private lastImpact: ImpactStyle = 'punch';
  // a probe in progress: how to answer it (it's answered with null if another replaces it)
  private probing: ((part: BodyPart | null) => void) | null = null;
  private state: EditorState = { scan: null, job: null, lanes: [], rows: 0, hasEffects: false };

  constructor(private analysis: Analysis, private layers: EffectLayers, private events: EditorEvents) {}

  // ---------- queries ----------
  get ready() { return this.clip.length > 0 && this.state.scan === null; }
  get trackCount() { return this.tracks.length; }
  frameAt(t: number) { return frameIndexAt(this.clip, t); }
  name(id: number) { return this.track(id)?.name ?? ''; }
  // settings for the given effect, or the only one, or the next one added
  fx(id: number | null) { return this.fxTarget(id)?.fx ?? this.lastFx; }
  hasShapeAt(id: number, i: number) { return !!this.track(id)?.frames[i]?.shapes.length; }
  inRange(id: number, i: number) { const t = this.track(id); return !!t && inSpan(rangeFrames(t, this.clip), i); }
  lostAt(i: number) { return this.tracks.some(t => t.frames[i]?.shapes.some(s => s.lost)); }
  trackAt(i: number, p: Selection) { return trackAt(this.tracks, this.clip, i, p.x, p.y)?.id ?? null; }
  kind(id: number) { return this.track(id)?.kind ?? null; }
  // the first time any effect has something to follow
  firstEffectTime() {
    let best: number | null = null;
    for (const t of this.tracks) {
      const f = t.frames.find(fr => fr.shapes.length);
      if (f && (best === null || f.t < best)) best = f.t;
    }
    return best;
  }

  // ---------- clip ----------
  // a new clip (or none): drops everything
  load(source: Blob | null) {
    this.stopJobs();
    this.source = source; this.clip = []; this.tracks = []; this.tracked.clear();
    this.syncLayers();
    this.update({ scan: null, job: null, lanes: [], rows: 0, hasEffects: false }, true);
  }

  // lists every frame; nothing can be tracked until this is done
  scan(length: number) {
    if (!this.source) return;
    this.duration = length;
    this.update({ scan: 0 });
    this.analysis.scan(this.source, length, {
      progress: (done, total) => this.update({ scan: Math.min(0.99, done / total) }),
      scanned: (meta, frames) => {
        this.clip = frames;
        this.duration = meta.duration || length;
        this.events.meta(meta);
        this.layers.setClip(frames.map(f => ({ t: f.t, dur: f.dur, shapes: [] })), new Int32Array(frames.length));
      },
      done: () => { this.update({ scan: null }, true); this.pump(); },
      error: message => { this.update({ scan: null }); this.events.status(message); },
    });
  }

  // ---------- adding ----------
  // whether the tap at frame i is on a person, and the body part nearest it (null: not a person).
  // It goes ahead of any tracking in progress, which runs again after.
  probe(i: number, at: Selection): Promise<BodyPart | null> {
    const f = this.clip[i], source = this.source;
    if (!f || !source) return Promise.resolve(null);
    this.probing?.(null);
    if (this.running) { this.analysis.cancel(); this.queue.unshift(this.running); this.running = null; }
    return new Promise(resolve => {
      let part: BodyPart | null = null;
      const answer = (p: BodyPart | null) => { if (this.probing === answer) this.probing = null; resolve(p); };
      this.probing = answer;
      this.update({ job: { label: 'Looking at what you tapped', progress: 0 } });
      const done = () => { if (this.probing !== answer) return; answer(part); this.update({ job: null }); this.pump(); };
      this.analysis.probe(source, { t: f.t, at }, { probed: p => { part = p; }, done, error: done });
    });
  }

  // a new effect on what was tapped at frame i (the object there, or a body part of the person
  // there), lasting DEFAULT_EFFECT_S from there
  addTrack(i: number, sel: Selection, fx: Partial<FxSettings> = {}, part: BodyPart | null = null) {
    const f = this.clip[i];
    if (!f) return null;
    this.lastFx = { ...this.lastFx, ...fx };
    return this.start(newTrack(this.nextId++, this.clip, this.lastFx, { s: f.t, e: Math.min(this.duration, f.t + DEFAULT_EFFECT_S) }, part), i, sel);
  }

  // a new impact hitting what was tapped at frame i
  addImpact(i: number, sel: Selection, style: ImpactStyle = this.lastImpact, fx: Partial<FxSettings> = {}, part: BodyPart | null = null) {
    if (!this.clip[i]) return null;
    this.lastImpact = style;
    return this.start(newImpact(this.nextId++, this.clip, { ...this.lastFx, ...fx }, style, i, this.duration, part), i, sel);
  }

  private start(t: Track, i: number, sel: Selection) {
    const key: Key = { i, x: sel.x, y: sel.y };
    t.keys = [key];
    this.tracks.push(t);
    this.tracked.set(t.id, trackSpan(t, this.clip));
    this.syncLayers();
    this.queue.push({ id: t.id, key });
    this.publish(); this.pump();
    return t.id;
  }

  // ---------- fixing ----------

  // a tap on the effect's object at frame i: a keyframe that re-tracks the frames around it
  fixAt(id: number, i: number, sel: Selection) {
    const t = this.track(id);
    if (!t) return false;
    if (!inSpan(trackSpan(t, this.clip), i)) {
      this.events.status(t.kind === 'impact' ? `This moment is outside ${t.name}.` : `This moment is outside ${t.name}’s effect. Drag its ends to include it.`);
      return false;
    }
    const key: Key = { i, x: sel.x, y: sel.y };
    t.keys = insertKey(t.keys, key);
    this.queue.unshift({ id, key });
    // tracking in progress for this effect may cover frames this key now owns; run it again after
    const r = this.running;
    if (r && r.id === id) {
      this.analysis.cancel(); this.running = null;
      if (r.key.i !== i) this.queue.splice(1, 0, r);
    }
    this.publish(); this.pump();
    return true;
  }

  // removes the keyframe that tracks frame i; its neighbours take its frames over
  removeFixAt(id: number, i: number) {
    const t = this.track(id), span = t && trackSpan(t, this.clip);
    const key = t && span && ownerOf(t.keys, span, i);
    if (!t || !span || !key) return false;
    const [a, b] = ownedRange(t.keys, key, span);
    t.keys = t.keys.filter(k => k !== key);
    this.queue = this.queue.filter(j => j.key !== key);
    if (this.running?.key === key) { this.analysis.cancel(); this.running = null; }
    clearShapes(t, this.clip, a, b); this.layers.changed(id);
    for (const k of keysCovering(t.keys, span, a, b)) this.queue.push({ id, key: k });
    this.publish(true); this.pump();
    this.events.status(t.keys.some(k => inSpan(span, k.i)) ? 'Removed the fix here.' : `Removed the fix. Tap the object to place ${t.name} again.`);
    return true;
  }

  // swaps the effect's object with the nearest other effect's from frame i on (for when the
  // tracker mixed them up as they crossed)
  swapAt(id: number, i: number) {
    const a = this.track(id), b = a && nearestOther(this.tracks, a, i);
    if (!a || !b) return false;
    swapFrom(a, b, i, this.clip);
    this.layers.changed(a.id); this.layers.changed(b.id);
    this.publish(true);
    this.events.status(`Swapped ${a.name} and ${b.name} from here on.`);
    return true;
  }

  // ---------- timing ----------
  // moves an effect's start and/or end, in seconds. Call commitRange when the change is done
  // (e.g. when a drag ends) to track the object in any frames the new range uncovers.
  setRange(id: number, r: { s?: number; e?: number }) {
    const t = this.track(id);
    if (!t || !setRange(t, r, this.duration, this.clip)) return;
    this.syncLayers();
    this.layers.changed(id);
    this.publish(true);
  }

  commitRange(id: number) {
    const t = this.track(id);
    if (!t) return;
    const before = this.tracked.get(id) ?? { s: 0, e: 0 }, after = trackSpan(t, this.clip);
    this.tracked.set(id, after);
    const redo = keysToRetrack(t.keys, before, after);
    if (!redo.length) return;
    this.queue = this.queue.filter(j => !redo.includes(j.key));
    if (this.running && redo.includes(this.running.key)) { this.analysis.cancel(); this.running = null; }
    for (const key of redo) this.queue.push({ id, key });
    this.publish(); this.pump();
  }

  // moves an impact to hit at time t
  moveImpactTo(id: number, t: number) {
    const tr = this.track(id), i = this.frameAt(Math.max(0, Math.min(t, this.duration - 1e-3)));
    if (!tr || i < 0 || !setHit(tr, this.clip, this.duration, i)) return;
    this.timingChanged(id);
  }

  // an impact's style (which also sets how long it lasts)
  setImpactStyle(id: number, style: ImpactStyle) {
    const t = this.track(id);
    if (!t || !setHit(t, this.clip, this.duration, hitFrame(t, this.clip), style)) return;
    this.lastImpact = style;
    this.timingChanged(id);
  }
  get impactStyle() { return this.lastImpact; }

  private timingChanged(id: number) {
    this.syncLayers(); this.layers.changed(id);
    this.publish(true);
    this.commitRange(id);
  }

  // ---------- look ----------
  // changes the given clip (or the only one); also used for the next one added
  setFx(id: number | null, p: Partial<FxSettings>) {
    const t = this.fxTarget(id);
    this.lastFx = { ...(t?.fx ?? this.lastFx), ...p };
    if (t) { t.fx = this.lastFx; this.syncLayers(); this.publish(true); }
  }
  setEffect(id: number | null, effect: Effect) { this.setFx(id, { effect, pal: DEFAULT_PAL[effect] }); }

  deleteTrack(id: number) {
    this.tracks = this.tracks.filter(t => t.id !== id);
    this.tracked.delete(id);
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
    const rows = packRows(this.tracks.map(t => t.range));
    this.update({
      lanes: this.tracks.map((t, k) => toLane(t, this.clip, rows[k])),
      rows: rows.length ? Math.max(...rows) + 1 : 0,
      hasEffects: this.tracks.some(t => t.frames.some(f => f.shapes.length)),
    }, drawn);
  }

  private syncLayers() {
    this.layers.setLayers(this.tracks.map(t => ({
      id: t.id, kind: t.kind, frames: t.frames, settings: t.fx, color: t.color, range: t.range,
      impacts: t.kind === 'impact' && t.impact ? [{ id: t.id, i: hitFrame(t, this.clip), style: t.impact, tap: t.keys[0] }] : [],
    })));
  }

  private stopJobs() { this.analysis.cancel(); this.queue = []; this.running = null; this.probing?.(null); }

  private pump() {
    if (this.running || this.probing) return;
    const source = this.source;
    const job = source && this.ready ? this.queue.shift() : undefined;
    if (!source || !job) { if (this.state.job) this.update({ job: null }); return; }
    const t = this.track(job.id), span = t && trackSpan(t, this.clip);
    // the key may have been removed, or left outside the clip's tracked frames
    if (!t || !span || !t.keys.includes(job.key) || !inSpan(span, job.key.i)) { this.pump(); return; }
    const key = job.key, [from, to] = ownedRange(t.keys, key, span), label = `Tracking ${t.name}`;
    clearShapes(t, this.clip, from, to); this.layers.changed(t.id);
    this.running = job;
    this.update({ job: { label, progress: 0 } });
    const next = () => { if (this.running === job) { this.running = null; this.pump(); } };
    this.analysis.track(source, { times: this.clip.slice(from, to).map(f => f.t), key: key.i - from, select: { x: key.x, y: key.y }, pin: t.kind === 'impact' && !t.part, part: t.part ?? undefined }, {
      progress: (done, total) => this.update({ job: { label, progress: done / total } }),
      shapes: shapes => {
        let lo = Infinity, hi = -1;
        for (const { i, shape } of shapes) { const k = from + i; t.shapes[k] = { ...shape, id: t.id }; lo = Math.min(lo, k); hi = Math.max(hi, k); }
        if (hi >= 0) refreshFrames(t, this.clip, lo, hi + 1);
        this.layers.changed(t.id);
        this.publish(true);
      },
      done: () => { this.publish(true); next(); },
      error: message => { this.events.status(message); next(); },
    });
  }
}
