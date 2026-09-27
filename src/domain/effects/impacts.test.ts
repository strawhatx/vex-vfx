import { describe, expect, it } from 'vitest';
import { FAMILY_STYLES, IMPACTS, familyOf, stylesLike } from './impacts';
import { PALETTES } from './palettes';

describe('impact families', () => {
  it('a clip switches style only within its family', () => {
    expect(stylesLike('slam')).toEqual(['punch', 'slam', 'blast', 'anime']);
    expect(stylesLike('grenade')).toEqual(['fireball', 'grenade', 'bigboom']);
    expect(stylesLike('pulse')).toEqual(['ring', 'ground', 'pulse', 'nova']);
  });

  it('every style is in its own family, and has a size', () => {
    for (const [family, styles] of Object.entries(FAMILY_STYLES)) {
      for (const st of styles) {
        expect(familyOf(st)).toBe(family);
        expect(IMPACTS[st].size).toBeGreaterThan(0);
      }
    }
  });

  it('every explosion sends out a ground shockwave', () => {
    for (const st of FAMILY_STYLES.explosion) {
      expect(IMPACTS[st].wave?.dust).toBe(true);
      expect(IMPACTS[st].rings).toBe(0);
    }
  });

  it("a style this version doesn't know counts as a hit rather than crashing", () => {
    expect(familyOf('nope' as never)).toBe('hit');
  });

  it('words pop up on a burst, in the chosen colors, starting on Ember', () => {
    expect(FAMILY_STYLES.word).toEqual(['pow', 'boom', 'ko', 'bam']);
    for (const st of FAMILY_STYLES.word) {
      expect(IMPACTS[st].word?.text).toBe(IMPACTS[st].label);
      expect(PALETTES[IMPACTS[st].pal!].name).toBe('Ember');
    }
  });

  it('splashes are water impacts, starting on Blue', () => {
    expect(FAMILY_STYLES.water).toEqual(['splash', 'bigsplash']);
    for (const st of FAMILY_STYLES.water) {
      expect(IMPACTS[st].splash?.drops).toBeGreaterThan(0);
      expect(PALETTES[IMPACTS[st].pal!].name).toBe('Blue');
    }
  });

  it('a nova takes the chosen colors, starting on Prism', () => {
    expect(IMPACTS.nova.palette).toBe(true);
    expect(PALETTES[IMPACTS.nova.pal!].name).toBe('Prism');
  });
});
