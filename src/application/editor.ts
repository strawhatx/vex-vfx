// The editing use cases:
//   - load a clip, and list its frames
//   - the footage: split the film into scenes, and cut objects out of it into layers of their own
//     (cutouts), placed, moved and animated however the user likes
//   - add clips on tapped objects: effects for a stretch of the video (the user sets where each
//     starts and ends) and impacts at a moment; and paths (strands like a whip or a rope, see
//     domain/effects/strands), on a tapped object or drawn freehand, their far end held or free
//   - fix the tracking with keyframes, change a clip's timing and look, aim lasers
// The analysis work goes through `Jobs`, one job at a time. The editor knows nothing about the
// page: it talks to the outside only through the Analysis and EffectLayers ports, and reports
// back through `events`.
import type { ImpactStyle } from '@/domain/effects/impacts';
import { defaultAim, normalAim, type Aim, type Cam } from '@/domain/effects/laser';
import { DEFAULT_PAL, type Effect, type FxSettings } from '@/domain/effects/palettes';
import { DEFAULT_STRAND } from '@/domain/effects/strands';
import {
  clampAt,
  keyAt,
  newCutout,
  resetTransform,
  setTransformAt,
  toggleKey,
  transformAt,
  type Background,
  type Transform,
} from '@/domain/project/cutout';
import {
  inSpan,
  insertKey,
  keysCovering,
  keysToRetrack,
  ownedRange,
  ownerOf,
  type FrameSpan,
  type Key,
} from '@/domain/project/keyframes';
import {
  DEFAULT_EFFECT_S,
  clearShapes,
  cutoutAt,
  cutoutSource,
  hitFrame,
  isPinned,
  nearestOther,
  newCutoutTrack,
  newImpact,
  newSpotTrack,
  newTrack,
  rangeFrames,
  setHit,
  setRange,
  swapFrom,
  trackAt,
  trackSpan,
  type Track,
} from '@/domain/project/track';
import { sceneIndexAt, sceneStarts, scenesOf, splitAt, type Scene } from '@/domain/project/scenes';
import { canPin, placeAtSpot } from '@/domain/project/spot';
import type { BodyPart } from '@/domain/tracking/bodyParts';
import { frameIndexAt, type ClipFrame, type Selection, type TrackMeta } from '@/domain/tracking/types';
import { Jobs, type JobHost, type JobStatus } from './jobs';
import type { Analysis, EffectLayers } from './ports';
import { layersOf, timelineOf, type Timeline } from './views';

export interface EditorState extends Timeline {
  scan: number | null; // progress 0..1 while the clip is being read
  job: JobStatus | null; // analysis work in progress
  scenes: Scene[]; // the films the clip is split into (one, unsplit)
}

export interface EditorEvents {
  // state changed; drawn = the effects drawn on some frames changed too
  changed(state: EditorState, drawn: boolean): void;
  status(message: string): void;
  // the clip's frame size for analysis is known
  meta(meta: TrackMeta): void;
}

export const DEFAULT_FX: FxSettings = {
  effect: 'fire',
  pal: 0,
  size: 1,
  intensity: 1,
  volume: 1,
  outline: 'neon',
  glitch: 'chaos',
  text: 'LEGEND',
  textStyle: 'behind',
  font: 'anton',
  water: 'rain',
  strand: DEFAULT_STRAND,
};

export class Editor {
  // the clip
  private source: Blob | null = null;
  private duration = 0;
  private clip: ClipFrame[] = [];
  private W = 0; // analysis frame width
  // the camera's path through the clip, filled in when something needs it
  private camPath: (Cam | null)[] = [];
  // where the film is split into scenes (see scenes.ts)
  private cuts: number[] = [];

  // the effects and impacts on it
  private tracks: Track[] = [];
  private nextId = 1;
  // each clip's tracked frames as of its last tracking, to see what a change uncovers
  private tracked = new Map<number, FrameSpan>();
  // used for the next clip added
  private lastFx: FxSettings = { ...DEFAULT_FX };
  private lastImpact: ImpactStyle = 'punch';

  private jobs: Jobs;
  private state: EditorState = {
    scan: null,
    job: null,
    lanes: [],
    rows: 0,
    cutRows: 0,
    hasEffects: false,
    scenes: [],
  };

