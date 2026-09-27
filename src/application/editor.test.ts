import { beforeEach, describe, expect, it } from 'vitest';
import type { ClipFrame, Shape } from '@/domain/tracking/types';
import { Editor, type EditorState } from './editor';
import type { Analysis, EffectLayers, LayerSpec } from './ports';

// ---------- fakes ----------
type Call =
  | { kind: 'scan'; on: Parameters<Analysis['scan']>[2] }
  | { kind: 'track'; req: Parameters<Analysis['track']>[1]; on: Parameters<Analysis['track']>[2] }
  | { kind: 'probe'; req: Parameters<Analysis['probe']>[1]; on: Parameters<Analysis['probe']>[2] }
  | { kind: 'camera'; times: number[] };

class FakeAnalysis implements Analysis {
  calls: Call[] = [];
  cancels = 0;
  scan: Analysis['scan'] = (_s, _l, on) => {
    this.calls.push({ kind: 'scan', on });
  };
  track: Analysis['track'] = (_s, req, on) => {
    this.calls.push({ kind: 'track', req, on });
  };
  probe: Analysis['probe'] = (_s, req, on) => {
    this.calls.push({ kind: 'probe', req, on });
  };
  // the camera's path is worked out at once: it held still
  camera: Analysis['camera'] = (_s, times, on) => {
    this.calls.push({ kind: 'camera', times });
    on.path(times.map((_, i) => ({ i, s: 1, tx: 0, ty: 0 })));
    on.done();
  };
  cancel() {
    this.cancels++;
  }
  get last() {
    return this.calls[this.calls.length - 1];
  }
  get tracks() {
    return this.calls.filter(c => c.kind === 'track').length;
  }
}

class FakeLayers implements EffectLayers {
  specs: LayerSpec[] = [];
  setClip() {}
  camera: unknown[] = [];
  setCamera(path: unknown[]) {
    this.camera = path;
  }
  setLayers(s: LayerSpec[]) {
    this.specs = s;
  }
  changed() {}
}

// 60 frames at 10 fps: a 6-second clip
const clip: ClipFrame[] = Array.from({ length: 60 }, (_, i) => ({ t: i / 10, dur: 0.1 }));
const times = (a: number, b: number) => clip.slice(a, b).map(f => f.t);
const shape = (): Shape => ({ id: 0, cx: 50, cy: 50, w: 20, h: 40 });

let analysis: FakeAnalysis, editor: Editor, layers: FakeLayers, state: EditorState, statuses: string[];

function trackCall() {
  const c = analysis.last;
  if (c.kind !== 'track') throw new Error(`expected a track job, got ${c.kind}`);
  return c;
}
// finishes the running track job with the object found in every frame
function finishTrack() {
  const c = trackCall();
  c.on.shapes(c.req.times.map((_, i) => ({ i, shape: shape() })));
  c.on.done();
  return c;
}

beforeEach(() => {
  analysis = new FakeAnalysis();
  layers = new FakeLayers();
  statuses = [];
  editor = new Editor(analysis, layers, {
    changed: s => {
      state = s;
    },
    status: m => statuses.push(m),
    meta: () => {},
  });
  editor.load(new Blob());
  editor.scan(6);
  const scan = analysis.last;
  if (scan.kind !== 'scan') throw new Error('expected a scan');
  scan.on.scanned({ videoW: 100, videoH: 100, W: 100, H: 100, duration: 6, frameCount: 60 }, clip);
  scan.on.done();
});

