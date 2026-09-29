import { beforeEach, describe, expect, it } from 'vitest';
import type { ClipFrame, Shape } from '@/domain/tracking/types';
import { presetById } from '@/domain/effects/library';
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
  project.scanVideo(id, seconds);
  const scan = analyses.get(id)!.last;
  if (scan.kind !== 'scan') throw new Error('expected a scan');
  scan.on.scanned(
    { videoW: 200, videoH: 100, W: 100, H: 50, duration: seconds, frameCount: seconds * 10 },
    clipOf(seconds),
  );
  scan.on.done();
  return id;
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
  project = new Project(
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
});

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
    const f = project.addLook(preset('noir'), 1),
      g = project.addLook(preset('golden-hour'), 2),
      s = project.addLook(preset('strobe'), 1);
    expect(state.looks.map(c => [c.id, c.preset.group, c.row])).toEqual([
      [f, 'filter', 0],
      [g, 'filter', 1], // (overlapping the first)
      [s, 'screen', 0],
    ]);
    expect(state.lookRows).toEqual({ filter: 2, screen: 1 });
    expect(state.hasEffects).toBe(true);
  });

  it('draw what is on at the time: filters, then screen effects', () => {
    addVideo(10);
    project.addLook(preset('strobe'), 0);
    project.addLook(preset('noir'), 0);
    expect(project.looksAt(0.01).map(d => d.engine)).toEqual(['color', 'screen']);
    expect(project.looksAt(9)).toEqual([]);
  });

  it('are trimmed, moved, restyled and tuned, each a step to undo', () => {
    addVideo(10);
    const id = project.addLook(preset('noir'), 1);
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

  it('are copied straight after themselves, and deleted', () => {
    addVideo(10);
    const id = project.addLook(preset('noir'), 1);
    project.setLookRange(id, { e: 3 });
    const d = project.duplicateLook(id)!;
    expect(project.look(d)).toMatchObject({ at: 3, len: 2, name: 'Noir' });
    project.deleteLook(id);
    expect(state.looks.map(c => c.id)).toEqual([d]);
    project.undo();
    expect(state.looks).toHaveLength(2);
  });
});
