import { beforeEach, describe, expect, it } from 'vitest';
import type { ClipFrame, Shape } from '@/domain/tracking/types';
import { presetById } from '@/domain/effects/library';
import { MY_OWN, addPass, blankEffect, setParam } from '@/domain/effects/custom';
import { FakeAnalysis, FakeLayers, FakePictures } from './fakes';
import { Project, REEL_IDS, type ProjectState } from './project';

// each video gets its own fake analysis and drawing
let analyses: Map<number, FakeAnalysis>,
  layers: Map<number, FakeLayers>,
  pictures: FakePictures,
  project: Project,
  state: ProjectState;

const clipOf = (seconds: number): ClipFrame[] =>
  Array.from({ length: Math.round(seconds * 10) }, (_, i) => ({ t: i / 10, dur: 0.1 }));
const shape = (): Shape => ({ id: 0, cx: 50, cy: 25, w: 20, h: 40 });

// adds a video `seconds` long (10 fps, 100 x 100) and lists its frames
function addVideo(seconds: number, index?: number) {
  const id = project.addVideo(new Blob(), index);
  scanVideo(id, seconds);
  return id;
}

// lists video id's frames (it's `seconds` long)
function scanVideo(id: number, seconds: number) {
  project.scanVideo(id, seconds);
  const scan = analyses.get(id)!.last;
  if (scan.kind !== 'scan') throw new Error('expected a scan');
  scan.on.scanned(
    { videoW: 200, videoH: 100, W: 100, H: 50, duration: seconds, frameCount: seconds * 10 },
    clipOf(seconds),
  );
  scan.on.done();
}

// finishes video `reel`'s running track job with the object found in every frame
function finishTrack(reel: number) {
  const c = analyses.get(reel)!.last;
  if (c.kind !== 'track') throw new Error(`expected a track job, got ${c.kind}`);
  c.on.shapes(c.req.times.map((_, i) => ({ i, shape: shape() })));
  c.on.done();
}

function cutoutCall(reel: number) {
  const c = analyses.get(reel)!.last;
  if (c.kind !== 'cutout') throw new Error(`expected a cutout job, got ${c.kind}`);
  return c;
}

beforeEach(() => {
  analyses = new Map();
  layers = new Map();
  pictures = new FakePictures();
  project = newProject();
});

// a project on fresh fakes of its own (the ones before are forgotten)
function newProject() {
  return new Project(
    reel => {
      const a = new FakeAnalysis(),
        l = new FakeLayers();
      analyses.set(reel, a);
      layers.set(reel, l);
      return { analysis: a, layers: l };
    },
    pictures,
    {
      changed: s => {
        state = s;
      },
      status: () => {},
      meta: () => {},
    },
  );
}

describe('several videos', () => {
  it('play one after another', () => {
    const a = addVideo(6),
      b = addVideo(4);
    expect(state.length).toBe(10);
    expect(state.reels.map(r => [r.id, r.at, r.length])).toEqual([
      [a, 0, 6],
      [b, 6, 4],
    ]);
    expect(project.locate(7)).toEqual({ reel: b, t: 1, at: 6 });
    expect(state.films.map(f => [f.reel, f.at])).toEqual([
      [a, 0],
      [b, 6],
    ]);
  });

  it('a video can go before another', () => {
    const a = addVideo(6);
    const b = addVideo(4, 0);
    expect(state.reels.map(r => r.id)).toEqual([b, a]);
  });

  it('each video’s clips show at their time in the film, numbered apart', () => {
    addVideo(6);
    const b = addVideo(4);
    const id = project.editorOf(b)!.addTrack(10, { x: 50, y: 25 })!;
    expect(id).toBe(b * REEL_IDS + 1);
    expect(project.videoOf(id)).toBe(b);
    expect(state.lanes[0]).toMatchObject({ id, reel: b, range: { s: 7, e: 10 } });
  });

  it('deleting a film of the first moves the second up', () => {
    const a = addVideo(6),
      b = addVideo(4);
    project.editorOf(a)!.split(20);
    project.deleteFilm(0);
    expect(state.length).toBe(8);
    expect(state.reels.find(r => r.id === b)?.at).toBe(4);
  });

  it('a video can be moved; its clips go with it', () => {
    const a = addVideo(6),
      b = addVideo(4);
    project.editorOf(a)!.addTrack(10, { x: 50, y: 25 });
    project.moveVideo(b, 0);
    expect(state.reels.map(r => [r.id, r.at])).toEqual([
      [b, 0],
      [a, 4],
    ]);
    expect(state.lanes[0].range).toEqual({ s: 5, e: 8 });
    project.undo();
    expect(state.reels.map(r => r.id)).toEqual([a, b]);
  });

  it('a video can be taken out, and undo puts it back', () => {
    const a = addVideo(6);
    addVideo(4);
    project.removeVideo(a);
    expect(state.length).toBe(4);
    project.undo();
    expect(state.length).toBe(10);
    expect(state.reels[0].id).toBe(a);
  });
});

