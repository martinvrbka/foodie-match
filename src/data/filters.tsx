import { createContext, type ReactNode, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { blockedForMatching, type FilterableRecipe, NO_FILTERS, type RecipeFilters } from '../logic/filters';
import type { Difficulty } from '../logic/recipes';
import { cachedRecipes } from './discover';
import { useProfile } from './profile';
import type { RecipeSummary } from './recipes';
import { supabase } from './supabase';

export const toFilterable = (r: RecipeSummary): FilterableRecipe => ({
  id: r.id,
  cookTimeMin: r.cook_time_min,
  difficulty: r.difficulty,
  cuisine: r.cuisine,
});

export interface MySettings {
  /** Shared with my partner when paired (either of us changes them for both); mine when unpaired. */
  filters: RecipeFilters;
  /** Recipes I marked "Do not eat". */
  hidden: Set<number>;
}

async function loadFilters(): Promise<RecipeFilters> {
  const { data, error } = await supabase.rpc('get_recipe_filters');
  if (error) throw error;
  const f = data as { max_minutes: number | null; difficulties: Difficulty[]; cuisines: string[] };
  return { maxMinutes: f.max_minutes, difficulties: f.difficulties, cuisines: f.cuisines };
}

/** The filters that apply to me (our couple's, or mine when unpaired) and my "Do not eat" marks. */
export async function loadMySettings(): Promise<MySettings> {
  const [filters, hidden] = await Promise.all([loadFilters(), supabase.from('user_hidden_recipes').select('recipe_id')]);
  if (hidden.error) throw hidden.error;
  return { filters, hidden: new Set(hidden.data.map((h) => h.recipe_id)) };
}

/** Saves the filters for both of us (or just me when unpaired). */
export async function saveFilters(f: RecipeFilters) {
  const { error } = await supabase.rpc('set_recipe_filters', {
    p_max_minutes: f.maxMinutes as number,
    p_difficulties: [...f.difficulties],
    p_cuisines: [...f.cuisines],
  });
  if (error) throw error;
}

export async function saveHidden(recipeId: number, hidden: boolean) {
  const { error } = hidden
    ? await supabase
        .from('user_hidden_recipes')
        .upsert({ recipe_id: recipeId }, { onConflict: 'user_id,recipe_id', ignoreDuplicates: true })
    : await supabase.from('user_hidden_recipes').delete().eq('recipe_id', recipeId);
  if (error) throw error;
}

/** Recipes my partner's settings block, without saying why. Empty when unpaired. */
export async function loadPartnerBlocked(): Promise<Set<number>> {
  const { data, error } = await supabase.rpc('partner_blocked_recipes');
  if (error) throw error;
  return new Set(data);
}

/** Recipes matching must not offer to our couple (shared filters + both partners' marks). */
export async function loadCoupleBlocked(): Promise<Set<number>> {
  const [recipes, mine, partner] = await Promise.all([cachedRecipes(), loadMySettings(), loadPartnerBlocked()]);
  return blockedForMatching(recipes.map(toFilterable), mine.filters, mine.hidden, partner);
}

export interface RecipeSettings {
  settings: MySettings | null;
  /**
   * Bumped after every saved change, mine or my partner's (not by the first load), so
   * Discover knows to rebuild its deck.
   */
  version: number;
  loadError: unknown;
  saveError: unknown;
  reload: () => void;
  setFilters: (f: RecipeFilters) => void;
  setHidden: (recipeId: number, hidden: boolean) => void;
}

const RecipeSettingsContext = createContext<RecipeSettings>({
  settings: null,
  version: 0,
  loadError: null,
  saveError: null,
  reload: () => {},
  setFilters: () => {},
  setHidden: () => {},
});

/**
 * The filters and my marks, shared by all signed-in screens. My partner's filter changes
 * arrive live. My changes show immediately and roll back if saving fails.
 */
export function RecipeSettingsProvider({ children }: { children: ReactNode }) {
  const { me } = useProfile();
  const myId = me?.id ?? null;
  const coupleId = me?.couple_id ?? null;
  const [settings, setSettings] = useState<MySettings | null>(null);
  const [version, setVersion] = useState(0);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [saveError, setSaveError] = useState<unknown>(null);
  const current = useRef<MySettings | null>(null);

  const apply = (s: MySettings) => {
    current.current = s;
    setSettings(s);
  };

  const reload = useCallback(() => {
    setLoadError(null);
    loadMySettings().then(apply, setLoadError);
  }, []);

  // Pairing or unpairing switches between our shared filters and my own.
  useEffect(() => {
    if (myId) reload();
  }, [myId, coupleId, reload]);

  useEffect(() => {
    if (!coupleId) return;
    const channel = supabase
      .channel(`couple-filters-${coupleId}-${Math.random().toString(36).slice(2)}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'couple_recipe_filters', filter: `couple_id=eq.${coupleId}` },
        () => {
          loadFilters().then((filters) => {
            if (current.current) apply({ ...current.current, filters });
            setVersion((v) => v + 1);
          }, setLoadError);
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [coupleId]);

  // Saves run one after another, so a quick Undo can't reach the server before the mark it undoes.
  const queue = useRef<Promise<void>>(Promise.resolve());
  const update = (next: MySettings, save: () => Promise<void>) => {
    const before = current.current;
    apply(next);
    setSaveError(null);
    queue.current = queue.current
      .then(save)
      .then(() => setVersion((v) => v + 1))
      .catch((e) => {
        if (before) apply(before);
        setSaveError(e);
      });
  };

  const value: RecipeSettings = {
    settings,
    version,
    loadError,
    saveError,
    reload,
    setFilters: (filters) => {
      if (current.current) update({ ...current.current, filters }, () => saveFilters(filters));
    },
    setHidden: (recipeId, hidden) => {
      const s = current.current;
      if (!s) return;
      const next = new Set(s.hidden);
      if (hidden) next.add(recipeId);
      else next.delete(recipeId);
      update({ ...s, hidden: next }, () => saveHidden(recipeId, hidden));
    },
  };
  return <RecipeSettingsContext.Provider value={value}>{children}</RecipeSettingsContext.Provider>;
}

export const useRecipeSettings = () => useContext(RecipeSettingsContext);
