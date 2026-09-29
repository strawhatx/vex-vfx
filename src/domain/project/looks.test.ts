import { describe, expect, it } from 'vitest';
import { parsePreset } from '../effects/presets';
import {
  looksAt,
  lookRange,
  newLook,
  particlesAt,
  placeLook,
  previewOf,
  textPreviewOf,
  textsAt,
  trimLook,
  withControl,
  withPreset,
  withText,
} from './looks';

const filter = parsePreset({
  id: 'mono',
  name: 'Mono',
  group: 'filter',
  length: 5,
  fade: { in: 1 },
  passes: [{ engine: 'color', kind: 'grade', params: { saturation: -1 } }],
  controls: [
    {
      id: 'strength',
      label: 'Strength',
      type: 'slider',
      def: 1,
      drives: [{ pass: 0, param: 'amount', from: 0, to: 1 }],
    },
  ],
});
const flash = parsePreset({
  id: 'flash',
  name: 'Flash',
  group: 'screen',
  passes: [{ engine: 'screen', kind: 'flash', params: { amount: 1 } }],
  controls: [
    {
      id: 'strength',
      label: 'Strength',
      type: 'slider',
      def: 0.5,
      drives: [{ pass: 0, param: 'amount', from: 0, to: 1 }],
    },
    { id: 'color', label: 'Color', type: 'color', def: '#ffffff', drives: [{ pass: 0, param: 'color' }] },
  ],
});

describe('a look on the film', () => {
  it('lasts as long as its preset says, or as much as fits', () => {
    expect(lookRange(newLook(1, filter, 2, 20))).toEqual({ s: 2, e: 7 });
    expect(lookRange(newLook(1, filter, 18, 20))).toEqual({ s: 18, e: 20 });
    expect(newLook(1, flash, 0, 20)).toMatchObject({
      name: 'Flash',
      values: { strength: 0.5, color: '#ffffff' },
    });
  });

  it('trims from either end, never shorter than a tenth of a second nor before the start', () => {
    const c = newLook(1, filter, 2, 20);
    expect(lookRange(trimLook(c, { s: 3 }))).toEqual({ s: 3, e: 7 });
    expect(lookRange(trimLook(c, { e: 4 }))).toEqual({ s: 2, e: 4 });
    expect(lookRange(trimLook(c, { s: -1 }))).toEqual({ s: 0, e: 7 });
    expect(lookRange(trimLook(c, { s: 9 }))).toEqual({ s: 6.9, e: 7 });
  });

  it('moves whole', () => {
    expect(lookRange(placeLook(newLook(1, filter, 2, 20), -3))).toEqual({ s: 0, e: 5 });
  });

  it('keeps its timing and the values of controls both presets have when its preset changes', () => {
    const c = withControl({ ...newLook(1, flash, 2, 20), len: 1 }, 'strength', 0.9);
    const d = withPreset(c, filter);
    expect(d).toMatchObject({ at: 2, len: 1, name: 'Mono', values: { strength: 0.9 } });
    expect(d.values).not.toHaveProperty('color');
  });

  it('fits a control to its range, and ignores ones its preset lacks', () => {
    const c = newLook(1, flash, 0, 20);
    expect(withControl(c, 'strength', 7).values.strength).toBe(1);
    expect(withControl(c, 'size', 1)).toBe(c);
  });
});

describe('what the looks draw', () => {
  it('draws the looks on at the time, filters first, fading in', () => {
    const f = newLook(1, filter, 0, 20),
      s = newLook(2, flash, 0, 20);
    const drawn = looksAt([s, f], 0.5);
    expect(drawn.map(d => d.engine)).toEqual(['color', 'screen']);
    expect(drawn[0].engine === 'color' && drawn[0].amount).toBeCloseTo(0.5); // half faded in
    expect(drawn[1].engine === 'screen' && drawn[1].values.amount).toBeCloseTo(0.5); // its slider
  });

  it('draws nothing outside a look, or with its strength at 0', () => {
    const f = newLook(1, filter, 2, 20);
    expect(looksAt([f], 1)).toEqual([]);
    expect(looksAt([f], 7)).toEqual([]);
    expect(looksAt([withControl(f, 'strength', 0)], 4)).toEqual([]);
  });

  it('draws lower rows first, so the top row is on top', () => {
    const a = { ...newLook(1, flash, 0, 20), row: 0 },
      b = { ...withControl(newLook(2, flash, 0, 20), 'color', '#ff0000'), row: 1 };
    const drawn = looksAt([a, b], 1);
    expect(drawn.map(d => d.engine === 'screen' && d.values.color)).toEqual(['#ff0000', '#ffffff']);
  });
});

