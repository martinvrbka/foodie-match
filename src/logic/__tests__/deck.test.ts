import { buildDeck, type DeckInput, type DeckRecipe } from '../deck';

/** Small deterministic RNG (mulberry32) so orders are reproducible. */
function seeded(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Ingredients: 1 garlic, 2 pork, 3 prawn, 4 rice
const recipes: DeckRecipe[] = [
  { id: 10, ingredientIds: [4] },
  { id: 11, ingredientIds: [1, 4] },
  { id: 12, ingredientIds: [2, 4] },
  { id: 13, ingredientIds: [3] },
  { id: 14, ingredientIds: [] },
  { id: 15, ingredientIds: [1] },
];
const none = new Set<number>();
const input = (over: Partial<DeckInput> = {}): DeckInput => ({
  recipes,
  myExcluded: none,
  mySwiped: none,
  partner: null,
  rng: seeded(1),
  ...over,
});
const ids = (deck: { recipeId: number }[]) => deck.map((c) => c.recipeId);

describe('buildDeck', () => {
  it('unpaired: every recipe once, none flagged', () => {
    const deck = buildDeck(input());
    expect(ids(deck).sort()).toEqual([10, 11, 12, 13, 14, 15]);
    expect(deck.every((c) => !c.partnerExcluded)).toBe(true);
  });

  it('filters by my own exclusions', () => {
    const deck = buildDeck(input({ myExcluded: new Set([2, 3]) }));
    expect(ids(deck).sort()).toEqual([10, 11, 14, 15]);
  });

  it('never drops a recipe because of the partner: it goes last, flagged', () => {
    const deck = buildDeck(input({ partner: { excluded: new Set([1]), liked: none } }));
    expect(ids(deck).sort()).toEqual([10, 11, 12, 13, 14, 15]);
    expect(deck.slice(-2).map((c) => [c.recipeId, c.partnerExcluded]).sort()).toEqual([
      [11, true],
      [15, true],
    ]);
    expect(deck.slice(0, -2).every((c) => !c.partnerExcluded)).toBe(true);
  });

  it('drops recipes I already swiped', () => {
    const deck = buildDeck(input({ mySwiped: new Set([10, 11, 12]) }));
    expect(ids(deck).sort()).toEqual([13, 14, 15]);
  });

  it('empty deck when everything is swiped or excluded', () => {
    expect(buildDeck(input({ mySwiped: new Set([10, 11, 12, 13]), myExcluded: new Set([1]) }))).toEqual([
      { recipeId: 14, partnerExcluded: false },
    ]);
    expect(buildDeck(input({ recipes: [] }))).toEqual([]);
  });

  it('puts partner-liked recipes at every 3rd position while any remain', () => {
    const many: DeckRecipe[] = Array.from({ length: 12 }, (_, i) => ({ id: i + 1, ingredientIds: [] }));
    const liked = new Set([1, 2, 3]);
    const deck = buildDeck(input({ recipes: many, partner: { excluded: none, liked } }));
    const positions = deck.map((c, i) => (liked.has(c.recipeId) ? i : -1)).filter((i) => i >= 0);
    expect(positions).toEqual([2, 5, 8]);
  });

  it('when only partner-liked recipes are left they simply follow', () => {
    const deck = buildDeck(
      input({ recipes: recipes.slice(0, 3), partner: { excluded: none, liked: new Set([10, 11, 12]) } }),
    );
    expect(ids(deck).sort()).toEqual([10, 11, 12]);
  });

  it('a partner-liked recipe the partner cannot eat still goes last', () => {
    const deck = buildDeck(input({ partner: { excluded: new Set([2]), liked: new Set([12]) } }));
    expect(deck[deck.length - 1]).toEqual({ recipeId: 12, partnerExcluded: true });
  });

  it('drops recipes blocked by either partner’s filters or "Do not eat" marks, even partner-liked ones', () => {
    const deck = buildDeck(
      input({ blocked: new Set([10, 12]), partner: { excluded: new Set([1]), liked: new Set([10]) } }),
    );
    expect(ids(deck).sort()).toEqual([11, 13, 14, 15]);
  });

  it('empty deck when filters block everything left', () => {
    expect(buildDeck(input({ mySwiped: new Set([10, 11, 12]), blocked: new Set([13, 14, 15]) }))).toEqual([]);
  });

  it('same inputs and RNG seed ⇒ same order; another seed ⇒ usually different', () => {
    const many: DeckRecipe[] = Array.from({ length: 30 }, (_, i) => ({ id: i + 1, ingredientIds: [] }));
    const a = ids(buildDeck(input({ recipes: many, rng: seeded(7) })));
    const b = ids(buildDeck(input({ recipes: many, rng: seeded(7) })));
    const c = ids(buildDeck(input({ recipes: many, rng: seeded(8) })));
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });
});
