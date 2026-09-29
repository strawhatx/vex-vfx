import { beforeEach, describe, expect, it } from 'vitest';
import { FAMILY_STYLES } from '@/domain/effects/impacts';
import { encodeRle, type ClipFrame, type Shape } from '@/domain/tracking/types';
import { Editor, type EditorState } from './editor';
import { FakeAnalysis, FakeLayers } from './fakes';

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

describe('moving clips between rows', () => {
  it('a clip moved down stays there, with room left above it', () => {
    editor.addTrack(0, { x: 10, y: 10 }); // 0..3
    editor.addTrack(30, { x: 20, y: 20 }); // 3..6
    editor.moveToRow(2, 1);
    expect(state.lanes.map(l => l.row)).toEqual([0, 1]);
    expect(state.rows).toBe(2);
    // and stays there when something else changes
    editor.setFx(1, { pal: 3 });
    expect(state.lanes.map(l => l.row)).toEqual([0, 1]);
  });

  it('moved onto a row where it overlaps something, it goes to the next free one', () => {
    editor.addTrack(0, { x: 10, y: 10 });
    editor.addTrack(10, { x: 20, y: 20 });
    editor.addTrack(40, { x: 30, y: 30 });
    // 3 overlaps nothing on row 0 after 1 ends; 2 overlaps 1, so it can't go up
    editor.moveToRow(2, 0);
    expect(state.lanes.find(l => l.id === 2)?.row).toBe(1);
  });

  it('moved above the top, it gets a new row of its own; undo puts it back', () => {
    editor.addTrack(0, { x: 10, y: 10 });
    editor.addTrack(30, { x: 20, y: 20 });
    editor.moveToRow(2, -1);
    expect(state.lanes.map(l => l.row)).toEqual([1, 0]);
    editor.undo();
    expect(state.lanes.map(l => l.row)).toEqual([0, 0]);
  });
});