describe('duplicating a film', () => {
  it('puts a copy of it straight after its video, just that stretch, as its own video', () => {
    const a = addVideo(6);
    project.split(2);
    project.split(4);
    project.setSpeed(1, 2, false);
    const b = project.duplicateFilm(1)!;
    expect(state.reels.map(r => r.id)).toEqual([a, b]);
    scanVideo(b, 6);
    // (the original's three films, then the copy: 2..4 at double speed)
    expect(state.films.map(f => [f.reel, f.s, f.e, f.speed])).toEqual([
      [a, 0, 2, 1],
      [a, 2, 4, 2],
      [a, 4, 6, 1],
      [b, 2, 4, 2],
    ]);
    project.undo();
    expect(state.reels.map(r => r.id)).toEqual([a]);
  });
});

describe('tracing each file once', () => {
  // an effect on the object at frame i of video `reel`
  const tap = (reel: number, i: number, x = 50) => project.editorOf(reel)!.addTrack(i, { x, y: 25 })!;
  const lanesOn = (reel: number) => state.lanes.filter(l => l.reel === reel);

  it('a duplicated film comes with a copy of its effects, tracked as they were', () => {
    const a = addVideo(6);
    project.split(2);
    project.split(4);
    tap(a, 25); // (2.5..5.5)
    finishTrack(a);
    const b = project.duplicateFilm(1)!;
    scanVideo(b, 6);
    const [copy] = lanesOn(b);
    // (the copy plays 2..4 of the video, from 6 in the film: the effect cut to it)
    expect(copy.range.s).toBeCloseTo(6.5);
    expect(copy.range.e).toBeCloseTo(8);
    expect(copy.spans.length).toBeGreaterThan(0);
    expect(analyses.get(b)!.tracks).toBe(0);
    expect(lanesOn(a)).toHaveLength(1);
  });

  it('a second use of the same file reuses what was traced in it', () => {
    const a = addVideo(6),
      b = addVideo(6);
    project.identify(a, 'same');
    project.identify(b, 'same');
    tap(a, 10); // (1..4)
    finishTrack(a);
    tap(b, 20);
    expect(analyses.get(b)!.tracks).toBe(0);
    // (for as long as it was traced: 2..4 of b, which starts at 6)
    const [l] = lanesOn(b);
    expect(l.range.s).toBeCloseTo(8);
    expect(l.range.e).toBeCloseTo(10);
    expect(l.spans.length).toBeGreaterThan(0);
    // (a tap on nothing traced is tracked)
    tap(b, 20, 5);
    expect(analyses.get(b)!.tracks).toBe(1);
  });

  it('another file is tracked afresh', () => {
    const a = addVideo(6),
      b = addVideo(6);
    project.identify(a, 'one');
    project.identify(b, 'other');
    tap(a, 10);
    finishTrack(a);
    tap(b, 20);
    expect(analyses.get(b)!.tracks).toBe(1);
  });

  it('a file added again after its video was taken out reuses what was traced in it', () => {
    const a = addVideo(6);
    project.identify(a, 'same');
    tap(a, 10);
    finishTrack(a);
    project.removeVideo(a);
    const c = addVideo(6);
    project.identify(c, 'same');
    tap(c, 20);
    expect(analyses.get(c)!.tracks).toBe(0);
  });

  it("keeps each video's fingerprint with the film", () => {
    const a = addVideo(6);
    project.identify(a, 'same');
    const saved = project.saved();
    expect(saved.reels[0].source).toBe('same');
    project = newProject();
    project.open(saved);
    expect(project.files.reels[0].source).toBe('same');
  });
});

