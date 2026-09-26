import { contrastRatio, meetsAA } from '../contrast';
import { colors, textPairs } from '../tokens';

describe('contrastRatio', () => {
  it('black on white is 21:1', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 1);
  });
  it('is symmetric', () => {
    expect(contrastRatio('#E4572E', '#FFFFFF')).toBeCloseTo(contrastRatio('#FFFFFF', '#E4572E'), 5);
  });
  it('ignores hex case and a missing #', () => {
    expect(contrastRatio('#e4572e', 'ffffff')).toBeCloseTo(contrastRatio('#E4572E', '#FFFFFF'), 5);
  });
  it('same color is 1:1', () => {
    expect(contrastRatio('#6A994E', '#6A994E')).toBeCloseTo(1, 5);
  });
  it('uses 4.5 for normal text and 3.0 for large text', () => {
    // #767676 on white ≈ 4.54 (passes), #777777 ≈ 4.48 (fails normal, passes large)
    expect(meetsAA('#767676', '#FFFFFF')).toBe(true);
    expect(meetsAA('#777777', '#FFFFFF')).toBe(false);
    expect(meetsAA('#777777', '#FFFFFF', true)).toBe(true);
    // #959595 on white ≈ 2.96: fails even large
    expect(meetsAA('#959595', '#FFFFFF', true)).toBe(false);
  });
  // KNOWN BUG: 3-digit shorthand is parsed as NaN, so a valid color like '#FFF'
  // makes the contrast test fail with no useful message. Remove `.failing` when fixed.
  it.failing('supports 3-digit shorthand hex', () => {
    expect(contrastRatio('#FFF', '#000')).toBeCloseTo(21, 1);
  });
  it('documents why primaryStrong exists: brand tomato fails AA for normal white text', () => {
    expect(meetsAA(colors.onPrimary, colors.primary)).toBe(false);
    expect(meetsAA(colors.onPrimary, colors.primary, true)).toBe(true);
  });
});

describe('theme text pairs meet WCAG AA', () => {
  it.each(textPairs.map((p) => [p.name, p] as const))('%s', (_name, p) => {
    expect(meetsAA(p.fg, p.bg, p.large)).toBe(true);
  });
});
