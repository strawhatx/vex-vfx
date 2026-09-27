import { beforeEach, describe, expect, it } from 'vitest';
import { FAMILY_STYLES } from '@/domain/effects/impacts';
import type { ClipFrame, Shape } from '@/domain/tracking/types';
import { Editor, type EditorState } from './editor';
import type { Analysis, EffectLayers, LayerSpec } from './ports';

// ---------- fakes ----------
type Call =
  | { kind: 'scan'; on: Parameters<Analysis['scan']>[2] }
  | { kind: 'track'; req: Parameters<Analysis['track']>[1]; on: Parameters<Analysis['track']>[2] }
  | { kind: 'probe'; req: Parameters<Analysis['probe']>[1]; on: Parameters<Analysis['probe']>[2] }
  | { kind: 'camera'; times: number[] }
  | { kind: 'cutout'; req: Parameters<Analysis['cutout']>[1]; on: Parameters<Analysis['cutout']>[2] };

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
  // the camera's path is worked out at once: it held still, or panned `pan` pixels a frame
  pan = 0;
  camera: Analysis['camera'] = (_s, times, on) => {
    this.calls.push({ kind: 'camera', times });
    on.path(times.map((_, i) => ({ i, s: 1, tx: i * this.pan, ty: 0 })));
    on.done();
  };
  cutout: Analysis['cutout'] = (_s, req, on) => {
    this.calls.push({ kind: 'cutout', req, on });
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
  cut = new Map<number, Map<number, unknown>>();
  cutoutFrames(id: number, frames: { i: number }[]) {
    const m = this.cut.get(id) ?? new Map();
    for (const f of frames) m.set(f.i, f);
    this.cut.set(id, m);
  }
  trimmed: { id: number; span: { s: number; e: number } }[] = [];
  trimCutout(id: number, span: { s: number; e: number }) {
    this.trimmed.push({ id, span });
  }
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

  it('a hit goes off at the tapped spot without tracking anything, pinned to the scene by the camera path', () => {
    const id = editor.addImpact(20, { x: 50, y: 50 }, 'punch')!;
    expect(analysis.calls.filter(k => k.kind === 'track')).toHaveLength(0);
    // impacts stay put in the scene, so the camera's path is worked out once for the clip
    expect(analysis.calls.filter(k => k.kind === 'camera')).toHaveLength(1);
    expect(layers.camera).toHaveLength(60);
    expect(layers.camera[30]).toEqual({ s: 1, tx: 0, ty: 0 });
    expect(editor.pinned(id)).toBe(true);
  });

  it('the next impact gets the last style chosen', () => {
    const a = editor.addImpact(20, { x: 50, y: 50 }, 'anime')!;
    const b = editor.addImpact(40, { x: 50, y: 50 })!;
    expect(state.lanes.find(l => l.id === b)!.impact).toBe('anime');
    editor.setImpactStyle(a, 'blast');
    expect(state.lanes.find(l => l.id === a)!.range).toEqual({ s: 2, e: 2.8 });
    expect(editor.impactStyle).toBe('blast');
  });

  it('moving an impact moves when it goes off, keeping its spot', () => {
    const id = editor.addImpact(20, { x: 50, y: 50 }, 'punch')!;
    editor.moveImpactTo(id, 3);
    expect(state.lanes[0].range.s).toBe(3);
    expect(layers.specs[0].impacts[0]).toMatchObject({ i: 30, tap: { i: 20, x: 50, y: 50 } });
  });

  it('stretching an impact slows its burst and tells the renderer its new length', () => {
    const id = editor.addImpact(20, { x: 50, y: 50 }, 'punch')!;
    editor.setRange(id, { e: 2.9 });
    editor.commitRange(id);
    const lane = state.lanes.find(l => l.id === id)!;
    expect(lane.speed).toBeCloseTo(0.5);
    expect(layers.specs[0].range).toEqual({ s: 2, e: 2.9 });
  });

  it('impacts and effects stack on rows together', () => {
    editor.addTrack(0, { x: 10, y: 10 }); // 0..3
    editor.addImpact(20, { x: 20, y: 20 }, 'punch'); // 2..2.45, overlaps
    editor.addImpact(40, { x: 20, y: 20 }, 'punch'); // 4..4.45, free
    expect(state.lanes.map(l => l.row)).toEqual([0, 1, 0]);
  });
  it('every style in every family can be added', () => {
    for (const st of Object.values(FAMILY_STYLES).flat()) {
      const id = editor.addImpact(20, { x: 50, y: 50 }, st)!;
      expect(state.lanes.find(l => l.id === id)!.impact).toBe(st);
    }
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
});

describe('outlines', () => {
  it('trace the tapped object in the style picked, which can be changed later', () => {
    const id = editor.addTrack(14, { x: 50, y: 50 }, { effect: 'outline', outline: 'glitch' })!;
    expect(trackCall().req.times).toEqual(times(14, 44));
    expect(layers.specs[0].settings).toMatchObject({ effect: 'outline', outline: 'glitch' });
    editor.setFx(id, { outline: 'pulse' });
    expect(layers.specs[0].settings.outline).toBe('pulse');
  });
});

describe('water', () => {
  it('rains round the tapped object (its drops bounce off it), or goes underwater', () => {
    const id = editor.addTrack(14, { x: 50, y: 50 }, { effect: 'water', water: 'rain' })!;
    expect(trackCall().req.times).toEqual(times(14, 44));
    expect(layers.specs[0].settings).toMatchObject({ effect: 'water', water: 'rain' });
    editor.setFx(id, { water: 'underwater' });
    expect(layers.specs[0].settings.water).toBe('underwater');
  });

  it('or over the whole frame, tracking nothing', () => {
    const id = editor.addSpotEffect(14, { x: 50, y: 50 }, { effect: 'water', water: 'rain' })!;
    expect(analysis.tracks).toBe(0);
    expect(state.lanes[0]).toMatchObject({ name: `Water ${id}`, pinned: true });
  });
});

describe('glitches', () => {
  it('glitch the tapped object in the style picked', () => {
    const id = editor.addTrack(14, { x: 50, y: 50 }, { effect: 'glitch', glitch: 'slices' })!;
    expect(trackCall().req.times).toEqual(times(14, 44));
    expect(layers.specs[0].settings).toMatchObject({ effect: 'glitch', glitch: 'slices' });
    editor.setFx(id, { glitch: 'vhs' });
    expect(layers.specs[0].settings.glitch).toBe('vhs');
  });

  it('or the whole frame, tracking nothing', () => {
    const id = editor.addSpotEffect(14, { x: 50, y: 50 }, { effect: 'glitch', glitch: 'rgb' })!;
    expect(analysis.tracks).toBe(0);
    expect(state.lanes[0]).toMatchObject({ name: `Glitch ${id}`, pinned: true });
    expect(layers.specs[0].pinned).toBe(true);
  });
});

describe('text', () => {
  it('behind or following an object tracks it, with the words and font picked', () => {
    const id = editor.addTrack(
      14,
      { x: 50, y: 50 },
      { effect: 'text', textStyle: 'behind', text: 'LEGEND' },
    )!;
    expect(trackCall().req.times).toEqual(times(14, 44));
    expect(layers.specs[0].settings).toMatchObject({ effect: 'text', textStyle: 'behind', text: 'LEGEND' });
    editor.setFx(id, { text: 'GOAT', font: 'bangers', textStyle: 'follow' });
    expect(layers.specs[0].settings).toMatchObject({ text: 'GOAT', font: 'bangers', textStyle: 'follow' });
  });

  it('a title goes at the tapped spot, tracking nothing', () => {
    const id = editor.addSpotEffect(14, { x: 50, y: 50 }, { effect: 'text', textStyle: 'title' })!;
    expect(analysis.tracks).toBe(0);
    expect(state.lanes[0]).toMatchObject({ name: `Text ${id}`, pinned: true });
  });
});

describe('effects from a spot', () => {
  const box = (i: number) => layers.specs[0].frames[i].shapes[0];

  it('sparks can come from the tapped spot: nothing tracked, a small box there all through', () => {
    const id = editor.addSpotEffect(14, { x: 30, y: 40 }, { effect: 'sparks' })!;
    expect(analysis.tracks).toBe(0);
    expect(analysis.calls.filter(k => k.kind === 'camera')).toHaveLength(1);
    const lane = state.lanes.find(l => l.id === id)!;
    expect(lane).toMatchObject({ name: `Spot ${id}`, pinned: true, range: { s: 1.4, e: 4.4 } });
    expect(editor.pinned(id)).toBe(true);
    expect(box(14)).toMatchObject({ cx: 30, cy: 40, w: 5, h: 5 });
    expect(box(43)).toMatchObject({ cx: 30, cy: 40 });
    expect(box(13)).toBeUndefined();
    expect(box(44)).toBeUndefined();
  });

  it('stays put in the scene as the camera pans', () => {
    analysis.pan = 2;
    editor.addSpotEffect(14, { x: 30, y: 40 }, { effect: 'sparks' });
    expect(box(14)!.cx).toBe(30);
    expect(box(20)!.cx).toBe(42); // the camera moved 12 pixels between the two
  });

  it('a tap moves it, and stretching it covers the new frames, still without tracking', () => {
    const id = editor.addSpotEffect(14, { x: 30, y: 40 }, { effect: 'sparks' })!;
    expect(editor.fixAt(id, 30, { x: 70, y: 20 })).toBe(true);
    expect(box(30)).toMatchObject({ cx: 70, cy: 20 });
    editor.setRange(id, { e: 5 });
    editor.commitRange(id);
    expect(box(48)).toMatchObject({ cx: 70, cy: 20 });
    expect(analysis.tracks).toBe(0);
    expect(editor.removeFixAt(id, 30)).toBe(false);
  });

  it('only for effects that can come from a spot', () => {
    expect(editor.addSpotEffect(14, { x: 30, y: 40 }, { effect: 'fire' })).toBeNull();
    expect(state.lanes).toHaveLength(0);
  });
});

describe('lasers', () => {
  it('fires sideways by default, towards the side with more room', () => {
    editor.addTrack(14, { x: 10, y: 50 }, { effect: 'laser' });
    expect(layers.specs[0].aim).toEqual({ h: 90, v: 0, target: null });
    editor.addTrack(40, { x: 90, y: 50 }, { effect: 'laser' });
    expect(layers.specs[1].aim).toEqual({ h: -90, v: 0, target: null });
    expect(layers.specs[1].tap).toEqual({ i: 40, x: 90, y: 50 });
  });

  it('turns left-right and up-down separately, kept in range', () => {
    editor.addTrack(14, { x: 10, y: 50 }, { effect: 'laser' });
    editor.setAim(1, { h: 0 }); // at the camera
    editor.setAim(1, { v: -12 }); // a little up
    expect(layers.specs[0].aim).toMatchObject({ h: 0, v: -12 });
    editor.setAim(1, { h: 270, v: 200 });
    expect(layers.specs[0].aim).toMatchObject({ h: -90, v: 90 });
  });

  it('can hit a tapped spot instead, which needs the camera path; clearing it goes back to its direction', () => {
    editor.addTrack(14, { x: 10, y: 50 }, { effect: 'laser' });
    editor.setAim(1, { h: 45, v: 10 });
    editor.aimAt(1, 20, { x: 70, y: 20 });
    expect(layers.specs[0].aim).toEqual({ h: 45, v: 10, target: { i: 20, x: 70, y: 20 } });
    // the camera's path is worked out once the laser's own tracking is done
    expect(analysis.calls.some(k => k.kind === 'camera')).toBe(false);
    finishTrack();
    expect(analysis.calls.some(k => k.kind === 'camera')).toBe(true);
    editor.clearAimTarget(1);
    expect(layers.specs[0].aim).toEqual({ h: 45, v: 10, target: null });
  });
});

describe('explosions', () => {
  it('go off at the tapped spot without tracking anything, pinned to the scene by the camera path', () => {
    const id = editor.addImpact(20, { x: 30, y: 40 }, 'fireball')!;
    expect(analysis.calls.filter(k => k.kind === 'track')).toHaveLength(0);
    expect(analysis.calls.filter(k => k.kind === 'camera')).toHaveLength(1);
    const lane = state.lanes.find(l => l.id === id)!;
    expect(lane.name).toBe(`Explosion ${id}`);
    expect(lane.range).toEqual({ s: 2, e: 3.6 });
    expect(layers.specs[0].impacts).toEqual([{ id, i: 20, style: 'fireball', tap: { i: 20, x: 30, y: 40 } }]);
    expect(editor.pinned(id)).toBe(true);
  });

  it('can be exported on their own: nothing to follow, but something to draw from the moment they go off', () => {
    editor.addImpact(20, { x: 30, y: 40 }, 'grenade');
    expect(state.hasEffects).toBe(true);
    expect(editor.firstEffectTime()).toBe(2);
  });

  it('a tap while one is selected moves it there, still without tracking', () => {
    const id = editor.addImpact(20, { x: 30, y: 40 }, 'fireball')!;
    expect(editor.fixAt(id, 35, { x: 80, y: 10 })).toBe(true);
    expect(layers.specs[0].impacts[0].tap).toEqual({ i: 35, x: 80, y: 10 });
    expect(analysis.calls.filter(k => k.kind === 'track')).toHaveLength(0);
    // and there are no fixes to remove
    expect(editor.removeFixAt(id, 35)).toBe(false);
  });

  it('moving or stretching one needs no tracking', () => {
    const id = editor.addImpact(20, { x: 30, y: 40 }, 'bigboom')!;
    editor.moveImpactTo(id, 4);
    editor.setRange(id, { e: 5.9 });
    editor.commitRange(id);
    expect(analysis.calls.filter(k => k.kind === 'track')).toHaveLength(0);
    expect(state.lanes[0].range.s).toBe(4); // moved
  });
});

// ---------- the footage ----------

function cutoutCall() {
  const c = analysis.last;
  if (c.kind !== 'cutout') throw new Error(`expected a cutout job, got ${c.kind}`);
  return c;
}

describe('splitting the film', () => {
  it('splits into two films at the frame shown', () => {
    expect(editor.split(20)).toBe(true);
    expect(state.scenes).toEqual([
      { s: 0, e: 2, at: 0 },
      { s: 2, e: 6, at: 2 },
    ]);
    expect(editor.sceneAt(2.5)).toBe(1);
  });

  it('won’t split right at the edge of a film', () => {
    expect(editor.split(0)).toBe(false);
    expect(state.scenes).toHaveLength(1);
    expect(statuses.at(-1)).toContain('Too close');
  });

  it('new clips stay inside the film they’re added in', () => {
    editor.split(20);
    editor.addTrack(10, { x: 50, y: 50 });
    expect(state.lanes[0].range).toEqual({ s: 1, e: 2 });
  });
});

describe('cutting an object out', () => {
  it('tracks the object first, then cuts it out along its outlines', () => {
    const id = editor.addCutout(14, { x: 50, y: 50 }, 'keep')!;
    expect(trackCall().req.times).toEqual(times(14, 44));
    finishTrack();
    const c = cutoutCall();
    expect(c.req.times).toEqual(times(14, 44));
    expect(c.req.plate).toBe(false);
    expect(state.lanes[0]).toMatchObject({ kind: 'cutout', name: 'Cutout 1', range: { s: 1.4, e: 4.4 } });
    expect(state.cutRows).toBe(1);
    expect(state.rows).toBe(0);
    // frames come back numbered by clip frame
    c.on.frames([{ i: 0, cut: null }]);
    expect(layers.cut.get(id)?.has(14)).toBe(true);
  });

  it('removing the object waits for the camera’s path, to line up the frames around', () => {
    editor.addCutout(14, { x: 50, y: 50 }, 'clean');
    finishTrack();
    expect(analysis.calls.some(k => k.kind === 'camera')).toBe(true);
    const c = cutoutCall();
    expect(c.req.plate).toBe(true);
    expect(c.req.cam).toHaveLength(30);
    expect(c.req.cam[0]).toEqual({ s: 1, tx: 0, ty: 0 });
  });

  it('a fix while cutting out stops it, tracks, then cuts out again', () => {
    editor.addCutout(14, { x: 50, y: 50 }, 'keep');
    finishTrack();
    cutoutCall();
    const cancels = analysis.cancels;
    editor.fixAt(1, 30, { x: 60, y: 50 });
    expect(analysis.cancels).toBeGreaterThan(cancels);
    finishTrack();
    expect(cutoutCall().req.times).toEqual(times(14, 44));
  });

  it('choosing to remove the object later cuts it out again, with the background', () => {
    editor.addCutout(14, { x: 50, y: 50 }, 'keep');
    finishTrack();
    cutoutCall().on.done();
    editor.setBackground(1, 'clean');
    expect(cutoutCall().req.plate).toBe(true);
    expect(layers.specs[0].cutout?.bg).toBe('clean');
  });

  it('can be placed at another time without cutting it out again', () => {
    editor.addCutout(14, { x: 50, y: 50 }, 'keep');
    finishTrack();
    cutoutCall().on.done();
    const calls = analysis.calls.length;
    editor.placeAt(1, 5);
    // it's 3 s long, so it can start at 3 s at the latest
    expect(state.lanes[0].range.s).toBeCloseTo(3);
    expect(state.lanes[0].range.e).toBeCloseTo(6);
    expect(state.lanes[0].cutout?.from).toBe(1.4);
    expect(analysis.calls.length).toBe(calls);
    expect(editor.cutoutShowing(1, 45)).toBe(true);
    expect(editor.cutoutShowing(1, 20)).toBe(false);
  });

  it('its ends are where it’s placed, and change the frames it’s cut from to match', () => {
    editor.addCutout(14, { x: 50, y: 50 }, 'keep');
    finishTrack();
    cutoutCall().on.done();
    editor.placeAt(1, 2.4); // one second later than cut from
    editor.setRange(1, { s: 2.9 });
    expect(state.lanes[0].range.s).toBeCloseTo(2.9);
    expect(state.lanes[0].cutout?.from).toBeCloseTo(1.9);
    editor.commitRange(1);
    expect(cutoutCall().req.times).toEqual(times(19, 44));
  });

  it('moves and animates with keyframes', () => {
    editor.addCutout(14, { x: 50, y: 50 }, 'keep');
    editor.setTransform(1, 1.4, { x: 10 });
    expect(editor.transformAt(1, 3)).toMatchObject({ x: 10 });
    editor.toggleMoveKey(1, 1.4);
    editor.setTransform(1, 2.4, { x: 30 });
    expect(editor.moveKeyAt(1, 2.4)).toBe(true);
    expect(state.lanes[0].cutout?.moves).toEqual([1.4, 2.4]);
    expect(editor.transformAt(1, 1.9)?.x).toBeCloseTo(20);
  });

  it('is selected by tapping it where it’s placed', () => {
    editor.addCutout(14, { x: 50, y: 50 }, 'keep');
    finishTrack();
    editor.setTransform(1, 1.4, { x: 30 });
    expect(editor.trackAt(20, { x: 80, y: 50 })).toBe(1);
    expect(editor.trackAt(20, { x: 50, y: 50 })).toBe(null);
  });

  it('deleting it stops cutting it out', () => {
    editor.addCutout(14, { x: 50, y: 50 }, 'keep');
    finishTrack();
    cutoutCall();
    const cancels = analysis.cancels;
    editor.deleteTrack(1);
    expect(analysis.cancels).toBeGreaterThan(cancels);
    expect(layers.specs).toEqual([]);
  });
});

// ---------- paths ----------

describe('paths', () => {
  const line = [
    { x: 10, y: 10 },
    { x: 30, y: 20 },
    { x: 50, y: 10 },
  ];

  it('a drawn path stays put in the scene: nothing to track, but it needs the camera’s path', () => {
    const id = editor.addDrawnPath(14, line, { strand: { ...editor.fx(null).strand, form: 'rope' } })!;
    expect(analysis.tracks).toBe(0);
    expect(analysis.calls.some(k => k.kind === 'camera')).toBe(true);
    expect(state.lanes[0]).toMatchObject({ name: 'Path 1', pinned: true, path: { drawn: true, end: false } });
    expect(editor.fx(id)).toMatchObject({ effect: 'path', strand: { form: 'rope' } });
    expect(layers.specs[0].path?.drawn).toEqual({ i: 14, pts: line });
  });

  it('a tap moves a drawn path, keeping its shape; drawing it again replaces it', () => {
    const id = editor.addDrawnPath(14, line)!;
    editor.fixAt(id, 20, { x: 60, y: 60 });
    expect(layers.specs[0].path?.drawn).toEqual({
      i: 20,
      pts: [
        { x: 60, y: 60 },
        { x: 80, y: 70 },
        { x: 100, y: 60 },
      ],
    });
    editor.redrawPath(id, 25, line.slice(0, 2));
    expect(layers.specs[0].path?.drawn).toEqual({ i: 25, pts: line.slice(0, 2) });
    expect(layers.specs[0].tap).toEqual({ i: 25, ...line[0] });
  });

  it('a path on an object is tracked like any effect', () => {
    editor.addTrack(14, { x: 50, y: 50 }, { effect: 'path' });
    expect(trackCall().req.times).toEqual(times(14, 44));
    expect(state.lanes[0].path).toEqual({ drawn: false, end: false });
  });

  it('its far end holds on to another clip’s object, or a spot in the scene', () => {
    editor.addTrack(14, { x: 50, y: 50 }, { effect: 'path' });
    finishTrack();
    editor.addTrack(14, { x: 20, y: 20 }, { effect: 'fire' });
    finishTrack();
    // the second object's box is 20 x 40 around (50, 50) too: tap its middle
    editor.setPathEnd(1, 20, { x: 50, y: 50 });
    expect(layers.specs[0].path?.end).toEqual({ i: 20, x: 50, y: 50, clip: 2 });
    expect(statuses.at(-1)).toContain('holds on to Object 2');
    // somewhere else: a spot in the scene
    editor.setPathEnd(1, 20, { x: 90, y: 5 });
    expect(layers.specs[0].path?.end?.clip).toBeNull();
    editor.freePathEnd(1);
    expect(layers.specs[0].path?.end).toBeNull();
  });

  it('deleting what its end holds on to leaves the end held where it was', () => {
    editor.addTrack(14, { x: 50, y: 50 }, { effect: 'path' });
    finishTrack();
    editor.addTrack(14, { x: 20, y: 20 }, { effect: 'fire' });
    finishTrack();
    editor.setPathEnd(1, 20, { x: 50, y: 50 });
    editor.deleteTrack(2);
    expect(layers.specs[0].path?.end).toEqual({ i: 20, x: 50, y: 50, clip: null });
  });
});

// ---------- deleting films ----------

describe('deleting a film', () => {
  it('leaves it out: the films either side play back to back', () => {
    editor.split(20);
    editor.split(40);
    expect(editor.deleteScene(1)).toBe(true);
    expect(state.scenes).toEqual([
      { s: 0, e: 2, at: 0 },
      { s: 4, e: 6, at: 2 },
    ]);
    expect(state.length).toBe(4);
    // times outside are the film as edited
    expect(editor.frameAt(2.5)).toBe(45);
    expect(editor.toProgram(4.5)).toBe(2.5);
    expect(editor.jumpFrom(2)).toBe(4);
    expect(editor.jumpFrom(1)).toBeNull();
  });

  it('won’t delete the only film', () => {
    expect(editor.deleteScene(0)).toBe(false);
    expect(statuses.at(-1)).toContain('only film');
  });

  it('what’s on it stays in the project, unseen; a clip running over it closes up round it', () => {
    editor.split(20);
    editor.split(40);
    editor.addTrack(25, { x: 50, y: 50 }); // 2.5 .. 4: wholly in the middle film
    editor.addTrack(10, { x: 50, y: 50 }); // 1 .. 2
    editor.setRange(2, { e: 5 }); // on over the middle film into the last (nothing's deleted yet)
    editor.deleteScene(1);
    expect(state.lanes.map(l => l.id)).toEqual([2]);
    // the clip's 5 plays at 3 once the middle film is gone
    expect(state.lanes[0].range).toEqual({ s: 1, e: 3 });
    expect(layers.specs.map(s => s.id)).toEqual([1, 2]);
  });

  it('dragging a clip’s end on the edited timeline sets it in the clip’s own time', () => {
    editor.split(20);
    editor.split(40);
    editor.deleteScene(1);
    editor.addTrack(10, { x: 50, y: 50 });
    editor.setRange(1, { e: 3 }); // program 3 = the clip's 5
    expect(layers.specs[0].range).toEqual({ s: 1, e: 5 });
    expect(state.lanes[0].range).toEqual({ s: 1, e: 3 });
    // ending right at the join ends at the end of the first film, not the start of the next
    editor.setRange(1, { e: 2 });
    expect(layers.specs[0].range.e).toBe(2);
  });
});

// ---------- undo ----------

describe('undo and redo', () => {
  it('undoes and redoes adding a clip', () => {
    expect(state.canUndo).toBe(false);
    editor.addTrack(14, { x: 50, y: 50 });
    finishTrack();
    expect(state.canUndo).toBe(true);
    expect(editor.undo()).toBe(true);
    expect(state.lanes).toEqual([]);
    expect(layers.specs).toEqual([]);
    expect(state.canRedo).toBe(true);
    editor.redo();
    expect(state.lanes.map(l => l.id)).toEqual([1]);
    // the tracking came back with it
    expect(editor.hasShapeAt(1, 20)).toBe(true);
  });

  it('a new change clears what could be redone', () => {
    editor.addTrack(14, { x: 50, y: 50 });
    editor.undo();
    editor.addTrack(20, { x: 50, y: 50 });
    expect(state.canRedo).toBe(false);
    expect(editor.redo()).toBe(false);
  });

  it('undoes splitting and deleting films', () => {
    editor.split(20);
    editor.deleteScene(0);
    expect(state.scenes).toHaveLength(1);
    editor.undo();
    expect(state.scenes).toHaveLength(2);
    editor.undo();
    expect(state.scenes).toHaveLength(1);
    expect(state.scenes[0]).toEqual({ s: 0, e: 6, at: 0 });
  });

  it('a drag is one step, however many moves it takes', () => {
    editor.addTrack(14, { x: 50, y: 50 });
    finishTrack();
    editor.setRange(1, { e: 5 });
    editor.setRange(1, { e: 5.2 });
    editor.setRange(1, { e: 5.4 });
    editor.commitRange(1);
    editor.undo();
    expect(state.lanes[0].range).toEqual({ s: 1.4, e: 4.4 });
  });

  it('slider changes to one setting are one step', () => {
    editor.addTrack(14, { x: 50, y: 50 });
    editor.setFx(1, { size: 1.2 });
    editor.setFx(1, { size: 1.5 });
    editor.setFx(1, { pal: 3 });
    editor.undo();
    expect(editor.fx(1)).toMatchObject({ size: 1.5, pal: 0 });
    editor.undo();
    expect(editor.fx(1).size).toBe(1);
  });

  it('undoing a fix stops its tracking and puts the old outlines back', () => {
    editor.addTrack(14, { x: 50, y: 50 });
    finishTrack();
    editor.fixAt(1, 40, { x: 70, y: 50 });
    const fix = trackCall();
    editor.undo();
    // the old tracking is back, and nothing new is asked for
    expect(editor.hasShapeAt(1, 40)).toBe(true);
    const calls = analysis.calls.length;
    fix.on.done(); // too late: it was cancelled
    expect(analysis.calls.length).toBe(calls);
  });

  it('tracking still to do when a step was taken carries on after undoing back to it', () => {
    editor.addTrack(14, { x: 50, y: 50 }); // tracking starts
    editor.setFx(1, { pal: 2 });
    editor.undo();
    expect(trackCall().req.times).toEqual(times(14, 44));
  });

  it('a cutout whose outlines changed is cut out again', () => {
    editor.addCutout(14, { x: 50, y: 50 }, 'keep');
    finishTrack();
    cutoutCall().on.done();
    editor.fixAt(1, 30, { x: 60, y: 50 });
    finishTrack();
    cutoutCall().on.done();
    editor.undo();
    expect(cutoutCall().req.times).toEqual(times(14, 44));
  });

  it('a new clip forgets it all', () => {
    editor.addTrack(14, { x: 50, y: 50 });
    editor.load(new Blob());
    expect(state.canUndo).toBe(false);
  });
});
