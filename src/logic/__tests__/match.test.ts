import { expandExclusions, isCompatible, isMatch, type IngredientNode } from '../match';

// meat(1) > pork(2) > bacon(3), ham(4); seafood(5) > shrimp(6); garlic(7); dairy(8) > butter(9)
const tree: IngredientNode[] = [
  { id: 1, parentId: null },
  { id: 2, parentId: 1 },
  { id: 3, parentId: 2 },
  { id: 4, parentId: 2 },
  { id: 5, parentId: null },
  { id: 6, parentId: 5 },
  { id: 7, parentId: null },
  { id: 8, parentId: null },
  { id: 9, parentId: 8 },
];
const none = new Set<number>();
const likes = (excluded = none) => ({ likedInDiscover: true, excluded });
const nope = (excluded = none) => ({ likedInDiscover: false, excluded });

describe('expandExclusions', () => {
  it('is empty for no exclusions', () => {
    expect(expandExclusions([], tree)).toEqual(new Set());
  });
  it('includes all descendants, several levels deep', () => {
    expect(expandExclusions([1], tree)).toEqual(new Set([1, 2, 3, 4]));
  });
  it('does not include parents or siblings', () => {
    expect(expandExclusions([3], tree)).toEqual(new Set([3]));
  });
  it('vegetarian preset (meat + seafood) covers bacon and shrimp but not butter', () => {
    const ex = expandExclusions([1, 5], tree);
    expect(ex.has(3)).toBe(true);
    expect(ex.has(6)).toBe(true);
    expect(ex.has(9)).toBe(false);
  });
  it('keeps an excluded id that is unknown to the hierarchy', () => {
    expect(expandExclusions([99], tree)).toEqual(new Set([99]));
  });
  it('terminates on a cyclic mapping', () => {
    const cyclic = [{ id: 1, parentId: 2 }, { id: 2, parentId: 1 }];
    expect(expandExclusions([1], cyclic)).toEqual(new Set([1, 2]));
  });
});

describe('isCompatible', () => {
  it('a recipe with no ingredients is compatible', () => {
    expect(isCompatible([], new Set([1]))).toBe(true);
  });
  it('checks every exclusion set given', () => {
    expect(isCompatible([7, 9], new Set([3]), new Set([9]))).toBe(false);
    expect(isCompatible([7, 9], new Set([3]), new Set([6]))).toBe(true);
  });
});

describe('isMatch', () => {
  const carbonara = [3, 7, 9]; // bacon, garlic, butter

  it('both liked and nobody excludes anything ⇒ match', () => {
    expect(isMatch(carbonara, likes(), likes())).toBe(true);
  });
  it('only one partner liked ⇒ no match', () => {
    expect(isMatch(carbonara, likes(), nope())).toBe(false);
    expect(isMatch(carbonara, nope(), likes())).toBe(false);
  });
  it('unpaired user never matches', () => {
    expect(isMatch(carbonara, likes(), null)).toBe(false);
  });
  it('my own exclusion blocks the match', () => {
    expect(isMatch(carbonara, likes(new Set([7])), likes())).toBe(false);
  });
  it("partner's exclusion blocks the match (union of both lists)", () => {
    expect(isMatch(carbonara, likes(), likes(new Set([9])))).toBe(false);
  });
  it('an excluded parent blocks via its descendant (no pork ⇒ no bacon)', () => {
    expect(isMatch(carbonara, likes(expandExclusions([2], tree)), likes())).toBe(false);
  });
  it('retroactive: removing the blocking exclusion turns the same likes into a match', () => {
    const before = likes(expandExclusions([2], tree));
    const after = likes(expandExclusions([], tree));
    expect(isMatch(carbonara, before, likes())).toBe(false);
    expect(isMatch(carbonara, after, likes())).toBe(true);
  });
});
