import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { blockedForMatching, type FilterableRecipe, NO_FILTERS, type RecipeFilters } from '../logic/filters';
import type { Difficulty } from '../logic/recipes';
import { cachedRecipes } from './discover';
import type { RecipeSummary } from './recipes';
import { supabase } from './supabase';

let version = 0;
/** Bumped whenever I change my filters or "Do not eat" marks, so Discover knows to rebuild its deck. */
export const filtersVersion = () => version;

export const toFilterable = (r: RecipeSummary): FilterableRecipe => ({
  id: r.id,
  cookTimeMin: r.cook_time_min,
  difficulty: r.difficulty,
  cuisine: r.cuisine,
});

export interface MySettings {
  filters: RecipeFilters;
  /** Recipes I marked "Do not eat". */
  hidden: Set<number>;
}

/** My filters and "Do not eat" marks (RLS: own rows only). */
export async function loadMySettings(): Promise<MySettings> {
  const [filters, hidden] = await Promise.all([
    supabase.from('user_recipe_filters').select('max_minutes, difficulties, cuisines').maybeSingle(),
    supabase.from('user_hidden_recipes').select('recipe_id'),
  ]);
  if (filters.error) throw filters.error;
  if (hidden.error) throw hidden.error;
  return {
    filters: filters.data
      ? {
          maxMinutes: filters.data.max_minutes,
          difficulties: filters.data.difficulties as Difficulty[],
          cuisines: filters.data.cuisines,
        }
      : NO_FILTERS,
    hidden: new Set(hidden.data.map((h) => h.recipe_id)),
  };
}

export async function saveFilters(f: RecipeFilters) {
  version++;
  const { error } = await supabase.from('user_recipe_filters').upsert(
    {
      max_minutes: f.maxMinutes,
      difficulties: [...f.difficulties],
      cuisines: [...f.cuisines],
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  );
  if (error) throw error;
}

export async function saveHidden(recipeId: number, hidden: boolean) {
  version++;
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
  return new Set(data as number[]);
}

/** Recipes matching must not offer to our couple (my settings + my partner's). */
export async function loadCoupleBlocked(): Promise<Set<number>> {
  const [recipes, mine, partner] = await Promise.all([cachedRecipes(), loadMySettings(), loadPartnerBlocked()]);
  return blockedForMatching(recipes.map(toFilterable), mine.filters, mine.hidden, partner);
}

export interface RecipeSettings {
  settings: MySettings | null;
  loadError: unknown;
  saveError: unknown;
  reload: () => void;
  setFilters: (f: RecipeFilters) => void;
  setHidden: (recipeId: number, hidden: boolean) => void;
}

/**
 * My filters and marks, reloaded whenever the screen is shown (they can change on
 * another screen or device). Changes show immediately and roll back if saving fails.
 */
export function useRecipeSettings(): RecipeSettings {
  const [settings, setSettings] = useState<MySettings | null>(null);
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
  useFocusEffect(reload);

  // Saves run one after another, so a quick Undo can't reach the server before the mark it undoes.
  const queue = useRef<Promise<void>>(Promise.resolve());
  const update = (next: MySettings, save: () => Promise<void>) => {
    const before = current.current;
    apply(next);
    setSaveError(null);
    queue.current = queue.current.then(save).catch((e) => {
      if (before) apply(before);
      setSaveError(e);
    });
  };

  return {
    settings,
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
}