describe('reversing a film', () => {
  it('puts it backwards in its place, as a video of its own, and takes the film out', () => {
    const a = addVideo(6);
    project.split(2);
    project.split(4);
    project.setSpeed(1, 2, false);
    const b = project.reverseFilm(1, new Blob(['reversed']))!;
    expect(state.reels.map(r => r.id)).toEqual([a, b]);
    scanVideo(b, 2);
    expect(state.films.map(f => [f.reel, f.s, f.e, f.speed])).toEqual([
      [a, 0, 2, 1],
      [a, 4, 6, 1],
      [b, 0, 2, 2],
    ]);
    // (one step: both put back)
    project.undo();
    expect(state.reels.map(r => r.id)).toEqual([a]);
    expect(state.films).toHaveLength(3);
  });
});

describe('cutouts as layers of the film', () => {
  function cutOut() {
    const a = addVideo(6);
    const id = project.addCutout(a, 14, { x: 50, y: 25 }, 'keep', null)!;
    finishTrack(a);
    // its outlines checked: it's cut out
    project.startReview(id);
    project.finishReview(id);
    return { a, id };
  }

  it('what’s cut becomes a layer of the film, over the stretch it’s cut from', () => {
    const { id } = cutOut();
    const lane = state.lanes.find(l => l.id === id)!;
    expect(lane).toMatchObject({
      kind: 'cutout',
      range: { s: 1.4, e: 4.4 },
      cutout: { from: 1.4, bg: 'keep' },
    });
    expect(state.cutRows).toBe(1);
    // the object in each frame, as fractions of its frame
    expect(project.overlay(id)?.frames[0]).toEqual({ t: 1.4, cx: 0.5, cy: 0.5, w: 0.2, h: 0.8 });
  });

  it('keeps the pictures cut, by time in its video, as fractions of the frame', () => {
    const { a, id } = cutOut();
    const image = {} as ImageBitmap;
    cutoutCall(a).on.frames([{ i: 0, cut: { image, x: 40, y: 5, w: 20, h: 40 } }]);
    expect(pictures.byId.get(id)?.get(1.4)).toEqual({ image, x: 0.4, y: 0.1, w: 0.2, h: 0.8 });
  });

  it('can be placed over another video', () => {
    const { id } = cutOut();
    addVideo(4);
    project.placeAt(id, 7);
    expect(state.lanes.find(l => l.id === id)?.range).toEqual({ s: 7, e: 10 });
  });

  it('stays when the video it’s cut from is taken out, as it was cut', () => {
    const { a, id } = cutOut();
    addVideo(4);
    project.placeAt(id, 7);
    project.removeVideo(a);
    const lane = state.lanes.find(l => l.id === id)!;
    expect(lane.cutout?.from).toBeNull();
    expect(project.overlay(id)?.frames).toHaveLength(30);
    // it can still be moved about
    project.setTransform(id, 1, { x: 0.1 });
    expect(project.transformAt(id, 1)?.x).toBe(0.1);
    // and stays when the other video is replaced too
    project.replaceVideo(state.reels[0].id, new Blob());
    expect(project.overlay(id)).not.toBeNull();
  });

  it('checking it, sets which stretch of its video it’s cut from, both ways', () => {
    const { a, id } = cutOut();
    const ed = project.editorOf(a)!;
    const tracks = analyses.get(a)!.tracks;
    project.setCutoutSpan(id, { s: 1 });
    project.commitOverlayRange(id);
    expect(ed.cutoutOf(id)?.range).toEqual({ s: 1, e: 4.4 });
    expect(project.overlay(id)).toMatchObject({ src: { s: 1, e: 4.4 } });
    expect(analyses.get(a)!.tracks).toBeGreaterThan(tracks); // what it grew into is tracked
    project.setCutoutSpan(id, { e: 3 });
    expect(ed.cutoutOf(id)?.range).toEqual({ s: 1, e: 3 });
    expect(project.overlay(id)).toMatchObject({ src: { s: 1, e: 3 } });
  });

  it('cutting out and undoing it are one step each', () => {
    const { a, id } = cutOut();
    project.undo();
    expect(project.overlay(id)).toBeNull();
    expect(project.editorOf(a)?.cutoutOf(id)).toBeNull();
    project.redo();
    expect(project.overlay(id)).not.toBeNull();
    expect(project.editorOf(a)?.cutoutOf(id)).not.toBeNull();
  });

  it('trimmed, keeps what shows where it is; it can grow into more of its video, cut once done', () => {
    const { a, id } = cutOut();
    cutoutCall(a).on.done();
    project.setOverlayRange(id, { s: 2 });
    expect(project.overlay(id)).toMatchObject({ at: 2, src: { s: 2, e: 4.4 } });
    project.setOverlayRange(id, { e: 5.4 });
    expect(project.editorOf(a)?.cutoutOf(id)?.range).toEqual({ s: 1.4, e: 5.4 });
    project.commitOverlayRange(id);
    finishTrack(a);
    expect(cutoutCall(a).req.times.at(-1)).toBeCloseTo(5.3);
  });

  it('deleting it deletes what cuts it; a copy keeps that going', () => {
    const { a, id } = cutOut();
    const copy = project.duplicateOverlay(id)!;
    expect(project.overlay(copy)).toMatchObject({ at: 1.4, name: 'Cutout 1 copy' });
    project.deleteOverlay(id);
    expect(project.editorOf(a)?.cutoutOf(id)).not.toBeNull();
    project.deleteOverlay(copy);
    expect(project.editorOf(a)?.cutoutOf(id)).toBeNull();
  });

  it('is found under a tap where it’s placed', () => {
    const { id } = cutOut();
    // a 2:1 video fills a 200 x 100 picture: the object is 40 x 80 around the middle
    expect(project.overlayAt(2, 100, 50, 200, 100)).toBe(id);
    expect(project.overlayAt(2, 10, 10, 200, 100)).toBeNull();
    expect(project.overlayAt(5, 100, 50, 200, 100)).toBeNull();
  });
});

