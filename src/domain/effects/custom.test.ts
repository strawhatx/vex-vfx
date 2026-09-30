import { describe, expect, it } from 'vitest';
import {
  addPass,
  blankEffect,
  hasStrength,
  kindsOf,
  movePass,
  ownCopy,
  removePass,
  setMeta,
  setMotion,
  setParam,
  slug,
  TARGETS,
  withStrength,
} from './custom';
import { presets } from './library';
import { controlDefaults, passesWith, type Preset } from './presets';

// what a clip of it draws is what's being edited
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

describe('an effect made from nothing', () => {
  it('has the first layer for what it is for, and a Strength slider', () => {
    const c = blankEffect('filter');
    expect(c).toMatchObject({ group: 'filter', passes: [{ engine: 'frame', kind: 'grade' }] });
    expect(hasStrength(c)).toBe(true);
    expect(blankEffect('screen')).toMatchObject({ group: 'screen', passes: [{ engine: 'frame' }] });
    drawsAsEdited(c);
    for (const g of TARGETS) expect(blankEffect(g).group).toBe(g);
  });

  it('takes its id from its name', () => {
    expect(slug('Golden  Hour!')).toBe('golden-hour');
    expect(slug('Ümlaut Café')).toBe('umlaut-cafe');
    expect(slug('***')).toBe('preset');
    expect(setMeta(blankEffect('filter'), { name: 'Blue Steel' }).id).toBe('blue-steel');
  });

  it('keeps its length and fades in range', () => {
    expect(setMeta(blankEffect('screen'), { length: 999, fadeIn: -1, fadeOut: 3 })).toMatchObject({
      length: 60,
      fade: { in: 0, out: 3 },
    });
  });
});

describe("a clip's own copy of its template", () => {
  it('draws as the clip did, with its sliders baked in and a Strength slider at full', () => {
    for (const shipped of presets()) {
      const values = controlDefaults(shipped);
      for (const c of shipped.controls) if (c.type === 'slider') values[c.id] = c.def * 0.5;
      const own = ownCopy(shipped, values);
      expect(own.controls.every(c => c.id === 'strength')).toBe(true);
      expect(passesWith(own, controlDefaults(own)).map(p => p.params)).toEqual(
        passesWith(shipped, values).map(p => p.params),
      );
    }
  });

  it('keeps drawing as edited when a setting its Strength drives changes', () => {
    const quake = presets().find(p => p.id === 'earthquake')!;
    drawsAsEdited(setParam(ownCopy(quake, controlDefaults(quake)), 1, 'amount', 0.3));
  });
});

describe('editing layers', () => {
  it('fits settings to their ranges, and keeps drawing as edited', () => {
    let p = setParam(blankEffect('filter'), 0, 'saturation', -5);
    expect(p.passes[0].params.saturation).toBe(-1);
    p = setParam(p, 0, 'amount', 0.4);
    expect(p.controls[0].type === 'slider' && p.controls[0].drives[0].to).toBeCloseTo(0.4);
    drawsAsEdited(p);
  });

  it('adds, moves and removes layers, with Strength following them', () => {
    let p = addPass(blankEffect('screen'), 'frame', 'shake');
    expect(p.controls[0].drives.map(d => d.pass)).toEqual([0, 1]);
    p = movePass(p, 1, -1);
    expect(p.passes.map(x => x.kind)).toEqual(['shake', 'flash']);
    p = removePass(p, 0);
    expect(p.passes.map(x => x.kind)).toEqual(['flash']);
    expect(p.controls[0].drives).toEqual([{ pass: 0, param: 'amount', from: 0, to: 0.6 }]);
    drawsAsEdited(p);
  });

  it('never removes the last layer', () => {
    const p = blankEffect('screen');
    expect(removePass(p, 0)).toBe(p);
  });

  it('sets how a layer moves', () => {
    const p = setMotion(blankEffect('screen'), 0, { kind: 'burst', rate: 4 });
    expect(p.passes[0].motion).toMatchObject({ kind: 'burst', rate: 4 });
  });

  it('turns Strength off and on', () => {
    const p = withStrength(blankEffect('filter'), false);
    expect(hasStrength(p)).toBe(false);
    expect(hasStrength(withStrength(p, true))).toBe(true);
  });
});

describe('what can go on what', () => {
  it('offers each target its layers, from any engine', () => {
    const on = (g: Parameters<typeof kindsOf>[0]) => kindsOf(g).map(k => `${k.engine}:${k.kind}`);
    expect(on('screen')).toContain('object:emitter');
    expect(on('text')).toContain('object:emitter');
    expect(on('text')).not.toContain('object:tint');
    expect(on('body')).toContain('object:tint');
    expect(on('impact')).toEqual(expect.arrayContaining(['object:hit', 'object:emitter']));
    expect(on('transition')).toContain('frame:flash');
    expect(on('transition')).not.toContain('motion:combo');
  });
});