describe('adding an effect', () => {
  it('lasts 3 seconds from the tapped frame, and tracks only those frames', () => {
    editor.addTrack(14, { x: 50, y: 50 });
    expect(state.lanes[0].range).toEqual({ s: 1.4, e: 4.4 });
    const c = trackCall();
    // plain effects don't need the camera's path
    expect(analysis.calls.some(k => k.kind === 'camera')).toBe(false);
    expect(c.req.times).toEqual(times(14, 44));
    expect(c.req.key).toBe(0);
    expect(state.job?.label).toBe('Tracking Object 1');
  });

  it('stops at the end of the clip', () => {
    editor.addTrack(50, { x: 50, y: 50 });
    expect(state.lanes[0].range).toEqual({ s: 5, e: 6 });
    expect(trackCall().req.times).toEqual(times(50, 60));
  });

  it('draws the effect only inside its range once tracked', () => {
    editor.addTrack(14, { x: 50, y: 50 });
    finishTrack();
    expect(editor.hasShapeAt(1, 20)).toBe(true);
    expect(editor.hasShapeAt(1, 50)).toBe(false);
    expect(state.hasEffects).toBe(true);
    expect(editor.firstEffectTime()).toBe(1.4);
  });
});

describe('stacking effects', () => {
  it('effects one after another share a row', () => {
    editor.addTrack(0, { x: 10, y: 10 }); // 0..3
    editor.addTrack(30, { x: 20, y: 20 }); // 3..6
    expect(state.rows).toBe(1);
    expect(state.lanes.map(l => l.row)).toEqual([0, 0]);
  });

  it('overlapping effects stack on separate rows, each with its own look', () => {
    editor.addTrack(0, { x: 10, y: 10 });
    editor.setEffect(1, 'lightning');
    editor.addTrack(10, { x: 20, y: 20 });
    editor.setFx(2, { pal: 2 });
    expect(state.rows).toBe(2);
    expect(editor.fx(1)).toMatchObject({ effect: 'lightning', pal: 1 });
    expect(editor.fx(2)).toMatchObject({ effect: 'lightning', pal: 2 });
    expect(layers.specs.map(s => s.settings.pal)).toEqual([1, 2]);
  });
});

describe('changing where an effect starts and ends', () => {
  it('dragging does not track; letting go tracks only the new frames', () => {
    editor.addTrack(14, { x: 50, y: 50 });
    finishTrack();
    const before = analysis.tracks;
    editor.setRange(1, { e: 5 });
    editor.setRange(1, { e: 5.4 });
    expect(analysis.tracks).toBe(before);
    editor.commitRange(1);
    expect(trackCall().req.times).toEqual(times(14, 54));
  });

  it('the renderer is told where the effect now ends, so it switches off right there', () => {
    editor.addTrack(14, { x: 50, y: 50 });
    editor.setRange(1, { e: 2.5 });
    expect(layers.specs[0].range).toEqual({ s: 1.4, e: 2.5 });
  });

  it('shortening an effect needs no tracking', () => {
    editor.addTrack(14, { x: 50, y: 50 });
    finishTrack();
    const before = analysis.tracks;
    editor.setRange(1, { s: 2, e: 3 });
    editor.commitRange(1);
    expect(analysis.tracks).toBe(before);
    expect(editor.hasShapeAt(1, 25)).toBe(true);
    expect(editor.hasShapeAt(1, 15)).toBe(false);
  });

  it('never gets shorter than a tenth of a second or leaves the clip', () => {
    editor.addTrack(14, { x: 50, y: 50 });
    editor.setRange(1, { e: 1.45 });
    expect(state.lanes[0].range).toEqual({ s: 1.4, e: 4.4 });
    editor.setRange(1, { s: -1, e: 99 });
    expect(state.lanes[0].range).toEqual({ s: 0, e: 6 });
  });
});