describe('one history for the film', () => {
  it('undoes edits in whichever video they were made, in order', () => {
    const a = addVideo(6),
      b = addVideo(4);
    project.editorOf(a)!.addTrack(10, { x: 50, y: 25 });
    project.editorOf(b)!.addTrack(10, { x: 50, y: 25 });
    expect(state.lanes).toHaveLength(2);
    project.undo();
    expect(state.lanes.map(l => l.reel)).toEqual([a]);
    project.undo();
    expect(state.lanes).toEqual([]);
    project.redo();
    expect(state.lanes.map(l => l.reel)).toEqual([a]);
    expect(state.canRedo).toBe(true);
  });
});

describe('music on the Audio layer', () => {
  it('is placed where asked, trimmed and moved, each a step to undo', () => {
    addVideo(6);
    const id = project.addMusic('song', 30, 1)!;
    // as much of it as fits before the film ends
    expect(state.music).toMatchObject([{ id, at: 1, src: { s: 0, e: 5 }, row: 0 }]);
    expect(state.audioRows).toBe(1);
    project.setMusicRange(id, { s: 2 });
    expect(state.music[0]).toMatchObject({ at: 2, src: { s: 1, e: 5 } });
    project.setMusicVolume(id, 0.5);
    project.undo();
    expect(state.music[0].volume).toBe(1);
    project.undo();
    expect(state.music[0]).toMatchObject({ at: 1, src: { s: 0, e: 5 } });
    project.deleteMusic(id);
    expect(state.music).toEqual([]);
    project.undo();
    expect(state.music).toHaveLength(1);
  });
});

