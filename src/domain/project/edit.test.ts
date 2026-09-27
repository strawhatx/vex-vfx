import { describe, expect, it } from 'vitest';
import { jumpFrom, lengthOf, pieceAt, piecesOf, toProgram, toSource } from './edit';

// a 6-second clip split at 2 and 4, with the middle film deleted
const pieces = piecesOf([2, 4], [2], 6);

describe('the film as edited', () => {
  it('plays the kept films back to back', () => {
    expect(pieces).toEqual([
      { s: 0, e: 2, at: 0 },
      { s: 4, e: 6, at: 2 },
    ]);
    expect(lengthOf(pieces)).toBe(4);
  });

  it('unsplit and undeleted, program time is source time', () => {
    const all = piecesOf([], [], 6);
    expect(toProgram(all, 3.3)).toBe(3.3);
    expect(toSource(all, 3.3)).toBe(3.3);
  });

  it('maps source time to program time, a deleted stretch to where the next film starts', () => {
    expect(toProgram(pieces, 1)).toBe(1);
    expect(toProgram(pieces, 3)).toBe(2);
    expect(toProgram(pieces, 5)).toBe(3);
    expect(toProgram(pieces, 6)).toBe(4);
  });

  it('maps program time back, a join to the next film’s start or (for an end) the last one’s end', () => {
    expect(toSource(pieces, 1)).toBe(1);
    expect(toSource(pieces, 2)).toBe(4);
    expect(toSource(pieces, 2, true)).toBe(2);
    expect(toSource(pieces, 3)).toBe(5);
    expect(toSource(pieces, 99)).toBe(6);
  });

  it('knows which film is playing, and where to skip to from a deleted one', () => {
    expect(pieceAt(pieces, 1)).toBe(0);
    expect(pieceAt(pieces, 3)).toBe(-1);
    expect(pieceAt(pieces, 4)).toBe(1);
    expect(jumpFrom(pieces, 1)).toBeNull();
    expect(jumpFrom(pieces, 2)).toBe(4);
    expect(jumpFrom(piecesOf([2], [2], 6), 3)).toBe('end');
    // the first film deleted: start at the second
    expect(jumpFrom(piecesOf([2], [0], 6), 0)).toBe(2);
  });
});
