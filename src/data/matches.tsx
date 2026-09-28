import { createContext, type ReactNode, useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { cachedRecipes } from './discover';
import { useProfile } from './profile';
import type { RecipeSummary } from './recipes';
import { supabase } from './supabase';

interface MatchCelebration {
  /** The match being celebrated, shown by <MatchOverlay/>; null when none. */
  current: RecipeSummary | null;
  /** Celebrate a live match (once per recipe, whichever phone hears first). */
  celebrate: (recipeId: number) => void;
  dismiss: () => void;
}

const MatchContext = createContext<MatchCelebration>({ current: null, celebrate: () => {}, dismiss: () => {} });

/**
 * "It's a match!" on both phones: the swiping phone calls celebrate() from the RPC
 * result, the partner's phone hears the new match over realtime. Only live swipe
 * matches (via = 'swipe') are celebrated, not retroactive ones.
 */
export function MatchProvider({ children }: { children: ReactNode }) {
  const { me } = useProfile();
  const coupleId = me?.couple_id ?? null;
  const [current, setCurrent] = useState<RecipeSummary | null>(null);
  const shown = useRef(new Set<string>());

  const celebrate = useCallback(
    (recipeId: number) => {
      const key = `${coupleId}:${recipeId}`;
      if (shown.current.has(key)) return;
      shown.current.add(key);
      cachedRecipes().then(
        (recipes) => setCurrent(recipes.find((r) => r.id === recipeId) ?? null),
        () => {},
      );
    },
    [coupleId],
  );

  useEffect(() => {
    if (!coupleId) return;
    const channel = supabase
      .channel(`matches-${coupleId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'matches', filter: `couple_id=eq.${coupleId}` },
        (payload) => {
          const row = payload.new as { recipe_id: number; via: string };
          if (row.via === 'swipe') celebrate(row.recipe_id);
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [coupleId, celebrate]);

  return (
    <MatchContext.Provider value={{ current, celebrate, dismiss: () => setCurrent(null) }}>
      {children}
    </MatchContext.Provider>
  );
}

export const useMatchCelebration = () => useContext(MatchContext);

export interface MatchRow {
  recipe: RecipeSummary;
  createdAt: string;
}

/** Our visible matches (removed and now-excluded ones are hidden), live-updated. */
export function useMatchList() {
  const { me } = useProfile();
  const coupleId = me?.couple_id ?? null;
  const [matches, setMatches] = useState<MatchRow[] | null>(null);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(async () => {
    if (!coupleId) {
      setMatches([]);
      return;
    }
    try {
      const [recipes, rows] = await Promise.all([
        cachedRecipes(),
        supabase.from('visible_matches').select('recipe_id, created_at'),
      ]);
      if (rows.error) throw rows.error;
      const byId = new Map(recipes.map((r) => [r.id, r]));
      setMatches(
        rows.data.flatMap((row) => {
          const recipe = row.recipe_id === null ? undefined : byId.get(row.recipe_id);
          return recipe && row.created_at ? [{ recipe, createdAt: row.created_at }] : [];
        }),
      );
      setError(null);
    } catch (e) {
      setError(e);
    }
  }, [coupleId]);

  useEffect(() => {
    load();
    if (!coupleId) return;
    const channel = supabase
      .channel(`match-list-${coupleId}-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'matches', filter: `couple_id=eq.${coupleId}` }, () =>
        load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [coupleId, load]);

  return { matches, error, reload: load };
}

/** Hides a match for both of us; it is never re-created. */
export async function removeMatch(recipeId: number) {
  const { error } = await supabase.rpc('remove_match', { p_recipe_id: recipeId });
  if (error) throw error;
}

/** Whether this recipe is currently one of our visible matches. */
export async function isVisibleMatch(recipeId: number): Promise<boolean> {
  const { count, error } = await supabase
    .from('visible_matches')
    .select('recipe_id', { count: 'exact', head: true })
    .eq('recipe_id', recipeId);
  if (error) throw error;
  return (count ?? 0) > 0;
}

// When I last opened the Matches screen, per device (for "N new matches").
const seenKey = (userId: string) => `matchesLastSeen:${userId}`;

export function matchesLastSeen(userId: string): string | null {
  try {
    return localStorage.getItem(seenKey(userId));
  } catch {
    return null;
  }
}

const seenListeners = new Set<() => void>();

export function markMatchesSeen(userId: string, at: string) {
  try {
    localStorage.setItem(seenKey(userId), at);
  } catch {
    // Not critical: the count just stays until next time.
  }
  seenListeners.forEach((l) => l());
}

/** matchesLastSeen() that re-renders when the Matches screen marks matches seen. */
export function useMatchesLastSeen(userId: string): string | null {
  return useSyncExternalStore(
    (l) => {
      seenListeners.add(l);
      return () => seenListeners.delete(l);
    },
    () => matchesLastSeen(userId),
  );
}