describe('looks over the film', () => {
  const preset = (id: string) => presetById(id)!;

  it('are placed at the playhead, each group on a layer of its own', () => {
    addVideo(10);
    const f = project.addLook(preset('noir'), 1)!,
      g = project.addLook(preset('golden-hour'), 2)!,
      s = project.addLook(preset('strobe'), 1)!;
    expect(state.looks.map(c => [c.id, c.preset.group, c.row])).toEqual([
      [f, 'filter', 0],
      [g, 'filter', 1], // (overlapping the first)
      [s, 'screen', 0],
    ]);
    expect(state.lookRows).toEqual({ filter: 2, screen: 1, text: 0 });
    expect(state.hasEffects).toBe(true);
  });

  it('draw what is on at the time: filters, then screen effects', () => {
    addVideo(10);
    project.addLook(preset('strobe'), 0)!;
    project.addLook(preset('noir'), 0)!;
    expect(project.looksAt(0.01).map(d => d.engine)).toEqual(['color', 'screen']);
    expect(project.looksAt(9)).toEqual([]);
  });

  it('are trimmed, moved, restyled and tuned, each a step to undo', () => {
    addVideo(10);
    const id = project.addLook(preset('noir'), 1)!;
    project.setLookRange(id, { e: 3 });
    expect(state.looks[0]).toMatchObject({ at: 1, len: 2 });
    project.placeLook(id, 4);
    expect(state.looks[0].at).toBe(4);
    project.setLookControl(id, 'strength', 0.3);
    expect(state.looks[0].values.strength).toBe(0.3);
    expect(project.setLookPreset(id, preset('strobe'))).toBe(false); // (not a filter)
    project.setLookPreset(id, preset('silver'));
    expect(state.looks[0]).toMatchObject({ name: 'Silver', at: 4, len: 2, values: { strength: 0.3 } });
    project.undo();
    expect(state.looks[0].name).toBe('Noir');
    project.undo();
    expect(state.looks[0].values.strength).toBe(1);
    project.undo();
    expect(state.looks[0].at).toBe(1);
  });

  it('are customized on their own copy of their template, each change a step to undo', () => {
    addVideo(10);
    const id = project.addLook(preset('strobe'), 1)!;
    project.setLookControl(id, 'strength', 0.5);
    const was = project.looksAt(1.01);
    // (its own copy draws as it did, its slider baked in)
    project.customizeLook(id, p => p, 'noop');
    expect(project.looksAt(1.01)).toEqual(was);
    expect(state.looks[0].values).toEqual({ strength: 1 });
    project.customizeLook(id, p => addPass(p, 'frame', 'shake'));
    expect(state.looks[0].preset.passes.map(x => x.kind)).toEqual(['flash', 'shake']);
    project.customizeLook(id, p => setParam(p, 0, 'color', '#ff0000'), 'set:0:color');
    project.customizeLook(id, p => setParam(p, 0, 'color', '#00ff00'), 'set:0:color');
    expect(state.looks[0].preset.passes[0].params.color).toBe('#00ff00');
    project.undo(); // (both colors: one drag)
    expect(state.looks[0].preset.passes[0].params.color).toBe('#ffffff');
    project.undo();
    expect(state.looks[0].preset.passes).toHaveLength(1);
  });

  it('can be made from nothing', () => {
    addVideo(10);
    const id = project.addLook(blankEffect('screen'), 0)!;
    expect(project.look(id)).toMatchObject({ name: 'My effect', preset: { id: MY_OWN, group: 'screen' } });
  });

  it('are copied straight after themselves, and deleted', () => {
    addVideo(10);
    const id = project.addLook(preset('noir'), 1)!;
    project.setLookRange(id, { e: 3 });
    const d = project.duplicateLook(id)!;
    expect(project.look(d)).toMatchObject({ at: 3, len: 2, name: 'Noir' });
    project.deleteLook(id);
    expect(state.looks.map(c => c.id)).toEqual([d]);
    project.undo();
    expect(state.looks).toHaveLength(2);
  });
});

describe("the film's layers", () => {
  it('draw their own looks: filters apart from video effects', () => {
    addVideo(10);
    project.addLook(presetById('strobe')!, 0);
    project.addLook(presetById('noir')!, 0);
    expect(project.looksAt(0.01, 'filter').map(d => d.engine)).toEqual(['color']);
    expect(project.looksAt(0.01, 'screen').map(d => d.engine)).toEqual(['screen']);
  });
});

