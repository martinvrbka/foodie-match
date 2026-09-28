// Advanced recipe filters and "Do not eat" marks. Rules in src/logic/CLAUDE.md.
import type { Difficulty } from './recipes';

export interface RecipeFilters {
  /** Only recipes taking at most this many minutes; null = any. */
  maxMinutes: number | null;
  /** Only these difficulties; empty = any. */
  difficulties: readonly Difficulty[];
  /** Only these cuisines; empty = any. */
  cuisines: readonly string[];
}

export interface FilterableRecipe {
  id: number;
  cookTimeMin: number | null;
  difficulty: Difficulty | null;
  cuisine: string | null;
}

export const NO_FILTERS: RecipeFilters = { maxMinutes: null, difficulties: [], cuisines: [] };

/** Fixed max-time steps (PO decision DL-017). */
export const MAX_TIME_OPTIONS = [15, 30, 45, 60, 90, 120] as const;

export const DIFFICULTY_ORDER: readonly Difficulty[] = ['easy', 'medium', 'hard'];

/** How many of the three filters are on, for "Advanced filters (n)". */
export function activeFilterCount(f: RecipeFilters): number {
  return (f.maxMinutes !== null ? 1 : 0) + (f.difficulties.length > 0 ? 1 : 0) + (f.cuisines.length > 0 ? 1 : 0);
}

/**
 * Each filter is checked on its own. A recipe with no cook time fails any max
 * time; a recipe with no difficulty or cuisine passes that filter (others still apply).
 */
export function passesFilters(r: FilterableRecipe, f: RecipeFilters): boolean {
  if (f.maxMinutes !== null && (r.cookTimeMin === null || r.cookTimeMin > f.maxMinutes)) return false;
  if (f.difficulties.length > 0 && r.difficulty !== null && !f.difficulties.includes(r.difficulty)) return false;
  if (f.cuisines.length > 0 && r.cuisine !== null && !f.cuisines.includes(r.cuisine)) return false;
  return true;
}

/** What I see in the recipe overview: our shared filters and my own "Do not eat" marks only. */
export function visibleInOverview<T extends FilterableRecipe>(
  recipes: readonly T[],
  mine: RecipeFilters,
  myHidden: ReadonlySet<number>,
): T[] {
  return recipes.filter((r) => !myHidden.has(r.id) && passesFilters(r, mine));
}

/**
 * Recipes matching must not offer: those failing our shared filters, marked by me, or
 * blocked by my partner (the partner's set comes from the server, which doesn't reveal
 * why; it includes the shared filters and the partner's "Do not eat" marks).
 */
export function blockedForMatching(
  recipes: readonly FilterableRecipe[],
  mine: RecipeFilters,
  myHidden: ReadonlySet<number>,
  partnerBlocked: ReadonlySet<number>,
): Set<number> {
  return new Set(
    recipes.filter((r) => myHidden.has(r.id) || partnerBlocked.has(r.id) || !passesFilters(r, mine)).map((r) => r.id),
  );
}

/**
 * The filters hide some recipe I haven't swiped yet: an empty deck then says "No recipe
 * matches the filters." (with a Filters button) instead of "You've seen every recipe".
 */
export function filtersHoldBack(
  recipes: readonly FilterableRecipe[],
  filters: RecipeFilters,
  mySwiped: ReadonlySet<number>,
): boolean {
  return activeFilterCount(filters) > 0 && recipes.some((r) => !mySwiped.has(r.id) && !passesFilters(r, filters));
}

/** Values the filter panel offers: only difficulties and cuisines recipes actually have. */
export function filterOptions(recipes: readonly FilterableRecipe[]): { difficulties: Difficulty[]; cuisines: string[] } {
  const used = new Set(recipes.map((r) => r.difficulty));
  return {
    difficulties: DIFFICULTY_ORDER.filter((d) => used.has(d)),
    cuisines: [...new Set(recipes.map((r) => r.cuisine).filter((c): c is string => !!c))].sort((a, b) =>
      a.localeCompare(b),
    ),
  };
}

/** Adds the value if missing, removes it if present (multi-select chips). */
export function toggleValue<T>(values: readonly T[], value: T): T[] {
  return values.includes(value) ? values.filter((v) => v !== value) : [...values, value];
}
