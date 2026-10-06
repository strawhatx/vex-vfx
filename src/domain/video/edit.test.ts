import { describe, expect, it } from 'vitest';
import {
  addScene,
  blockers,
  confirmNumber,
  duplicateScene,
  editSlot,
  moveScene,
  removeScene,
  restyle,
  setSeconds,
} from './edit';
import { examplePlan } from './examples';
import { recipeBySlug } from './recipes';

const launch = () => examplePlan('orbit-launch');

describe('editing a plan', () => {
  it('sets text without trimming what is being typed, within the limit', () => {
    const p = editSlot(launch(), 1, 'text', 'Release notes ');
    expect(p.scenes[1].type === 'kinetic-type' && p.scenes[1].text).toBe('Release notes ');
    const long = editSlot(launch(), 1, 'text', 'x'.repeat(200));
    expect(long.scenes[1].type === 'kinetic-type' && long.scenes[1].text).toHaveLength(60);
  });

  it('a number the user types is confirmed; clearing it empties the slot', () => {
    let p = editSlot(launch(), 3, 'value', 4500);
    expect(p.scenes[3].type === 'stat-counter' && p.scenes[3].value).toEqual({
      value: 4500,
      confirmed: true,
    });
    p = editSlot(p, 3, 'value', null);
    expect(p.scenes[3].type === 'stat-counter' && p.scenes[3].value).toEqual({
      value: null,
      confirmed: false,
    });
  });

  it('keeps percentages within 0–100', () => {
    const p = editSlot(examplePlan('orbit-stats'), 2, 'percent', 250);
    expect(p.scenes[2].type === 'stat-ring' && p.scenes[2].percent.value).toBe(100);
  });

  it('never changes the plan it was given', () => {
    const before = launch();
    const copy = structuredClone(before);
    editSlot(before, 0, 'name', 'Other');
    moveScene(before, 0, 2);
    removeScene(before, 0);
    expect(before).toEqual(copy);
  });

  it('confirms a number that is filled in, and only then', () => {
    let p = examplePlan('starter');
    p = confirmNumber(p, 1, 'value');
    expect(p.scenes[1].type === 'stat-counter' && p.scenes[1].value.confirmed).toBe(false);
    p = editSlot(p, 1, 'value', 300);
    (p.scenes[1] as { value: { confirmed: boolean } }).value.confirmed = false;
    p = confirmNumber(p, 1, 'value');
    expect(p.scenes[1].type === 'stat-counter' && p.scenes[1].value.confirmed).toBe(true);
  });

  it('keeps scene lengths in range', () => {
    expect(setSeconds(launch(), 0, 30).scenes[0].sec).toBe(4);
    expect(setSeconds(launch(), 0, 0).scenes[0].sec).toBe(2);
  });

  it('reorders, duplicates, adds and removes scenes, keeping at least one', () => {
    let p = launch();
    const n = p.scenes.length;
    expect(moveScene(p, 0, n - 1).scenes[n - 1].type).toBe('logo-reveal');
    expect(duplicateScene(p, 0).scenes).toHaveLength(n + 1);
    p = addScene(p, 'stat-ring', recipeBySlug('clean-soft')!, 0);
    expect(p.scenes[1].type).toBe('stat-ring');
    let one = launch();
    while (one.scenes.length > 1) one = removeScene(one, 0);
    expect(removeScene(one, 0).scenes).toHaveLength(1);
  });

  it('restyles: moves and transitions the new style lacks are swapped', () => {
    const p = launch();
    p.scenes[1].transition = 'soft-push';
    const b = restyle(p, recipeBySlug('brutalist')!);
    expect(b.aesthetic).toBe('brutalist');
    expect(b.scenes[1].transition).toBeNull();
    expect(b.scenes[1].type === 'kinetic-type' && b.scenes[1].move).toBe('word-slam');
  });
});

describe('blockers', () => {
  it('a finished plan has none', () => {
    expect(blockers(launch())).toEqual([]);
  });

  it('lists empty text, too few cards, and numbers to fill in or confirm', () => {
    let p = editSlot(launch(), 1, 'text', '  ');
    p = editSlot(p, 2, 'cards', [{ title: 'Only one', subtitle: '' }]);
    p = editSlot(p, 3, 'value', null);
    expect(blockers(p)).toEqual([
      'Scene 2: add the text',
      'Scene 3: add at least 2 cards',
      'Scene 4: fill in the number',
    ]);
    const starter = examplePlan('starter');
    expect(blockers(starter)).toEqual(['Scene 2: fill in the number']);
  });
});
