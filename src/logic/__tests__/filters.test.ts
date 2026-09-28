import {
  activeFilterCount,
  blockedForMatching,
  type FilterableRecipe,
  filterOptions,
  filtersHoldBack,
  MAX_TIME_OPTIONS,
  NO_FILTERS,
  passesFilters,
  type RecipeFilters,
  toggleValue,
  visibleInOverview,
} from '../filters';

const r = (id: number, over: Partial<FilterableRecipe> = {}): FilterableRecipe => ({
  id,
  cookTimeMin: 30,
  difficulty: 'easy',
  cuisine: 'Italian',
  ...over,
});
const f = (over: Partial<RecipeFilters> = {}): RecipeFilters => ({ ...NO_FILTERS, ...over });
const ids = (list: { id: number }[]) => list.map((x) => x.id).sort((a, b) => a - b);
const none = new Set<number>();

describe('max time (US-01)', () => {
  it('offers exactly 15, 30, 45, 60, 90 and 120 min', () => {
    expect([...MAX_TIME_OPTIONS]).toEqual([15, 30, 45, 60, 90, 120]);
  });

  it('30 min hides longer recipes and recipes with no time', () => {
    const recipes = [r(1, { cookTimeMin: 25 }), r(2, { cookTimeMin: 40 }), r(3, { cookTimeMin: 300 }), r(4, { cookTimeMin: null })];
    expect(ids(visibleInOverview(recipes, f({ maxMinutes: 30 }), none))).toEqual([1]);
  });

  it('the limit itself passes', () => {
    expect(passesFilters(r(1, { cookTimeMin: 30 }), f({ maxMinutes: 30 }))).toBe(true);
  });

  it('with no max time, recipes with no time are shown', () => {
    expect(passesFilters(r(1, { cookTimeMin: null }), NO_FILTERS)).toBe(true);
  });
});

describe('difficulty and cuisine (US-01)', () => {
  const recipes = [
    r(1, { difficulty: 'easy', cuisine: 'Italian' }),
    r(2, { difficulty: 'medium', cuisine: 'Mexican' }),
    r(3, { difficulty: 'hard', cuisine: 'Italian' }),
    r(4, { difficulty: 'easy', cuisine: 'Japanese' }),
    r(5, { difficulty: null, cuisine: 'Mexican' }),
    r(6, { difficulty: 'medium', cuisine: null }),
  ];

  it('offers only the values recipes use, difficulty in easy → hard order, cuisines alphabetically', () => {
    expect(filterOptions(recipes)).toEqual({
      difficulties: ['easy', 'medium', 'hard'],
      cuisines: ['Italian', 'Japanese', 'Mexican'],
    });
    expect(filterOptions([r(1, { difficulty: 'hard', cuisine: null })])).toEqual({ difficulties: ['hard'], cuisines: [] });
  });

  it('several values: a chosen difficulty AND a chosen cuisine; missing values still pass', () => {
    const chosen = f({ difficulties: ['easy', 'medium'], cuisines: ['Italian', 'Mexican'] });
    expect(ids(visibleInOverview(recipes, chosen, none))).toEqual([1, 2, 5, 6]);
  });

  it('a missing value passes only that filter; the others still apply (DL-019)', () => {
    const noDifficultyJapanese = r(7, { difficulty: null, cuisine: 'Japanese' });
    expect(passesFilters(noDifficultyJapanese, f({ difficulties: ['easy'], cuisines: ['Italian'] }))).toBe(false);
    expect(passesFilters(noDifficultyJapanese, f({ difficulties: ['easy'] }))).toBe(true);
  });
});

describe('activeFilterCount', () => {
  it('counts each of the three filters once', () => {
    expect(activeFilterCount(NO_FILTERS)).toBe(0);
    expect(activeFilterCount(f({ maxMinutes: 45, cuisines: ['Italian', 'Mexican'] }))).toBe(2);
    expect(activeFilterCount(f({ maxMinutes: 45, difficulties: ['easy'], cuisines: ['Italian'] }))).toBe(3);
  });
});

describe('"Do not eat" in the overview (US-03)', () => {
  it('a marked recipe is hidden even with no filters, and clearing filters keeps it hidden', () => {
    const recipes = [r(1), r(2, { cookTimeMin: 200 })];
    expect(ids(visibleInOverview(recipes, f({ maxMinutes: 30 }), new Set([1])))).toEqual([]);
    expect(ids(visibleInOverview(recipes, NO_FILTERS, new Set([1])))).toEqual([2]);
  });

  it('no filters and no marks ⇒ every recipe, as before (DoD-03)', () => {
    const recipes = [r(1), r(2, { cookTimeMin: null, difficulty: null, cuisine: null })];
    expect(ids(visibleInOverview(recipes, NO_FILTERS, none))).toEqual([1, 2]);
  });
});

describe('blockedForMatching (US-05)', () => {
  const recipes = [
    r(1, { cookTimeMin: 40, cuisine: 'Italian' }),
    r(2, { cookTimeMin: 90, cuisine: 'Italian' }),
    r(3, { cookTimeMin: 20, cuisine: 'Mexican' }),
    r(4, { cookTimeMin: 20, cuisine: 'Italian' }), // "Pasta carbonara", marked by the partner
    r(5, { cookTimeMin: null, cuisine: 'Italian' }),
  ];

  it('blocks what fails my filters, my marks, and what the partner blocks', () => {
    // I: max 60 min. Partner (computed on the server): Italian only + marked 4.
    const partnerBlocked = new Set([3, 4]);
    expect([...blockedForMatching(recipes, f({ maxMinutes: 60 }), none, partnerBlocked)].sort()).toEqual([2, 3, 4, 5]);
    expect([...blockedForMatching(recipes, NO_FILTERS, new Set([1]), none)]).toEqual([1]);
  });

  it('no settings on either side ⇒ nothing blocked (DoD-03)', () => {
    expect(blockedForMatching(recipes, NO_FILTERS, none, none).size).toBe(0);
  });
});

describe('toggleValue', () => {
  it('adds a missing value and removes a present one', () => {
    expect(toggleValue(['a'], 'b')).toEqual(['a', 'b']);
    expect(toggleValue(['a', 'b'], 'a')).toEqual(['b']);
  });
});

describe('filtersHoldBack (Swipe shows "No recipe matches the filters.")', () => {
  const recipes = [r(1, { cookTimeMin: 20 }), r(2, { cookTimeMin: 90 }), r(3, { cookTimeMin: 120 })];
  const quick: RecipeFilters = { ...NO_FILTERS, maxMinutes: 30 };

  it('is true when the filters hide a recipe I have not swiped yet', () => {
    expect(filtersHoldBack(recipes, quick, new Set([1]))).toBe(true);
  });

  it('is false with no filters on, even if "Do not eat" marks or exclusions emptied the deck', () => {
    expect(filtersHoldBack(recipes, NO_FILTERS, new Set())).toBe(false);
  });

  it('is false when everything the filters hide was already swiped', () => {
    expect(filtersHoldBack(recipes, quick, new Set([2, 3]))).toBe(false);
  });
});
