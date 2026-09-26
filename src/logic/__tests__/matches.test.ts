import { countNewMatches, filterMatches, matchCuisines, type MatchItem } from '../matches';

const m = (recipeId: number, createdAt: string, cookTimeMin: number | null, cuisine: string | null): MatchItem => ({
  recipeId,
  createdAt,
  cookTimeMin,
  cuisine,
});
const items = [
  m(1, '2026-09-26T10:00:00Z', 30, 'Italian'),
  m(2, '2026-09-26T12:00:00Z', 60, 'Thai'),
  m(3, '2026-09-26T11:00:00Z', 45, 'Italian'),
  m(4, '2026-09-26T09:00:00Z', null, null),
];
const ids = (list: MatchItem[]) => list.map((x) => x.recipeId);
const any = { maxMinutes: null, cuisine: null };

describe('filterMatches', () => {
  it('no filter: all, newest first', () => {
    expect(ids(filterMatches(items, any))).toEqual([2, 3, 1, 4]);
  });

  it('max cook time is inclusive; unknown cook time is excluded', () => {
    expect(ids(filterMatches(items, { maxMinutes: 45, cuisine: null }))).toEqual([3, 1]);
  });

  it('filters by cuisine', () => {
    expect(ids(filterMatches(items, { maxMinutes: null, cuisine: 'Italian' }))).toEqual([3, 1]);
  });

  it('combines both filters', () => {
    expect(ids(filterMatches(items, { maxMinutes: 30, cuisine: 'Italian' }))).toEqual([1]);
    expect(ids(filterMatches(items, { maxMinutes: 30, cuisine: 'Thai' }))).toEqual([]);
  });

  it('breaks equal timestamps by recipe id so the order is stable', () => {
    const same = [m(9, '2026-09-26T10:00:00Z', 10, null), m(8, '2026-09-26T10:00:00Z', 10, null)];
    expect(ids(filterMatches(same, any))).toEqual([8, 9]);
  });

  it('empty in, empty out', () => {
    expect(filterMatches([], any)).toEqual([]);
  });
});

describe('matchCuisines', () => {
  it('distinct, alphabetical, without empty values', () => {
    expect(matchCuisines(items)).toEqual(['Italian', 'Thai']);
  });
});

describe('countNewMatches', () => {
  it('counts matches newer than the last visit', () => {
    expect(countNewMatches(items, '2026-09-26T10:30:00Z')).toBe(2);
    expect(countNewMatches(items, '2026-09-26T12:00:00Z')).toBe(0);
  });

  it('never visited ⇒ every match is new', () => {
    expect(countNewMatches(items, null)).toBe(4);
  });
});
