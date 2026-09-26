import { beforeEach, describe, expect, it } from 'vitest';
import type { Appearance } from '@/domain/tracking/appearance';
import type { ClipFrame, Shape } from '@/domain/tracking/types';
import { Editor, type EditorState } from './editor';
import type { Analysis, EffectLayers, LayerSpec } from './ports';

// ---------- fakes ----------
type Call =
  | { kind: 'scan'; on: Parameters<Analysis['scan']>[1] }
  | { kind: 'track'; req: Parameters<Analysis['track']>[1]; on: Parameters<Analysis['track']>[2] }
  | { kind: 'find'; req: Parameters<Analysis['find']>[1]; on: Parameters<Analysis['find']>[2] };

class FakeAnalysis implements Analysis {
  calls: Call[] = [];
  cancels = 0;
  scan: Analysis['scan'] = (_s, on) => { this.calls.push({ kind: 'scan', on }); };
  track: Analysis['track'] = (_s, req, on) => { this.calls.push({ kind: 'track', req, on }); };
  find: Analysis['find'] = (_s, req, on) => { this.calls.push({ kind: 'find', req, on }); };
  cancel() { this.cancels++; }
  get last() { return this.calls[this.calls.length - 1]; }
}

class FakeLayers implements EffectLayers {
  specs: LayerSpec[] = [];
  changedIds: number[] = [];
  setClip() {}
  setLayers(s: LayerSpec[]) { this.specs = s; }
  changed(id: number) { this.changedIds.push(id); }
}

// 30 frames at 10 fps, cut at frames 10 and 20: three 1-second shots
const clip: ClipFrame[] = Array.from({ length: 30 }, (_, i) => ({ t: i / 10, dur: 0.1 }));
const LOOK: Appearance = { top: new Float32Array(40), bottom: new Float32Array(40), area: 0.1, aspect: 0.5 };
const shape = (): Shape => ({ id: 0, cx: 50, cy: 50, w: 20, h: 40 });

let analysis: FakeAnalysis, layers: FakeLayers, editor: Editor, state: EditorState, statuses: string[];

function trackCall() { const c = analysis.last; if (c.kind !== 'track') throw new Error(`expected a track job, got ${c.kind}`); return c; }
function findCall() { const c = analysis.last; if (c.kind !== 'find') throw new Error(`expected a find job, got ${c.kind}`); return c; }
// finishes the running track job: every frame found, and (optionally) how the object looked
function finishTrack(look: Appearance | null = LOOK) {
  const c = trackCall();
  c.on.appearance(look);
  c.on.shapes(c.req.times.map((_, i) => ({ i, shape: shape() })));
  c.on.done();
  return c;
}

beforeEach(() => {
  analysis = new FakeAnalysis(); layers = new FakeLayers(); statuses = [];
  editor = new Editor(analysis, layers, { changed: s => { state = s; }, status: m => statuses.push(m), meta: () => {} });
  editor.load(new Blob());
  editor.scan(3);
  const scan = analysis.last;
  if (scan.kind !== 'scan') throw new Error('expected a scan');
  scan.on.scanned({ videoW: 100, videoH: 100, W: 100, H: 100, duration: 3, frameCount: 30 }, clip, [10, 20]);
  scan.on.done();
});

describe('scanning', () => {
  it('reports the cuts as times and is then ready', () => {
    expect(state.cuts).toEqual([1, 2]);
    expect(editor.ready).toBe(true);
    expect(statuses).toContain('Found 2 cuts: 3 shots.');
  });
});

