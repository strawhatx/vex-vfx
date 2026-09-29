// The editing use cases for one video of the film (see project.ts for the film as a whole):
//   - load a clip, and list its frames
//   - the footage: split the film into scenes and delete the ones not wanted, and cut objects out
//     of it (the layers they become belong to the film: see overlay.ts)
//   - add clips on tapped objects: effects for a stretch of the video (the user sets where each
//     starts and ends) and impacts at a moment
//   - fix the tracking with keyframes, change a clip's timing and look, aim lasers
//   - undo and redo any of it
// The analysis work goes through `Jobs`, one job at a time. The editor knows nothing about the
// page: it talks to the outside only through the Analysis and EffectLayers ports, and reports
// back through `events`.
//
// Times: the project keeps the clip's own time (source time). Outside, times are program time: the
// film as edited, with deleted films left out (see edit.ts). Every time in or out of the editor's
// methods is program time; frame indices are the clip's.
import type { AnimKind, AnimSlot } from '@/domain/effects/animation';
import type { ImpactStyle } from '@/domain/effects/impacts';
import { defaultAim, normalAim, type Aim, type Cam } from '@/domain/effects/laser';
import { DEFAULT_PAL, type Effect, type FxSettings } from '@/domain/effects/palettes';
import type { Background } from '@/domain/project/cutout';
import type { OverlayFrame } from '@/domain/project/overlay';
import {
  jumpFrom,
  lengthOf,
  pieceAt,
  piecesOf,
  withSpeed,
  type SceneAnim,
  type SceneSpeed,
  withAnim,
  toProgram,
  toSource,
  type Piece,
} from '@/domain/project/edit';
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
  hitFrame,
  isPinned,
  nearestOther,
  newCutoutTrack,
  newImpact,
  newSpotTrack,
  newTrack,
  duplicate,
  drawnShapes,
  rangeFrames,
  refreshFrames,
  setHit,
  setRange,
  swapFrom,
  trackAt,
  trackSpan,
  withBody,
  withBodyControl,
  type Track,
} from '@/domain/project/track';
import type { ParamValue } from '@/domain/effects/params';
import type { Preset } from '@/domain/effects/presets';
import { sceneIndexAt, sceneStarts, scenesOf, splitAt } from '@/domain/project/scenes';
import { canPin, placeAtSpot } from '@/domain/project/spot';
import type { BodyPart } from '@/domain/tracking/bodyParts';
import { clampEdge, type EdgeSettings } from '@/domain/project/edge';
import type { Part, PartOp } from '@/domain/project/parts';
import { reviewFlags, type Flag } from '@/domain/project/review';
import {
  frameIndexAt,
  type ClipFrame,
  type Selection,
  type Shape,
  type TrackMeta,
} from '@/domain/tracking/types';
import { Jobs, type JobHost, type JobStatus, type TrackJob } from './jobs';
import type { Analysis, CutFrame, EffectLayers } from './ports';
import { layersOf, timelineOf, type Timeline } from './views';

export interface EditorState extends Timeline {
  scan: number | null; // progress 0..1 while the clip is being read
  job: JobStatus | null; // analysis work in progress
  scenes: Piece[]; // the films the clip is split into and kept (one, unsplit), back to back
  scanned: boolean; // the clip's frames are known (so no films kept means all were deleted)
  length: number; // how long the film plays, as edited (seconds)
  canUndo: boolean;
  canRedo: boolean;
}

// the project as it was at one moment, to go back to: everything the user edits, and the tracking
// that was still to do then
interface Snapshot {
  tracks: Track[];
  nextId: number;
  cuts: number[];
  gone: number[];
  speeds: SceneSpeed[];
  anims: SceneAnim[];
  tracked: [number, FrameSpan][];
  jobs: TrackJob[];
  lastFx: FxSettings;
  lastImpact: ImpactStyle;
}

// how many steps back undo goes
const HISTORY = 60;
// changes of the same kind (dragging a slider, a clip's end, a cutout) this close together are one
// step to undo
const MERGE_MS = 1200;