describe("a preset's button", () => {
  it('shows it at its strongest', () => {
    const hit = parsePreset({
      id: 'build',
      name: 'Build',
      group: 'screen',
      length: 2,
      passes: [{ engine: 'screen', kind: 'zoom', params: { amount: 0.4 }, motion: { kind: 'rise' } }],
    });
    const [z] = previewOf(hit);
    expect(z.engine === 'screen' && z.values.amount).toBeCloseTo(0.4, 2); // (at the end, all built up)
    expect(previewOf(filter).map(d => d.engine)).toEqual(['color']);
  });
});

describe('text on the film', () => {
  const title = parsePreset({
    id: 'title',
    name: 'Title',
    group: 'text',
    length: 2,
    passes: [
      { engine: 'text', kind: 'type', params: { words: 'HELLO' } },
      { engine: 'text', kind: 'fill' },
      { engine: 'text', kind: 'in', params: { style: 'fade', duration: 0.4, stagger: 0.1 } },
    ],
  });

  it("starts with its type's words, in the middle", () => {
    expect(newLook(1, title, 0, 20).text).toEqual({ words: 'HELLO', x: 0.5, y: 0.5, scale: 1, rot: 0 });
    expect(newLook(1, filter, 0, 20).text).toBeNull();
  });

  it('keeps its words and place, in bounds', () => {
    const c = withText(newLook(1, title, 0, 20), { words: 'x'.repeat(99), scale: 50, x: 0.2 });
    expect(c.text).toMatchObject({ x: 0.2, scale: 5 });
    expect(c.text!.words).toHaveLength(60);
    expect(withText(newLook(1, filter, 0, 20), { x: 0 }).text).toBeNull();
  });

  it('is drawn apart from the looks, and keeps its words when its preset changes', () => {
    const c = withText(newLook(1, title, 0, 20), { words: 'Mine' });
    expect(looksAt([c], 1)).toEqual([]);
    expect(textsAt([c], 1).map(d => d.letters.join(''))).toEqual(['Mine']);
    expect(textsAt([c], 3)).toEqual([]);
    expect(withPreset(c, title).text!.words).toBe('Mine');
  });

  it('moves as a whole as its animation says', () => {
    const grow = {
      preset: 'grow',
      params: { duration: 1, ease: 'linear', scale: 0, x: 0, y: 0, turn: 0, opacity: 1, blur: 0 },
    };
    const c = { ...newLook(1, title, 0, 20), anim: { in: grow, out: null, combo: null } };
    expect(textsAt([c], 0.5)[0].pose.scale).toBeCloseTo(0.5);
    expect(textsAt([c], 1.5)[0].pose.scale).toBe(1);
  });

  it('shows on its button with all its letters in', () => {
    expect(textPreviewOf(title).poses.every(p => p.alpha === 1)).toBe(true);
  });
});

describe('particles on the film', () => {
  const snow = parsePreset({
    id: 'snow',
    name: 'Snow',
    group: 'screen',
    length: 4,
    fade: { in: 1 },
    passes: [
      { engine: 'screen', kind: 'flash', params: { amount: 0.5 } },
      { engine: 'particle', kind: 'emitter', params: { from: 'frame', amount: 1 } },
    ],
  });
  const sparkle = parsePreset({
    id: 'sparkle',
    name: 'Sparkle',
    group: 'text',
    length: 2,
    passes: [
      { engine: 'text', kind: 'type', params: { words: 'HI' } },
      { engine: 'text', kind: 'fill' },
      { engine: 'particle', kind: 'emitter', params: { shape: 'star' } },
    ],
  });

  it("are a screen look's emitters, faded with it, from its start", () => {
    const c = newLook(3, snow, 2, 20);
    expect(particlesAt([c], 1)).toEqual([]);
    const [e] = particlesAt([c], 2.5);
    expect(e).toMatchObject({ key: '3:1', local: 0.5 });
    expect(e.params.amount).toBeCloseTo(0.5);
    expect(e.params.from).toBe('frame');
  });

  it("aren't drawn as the look's passes", () => {
    expect(looksAt([newLook(3, snow, 0, 20)], 2).map(d => d.engine)).toEqual(['screen']);
    expect(previewOf(snow).map(d => d.engine)).toEqual(['screen']);
  });

  it("on a text, are among its styles in order, and aren't the frame's", () => {
    const c = newLook(1, sparkle, 0, 20);
    expect(textsAt([c], 1)[0].styles.map(s => s.kind)).toEqual(['fill', 'emitter']);
    expect(particlesAt([c], 1)).toEqual([]);
  });
});
