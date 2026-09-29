import { describe, expect, it } from 'vitest';
import {
  addPass,
  draftOf,
  expose,
  exposedBy,
  hasStrength,
  movePass,
  newDraft,
  presetFile,
  removePass,
  renameControl,
  setMeta,
  setMotion,
  setParam,
  slug,
  withStrength,
} from './draft';
import { presets } from './library';
import { controlDefaults, parsePreset, passesWith, type Preset } from './presets';

// what a new clip of it draws is what's being edited
const drawsAsEdited = (p: Preset) =>
  expect(passesWith(p, controlDefaults(p)).map(x => x.params)).toEqual(
    p.passes.map(x =>
      expect.objectContaining(
        Object.fromEntries(
          Object.entries(x.params).map(([k, v]) => [k, typeof v === 'number' ? expect.closeTo(v, 6) : v]),
        ),
      ),
    ),
  );

describe('a new draft', () => {
  it('has one pass of its engine and a Strength slider', () => {
    const c = newDraft('color');
    expect(c).toMatchObject({ group: 'filter', passes: [{ engine: 'color', kind: 'grade' }] });
    expect(hasStrength(c)).toBe(true);
    expect(newDraft('screen')).toMatchObject({ group: 'screen', passes: [{ engine: 'screen' }] });
    drawsAsEdited(c);
  });

  it('takes its id from its name', () => {
    expect(slug('Golden  Hour!')).toBe('golden-hour');
    expect(slug('Ümlaut Café')).toBe('umlaut-cafe');
    expect(slug('***')).toBe('preset');
    expect(setMeta(newDraft('color'), { name: 'Blue Steel' }).id).toBe('blue-steel');
  });

  it('keeps its length and fades in range', () => {
    expect(setMeta(newDraft('screen'), { length: 999, fadeIn: -1, fadeOut: 3 })).toMatchObject({
      length: 60,
      fade: { in: 0, out: 3 },
    });
  });
});

describe('editing passes', () => {
  it('fits settings to their ranges, and keeps drawing as edited', () => {
    let p = setParam(newDraft('color'), 0, 'saturation', -5);
    expect(p.passes[0].params.saturation).toBe(-1);
    p = setParam(p, 0, 'amount', 0.4);
    expect(p.controls[0].type === 'slider' && p.controls[0].drives[0].to).toBeCloseTo(0.4);
    drawsAsEdited(p);
  });

  it('adds, moves and removes passes, with the controls following them', () => {
    let p = addPass(newDraft('screen'), 'shake');
    p = expose(p, 1, 'speed', true);
    expect(p.controls.map(c => c.id)).toEqual(['strength', 'speed']);
    // Strength covers the new pass too
    expect(p.controls[0].drives.map(d => d.pass)).toEqual([0, 1]);
    p = movePass(p, 1, -1);
    expect(p.passes.map(x => x.kind)).toEqual(['shake', 'flash']);
    expect(exposedBy(p, 0, 'speed')?.id).toBe('speed');
    p = removePass(p, 0);
    expect(p.passes.map(x => x.kind)).toEqual(['flash']);
    expect(p.controls.map(c => c.id)).toEqual(['strength']);
    expect(p.controls[0].drives).toEqual([{ pass: 0, param: 'amount', from: 0, to: 0.6 }]);
    drawsAsEdited(p);
  });

  it('never removes the last pass', () => {
    const p = newDraft('screen');
    expect(removePass(p, 0)).toBe(p);
  });

  it('sets how a pass moves', () => {
    const p = setMotion(newDraft('screen'), 0, { kind: 'burst', rate: 4 });
    expect(p.passes[0].motion).toMatchObject({ kind: 'burst', rate: 4 });
  });
});

describe('the sliders users get', () => {
  it('gives a setting a slider over its whole range, starting where it is', () => {
    let p = setParam(newDraft('color'), 0, 'temperature', 0.5);
    p = expose(p, 0, 'temperature', true);
    const c = exposedBy(p, 0, 'temperature')!;
    expect(c).toMatchObject({ type: 'slider', label: 'Warmth', def: 0.75, drives: [{ from: -1, to: 1 }] });
    // moved in the lab, its default follows
    p = setParam(p, 0, 'temperature', -0.5);
    expect(exposedBy(p, 0, 'temperature')!.def).toBeCloseTo(0.25);
    drawsAsEdited(p);
    p = renameControl(p, c.id, 'Heat');
    expect(exposedBy(p, 0, 'temperature')!.label).toBe('Heat');
    expect(exposedBy(expose(p, 0, 'temperature', false), 0, 'temperature')).toBeNull();
  });

  it('gives a color a color control, and a choice none', () => {
    let p = expose(newDraft('screen'), 0, 'color', true);
    expect(exposedBy(p, 0, 'color')).toMatchObject({ type: 'color', def: '#ffffff' });
    p = setParam(p, 0, 'color', '#FF0000');
    expect(exposedBy(p, 0, 'color')!.def).toBe('#ff0000');
    const m = addPass(p, 'mirror');
    expect(expose(m, 1, 'mode', true)).toBe(m);
  });

  it('turns Strength off and on', () => {
    const p = withStrength(newDraft('color'), false);
    expect(hasStrength(p)).toBe(false);
    expect(hasStrength(withStrength(p, true))).toBe(true);
  });
});

describe('loading and saving', () => {
  it('saves a file that loads back as the same preset', () => {
    let p = setMeta(addPass(newDraft('screen'), 'glow'), {
      name: 'Hot Flash',
      category: 'Light',
      fadeIn: 0.2,
    });
    p = expose(setMotion(p, 1, { kind: 'pulse', rate: 2 }), 1, 'threshold', true);
    const file = JSON.parse(JSON.stringify(presetFile(p)));
    expect(parsePreset(file)).toEqual(p);
  });

  it('loads every preset that ships drawing as it did', () => {
    for (const shipped of presets()) {
      const d = draftOf(shipped);
      expect(passesWith(d, controlDefaults(d))).toEqual(passesWith(shipped, controlDefaults(shipped)));
    }
  });

  it('keeps a loaded preset drawing as edited when a setting its Strength drives changes', () => {
    const quake = draftOf(presets().find(p => p.id === 'earthquake')!);
    drawsAsEdited(setParam(quake, 1, 'amount', 0.3));
  });
});
