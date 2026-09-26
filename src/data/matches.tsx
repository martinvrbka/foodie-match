import { createContext, type ReactNode, useCallback, useContext, useEffect, useRef, useState } from 'react';
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