// a copy of a track that later edits can't reach into. Shapes, keyframes and settings are never
// changed in place, only replaced, so they're shared; what's drawn is rebuilt from them.
const copyTrack = (t: Track): Track => ({
  ...t,
  range: { ...t.range },
  shapes: t.shapes.slice(),
  parts: t.parts.map(p => ({ ...p, shapes: p.shapes.slice() })),
  keys: t.keys.slice(),
  frames: [],
});

// what a cutout's outline is made of, to tell later whether it changed
type OutlineOf = {
  shapes: (Shape | null)[];
  parts: { id: number; shapes: (Shape | null)[] }[];
  edge: EdgeSettings | null;
};
const outlineOf = (t: Track): OutlineOf => ({
  shapes: t.shapes.slice(),
  parts: t.parts.map(p => ({ id: p.id, shapes: p.shapes.slice() })),
  edge: t.cutout?.edge ?? null,
});
const outlineChanged = (was: OutlineOf, t: Track) =>
  (t.cutout?.edge ?? null) !== was.edge ||
  t.shapes.some((sh, i) => sh !== was.shapes[i]) ||
  t.parts.length !== was.parts.length ||
  t.parts.some((p, k) => p.id !== was.parts[k].id || p.shapes.some((sh, i) => sh !== was.parts[k].shapes[i]));

export const EMPTY_STATE: EditorState = {
  scan: null,
  job: null,
  lanes: [],
  rows: 0,
  cutRows: 0,
  hasEffects: false,
  scenes: [],
  scanned: false,
  length: 0,
  canUndo: false,
  canRedo: false,
};

export interface EditorEvents {
  // state changed; drawn = the effects drawn on some frames changed too
  changed(state: EditorState, drawn: boolean): void;
  status(message: string): void;
  // the clip's frame size for analysis is known
  meta(meta: TrackMeta): void;
  // a step to undo was kept (see record): the film keeps one history for all its videos
  recorded?(): void;
  // a cutout's pictures, as they're cut (i: clip frame), and the frames it's being cut from now
  cutoutFrames?(id: number, frames: CutFrame[]): void;
  cutoutTrimmed?(id: number, span: { s: number; e: number }): void;
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
};

export class Editor {
  // the clip
  private source: Blob | null = null;
  private duration = 0;
  private clip: ClipFrame[] = [];
  private W = 0; // analysis frame size
  private H = 0;
  // the camera's path through the clip, filled in when something needs it
  private camPath: (Cam | null)[] = [];
  // where the film is split into scenes (see scenes.ts), and the source start of each one deleted
  private cuts: number[] = [];
  private gone: number[] = [];
  // how fast each film plays, by where it starts (see edit.ts)
  private speeds: SceneSpeed[] = [];
  // how each film moves as it plays (see effects/animation.ts), by where it starts
  private anims: SceneAnim[] = [];

  // the effects and impacts on it
  private tracks: Track[] = [];
  private nextId = 1;
  // each clip's tracked frames as of its last tracking, to see what a change uncovers
  private tracked = new Map<number, FrameSpan>();
  // used for the next clip added
  private lastFx: FxSettings = { ...DEFAULT_FX };
  private lastImpact: ImpactStyle = 'punch';
  // the cutout whose outlines are being checked, and its outlines when that started
  private reviewing: { id: number; was: OutlineOf } | null = null;

  // steps to undo and redo; `merge`: the kind of the last step and when, to merge the next into it
  private undos: Snapshot[] = [];
  private redos: Snapshot[] = [];
  private merge: { key: string; at: number } | null = null;

  private jobs: Jobs;
  private state: EditorState = EMPTY_STATE;