  constructor(
    private analysis: Analysis,
    private layers: EffectLayers,
    private events: EditorEvents,
  ) {
    this.jobs = new Jobs(analysis, this.jobHost());
  }

  // ---------- queries ----------

  get ready() {
    return this.clip.length > 0 && this.state.scan === null;
  }
  get trackCount() {
    return this.tracks.length;
  }
  get impactStyle() {
    return this.lastImpact;
  }
  frameAt(t: number) {
    return frameIndexAt(this.clip, t);
  }
  name(id: number) {
    return this.track(id)?.name ?? '';
  }
  kind(id: number) {
    return this.track(id)?.kind ?? null;
  }
  // an impact: pinned to a spot in the scene, not following an object
  pinned(id: number) {
    const t = this.track(id);
    return !!t && isPinned(t);
  }
  // settings for the given clip, or the only one, or the next one added
  fx(id: number | null) {
    return this.fxTarget(id)?.fx ?? this.lastFx;
  }
  hasShapeAt(id: number, i: number) {
    return !!this.track(id)?.frames[i]?.shapes.length;
  }
  inRange(id: number, i: number) {
    const t = this.track(id);
    return !!t && inSpan(rangeFrames(t, this.clip), i);
  }
  lostAt(i: number) {
    return this.tracks.some(t => t.frames[i]?.shapes.some(s => s.lost));
  }
  // the clip tapped at frame i: a cutout on top (where it's placed), or an effect's object
  trackAt(i: number, p: Selection) {
    return (
      (cutoutAt(this.tracks, this.clip, i, p.x, p.y) ?? trackAt(this.tracks, this.clip, i, p.x, p.y))?.id ??
      null
    );
  }
  // the first time any clip has something to show: a cutout shows from where it's placed, or where
  // it leaves the footage changed
  firstEffectTime() {
    const times = this.tracks.map(t => {
      const c = t.cutout;
      if (c) return Math.min(c.at, c.bg === 'keep' ? Infinity : t.range.s);
      return isPinned(t) ? t.range.s : (t.frames.find(f => f.shapes.length)?.t ?? Infinity);
    });
    const first = Math.min(Infinity, ...times);
    return first === Infinity ? null : first;
  }

  // ---------- the clip ----------

