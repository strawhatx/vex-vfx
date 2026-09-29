import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { PRESET_FILES } from './library/files';
import { presetById, presets, presetsIn } from './library';
import { passAt, fitPass } from './passes';
import { controlDefaults, parsePreset, passesWith } from './presets';

const shake = {
  id: 'test-shake',
  name: 'Test shake',
  group: 'screen',
  passes: [
    { engine: 'screen', kind: 'shake', params: { amount: 0.5, speed: 10 } },
    { engine: 'screen', kind: 'flash', params: { amount: 0.4 } },
  ],
  controls: [
    {
      id: 'strength',
      label: 'Strength',
      type: 'slider',
      def: 1,
      drives: [
        { pass: 0, param: 'amount', from: 0, to: 0.8 },
        { pass: 1, param: 'amount', from: 0, to: 0.2 },
      ],
    },
    { id: 'color', label: 'Color', type: 'color', def: '#FF0000', drives: [{ pass: 1, param: 'color' }] },
  ],
};

describe('a preset from data', () => {
  it('fills in what was left out and fits settings to their ranges', () => {
    const p = parsePreset({
      ...shake,
      passes: [{ engine: 'screen', kind: 'shake', params: { amount: 9 } }, shake.passes[1]],
    });
    expect(p.passes[0].params).toEqual({ amount: 1, speed: 12, turn: 0.3 });
    expect(p.passes[0].motion.kind).toBe('steady');
    expect(p).toMatchObject({ category: 'Other', length: 3, fade: { in: 0, out: 0 } });
    expect(p.controls[1].def).toBe('#ff0000');
  });

  it('says what is wrong with one that cannot be used', () => {
    expect(() => parsePreset({ ...shake, id: 'Bad Id' })).toThrow(/lower-case/);
    expect(() => parsePreset({ ...shake, group: 'sticker' })).toThrow(/group/);
    expect(() => parsePreset({ ...shake, passes: [] })).toThrow(/at least one pass/);
    expect(() => parsePreset({ ...shake, passes: [{ engine: 'screen', kind: 'teleport' }] })).toThrow(
      /pass 0: unknown pass/,
    );
    const drives = (d: object) => ({ ...shake, controls: [{ ...shake.controls[0], drives: [d] }] });
    expect(() => parsePreset(drives({ pass: 5, param: 'amount' }))).toThrow(/no pass 5/);
    expect(() => parsePreset(drives({ pass: 0, param: 'size' }))).toThrow(/no setting "size"/);
    expect(() =>
      parsePreset({ ...shake, controls: [{ ...shake.controls[1], drives: [{ pass: 0, param: 'amount' }] }] }),
    ).toThrow(/isn't a color/);
  });
});

describe('controls', () => {
  const p = parsePreset(shake);

  it('start at their defaults', () => {
    expect(controlDefaults(p)).toEqual({ strength: 1, color: '#ff0000' });
  });

  it('drive the settings of the passes', () => {
    const at = passesWith(p, { strength: 0.5, color: '#00ff00' });
    expect(at[0].params.amount).toBeCloseTo(0.4);
    expect(at[1].params.amount).toBeCloseTo(0.1);
    expect(at[1].params.color).toBe('#00ff00');
    // (the preset itself is left as it was)
    expect(p.passes[0].params.amount).toBe(0.5);
  });

  it('fall back to their defaults for values that do not fit', () => {
    const at = passesWith(p, { strength: 'loud', color: 'green' });
    expect(at[0].params.amount).toBeCloseTo(0.8);
    expect(at[1].params.color).toBe('#ff0000');
  });
});

describe('passes over time', () => {
  it('scale their strength by the clip fading and by their motion', () => {
    const pulse = fitPass({
      engine: 'screen',
      kind: 'flash',
      params: { amount: 1 },
      motion: { kind: 'pulse', rate: 1 },
    });
    const peak = passAt(pulse, 0.5, 2, 0.5, 1);
    expect(peak.engine === 'screen' && peak.values.amount).toBeCloseTo(0.5);
    const grade = fitPass({ engine: 'color', kind: 'grade', params: { amount: 0.8, saturation: -1 } });
    const g = passAt(grade, 0, 1, 0.5, 1);
    expect(g.engine === 'color' && g.amount).toBeCloseTo(0.4);
    expect(g.engine === 'color' && g.grade.saturation).toBe(-1);
  });

  it('shake the same way every time the same frame is drawn', () => {
    const s = fitPass({ engine: 'screen', kind: 'shake', params: { amount: 1 } });
    expect(passAt(s, 1.3, 3, 1, 7)).toEqual(passAt(s, 1.3, 3, 1, 7));
    expect(passAt(s, 1.3, 3, 1, 7)).not.toEqual(passAt(s, 1.3, 3, 1, 8));
  });
});

describe('the presets that ship', () => {
  it('all load, each with its own id', () => {
    const all = presets();
    expect(all.length).toBe(PRESET_FILES.length);
    expect(new Set(all.map(p => p.id)).size).toBe(all.length);
    expect(presetById('noir')?.group).toBe('filter');
  });

  it('are each listed in files.ts, under their own id', () => {
    const dir = fileURLToPath(new URL('./library', import.meta.url));
    const files = readdirSync(dir)
      .filter(f => f.endsWith('.json'))
      .map(f => f.slice(0, -5))
      .sort();
    expect(
      presets()
        .map(p => p.id)
        .sort(),
    ).toEqual(files);
  });

  it('are grouped by category for the menus', () => {
    const filters = presetsIn('filter');
    expect(filters.length).toBeGreaterThan(1);
    expect(filters.flatMap(c => c.presets).every(p => p.group === 'filter')).toBe(true);
    expect(presetsIn('screen').flatMap(c => c.presets).length).toBeGreaterThan(0);
  });
});
