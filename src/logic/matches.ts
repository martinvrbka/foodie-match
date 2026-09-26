// Matches list: filters, ordering and the "N new matches" count.

export interface MatchItem {
  recipeId: number;
  /** ISO timestamp the match was created. */
  createdAt: string;
  cookTimeMin: number | null;
  cuisine: string | null;
}

export interface MatchFilter {
  /** Only matches cooking in at most this many minutes; null = any. */
  maxMinutes: number | null;
  /** Only this cuisine; null = any. */
  cuisine: string | null;
}

export const COOK_TIME_OPTIONS = [30, 45, 60] as const;

/** Newest first, then filtered. A recipe with unknown cook time never passes a time filter. */
export function filterMatches<T extends MatchItem>(items: readonly T[], filter: MatchFilter): T[] {
  return items
    .filter((m) => filter.maxMinutes === null || (m.cookTimeMin !== null && m.cookTimeMin <= filter.maxMinutes))
    .filter((m) => filter.cuisine === null || m.cuisine === filter.cuisine)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || a.recipeId - b.recipeId);
}

/** Cuisines present in the matches, alphabetically (for the filter chips). */
export function matchCuisines(items: readonly MatchItem[]): string[] {
  return [...new Set(items.map((m) => m.cuisine).filter((c): c is string => !!c))].sort((a, b) =>
    a.localeCompare(b),
  );
}

/** Matches created after I last opened the Matches screen. Never opened ⇒ all of them. */
export function countNewMatches(items: readonly MatchItem[], lastSeen: string | null): number {
  if (lastSeen === null) return items.length;
  const seen = Date.parse(lastSeen);
  return items.filter((m) => Date.parse(m.createdAt) > seen).length;
}