  // a new clip (or none): drops everything
  load(source: Blob | null) {
    this.jobs.reset();
    this.source = source;
    this.clip = [];
    this.tracks = [];
    this.tracked.clear();
    this.camPath = [];
    this.cuts = [];
    this.syncLayers();
    this.update(
      { scan: null, job: null, lanes: [], rows: 0, cutRows: 0, hasEffects: false, scenes: [] },
      true,
    );
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
        this.W = meta.W;
        this.events.meta(meta);
        this.camPath = new Array(frames.length).fill(null);
        this.layers.setCamera(this.camPath);
        this.sendScenes();
      },
      done: () => {
        this.update({ scan: null, scenes: scenesOf(this.cuts, this.duration) }, true);
        this.jobs.pump();
      },
      error: message => {
        this.update({ scan: null });
        this.events.status(message);
      },
    });
  }

  // ---------- the footage: scenes ----------

  // the scene playing at time t
  sceneAt(t: number) {
    return sceneIndexAt(this.cuts, t);
  }

  // splits the film at frame i into two: frame i starts the second. False if it's too close to
  // either end of its film.
  split(i: number) {
    const cuts = splitAt(this.cuts, this.clip, i, this.duration);
    if (!cuts) {
      this.events.status('Too close to the end of the film to split here.');
      return false;
    }
    this.cuts = cuts;
    this.sendScenes();
    this.update({ scenes: scenesOf(cuts, this.duration) }, true);
    return true;
  }

  // ---------- the footage: cutouts ----------

  // a new cutout of the object tapped at frame i, cut from DEFAULT_EFFECT_S from there (within its
  // scene); bg: what's left in the footage where it was
  addCutout(i: number, sel: Selection, bg: Background) {
    const f = this.clip[i];
    if (!f) return null;
    const range = { s: f.t, e: this.defaultEnd(f.t) };
    const t = newCutoutTrack(this.nextId++, this.clip, this.lastFx, range, newCutout(range.s, bg));
    const id = this.start(t, i, sel);
    this.jobs.render(id);
    return id;
  }

  // what a cutout leaves in the footage where it was cut from
  setBackground(id: number, bg: Background) {
    const t = this.track(id);
    if (!t?.cutout || t.cutout.bg === bg) return;
    t.cutout = { ...t.cutout, bg };
    this.syncLayers();
    this.publish(true);
    // the background behind it is rebuilt when first asked for
    if (bg === 'clean') this.jobs.render(id);
  }

  // the cutout's transform at clip time t
  transformAt(id: number, t: number): Transform | null {
    const c = this.track(id)?.cutout;
    return c ? transformAt(c, t - c.at) : null;
  }

  // whether the cutout is showing at frame i (where it's placed)
  cutoutShowing(id: number, i: number) {
    const t = this.track(id);
    return !!t?.cutout && cutoutSource(t, this.clip, i) >= 0;
  }

  // whether the cutout has a transform keyframe at clip time t; and whether it has any
  moveKeyAt(id: number, t: number) {
    const c = this.track(id)?.cutout;
    return !!c && !!keyAt(c, t - c.at);
  }
  hasMoveKeys(id: number) {
    return !!this.track(id)?.cutout?.keys.length;
  }

  // moves, scales, turns or fades the cutout at clip time t: the whole layer, or with keyframes,
  // the keyframe there
  setTransform(id: number, t: number, p: Partial<Transform>) {
    this.changeCutout(id, c => setTransformAt(c, t - c.at, p));
  }

  // adds a transform keyframe at clip time t, or removes the one there
  toggleMoveKey(id: number, t: number) {
    this.changeCutout(id, c => toggleKey(c, t - c.at));
  }

  // back where it was cut from: no move and no keyframes
  resetTransform(id: number) {
    this.changeCutout(id, resetTransform);
  }

  // places the cutout to start at clip time t (kept inside the clip); it plays the same frames
  placeAt(id: number, t: number) {
    const tr = this.track(id);
    if (!tr) return;
    const len = tr.range.e - tr.range.s;
    this.changeCutout(id, c => ({ ...c, at: clampAt(t, len, this.duration) }));
  }

  private changeCutout(id: number, change: (c: NonNullable<Track['cutout']>) => Track['cutout']) {
    const t = this.track(id);
    if (!t?.cutout) return;
    t.cutout = change(t.cutout);
    this.syncLayers();
    this.publish(true);
  }

  // ---------- adding ----------

  // whether the tap at frame i is on a person, and the body part nearest it (null: not a person)
  probe(i: number, at: Selection): Promise<BodyPart | null> {
    const f = this.clip[i];
    return f ? this.jobs.probe(f.t, at) : Promise.resolve(null);
  }

  // a new effect on what was tapped at frame i (the object there, or a body part of the person
  // there), lasting DEFAULT_EFFECT_S from there
  addTrack(i: number, sel: Selection, fx: Partial<FxSettings> = {}, part: BodyPart | null = null) {
    const f = this.clip[i];
    if (!f) return null;
    this.lastFx = { ...this.lastFx, ...fx };
    const range = { s: f.t, e: this.defaultEnd(f.t) };
    return this.start(newTrack(this.nextId++, this.clip, this.lastFx, range, part), i, sel);
  }

  // a new effect coming from the spot tapped at frame i (only for effects that can: see canPin),
  // lasting DEFAULT_EFFECT_S from there
  addSpotEffect(i: number, sel: Selection, fx: Partial<FxSettings> = {}) {
    const f = this.clip[i];
    if (!f) return null;
    this.lastFx = { ...this.lastFx, ...fx };
    if (!canPin(this.lastFx.effect)) return null;
    // the spot stays put in the scene as the camera moves
    this.jobs.needCamera();
    const range = { s: f.t, e: this.defaultEnd(f.t) };
    return this.start(newSpotTrack(this.nextId++, this.clip, this.lastFx, range), i, sel);
  }

  // a new impact going off at the spot tapped at frame i
  addImpact(i: number, sel: Selection, style: ImpactStyle = this.lastImpact, fx: Partial<FxSettings> = {}) {
    if (!this.clip[i]) return null;
    this.lastImpact = style;
    // impacts stay put in the scene as the camera moves
    this.jobs.needCamera();
    const t = newImpact(this.nextId++, this.clip, { ...this.lastFx, ...fx }, style, i, this.duration);
    return this.start(t, i, sel);
  }

  private start(t: Track, i: number, sel: Selection) {
    const key: Key = { i, x: sel.x, y: sel.y };
    t.aim = defaultAim(sel, this.W);
    t.keys = [key];
    this.tracks.push(t);
    this.tracked.set(t.id, trackSpan(t, this.clip));
    this.place(t);
    this.syncLayers();
    this.publish();
    if (!isPinned(t)) this.jobs.add({ id: t.id, key });
    return t.id;
  }

  // ---------- paths ----------

  // a new path drawn freehand at frame i (pts: work pixels, the first is its anchor): it stays put
  // in the scene as the camera moves, lasting DEFAULT_EFFECT_S from there
  addDrawnPath(i: number, pts: Selection[], fx: Partial<FxSettings> = {}) {
    const f = this.clip[i];
    if (!f || pts.length < 2) return null;
    this.lastFx = { ...this.lastFx, ...fx, effect: 'path' };
    this.jobs.needCamera();
    const range = { s: f.t, e: this.defaultEnd(f.t) };
    const t = newSpotTrack(this.nextId++, this.clip, this.lastFx, range);
    t.path = { drawn: { i, pts }, end: null };
    return this.start(t, i, pts[0]);
  }

  // draws a drawn path again, at frame i
  redrawPath(id: number, i: number, pts: Selection[]) {
    const t = this.track(id);
    if (!t?.path?.drawn || pts.length < 2 || !this.clip[i]) return false;
    t.path = { ...t.path, drawn: { i, pts } };
    return this.moveSpot(t, i, pts[0]);
  }

  // holds the path's far end where tapped at frame i: on another clip's object there (it follows
  // it), or a spot in the scene
  setPathEnd(id: number, i: number, sel: Selection) {
    const t = this.track(id);
    if (!t || !this.clip[i]) return;
    const others = this.tracks.filter(o => o !== t);
    const on = cutoutAt(others, this.clip, i, sel.x, sel.y)
      ? null
      : trackAt(others, this.clip, i, sel.x, sel.y);
    if (!on) this.jobs.needCamera();
    t.path = { drawn: t.path?.drawn ?? null, end: { i, x: sel.x, y: sel.y, clip: on?.id ?? null } };
    this.syncLayers();
    this.publish(true);
    this.events.status(on ? `${t.name}’s end holds on to ${on.name}.` : `${t.name}’s end is held here.`);
  }

  // lets the path's far end go
  freePathEnd(id: number) {
    const t = this.track(id);
    if (!t?.path?.end) return;
    t.path = { ...t.path, end: null };
    this.syncLayers();
    this.publish(true);
  }

  // ---------- fixing ----------

  // a tap on the clip's object at frame i: a keyframe that re-tracks the frames around it
  fixAt(id: number, i: number, sel: Selection) {
    const t = this.track(id);
    if (!t) return false;
    if (isPinned(t)) return this.moveSpot(t, i, sel);
    if (!inSpan(trackSpan(t, this.clip), i)) {
      this.events.status(`This moment is outside ${t.name}’s effect. Drag its ends to include it.`);
      return false;
    }
    const key: Key = { i, x: sel.x, y: sel.y };
    t.keys = insertKey(t.keys, key);
    this.publish();
    this.jobs.addFirst({ id, key });
    this.recut(t);
    return true;
  }

  // an impact or spot effect tapped somewhere else goes there instead (the spot as seen at frame i)
  private moveSpot(t: Track, i: number, sel: Selection) {
    // a drawn path keeps its shape, starting at the tap
    const d = t.path?.drawn;
    if (d) {
      const [p0] = d.pts;
      t.path = {
        ...t.path!,
        drawn: { i, pts: d.pts.map(p => ({ x: p.x - p0.x + sel.x, y: p.y - p0.y + sel.y })) },
      };
    }
    t.keys = [{ i, x: sel.x, y: sel.y }];
    this.place(t);
    this.syncLayers();
    this.publish(true);
    return true;
  }

  // removes the keyframe that tracks frame i; its neighbours take its frames over
  removeFixAt(id: number, i: number) {
    const t = this.track(id);
    const span = t && trackSpan(t, this.clip);
    const key = t && span && ownerOf(t.keys, span, i);
    if (!t || !span || !key || isPinned(t)) return false;

    const [a, b] = ownedRange(t.keys, key, span);
    t.keys = t.keys.filter(k => k !== key);
    this.jobs.drop(j => j.key === key);
    clearShapes(t, this.clip, a, b);
    this.layers.changed(id);
    this.publish(true);
    this.jobs.add(...keysCovering(t.keys, span, a, b).map(k => ({ id, key: k })));
    this.recut(t);

    const anyLeft = t.keys.some(k => inSpan(span, k.i));
    this.events.status(
      anyLeft ? 'Removed the fix here.' : `Removed the fix. Tap the object to place ${t.name} again.`,
    );
    return true;
  }

  // swaps the clip's object with the nearest other clip's from frame i on (for when the tracker
  // mixed them up as they crossed)
  swapAt(id: number, i: number) {
    const a = this.track(id);
    const b = a && nearestOther(this.tracks, a, i);
    if (!a || !b) return false;
    swapFrom(a, b, i, this.clip);
    this.layers.changed(a.id);
    this.layers.changed(b.id);
    this.recut(a);
    this.recut(b);
    this.publish(true);
    this.events.status(`Swapped ${a.name} and ${b.name} from here on.`);
    return true;
  }

  // ---------- timing ----------

  // moves a clip's start and/or end, in seconds. Call commitRange when the change is done (e.g.
  // when a drag ends) to track the object in any frames the new range uncovers.
  // A cutout's start and end are where it's placed: moving them changes which frames it's cut from
  // to match, so what's already there stays put.
  setRange(id: number, r: { s?: number; e?: number }) {
    const t = this.track(id);
    if (!t) return;
    if (t.cutout) return this.setCutoutRange(t, r);
    if (!setRange(t, r, this.duration, this.clip)) return;
    this.place(t);
    this.syncLayers();
    this.layers.changed(id);
    this.publish(true);
  }

  commitRange(id: number) {
    const t = this.track(id);
    if (!t) return;
    const before = this.tracked.get(id) ?? { s: 0, e: 0 };
    const after = trackSpan(t, this.clip);
    this.tracked.set(id, after);
    if (isPinned(t)) return; // nothing to track
    const redo = keysToRetrack(t.keys, before, after);
    if (redo.length) {
      this.jobs.drop(j => redo.includes(j.key));
      this.publish();
      this.jobs.add(...redo.map(key => ({ id, key })));
    }
    if (before.s !== after.s || before.e !== after.e) this.recut(t);
  }

  // placed times [s, e) to the frames the cutout's cut from; its keyframes stay where they are
  private setCutoutRange(t: Track, r: { s?: number; e?: number }) {
    const c = t.cutout!,
      off = t.range.s - c.at;
    const src = {
      ...(r.s !== undefined && { s: r.s + off }),
      ...(r.e !== undefined && { e: r.e + off }),
    };
    const was = t.range;
    if (!setRange(t, src, this.duration, this.clip)) return;
    const at = t.range.s - off;
    if (at < -1e-6 || at + (t.range.e - t.range.s) > this.duration + 1e-6) {
      setRange(t, was, this.duration, this.clip);
      return;
    }
    const moved = at - c.at;
    t.cutout = { ...c, at, keys: c.keys.map(k => ({ ...k, t: k.t - moved })) };
    this.syncLayers();
    this.layers.changed(t.id);
    this.publish(true);
  }

  // moves an impact to hit at time t
  moveImpactTo(id: number, t: number) {
    const tr = this.track(id);
    const i = this.frameAt(Math.max(0, Math.min(t, this.duration - 1e-3)));
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

  private timingChanged(id: number) {
    this.syncLayers();
    this.layers.changed(id);
    this.publish(true);
    this.commitRange(id);
  }

  // ---------- lasers ----------

  // the direction a laser fires in (see Aim): left-right h and up-down v, in degrees
  setAim(id: number, p: { h?: number; v?: number }) {
    this.changeAim(id, aim => ({ ...aim, ...normalAim(p.h ?? aim.h, p.v ?? aim.v) }));
  }

  // a spot for the laser to hit, tapped at frame i: it stays put in the scene as the camera moves
  aimAt(id: number, i: number, sel: Selection) {
    if (!this.clip[i]) return;
    const changed = this.changeAim(id, aim => ({ ...aim, target: { i, x: sel.x, y: sel.y } }));
    if (changed) this.jobs.needCamera();
  }

  // back to firing in its direction
  clearAimTarget(id: number) {
    this.changeAim(id, aim => ({ ...aim, target: null }));
  }

  private changeAim(id: number, change: (aim: Aim) => Aim) {
    const t = this.track(id);
    if (!t) return false;
    t.aim = change(t.aim);
    this.syncLayers();
    this.publish(true);
    return true;
  }

  // ---------- look ----------

  // changes the given clip (or the only one); also used for the next one added
  setFx(id: number | null, p: Partial<FxSettings>) {
    const t = this.fxTarget(id);
    this.lastFx = { ...(t?.fx ?? this.lastFx), ...p };
    if (!t) return;
    t.fx = this.lastFx;
    this.syncLayers();
    this.publish(true);
  }

  setEffect(id: number | null, effect: Effect) {
    this.setFx(id, { effect, pal: DEFAULT_PAL[effect] });
  }

  deleteTrack(id: number) {
    this.tracks = this.tracks.filter(t => t.id !== id);
    // paths holding on to it are held where they were instead
    for (const t of this.tracks)
      if (t.path?.end?.clip === id) {
        t.path = { ...t.path, end: { ...t.path.end, clip: null } };
        this.jobs.needCamera();
      }
    this.tracked.delete(id);
    this.jobs.drop(j => j.id === id);
    this.jobs.dropRender(id);
    this.syncLayers();
    this.publish(true);
    this.jobs.pump();
  }

  // ---------- internals ----------

  // where a new clip starting at t ends: DEFAULT_EFFECT_S later, but within its scene
  private defaultEnd(t: number) {
    const scene = scenesOf(this.cuts, this.duration)[sceneIndexAt(this.cuts, t)];
    return Math.min(scene?.e ?? this.duration, t + DEFAULT_EFFECT_S);
  }

  // the clip's frames and its scenes, for the renderer
  private sendScenes() {
    const frames = this.clip.map(f => ({ t: f.t, dur: f.dur, shapes: [] }));
    this.layers.setClip(frames, sceneStarts(this.clip, this.cuts));
  }

  // a cutout's outlines changed: cut it out again once they're tracked
  private recut(t: Track) {
    if (t.cutout) this.jobs.render(t.id);
  }

  // a spot effect's box in each frame of its range, where the camera has carried the spot
  private place(t: Track) {
    if (!t.spot) return;
    placeAtSpot(t, this.clip, this.camPath, this.W);
    this.layers.changed(t.id);
  }

  private track(id: number | null) {
    return this.tracks.find(t => t.id === id) ?? null;
  }

  private fxTarget(id: number | null) {
    return this.track(id) ?? (this.tracks.length === 1 ? this.tracks[0] : null);
  }

  private update(p: Partial<EditorState>, drawn = false) {
    this.state = { ...this.state, ...p };
    this.events.changed(this.state, drawn);
  }

  // the clips changed: tell the timeline
  private publish(drawn = false) {
    this.update(timelineOf(this.tracks, this.clip), drawn);
  }

  // the clips' looks or timing changed: tell the renderer
  private syncLayers() {
    this.layers.setLayers(layersOf(this.tracks, this.clip));
  }

  // what the jobs read and report back
  private jobHost(): JobHost {
    const get = () => ({ source: this.source, ready: this.ready, clip: this.clip });
    const camPath = () => this.camPath;
    return {
      get source() {
        return get().source;
      },
      get ready() {
        return get().ready;
      },
      get clip() {
        return get().clip;
      },
      track: id => this.track(id),
      showJob: (job, drawn) => this.update({ job }, drawn),
      shapesChanged: (t, publish) => {
        this.layers.changed(t.id);
        if (publish) this.publish(true);
      },
      cameraMoved: path => {
        for (const { i, ...c } of path) this.camPath[i] = c;
        for (const t of this.tracks) this.place(t);
        this.update({}, true);
      },
      get camPath() {
        return camPath();
      },
      cutoutStarted: (id, span) => this.layers.trimCutout(id, span),
      cutoutFrames: (id, frames) => {
        this.layers.cutoutFrames(id, frames);
        this.update({}, true);
      },
      status: message => this.events.status(message),
    };
  }
}