describe('fixing', () => {
  it('a fix re-tracks only the frames nearer to it than to the first tap', () => {
    editor.addTrack(14, { x: 50, y: 50 });
    finishTrack();
    expect(editor.fixAt(1, 40, { x: 70, y: 50 })).toBe(true);
    const c = trackCall();
    // halfway between 14 and 40 is 27, so the fix owns 28..43
    expect(c.req.times).toEqual(times(28, 44));
    expect(c.req.key).toBe(12);
  });

  it('a tap outside the effect is not a fix', () => {
    editor.addTrack(14, { x: 50, y: 50 });
    finishTrack();
    expect(editor.fixAt(1, 50, { x: 70, y: 50 })).toBe(false);
    expect(statuses.at(-1)).toContain('outside Object 1');
  });

  it('a fix during tracking cancels it and runs it again after, up to the halfway point', () => {
    editor.addTrack(14, { x: 50, y: 50 });
    const first = trackCall();
    editor.fixAt(1, 40, { x: 70, y: 50 });
    expect(analysis.cancels).toBeGreaterThan(0);
    expect(trackCall().req.select).toEqual({ x: 70, y: 50 });
    finishTrack();
    expect(trackCall().req.select).toEqual(first.req.select);
    expect(trackCall().req.times).toEqual(times(14, 28));
  });

  it('removing a fix clears its frames and hands them back', () => {
    editor.addTrack(14, { x: 50, y: 50 });
    finishTrack();
    editor.fixAt(1, 40, { x: 70, y: 50 });
    finishTrack();
    expect(editor.removeFixAt(1, 41)).toBe(true);
    expect(editor.hasShapeAt(1, 41)).toBe(false);
    expect(trackCall().req.times).toEqual(times(14, 44));
    expect(statuses).toContain('Removed the fix here.');
  });
});

describe('deleting', () => {
  it('cancels its tracking and drops its bar', () => {
    editor.addTrack(14, { x: 50, y: 50 });
    const before = analysis.cancels;
    editor.deleteTrack(1);
    expect(analysis.cancels).toBe(before + 1);
    expect(state.lanes).toEqual([]);
    expect(state.rows).toBe(0);
    expect(layers.specs).toEqual([]);
    expect(state.job).toBeNull();
  });
});

describe('impacts', () => {
  it('an impact is its own clip, hitting at the tapped frame, drawn by the renderer as a burst', () => {
    const id = editor.addImpact(20, { x: 50, y: 50 }, 'slam')!;
    const lane = state.lanes.find(l => l.id === id)!;
    expect(lane.kind).toBe('impact');
    expect(lane.impact).toBe('slam');
    expect(lane.range).toEqual({ s: 2, e: 2.7 });
    const spec = layers.specs.find(s => s.id === id)!;
    expect(spec.kind).toBe('impact');
    expect(spec.impacts).toEqual([{ id, i: 20, style: 'slam', tap: { i: 20, x: 50, y: 50 } }]);
  });

  it('tracks the object from a little before the hit to the end of the burst', () => {
    editor.addImpact(20, { x: 50, y: 50 }, 'punch');
    const c = trackCall();
    // impacts stay put in the scene, so the camera's path is worked out once for the clip
    expect(analysis.calls.filter(k => k.kind === 'camera')).toHaveLength(1);
    expect(layers.camera).toHaveLength(60);
    expect(layers.camera[30]).toEqual({ s: 1, tx: 0, ty: 0 });
    expect(c.req.times[0]).toBe(1.8);
    expect(c.req.times[c.req.times.length - 1]).toBe(2.4);
    expect(c.req.times[c.req.key]).toBe(2);
  });

  it('the next impact gets the last style chosen', () => {
    const a = editor.addImpact(20, { x: 50, y: 50 }, 'anime')!;
    const b = editor.addImpact(40, { x: 50, y: 50 })!;
    expect(state.lanes.find(l => l.id === b)!.impact).toBe('anime');
    editor.setImpactStyle(a, 'blast');
    expect(state.lanes.find(l => l.id === a)!.range).toEqual({ s: 2, e: 2.8 });
    expect(editor.impactStyle).toBe('blast');
  });

  it('moving an impact tracks the new moment, from where the object was tapped', () => {
    const id = editor.addImpact(20, { x: 50, y: 50 }, 'punch')!;
    finishTrack();
    editor.moveImpactTo(id, 3);
    expect(state.lanes[0].range.s).toBe(3);
    expect(layers.specs[0].impacts[0].i).toBe(30);
    const c = trackCall();
    expect(c.req.times[c.req.key]).toBe(2);
    expect(c.req.times[c.req.times.length - 1]).toBe(3.4);
  });

  it('stretching an impact slows its burst and tells the renderer its new length', () => {
    const id = editor.addImpact(20, { x: 50, y: 50 }, 'punch')!;
    finishTrack();
    editor.setRange(id, { e: 2.9 });
    editor.commitRange(id);
    const lane = state.lanes.find(l => l.id === id)!;
    expect(lane.speed).toBeCloseTo(0.5);
    expect(layers.specs[0].range).toEqual({ s: 2, e: 2.9 });
    // the new frames are tracked
    expect(trackCall().req.times.at(-1)).toBe(2.8);
  });

  it('impacts and effects stack on rows together', () => {
    editor.addTrack(0, { x: 10, y: 10 }); // 0..3
    editor.addImpact(20, { x: 20, y: 20 }, 'punch'); // 2..2.45, overlaps
    editor.addImpact(40, { x: 20, y: 20 }, 'punch'); // 4..4.45, free
    expect(state.lanes.map(l => l.row)).toEqual([0, 1, 0]);
  });
});

