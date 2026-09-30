import { describe, expect, it } from 'vitest';
import { DEFAULT_STACK, fitStack, moveLayer } from './stack';

describe("the film's layers, stacked", () => {
  it('start with text on top and cutouts at the bottom', () => {
    expect(DEFAULT_STACK).toEqual(['cutouts', 'clips', 'filter', 'screen', 'text']);
  });

  it('move a layer up or down one place, never past the ends', () => {
    // (text behind a cutout: moved to the bottom)
    let s = [...DEFAULT_STACK];
    for (let k = 0; k < 4; k++) s = moveLayer(s, 'text', -1);
    expect(s).toEqual(['text', 'cutouts', 'clips', 'filter', 'screen']);
    expect(moveLayer(s, 'text', -1)).toEqual(s);
    expect(moveLayer(s, 'screen', 1)).toEqual(s);
    expect(moveLayer(s, 'filter', 1)).toEqual(['text', 'cutouts', 'clips', 'screen', 'filter']);
  });

  it('are read back from a saved film, whatever it holds', () => {
    expect(fitStack(['text', 'cutouts', 'clips', 'filter', 'screen'])).toEqual([
      'text',
      'cutouts',
      'clips',
      'filter',
      'screen',
    ]);
    expect(fitStack(undefined)).toEqual(DEFAULT_STACK);
    // (each once, unknown ones dropped, missing ones after, in their default order)
    expect(fitStack(['text', 'text', 'nope'])).toEqual(['text', 'cutouts', 'clips', 'filter', 'screen']);
    expect(fitStack(['screen', 'cutouts'])).toEqual(['screen', 'cutouts', 'clips', 'filter', 'text']);
  });
});
