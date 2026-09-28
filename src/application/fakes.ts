// In-memory fakes of the ports, for the tests: they record what they're asked, and the test says
// what comes back.
import type { Analysis, EffectLayers, LayerSpec, OverlayPictures, OverlaySprite } from './ports';

export type Call =
  | { kind: 'scan'; on: Parameters<Analysis['scan']>[2] }
  | { kind: 'track'; req: Parameters<Analysis['track']>[1]; on: Parameters<Analysis['track']>[2] }
  | { kind: 'probe'; req: Parameters<Analysis['probe']>[1]; on: Parameters<Analysis['probe']>[2] }
  | { kind: 'camera'; times: number[] }
  | { kind: 'cutout'; req: Parameters<Analysis['cutout']>[1]; on: Parameters<Analysis['cutout']>[2] };

export class FakeAnalysis implements Analysis {
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

export class FakeLayers implements EffectLayers {
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

export class FakePictures implements OverlayPictures {
  byId = new Map<number, Map<number, OverlaySprite | null>>();
  put(id: number, frames: { t: number; cut: OverlaySprite | null }[]) {
    const m = this.byId.get(id) ?? new Map();
    for (const f of frames) m.set(f.t, f.cut);
    this.byId.set(id, m);
  }
  trim(id: number, span: { s: number; e: number }) {
    const m = this.byId.get(id);
    if (m) for (const t of [...m.keys()]) if (t < span.s || t >= span.e) m.delete(t);
  }
  copy(from: number, to: number) {
    this.byId.set(to, new Map(this.byId.get(from)));
  }
}