describe('adding an object', () => {
  it('tracks it through its own shot only, from the tapped frame', () => {
    editor.addTrack(14, { x: 50, y: 50 });
    const c = trackCall();
    expect(c.req.times).toEqual(clip.slice(10, 20).map(f => f.t));
    expect(c.req.key).toBe(4);
    expect(state.job?.label).toBe('Tracking Object 1');
  });

  it('then looks for it in each other shot', () => {
    editor.addTrack(14, { x: 50, y: 50 });
    finishTrack();
    expect(findCall().req.t).toBe(clip[2].t); // shot 1, a couple of frames in
    expect(state.hasEffects).toBe(true);
    expect(layers.specs.map(s => s.id)).toEqual([1]);
  });

  it('tracks it in a shot where it is found again, marked as automatic', () => {
    editor.addTrack(14, { x: 50, y: 50 });
    finishTrack();
    findCall().on.found({ x: 30, y: 60 }); findCall().on.done();
    const c = trackCall();
    expect(c.req.times).toEqual(clip.slice(0, 10).map(f => f.t));
    expect(c.req.select).toEqual({ x: 30, y: 60 });
    expect(state.lanes[0].keys).toEqual([{ t: 0.2, auto: true }, { t: 1.4, auto: false }]);
  });

  it('marks shots where it is not found', () => {
    editor.addTrack(14, { x: 50, y: 50 });
    finishTrack();
    findCall().on.found(null); findCall().on.done();
    findCall().on.found(null); findCall().on.done();
    expect(state.lanes[0].missing.map(m => m.shot)).toEqual([0, 2]);
    expect(state.job).toBeNull();
  });

  it('skips the search when only a box could be tracked (nothing to match)', () => {
    editor.addTrack(14, { x: 50, y: 50 });
    finishTrack(null);
    expect(analysis.calls.filter(c => c.kind === 'find')).toHaveLength(0);
    expect(state.lanes[0].missing.map(m => m.shot)).toEqual([0, 2]);
  });
});

describe('fixing', () => {
  it('a fix jumps ahead of a search in progress, and the search runs again after', () => {
    editor.addTrack(12, { x: 50, y: 50 });
    finishTrack();
    const search = findCall();
    editor.fixAt(1, 18, { x: 70, y: 50 });
    expect(trackCall().req.select).toEqual({ x: 70, y: 50 });
    finishTrack();
    expect(findCall().req).toEqual(search.req);
  });

  it('a fix re-tracks only the frames nearer to it than to the first tap', () => {
    editor.addTrack(12, { x: 50, y: 50 });
    finishTrack();
    editor.fixAt(1, 18, { x: 70, y: 50 });
    const c = trackCall();
    // halfway between 12 and 18 is 15, so the fix owns 16..19
    expect(c.req.times).toEqual(clip.slice(16, 20).map(f => f.t));
    expect(c.req.key).toBe(2);
  });

  it('a fix during tracking in the same shot cancels that job and runs it again after', () => {
    editor.addTrack(12, { x: 50, y: 50 });
    const first = trackCall();
    editor.fixAt(1, 18, { x: 70, y: 50 });
    expect(analysis.cancels).toBeGreaterThan(0);
    expect(trackCall().req.select).toEqual({ x: 70, y: 50 });
    finishTrack();
    // the first tap's job again, now only up to the halfway point
    expect(trackCall().req.select).toEqual(first.req.select);
    expect(trackCall().req.times).toEqual(clip.slice(10, 16).map(f => f.t));
  });

  it('removing a fix clears its frames and hands them back to the other keyframe', () => {
    editor.addTrack(12, { x: 50, y: 50 });
    finishTrack();
    findCall().on.found(null); findCall().on.done();
    findCall().on.found(null); findCall().on.done();
    editor.fixAt(1, 18, { x: 70, y: 50 });
    finishTrack();
    expect(editor.removeFixAt(1, 19)).toBe(true);
    expect(editor.hasShapeAt(1, 19)).toBe(false);
    const c = trackCall();
    expect(c.req.select).toEqual({ x: 50, y: 50 });
    expect(c.req.times).toEqual(clip.slice(10, 20).map(f => f.t));
    expect(statuses).toContain('Removed the fix here.');
  });
});

describe('effects and objects', () => {
  it('each object keeps its own effect', () => {
    editor.addTrack(14, { x: 50, y: 50 });
    editor.setEffect(1, 'lightning');
    editor.addTrack(14, { x: 10, y: 10 });
    editor.setFx(2, { pal: 2 });
    expect(editor.fx(1)).toMatchObject({ effect: 'lightning', pal: 1 });
    expect(editor.fx(2)).toMatchObject({ effect: 'lightning', pal: 2 });
    expect(layers.specs.map(s => s.settings.pal)).toEqual([1, 2]);
  });

  it('deleting an object cancels its work and drops its lane', () => {
    editor.addTrack(14, { x: 50, y: 50 });
    const before = analysis.cancels;
    editor.deleteTrack(1);
    expect(analysis.cancels).toBe(before + 1);
    expect(state.lanes).toEqual([]);
    expect(layers.specs).toEqual([]);
    expect(state.job).toBeNull();
  });

  it('export starts at the first frame any effect follows', () => {
    editor.addTrack(14, { x: 50, y: 50 });
    finishTrack();
    expect(editor.firstEffectTime()).toBe(1);
  });
});