  // idBase: clip ids start after it, so several videos' clips never share one
  constructor(
    private analysis: Analysis,
    private layers: EffectLayers,
    private events: EditorEvents,
    private idBase = 0,
  ) {
    this.nextId = idBase + 1;
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
  // the clip frame shown at program time t
  frameAt(t: number) {
    return frameIndexAt(this.clip, this.src(t));
  }
  // program time to the clip's own, and back
  toSource(t: number) {
    return this.src(t);
  }
  toProgram(t: number) {
    return toProgram(this.pieces(), t);
  }
  // where playback at the clip's own time t goes instead: null if it's in a kept film, else the
  // start of the next one (the clip's own time), or 'end'
  jumpFrom(t: number) {
    return this.clip.length ? jumpFrom(this.pieces(), t) : null;
  }
  name(id: number) {
    return this.track(id)?.name ?? '';
  }
  color(id: number) {
    return this.track(id)?.color ?? '#fff';
  }
  // the time of clip frame i (the clip's own), and the frame's size for analysis
  frameTime(i: number) {
    return this.clip[i]?.t ?? 0;
  }
  get frameCount() {
    return this.clip.length;
  }
  get frameSize() {
    return { W: this.W, H: this.H };
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
  // the effect whose object was tapped at frame i
  trackAt(i: number, p: Selection) {
    return trackAt(this.tracks, this.clip, i, p.x, p.y)?.id ?? null;
  }
  // the clip's own length
  get sourceLength() {
    return this.duration;
  }

  // ---------- the clip ----------

  // a new clip (or none): drops everything
  load(source: Blob | null) {
    this.jobs.reset();
    this.source = source;
    this.clip = [];
    this.tracks = [];
    this.nextId = this.idBase + 1;
    this.tracked.clear();
    this.camPath = [];
    this.cuts = [];
    this.gone = [];
    this.speeds = [];
    this.anims = [];
    this.undos = [];
    this.redos = [];
    this.merge = null;
    this.syncLayers();
    this.update(EMPTY_STATE, true);
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
        this.H = meta.H;
        this.events.meta(meta);
        this.camPath = new Array(frames.length).fill(null);
        this.layers.setCamera(this.camPath);
        this.sendScenes();
      },
      done: () => {
        this.update({ scan: null, ...this.filmState() }, true);
        this.jobs.pump();
      },
      error: message => {
        this.update({ scan: null });
        this.events.status(message);
      },
    });
  }

  // ---------- the footage: scenes ----------

  // the film (of those kept) playing at time t
  sceneAt(t: number) {
    return Math.max(0, pieceAt(this.pieces(), this.src(t)));
  }

  // splits the film at frame i into two: frame i starts the second. False if it's too close to
  // either end of its film.
  split(i: number) {
    const cuts = splitAt(this.cuts, this.clip, i, this.duration);
    if (!cuts) {
      this.events.status('Too close to the end of the film to split here.');
      return false;
    }
    this.record();
    // both halves play as fast as the film did
    const t = this.clip[i]?.t ?? 0,
      was = this.pieces().find(p => t >= p.s && t < p.e),
      at = cuts.find(c => !this.cuts.includes(c));
    if (was && at !== undefined) {
      this.speeds = withSpeed(this.speeds, at, was.speed, was.pitch);
      // (it comes in on the first half and goes out on the second; both keep moving as it did)
      this.anims = withAnim(withAnim(this.anims, was.s, { ...was.anim, out: null }), at, {
        ...was.anim,
        in: null,
      });
    }
    this.cuts = cuts;
    this.sendScenes();
    this.update(this.filmState(), true);
    return true;
  }

  // film k (of those kept) plays at `speed` (1: as filmed); pitch: its sound's pitch changes with it.
  // Changes straight after one another (dragging the slider) are one step to undo.
  setSpeed(k: number, speed: number, pitch: boolean) {
    const p = this.pieces()[k];
    if (!p) return false;
    this.record(`speed:${p.s}`);
    this.speeds = withSpeed(this.speeds, p.s, speed, pitch);
    this.publish(true);
    this.update(this.filmState(), true);
    return true;
  }

  // film k's (of those kept) animation of this kind set, or taken off (null). Changes straight
  // after one another (dragging its duration) are one step to undo.
  setAnim(k: number, kind: AnimKind, slot: AnimSlot | null) {
    const p = this.pieces()[k];
    if (!p) return false;
    this.record(`anim:${p.s}:${kind}`);
    this.anims = withAnim(this.anims, p.s, { ...p.anim, [kind]: slot });
    this.publish(true);
    this.update(this.filmState(), true);
    return true;
  }

  // how fast the film plays at source time t, and whether its pitch changes with it
  speedAt(t: number) {
    const p = this.pieces().find(q => t >= q.s - 1e-6 && t < q.e);
    return { speed: p?.speed ?? 1, pitch: p?.pitch ?? false };
  }

  // deletes film k (of those kept): the ones either side then play one after the other. Whatever
  // is on it stays in the project, just unseen, and comes back with undo. The last one can go too,
  // leaving nothing to play.
  deleteScene(k: number) {
    const p = this.pieces()[k];
    if (!p) return false;
    this.record();
    this.gone = [...this.gone, p.s];
    this.publish(true);
    this.update(this.filmState(), true);
    return true;
  }

  // ---------- the footage: cutouts ----------

  // a new cutout of the object tapped at frame i, cut from DEFAULT_EFFECT_S from there (within its
  // scene); bg: what's left in the footage where it was; focus: the size of a box drawn round it
  // (centred on sel), to look for it only in there
  addCutout(i: number, sel: Selection, bg: Background, focus: { w: number; h: number } | null = null) {
    const f = this.clip[i];
    if (!f) return null;
    this.record();
    const range = { s: f.t, e: this.defaultEnd(f.t) };
    const t = newCutoutTrack(this.nextId++, this.clip, this.lastFx, range, bg);
    t.focus = focus && { w: Math.max(8, focus.w), h: Math.max(8, focus.h) };
    // it's cut out once its outlines have been checked (see finishReview)
    return this.start(t, i, sel);
  }

  // ---------- checking a cutout's outlines ----------

  // starts checking a cutout's outlines: it isn't cut out again until that's done
  startReview(id: number) {
    const t = this.track(id);
    if (!t?.cutout) return false;
    this.reviewing = { id, was: outlineOf(t) };
    return true;
  }

  // its outlines are right: it's cut out (again, if they changed)
  finishReview() {
    const r = this.reviewing;
    this.reviewing = null;
    const t = r && this.track(r.id);
    if (!r || !t?.cutout) return;
    // (not a step to undo: once checked, it stays checked)
    const first = !t.cutout.reviewed;
    if (first) t.cutout = { ...t.cutout, reviewed: true };
    if (first || outlineChanged(r.was, t)) this.jobs.render(t.id);
  }

  // what's being checked of a cutout: the frames it's cut from [s, e) and when each starts, the
  // stretch of the clip that is, which of them look wrong, the frames it was picked or changed on
  // (its keyframes and pieces), and its edge settings
  reviewOf(id: number): {
    s: number;
    e: number;
    times: number[]; // each frame's start (the clip's own time)
    range: { s: number; e: number };
    length: number; // the clip's
    flags: Flag[];
    keys: number[];
    edge: EdgeSettings;
  } | null {
    const t = this.track(id);
    if (!t?.cutout) return null;
    const { s, e } = rangeFrames(t, this.clip);
    const keys = t.keys.filter(k => k.i >= s && k.i < e);
    return {
      s,
      e,
      times: this.clip.slice(s, e).map(f => f.t),
      range: { ...t.range },
      length: this.duration,
      flags: reviewFlags(drawnShapes(t), s, e),
      keys: [...new Set([...keys.map(k => k.i), ...t.parts.map(p => p.i)])]
        .filter(i => i >= s && i < e)
        .sort((a, b) => a - b),
      edge: t.cutout.edge,
    };
  }

  // a cutout's edge: feathered, smoothed, grown or shrunk, steadied (see edge.ts). Changes
  // to one setting straight after one another (dragging its slider) are one step to undo.
  setEdge(id: number, p: Partial<EdgeSettings>) {
    const t = this.track(id);
    if (!t?.cutout) return;
    const edge = clampEdge({ ...t.cutout.edge, ...p });
    if ((Object.keys(edge) as (keyof EdgeSettings)[]).every(k => edge[k] === t.cutout!.edge[k])) return;
    this.record(`edge:${id}:${Object.keys(p).join()}`);
    t.cutout = { ...t.cutout, edge };
    refreshFrames(t, this.clip);
    this.syncLayers();
    this.layers.changed(id);
    this.publish(true);
    this.recut(t);
  }

  // what a cutout leaves in the footage where it was cut from
  setBackground(id: number, bg: Background) {
    const t = this.track(id);
    if (!t?.cutout || t.cutout.bg === bg) return;
    this.record();
    t.cutout = { ...t.cutout, bg };
    this.syncLayers();
    this.publish(true);
    // the background behind it is rebuilt when first asked for
    if (bg === 'clean') this.recut(t);
  }

  // what's cut out for a cutout: the stretch of the clip it's cut from (the clip's own time), what
  // it leaves there, and the object in each frame (fractions of the frame); null if it's gone
  cutoutOf(id: number): { range: { s: number; e: number }; bg: Background; frames: OverlayFrame[] } | null {
    const t = this.track(id);
    if (!t?.cutout || !this.clip.length) return null;
    const W = this.W || 1,
      H = this.H || 1;
    const { s, e } = rangeFrames(t, this.clip);
    const frames: OverlayFrame[] = [];
    for (let i = s; i < e; i++) {
      const sh = t.frames[i]?.shapes[0];
      if (sh) frames.push({ t: this.clip[i].t, cx: sh.cx / W, cy: sh.cy / H, w: sh.w / W, h: sh.h / H });
    }
    return { range: t.range, bg: t.cutout.bg, frames };
  }

  // cuts a cutout from another stretch of the clip (its own time); call commitRange once the change
  // is done to track and cut what it uncovered
  setCutoutRange(id: number, r: { s?: number; e?: number }) {
    const t = this.track(id);
    if (!t?.cutout) return;
    this.record(`range:${id}`);
    if (!setRange(t, r, this.duration, this.clip)) return;
    this.syncLayers();
    this.layers.changed(id);
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
  // body: a body preset it's made from (see effects/body.ts)
  addTrack(
    i: number,
    sel: Selection,
    fx: Partial<FxSettings> = {},
    part: BodyPart | null = null,
    body: Preset | null = null,
  ) {
    const f = this.clip[i];
    if (!f) return null;
    this.record();
    this.lastFx = { ...this.lastFx, ...fx };
    const range = { s: f.t, e: this.defaultEnd(f.t) };
    const t = newTrack(this.nextId++, this.clip, this.lastFx, range, part);
    return this.start(body ? withBody(t, body) : t, i, sel);
  }

  // an effect made from a body preset instead (another, or the first); its timing and tracking stay
  setBody(id: number, preset: Preset) {
    const t = this.track(id);
    if (!t || t.kind !== 'effect' || preset.group !== 'body') return false;
    this.record();
    const next = withBody(t, preset);
    t.body = next.body;
    t.fx = next.fx;
    this.syncLayers();
    this.publish(true);
    return true;
  }

  // one of its body preset's controls set; changes straight after one another are one step to undo
  setBodyControl(id: number, control: string, v: ParamValue) {
    const t = this.track(id);
    if (!t?.body) return;
    this.record(`body:${id}:${control}`);
    t.body = withBodyControl(t, control, v).body;
    this.syncLayers();
    this.publish(true);
  }

  // a new effect coming from the spot tapped at frame i (only for effects that can: see canPin),
  // lasting DEFAULT_EFFECT_S from there
  addSpotEffect(i: number, sel: Selection, fx: Partial<FxSettings> = {}) {
    const f = this.clip[i];
    if (!f) return null;
    if (!canPin({ ...this.lastFx, ...fx }.effect)) return null;
    this.record();
    this.lastFx = { ...this.lastFx, ...fx };
    // the spot stays put in the scene as the camera moves
    this.jobs.needCamera();
    const range = { s: f.t, e: this.defaultEnd(f.t) };
    return this.start(newSpotTrack(this.nextId++, this.clip, this.lastFx, range), i, sel);
  }

  // a new impact going off at the spot tapped at frame i
  addImpact(i: number, sel: Selection, style: ImpactStyle = this.lastImpact, fx: Partial<FxSettings> = {}) {
    if (!this.clip[i]) return null;
    this.record();
    this.lastImpact = style;
    // impacts stay put in the scene as the camera moves
    this.jobs.needCamera();
    const t = newImpact(this.nextId++, this.clip, { ...this.lastFx, ...fx }, style, i, this.duration);
    return this.start(t, i, sel);
  }

  private start(t: Track, i: number, sel: Selection) {
    this.named(t);
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

  // ---------- fixing ----------

  // a tap on the clip's object at frame i: a keyframe that re-tracks the frames around it
  fixAt(id: number, i: number, sel: Selection) {
    const t = this.track(id);
    if (!t) return false;
    if (isPinned(t)) {
      this.record();
      return this.moveSpot(t, i, sel);
    }
    return this.addKey(t, { i, x: sel.x, y: sel.y });
  }

  // a piece added to ('add') or taken out of ('remove') a cutout's outline, picked at frame i: the
  // piece tapped at `at`, followed through its frames, or a loop drawn round it (see parts.ts)
  addPart(id: number, i: number, op: PartOp, pick: { at: Selection } | { loop: readonly Selection[] }) {
    const t = this.track(id);
    if (!t?.cutout || !inSpan(trackSpan(t, this.clip), i)) return false;
    if ('loop' in pick && pick.loop.length < 3) return false;
    this.record();
    const part: Part = {
      id: Math.max(0, ...t.parts.map(p => p.id)) + 1,
      op,
      i,
      at: 'at' in pick ? { x: pick.at.x, y: pick.at.y } : null,
      loop: 'loop' in pick ? pick.loop.map(p => ({ x: p.x, y: p.y })) : null,
      shapes: new Array(this.clip.length).fill(null),
    };
    t.parts = [...t.parts, part];
    refreshFrames(t, this.clip);
    this.layers.changed(t.id);
    this.publish(true);
    if (part.at) this.jobs.addFirst(this.partJob(t, part));
    this.recut(t);
    return true;
  }

  // following a tapped piece from where it was picked
  private partJob(t: Track, p: Part): TrackJob {
    return { id: t.id, key: { i: p.i, x: p.at?.x ?? 0, y: p.at?.y ?? 0 }, part: p.id };
  }

  // a new keyframe (replacing any on its frame), tracked from first
  private addKey(t: Track, key: Key) {
    if (!inSpan(trackSpan(t, this.clip), key.i)) {
      this.events.status(`This moment is outside ${t.name}’s effect. Drag its ends to include it.`);
      return false;
    }
    this.record();
    t.keys = insertKey(t.keys, key);
    this.publish();
    this.jobs.addFirst({ id: t.id, key });
    this.recut(t);
    return true;
  }

  // an impact or spot effect tapped somewhere else goes there instead (the spot as seen at frame
  // i)
  private moveSpot(t: Track, i: number, sel: Selection) {
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
    this.record();

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
    this.record();
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
  setRange(id: number, span: { s?: number; e?: number }) {
    const t = this.track(id);
    if (!t) return;
    const r = {
      ...(span.s !== undefined && { s: this.src(span.s) }),
      ...(span.e !== undefined && { e: this.src(span.e, true) }),
    };
    this.record(`range:${id}`);
    if (!setRange(t, r, this.duration, this.clip)) return;
    this.place(t);
    this.syncLayers();
    this.layers.changed(id);
    this.publish(true);
  }

  commitRange(id: number) {
    const t = this.track(id);
    if (!t) return;
    this.merge = null; // the drag is done: the next is a step of its own
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
    if (before.s === after.s && before.e === after.e) return;
    // the pieces tapped are followed over the new frames too
    const tapped = t.parts.filter(p => p.at && inSpan(after, p.i));
    if (tapped.length) {
      this.jobs.drop(j => j.id === id && j.part !== undefined);
      this.jobs.add(...tapped.map(p => this.partJob(t, p)));
    }
    this.recut(t);
  }

  // moves an impact to hit at time t
  moveImpactTo(id: number, t: number) {
    const tr = this.track(id);
    const i = frameIndexAt(this.clip, Math.max(0, Math.min(this.src(t), this.duration - 1e-3)));
    if (!tr || i < 0) return;
    this.record();
    if (!setHit(tr, this.clip, this.duration, i)) return;
    this.timingChanged(id);
  }

  // an impact's style (which also sets how long it lasts)
  setImpactStyle(id: number, style: ImpactStyle) {
    const t = this.track(id);
    if (!t) return;
    this.record();
    if (!setHit(t, this.clip, this.duration, hitFrame(t, this.clip), style)) return;
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
    this.changeAim(id, aim => ({ ...aim, ...normalAim(p.h ?? aim.h, p.v ?? aim.v) }), `aim:${id}`);
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

  private changeAim(id: number, change: (aim: Aim) => Aim, merge?: string) {
    const t = this.track(id);
    if (!t) return false;
    this.record(merge);
    t.aim = change(t.aim);
    this.syncLayers();
    this.publish(true);
    return true;
  }

  // ---------- look ----------

  // changes the given clip (or the only one); also used for the next one added
  setFx(id: number | null, p: Partial<FxSettings>) {
    const t = this.fxTarget(id);
    if (t) this.record(`fx:${t.id}:${Object.keys(p).join()}`);
    const fx = { ...(t?.fx ?? this.lastFx), ...p };
    this.lastFx = fx;
    if (!t) return;
    t.fx = fx;
    this.syncLayers();
    this.publish(true);
  }

  setEffect(id: number | null, effect: Effect) {
    this.setFx(id, { effect, pal: DEFAULT_PAL[effect] });
  }

  // a copy of the clip on the row below, at the same time: its tracking too (and whatever of it is
  // still to do)
  duplicate(id: number) {
    const t = this.track(id);
    if (!t) return null;
    this.record();
    const d = duplicate(t, this.nextId++, this.clip);
    this.named(d);
    this.tracks.push(d);
    this.tracked.set(d.id, this.tracked.get(t.id) ?? trackSpan(d, this.clip));
    this.place(d);
    this.syncLayers();
    this.publish(true);
    const todo = this.jobs.pending().filter(j => j.id === t.id);
    if (todo.length) this.jobs.add(...todo.map(j => ({ id: d.id, key: j.key })));
    this.recut(d);
    return d.id;
  }

  // puts the clip on timeline row `row` (among the effect rows, or the cutout rows; -1: a new row
  // on top); if something there overlaps it, it goes on the next free row below
  moveToRow(id: number, row: number) {
    const t = this.track(id);
    if (!t || t.row === row) return;
    this.record();
    t.row = row;
    this.publish();
  }

  deleteTrack(id: number) {
    if (!this.track(id)) return;
    this.record();
    this.tracks = this.tracks.filter(t => t.id !== id);
    this.tracked.delete(id);
    this.jobs.drop(j => j.id === id);
    this.jobs.dropRender(id);
    this.syncLayers();
    this.publish(true);
    this.jobs.pump();
  }

  // ---------- undo ----------

  // back to how the project was before the last change
  undo() {
    const snap = this.undos.pop();
    if (!snap) return false;
    this.redos.push(this.snapshot());
    this.restore(snap);
    return true;
  }

  // the change undone, done again
  redo() {
    const snap = this.redos.pop();
    if (!snap) return false;
    this.undos.push(this.snapshot());
    this.restore(snap);
    return true;
  }

  // keeps the project as it is now, to undo back to, before a change. Changes of the same kind
  // (merge) close together are one step.
  private record(merge?: string) {
    const now = Date.now();
    if (merge && this.merge?.key === merge && now - this.merge.at < MERGE_MS) {
      this.merge.at = now;
      return;
    }
    this.merge = merge ? { key: merge, at: now } : null;
    this.undos.push(this.snapshot());
    this.events.recorded?.();
    if (this.undos.length > HISTORY) this.undos.shift();
    this.redos = [];
    if (!this.state.canUndo || this.state.canRedo) this.update({ canUndo: true, canRedo: false });
  }

  private snapshot(): Snapshot {
    return {
      tracks: this.tracks.map(copyTrack),
      nextId: this.nextId,
      cuts: this.cuts,
      gone: this.gone,
      speeds: this.speeds,
      anims: this.anims,
      tracked: [...this.tracked],
      jobs: this.jobs.pending(),
      lastFx: this.lastFx,
      lastImpact: this.lastImpact,
    };
  }

  // puts the project back as it was; its tracking still to do carries on, and cutouts whose
  // outlines differ from what's cut out are cut out again
  private restore(snap: Snapshot) {
    const was = new Map(this.tracks.map(t => [t.id, t]));
    this.tracks = snap.tracks.map(copyTrack);
    this.nextId = snap.nextId;
    this.cuts = snap.cuts;
    this.gone = snap.gone;
    this.speeds = snap.speeds;
    this.anims = snap.anims;
    this.tracked = new Map(snap.tracked);
    this.lastFx = snap.lastFx;
    this.lastImpact = snap.lastImpact;
    this.merge = null;
    // (a cutout being checked may be gone)
    if (this.reviewing && !this.track(this.reviewing.id)) this.reviewing = null;
    for (const t of this.tracks) {
      refreshFrames(t, this.clip);
      this.place(t);
    }
    this.sendScenes();
    this.syncLayers();
    for (const t of this.tracks) this.layers.changed(t.id);
    this.jobs.restore(
      snap.jobs.filter(j => {
        const t = this.track(j.id);
        return !!t && (j.part !== undefined ? t.parts.some(p => p.id === j.part) : t.keys.includes(j.key));
      }),
    );
    for (const t of this.tracks) {
      const old = was.get(t.id);
      if (t.cutout && old?.cutout?.reviewed) t.cutout = { ...t.cutout, reviewed: true };
      if (!old || outlineChanged(outlineOf(old), t)) this.recut(t);
    }
    this.publish(true);
    this.update(
      { ...this.filmState(), canUndo: this.undos.length > 0, canRedo: this.redos.length > 0 },
      true,
    );
  }

  // ---------- internals ----------

  // the kept films, back to back
  private pieces() {
    return piecesOf(this.cuts, this.gone, this.duration, this.speeds, this.anims);
  }

  // program time t in the clip's own time (end: t ends a stretch)
  private src(t: number, end = false) {
    return this.clip.length ? toSource(this.pieces(), t, end) : t;
  }

  private filmState() {
    const scenes = this.pieces();
    return {
      scenes,
      scanned: this.clip.length > 0,
      length: lengthOf(scenes),
      canUndo: this.undos.length > 0,
      canRedo: this.redos.length > 0,
    };
  }

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

  // a cutout's outlines changed: cut it out again once they're tracked (if they've been checked,
  // and aren't being checked now)
  private recut(t: Track) {
    if (t.cutout?.reviewed && this.reviewing?.id !== t.id) this.jobs.render(t.id);
  }

  // a spot effect's box in each frame of its range, where the camera has carried the spot
  private place(t: Track) {
    if (!t.spot) return;
    placeAtSpot(t, this.clip, this.camPath, this.W);
    this.layers.changed(t.id);
  }

  // a new clip's name counts from 1 in this video, not from its id's base
  private named(t: Track) {
    const suffix = ` ${t.id}`;
    if (this.idBase && t.name.endsWith(suffix))
      t.name = `${t.name.slice(0, -suffix.length)} ${t.id - this.idBase}`;
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
    const tl = timelineOf(this.tracks, this.clip, this.pieces());
    // each clip stays on the row it was put on
    for (const l of tl.lanes) {
      const t = this.track(l.id);
      if (t) t.row = l.row;
    }
    this.update(tl, drawn);
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
      cutoutStarted: (id, span) => {
        this.layers.trimCutout(id, span);
        this.events.cutoutTrimmed?.(id, span);
      },
      cutoutFrames: (id, frames) => {
        this.layers.cutoutFrames(id, frames);
        this.events.cutoutFrames?.(id, frames);
        this.update({}, true);
      },
      status: message => this.events.status(message),
    };
  }
}