describe('duplicating a clip', () => {
  it('copies it onto the row below, same look, timing and tracking', () => {
    editor.addTrack(14, { x: 50, y: 50 }, { effect: 'lightning' });
    finishTrack();
    const tracks = analysis.tracks;
    const id = editor.duplicate(1)!;
    expect(id).toBe(2);
    expect(analysis.tracks).toBe(tracks); // nothing tracked again
    expect(state.lanes.map(l => [l.name, l.row, l.range])).toEqual([
      ['Object 1', 0, { s: 1.4, e: 4.4 }],
      ['Object 2', 1, { s: 1.4, e: 4.4 }],
    ]);
    expect(editor.fx(2).effect).toBe('lightning');
    expect(layers.specs[1].frames[20].shapes[0]?.id).toBe(2);
  });

  it('a copy of one still being tracked is tracked too', () => {
    editor.addTrack(14, { x: 50, y: 50 });
    editor.duplicate(1);
    finishTrack();
    expect(trackCall().req.times).toEqual(times(14, 44));
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

  it('text has a layer of its own on the timeline', () => {
    editor.addTrack(14, { x: 50, y: 50 }, { effect: 'fire' });
    editor.addTrack(14, { x: 50, y: 50 }, { effect: 'text', text: 'HI' });
    // both on the first row of their own layers, though they overlap
    expect(state.lanes.map(l => l.row)).toEqual([0, 0]);
    expect([state.rows, state.textRows]).toEqual([1, 1]);
  });

  it('an effect on a body part tracks that part and is named after it', () => {
    editor.addTrack(14, { x: 50, y: 50 }, {}, 'eyes');
    expect(trackCall().req.part).toBe('eyes');
    expect(state.lanes[0].name).toBe('Eyes');
  });

  it('an effect on the whole body follows the whole person', () => {
    editor.addTrack(14, { x: 50, y: 50 }, {}, 'body');
    expect(trackCall().req.part).toBe('body');
    expect(state.lanes[0].name).not.toBe('Whole body');
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

// a cutout, its outlines checked (so it's cut out once tracked)
function checked(id: number) {
  editor.startReview(id);
  editor.finishReview();
  return id;
}

function cutoutCall() {
  const c = analysis.last;
  if (c.kind !== 'cutout') throw new Error(`expected a cutout job, got ${c.kind}`);
  return c;
}

describe('splitting the film', () => {
  it('splits into two films at the frame shown', () => {
    expect(editor.split(20)).toBe(true);
    expect(state.scenes).toMatchObject([
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
  it('with a box drawn round it, looks for it only in a box that size', () => {
    editor.addCutout(14, { x: 50, y: 50 }, 'keep', { w: 30, h: 60 });
    expect(trackCall().req.focus).toEqual({ w: 30, h: 60 });
    // fixed later with a tap, it's still looked for in a box that size
    finishTrack();
    editor.fixAt(1, 30, { x: 55, y: 50 });
    expect(trackCall().req.focus).toEqual({ w: 30, h: 60 });
  });

  it('tapped, it looks for it anywhere', () => {
    editor.addCutout(14, { x: 50, y: 50 }, 'keep');
    expect(trackCall().req.focus).toBeUndefined();
  });

  it('a person tapped is cut out whole; an effect follows just what was tapped', () => {
    editor.addCutout(14, { x: 50, y: 50 }, 'keep');
    expect(trackCall().req.wholePerson).toBe(true);
    finishTrack();
    editor.addTrack(14, { x: 50, y: 50 });
    expect(trackCall().req.wholePerson).toBeUndefined();
  });

  it('tracks the object first, then cuts it out along its outlines', () => {
    const id = checked(editor.addCutout(14, { x: 50, y: 50 }, 'keep')!);
    expect(trackCall().req.times).toEqual(times(14, 44));
    finishTrack();
    const c = cutoutCall();
    expect(c.req.times).toEqual(times(14, 44));
    expect(c.req.plate).toBe(false);
    // what's cut is the film's (see project.ts): the video lists no clip for it
    expect(state.lanes).toEqual([]);
    expect(editor.cutoutOf(id)).toMatchObject({ range: { s: 1.4, e: 4.4 }, bg: 'keep' });
    // the object in each frame cut, as fractions of the frame
    expect(editor.cutoutOf(id)?.frames[0]).toEqual({ t: 1.4, cx: 0.5, cy: 0.5, w: 0.2, h: 0.4 });
    // frames come back numbered by clip frame
    c.on.frames([{ i: 0, cut: null }]);
    expect(layers.cut.get(id)?.has(14)).toBe(true);
  });

  it('removing the object waits for the camera’s path, to line up the frames around', () => {
    checked(editor.addCutout(14, { x: 50, y: 50 }, 'clean')!);
    finishTrack();
    expect(analysis.calls.some(k => k.kind === 'camera')).toBe(true);
    const c = cutoutCall();
    expect(c.req.plate).toBe(true);
    expect(c.req.cam).toHaveLength(30);
    expect(c.req.cam[0]).toEqual({ s: 1, tx: 0, ty: 0 });
  });

  it('a fix while cutting out stops it, tracks, then cuts out again', () => {
    checked(editor.addCutout(14, { x: 50, y: 50 }, 'keep')!);
    finishTrack();
    cutoutCall();
    const cancels = analysis.cancels;
    editor.fixAt(1, 30, { x: 60, y: 50 });
    expect(analysis.cancels).toBeGreaterThan(cancels);
    finishTrack();
    expect(cutoutCall().req.times).toEqual(times(14, 44));
  });

  it('choosing to remove the object later cuts it out again, with the background', () => {
    checked(editor.addCutout(14, { x: 50, y: 50 }, 'keep')!);
    finishTrack();
    cutoutCall().on.done();
    editor.setBackground(1, 'clean');
    expect(cutoutCall().req.plate).toBe(true);
    expect(layers.specs[0].cutout?.bg).toBe('clean');
  });

  it('isn’t cut out until its outlines are checked', () => {
    const id = editor.addCutout(14, { x: 50, y: 50 }, 'keep')!;
    finishTrack();
    expect(analysis.calls.some(k => k.kind === 'cutout')).toBe(false);
    const r = editor.reviewOf(id)!;
    expect([r.s, r.e]).toEqual([14, 44]);
    expect(r.keys).toEqual([14]);
    expect(r.flags).toHaveLength(30);
    editor.startReview(id);
    editor.finishReview();
    expect(cutoutCall().req.times).toEqual(times(14, 44));
  });

  it('fixes made while checking it again are cut out once, when done', () => {
    const id = checked(editor.addCutout(14, { x: 50, y: 50 }, 'keep')!);
    finishTrack();
    cutoutCall().on.done();
    editor.startReview(id);
    editor.fixAt(id, 30, { x: 60, y: 50 });
    finishTrack();
    expect(analysis.last.kind).toBe('track');
    editor.finishReview();
    expect(cutoutCall().req.times).toEqual(times(14, 44));
  });

  it('checked again with nothing changed, it isn’t cut out again', () => {
    const id = checked(editor.addCutout(14, { x: 50, y: 50 }, 'keep')!);
    finishTrack();
    cutoutCall().on.done();
    const calls = analysis.calls.length;
    editor.startReview(id);
    editor.finishReview();
    expect(analysis.calls.length).toBe(calls);
  });

  it('a piece tapped is followed through all its frames and added to the outline', () => {
    const id = editor.addCutout(14, { x: 50, y: 50 }, 'keep')!;
    finishTrack();
    expect(editor.addPart(id, 30, 'add', { at: { x: 80, y: 50 } })).toBe(true);
    const c = trackCall();
    // the piece itself, over all the cutout's frames, from where it was tapped
    expect(c.req).toMatchObject({ select: { x: 80, y: 50 }, key: 16, times: times(14, 44) });
    expect(c.req.wholePerson).toBeUndefined();
    const m = new Uint8Array(100 * 100);
    for (let y = 45; y < 55; y++) m.fill(1, y * 100 + 75, y * 100 + 85);
    c.on.shapes([
      { i: 16, shape: { id: 0, cx: 80, cy: 50, w: 10, h: 10, mask: encodeRle(m, 100, 75, 45, 84, 54) } },
    ]);
    c.on.done();
    const at = (t: number) => editor.cutoutOf(id)!.frames.find(f => Math.abs(f.t - t) < 1e-6);
    // what was there stays (40..60), with the piece (75..84) added
    expect(at(3)?.w).toBeCloseTo(0.45, 2);
    expect(at(2)?.w).toBeCloseTo(0.2, 2);
  });

  it('a loop drawn takes a piece out, carried along; it’s cut out once checked', () => {
    const id = editor.addCutout(14, { x: 50, y: 50 }, 'keep')!;
    finishTrack();
    const calls = analysis.calls.length;
    const top = [
      { x: 30, y: 20 },
      { x: 70, y: 20 },
      { x: 70, y: 50 },
      { x: 30, y: 50 },
    ];
    expect(editor.addPart(id, 30, 'remove', { loop: top })).toBe(true);
    expect(analysis.calls.length).toBe(calls); // nothing to track
    const at = (t: number) => editor.cutoutOf(id)!.frames.find(f => Math.abs(f.t - t) < 1e-6);
    // the object was 30..70 high: now 50..70
    expect(at(3)?.h).toBeCloseTo(0.2, 2);
    expect(at(1.4)?.h).toBeCloseTo(0.2, 2);
    editor.startReview(id);
    editor.finishReview();
    expect(cutoutCall().req.masks[16]).not.toBeNull();
  });

  it('edge settings reshape its outline, soften the cut, and are one step to undo while dragged', () => {
    const id = editor.addCutout(14, { x: 50, y: 50 }, 'keep')!;
    const m = new Uint8Array(100 * 100);
    for (let y = 30; y < 70; y++) m.fill(1, y * 100 + 40, y * 100 + 60);
    const c = trackCall();
    c.on.shapes(
      c.req.times.map((_, i) => ({ i, shape: { ...shape(), mask: encodeRle(m, 100, 40, 30, 59, 69) } })),
    );
    c.on.done();
    const w = () => editor.cutoutOf(id)!.frames.find(f => Math.abs(f.t - 3) < 1e-6)!.w;
    expect(w()).toBeCloseTo(0.2, 2);
    editor.setEdge(id, { grow: 1 });
    editor.setEdge(id, { grow: 2 });
    expect(w()).toBeCloseTo(0.24, 2);
    expect(editor.reviewOf(id)?.edge.grow).toBe(2);
    editor.setEdge(id, { feather: 6 });
    checked(id);
    expect(cutoutCall().req.feather).toBe(6);
    editor.undo(); // (the feather)
    editor.undo(); // (both grows)
    expect(w()).toBeCloseTo(0.2, 2);
  });

  it('undoing a piece puts the outline back', () => {
    const id = editor.addCutout(14, { x: 50, y: 50 }, 'keep')!;
    finishTrack();
    editor.addPart(id, 30, 'remove', {
      loop: [
        { x: 0, y: 0 },
        { x: 99, y: 0 },
        { x: 99, y: 99 },
      ],
    });
    editor.undo();
    expect(editor.cutoutOf(id)?.frames.find(f => Math.abs(f.t - 3) < 1e-6)?.h).toBeCloseTo(0.4, 2);
  });

  it('deleting it stops cutting it out', () => {
    checked(editor.addCutout(14, { x: 50, y: 50 }, 'keep')!);
    finishTrack();
    cutoutCall();
    const cancels = analysis.cancels;
    editor.deleteTrack(1);
    expect(analysis.cancels).toBeGreaterThan(cancels);
    expect(layers.specs).toEqual([]);
  });
});

// ---------- deleting films ----------

describe('the speed of a film', () => {
  it('plays it faster or slower: the film and what’s on it close up or stretch to match', () => {
    editor.split(20);
    editor.addTrack(30, { x: 50, y: 50 }); // 3.0 to 6.0, in the second film
    expect(editor.setSpeed(1, 2, false)).toBe(true);
    expect(state.scenes).toMatchObject([
      { s: 0, e: 2, at: 0, speed: 1 },
      { s: 2, e: 6, at: 2, speed: 2 },
    ]);
    expect(state.length).toBe(4);
    expect(state.lanes[0].range).toEqual({ s: 2.5, e: 4 });
    expect(editor.speedAt(3)).toEqual({ speed: 2, pitch: false });
    // split again, both halves keep the speed; undo goes back
    editor.split(40);
    expect(state.scenes.map(p => p.speed)).toEqual([1, 2, 2]);
    editor.undo();
    editor.undo();
    expect(state.length).toBe(6);
  });
});

describe('deleting a film', () => {
  it('leaves it out: the films either side play back to back', () => {
    editor.split(20);
    editor.split(40);
    expect(editor.deleteScene(1)).toBe(true);
    expect(state.scenes).toMatchObject([
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

  it('can delete every film, leaving nothing to play; undo brings it back', () => {
    expect(editor.deleteScene(0)).toBe(true);
    expect(state).toMatchObject({ scenes: [], length: 0, scanned: true });
    editor.undo();
    expect(state.length).toBe(6);
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
    expect(state.scenes[0]).toMatchObject({ s: 0, e: 6, at: 0 });
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
    checked(editor.addCutout(14, { x: 50, y: 50 }, 'keep')!);
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
