import { contrastRatio, meetsAA } from '../contrast';
import { colors, textPairs } from '../tokens';

describe('contrastRatio', () => {
  it('black on white is 21:1', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 1);
  });
  it('is symmetric', () => {
    expect(contrastRatio('#E4572E', '#FFFFFF')).toBeCloseTo(contrastRatio('#FFFFFF', '#E4572E'), 5);
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