describe('body parts', () => {
  it('a probe goes ahead of tracking in progress, which then runs again', async () => {
    editor.addTrack(14, { x: 50, y: 50 });
    const cancels = analysis.cancels;
    const answer = editor.probe(20, { x: 30, y: 40 });
    const c = analysis.last;
    if (c.kind !== 'probe') throw new Error('expected a probe');
    expect(analysis.cancels).toBe(cancels + 1);
    expect(c.req).toEqual({ t: 2, at: { x: 30, y: 40 } });
    c.on.probed('handR');
    c.on.done();
    expect(await answer).toBe('handR');
    expect(trackCall().req.times).toEqual(times(14, 44)); // the interrupted tracking, again
  });

  it('a probe that misses a person answers null', async () => {
    const answer = editor.probe(20, { x: 0, y: 0 });
    const c = analysis.last;
    if (c.kind !== 'probe') throw new Error('expected a probe');
    c.on.probed(null);
    c.on.done();
    expect(await answer).toBeNull();
  });

  it('an effect on a body part tracks that part and is named after it', () => {
    editor.addTrack(14, { x: 50, y: 50 }, {}, 'eyes');
    expect(trackCall().req.part).toBe('eyes');
    expect(state.lanes[0].name).toBe('Eyes');
  });

  it('an impact on a body part tracks the part', () => {
    editor.addImpact(20, { x: 50, y: 50 }, 'punch', {}, 'handL');
    const c = trackCall();
    expect(c.req.part).toBe('handL');
    expect(state.lanes[0].name).toBe('Left hand');
  });
});

describe('lasers', () => {
  it('fires sideways by default, towards the side with more room', () => {
    editor.addTrack(14, { x: 10, y: 50 }, { effect: 'laser' });
    expect(layers.specs[0].aim).toEqual({ deg: 0, target: null });
    editor.addTrack(40, { x: 90, y: 50 }, { effect: 'laser' });
    expect(layers.specs[1].aim).toEqual({ deg: 180, target: null });
    expect(layers.specs[1].tap).toEqual({ i: 40, x: 90, y: 50 });
  });

  it('turns to a direction, kept between -180 and 180', () => {
    editor.addTrack(14, { x: 10, y: 50 }, { effect: 'laser' });
    editor.setAimAngle(1, 270);
    expect(layers.specs[0].aim.deg).toBe(-90);
  });

  it('can hit a tapped spot instead, which needs the camera path; clearing it goes back to its direction', () => {
    editor.addTrack(14, { x: 10, y: 50 }, { effect: 'laser' });
    editor.setAimAngle(1, 45);
    editor.aimAt(1, 20, { x: 70, y: 20 });
    expect(layers.specs[0].aim).toEqual({ deg: 45, target: { i: 20, x: 70, y: 20 } });
    // the camera's path is worked out once the laser's own tracking is done
    expect(analysis.calls.some(k => k.kind === 'camera')).toBe(false);
    finishTrack();
    expect(analysis.calls.some(k => k.kind === 'camera')).toBe(true);
    editor.clearAimTarget(1);
    expect(layers.specs[0].aim).toEqual({ deg: 45, target: null });
  });
});