describe('animations', () => {
  it('move a film of the film, and an overlay, each a step to undo', () => {
    const a = addVideo(6);
    const grow = { preset: 'grow-in', params: presetById('grow-in')!.passes[0].params };
    expect(project.setFilmAnim(0, 'in', grow)).toBe(true);
    expect(state.films[0].anim.in).toMatchObject({ preset: 'grow-in' });
    expect(project.setFilmAnim(5, 'in', grow)).toBe(false);
    const id = project.addCutout(a, 10, { x: 50, y: 25 }, 'keep', null)!;
    expect(project.overlay(id)!.anim).toEqual({ in: null, out: null, combo: null });
    project.setOverlayAnim(id, 'out', grow);
    expect(project.overlay(id)!.anim.out).toMatchObject({ preset: 'grow-in' });
    project.undo();
    expect(project.overlay(id)!.anim.out).toBeNull();
    const t = project.addLook(presetById('clean-title')!, 1)!;
    project.setLookAnim(t, 'combo', { preset: 'sway', params: presetById('sway')!.passes[0].params });
    expect(project.look(t)!.anim.combo).toMatchObject({ preset: 'sway' });
  });
});

describe('transitions', () => {
  it('go at the joins between films, across videos too, each a step to undo', () => {
    addVideo(6);
    addVideo(4);
    const flash = presetById('flash-cut')!;
    expect(project.setTransition(0, flash)).toBe(false); // (nothing before the first)
    expect(project.setTransition(1, presetById('noir')!)).toBe(false); // (not a transition)
    expect(project.setTransition(1, flash)).toBe(true);
    expect(state.transitions).toMatchObject([{ s: 0, duration: 0.5, preset: { id: 'flash-cut' } }]);
    expect(project.transitionAt(6)?.passes.map(p => p.engine)).toEqual(['screen']);
    expect(project.transitionAt(3)).toBeNull();
    project.setTransitionDuration(1, 9);
    expect(state.transitions[0].duration).toBe(2);
    project.undo();
    expect(state.transitions[0].duration).toBe(0.5);
    project.setTransition(1, null);
    expect(state.transitions).toEqual([]);
    project.undo();
    expect(state.transitions).toHaveLength(1);
  });

  it('can go at every join at once', () => {
    const a = addVideo(6);
    addVideo(4);
    project.split(3);
    expect(state.films).toHaveLength(3);
    project.setTransitionEverywhere(presetById('blur-cut')!);
    expect(state.transitions.map(tr => [tr.reel === a, tr.s])).toEqual([
      [true, 3],
      [false, 0],
    ]);
  });
});

describe('saving the film', () => {
  it('opens again as it was saved, each video put back once its frames are listed', () => {
    const a = addVideo(6),
      b = addVideo(4);
    const fx = project.editorOf(a)!.addTrack(10, { x: 50, y: 25 }, { effect: 'fire', pal: 2 })!;
    finishTrack(a);
    const cut = project.addCutout(b, 5, { x: 50, y: 25 }, 'keep', null)!;
    finishTrack(b);
    project.startReview(cut);
    project.finishReview(cut);
    project.addLook(presetById('noir')!, 1);
    const song = new Blob(['la']);
    project.addMusic('song', 30, 0, song);
    project.setTransition(1, presetById('blur-cut')!);
    project.setFilmAnim(0, 'in', { preset: 'grow-in', params: presetById('grow-in')!.passes[0].params });
    const was = state,
      frames = project.overlay(cut)!.frames;
    const saved = project.saved();

    project = newProject();
    expect(project.open(saved)).toBe(true);
    // (film-wide things are back at once; each video's own edits once it's been read)
    expect(state.reels.map(r => r.id)).toEqual([a, b]);
    expect(state.looks.map(l => l.name)).toEqual(['Noir']);
    expect(state.music.map(m => m.name)).toEqual(['song']);
    expect(project.files.music).toEqual([{ id: state.music[0].id, file: song }]);
    expect(state.canUndo).toBe(false);
    scanVideo(a, 6);
    scanVideo(b, 4);
    expect(state.lanes.map(l => [l.id, l.kind])).toEqual(was.lanes.map(l => [l.id, l.kind]));
    expect(state.lanes.find(l => l.id === fx)?.fx.pal).toBe(2);
    expect(state.films[0].anim.in?.preset).toBe('grow-in');
    expect(state.transitions).toHaveLength(1);
    expect(project.overlay(cut)?.frames).toEqual(frames);
    // its checked cutout is cut out again, to have its pictures
    expect(analyses.get(b)!.last.kind).toBe('cutout');
    // numbering carries on after what was there
    expect(project.addLook(presetById('silver')!, 0)).toBe(saved.next.look);
  });

  it('keeps a video still being read as it was saved', () => {
    const a = addVideo(6);
    project.editorOf(a)!.addTrack(10, { x: 50, y: 25 }, { effect: 'fire' });
    const saved = project.saved();
    project = newProject();
    project.open(saved);
    // (saved again before its frames were listed: nothing lost)
    expect(project.saved().reels[0].editor.tracks).toHaveLength(1);
  });

  it('opens a film saved before color and screen were one engine', () => {
    addVideo(6);
    addVideo(4);
    project.addLook(presetById('noir')!, 1);
    project.setTransition(1, presetById('blur-cut')!);
    const saved = project.saved();
    // (as it was kept then: the grade a color pass, the blur a screen one)
    const old = <T extends { preset: { passes: { engine: string }[] } }>(c: T) => ({
      ...c,
      preset: {
        ...c.preset,
        passes: c.preset.passes.map(p => ({ ...p, engine: p.engine === 'frame' ? 'color' : p.engine })),
      },
    });
    project = newProject();
    project.open({
      ...saved,
      looks: saved.looks.map(old),
      transitions: saved.transitions.map(old),
    } as typeof saved);
    expect(project.saved().looks[0].preset.passes.map(p => p.engine)).toEqual(['frame']);
    expect(project.looksAt(1.5).length).toBeGreaterThan(0);
    expect(project.saved().transitions[0].preset.passes.every(p => p.engine !== ('color' as string))).toBe(
      true,
    );
  });

  it("won't open a film saved some other way", () => {
    addVideo(6);
    expect(project.open({ ...project.saved(), version: 99 as 1 })).toBe(false);
  });
});

describe('effect clips', () => {
  const boom = { id: 'p1', name: 'Boom', length: 3, blend: 'screen' as const };

  it('are placed, trimmed, moved and set, each a step to undo, and saved with their videos', () => {
    addVideo(10);
    const file = new Blob(['boom']);
    const id = project.addEffectClip(boom, file, 2)!;
    expect(state.effectClips).toMatchObject([{ id, at: 2, src: { s: 0, e: 3 }, row: 0 }]);
    expect(state.effectRows).toBe(1);
    project.setEffectRange(id, { s: 3 });
    expect(state.effectClips[0]).toMatchObject({ at: 3, src: { s: 1, e: 3 } });
    project.setEffectLook(id, { x: 0.2, blend: 'key' });
    expect(project.effectsAt(3.5)).toEqual([{ clip: project.effectClip(id), time: 1.5 }]);
    project.undo();
    expect(state.effectClips[0].blend).toBe('screen');
    const d = project.duplicateEffect(id)!;
    expect(project.effectClip(d)?.at).toBe(5);

    const saved = project.saved();
    expect(saved.packs).toEqual([{ id: 'p1', file }]);
    project = newProject();
    project.open(saved);
    expect(state.effectClips.map(c => c.id)).toEqual([id, d]);
    expect(project.packsInUse).toEqual([{ id: 'p1', file }]);
    project.deleteEffect(d);
    expect(state.effectClips).toHaveLength(1);
  });

  it('open from a film saved before there were any', () => {
    addVideo(6);
    const old = project.saved() as Partial<ReturnType<typeof project.saved>>;
    delete old.effectClips;
    delete old.packs;
    project = newProject();
    expect(project.open(old as ReturnType<typeof project.saved>)).toBe(true);
    expect(state.effectClips).toEqual([]);
  });
});
