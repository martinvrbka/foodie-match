import { expandExclusions } from '../logic/match';
import type { DeckInput, DeckRecipe } from '../logic/deck';
import { cachedIngredients } from './exclusions';
import { listRecipes, type RecipeSummary } from './recipes';
import { supabase } from './supabase';

const PAGE = 1000;

/** All (recipe, ingredient) pairs. Static between seeds, so cached per app session. */
let recipeIngredientsCache: Promise<Map<number, number[]>> | null = null;

async function loadRecipeIngredients(): Promise<Map<number, number[]>> {
  const first = await supabase
    .from('recipe_ingredients')
    .select('recipe_id, ingredient_id', { count: 'exact' })
    .order('id')
    .range(0, PAGE - 1);
  if (first.error) throw first.error;
  const pages = [first.data];
  const total = first.count ?? first.data.length;
  const rest = await Promise.all(
    Array.from({ length: Math.ceil(total / PAGE) - 1 }, (_, i) =>
      supabase
        .from('recipe_ingredients')
        .select('recipe_id, ingredient_id')
        .order('id')
        .range((i + 1) * PAGE, (i + 2) * PAGE - 1),
    ),
  );
  for (const r of rest) {
    if (r.error) throw r.error;
    pages.push(r.data);
  }
  const byRecipe = new Map<number, number[]>();
  for (const row of pages.flat()) {
    const list = byRecipe.get(row.recipe_id);
    if (list) list.push(row.ingredient_id);
    else byRecipe.set(row.recipe_id, [row.ingredient_id]);
  }
  return byRecipe;
}

function cachedRecipeIngredients() {
  recipeIngredientsCache ??= loadRecipeIngredients().catch((e) => {
    recipeIngredientsCache = null;
    throw e;
  });
  return recipeIngredientsCache;
}

let recipesCache: Promise<RecipeSummary[]> | null = null;
export function cachedRecipes() {
  recipesCache ??= listRecipes().catch((e) => {
    recipesCache = null;
    throw e;
  });
  return recipesCache;
}

export interface DiscoverData {
  recipes: Map<number, RecipeSummary>;
  deckInput: Omit<DeckInput, 'rng'>;
  partnerName: string | null;
}

/** Everything buildDeck needs, loaded fresh except for the static recipe data. */
export async function loadDiscover(userId: string): Promise<DiscoverData> {
  const [recipes, recipeIngredients, ingredients, profiles, exclusions, swipes] = await Promise.all([
    cachedRecipes(),
    cachedRecipeIngredients(),
    cachedIngredients(),
    // RLS: me, plus my partner when paired.
    supabase.from('profiles').select('id, display_name'),
    supabase.from('user_excluded_ingredients').select('user_id, ingredient_id'),
    supabase.from('swipes').select('user_id, recipe_id, liked').eq('context', 'discover'),
  ]);
  for (const r of [profiles, exclusions, swipes]) if (r.error) throw r.error;

  const partner = profiles.data!.find((p) => p.id !== userId) ?? null;
  const nodes = ingredients.map((i) => ({ id: i.id, parentId: i.parentId }));
  const explicitOf = (uid: string) =>
    exclusions.data!.filter((e) => e.user_id === uid).map((e) => e.ingredient_id);
  const deckRecipes: DeckRecipe[] = recipes.map((r) => ({
    id: r.id,
    ingredientIds: recipeIngredients.get(r.id) ?? [],
  }));

  return {
    recipes: new Map(recipes.map((r) => [r.id, r])),
    partnerName: partner?.display_name ?? null,
    deckInput: {
      recipes: deckRecipes,
      myExcluded: expandExclusions(explicitOf(userId), nodes),
      mySwiped: new Set(swipes.data!.filter((s) => s.user_id === userId).map((s) => s.recipe_id)),
      partner: partner
        ? {
            excluded: expandExclusions(explicitOf(partner.id), nodes),
            liked: new Set(swipes.data!.filter((s) => s.user_id === partner.id && s.liked).map((s) => s.recipe_id)),
          }
        : null,
    },
  };
}

/** Saves a discover swipe. `matched` = it's now a match for the couple. */
export async function swipe(recipeId: number, liked: boolean): Promise<{ matched: boolean }> {
  const { data, error } = await supabase.rpc('discover_swipe', { p_recipe_id: recipeId, p_liked: liked });
  if (error) throw error;
  return data as { matched: boolean };
}

export async function undoLastSwipe(): Promise<{ recipe_id: number; liked: boolean }> {
  const { data, error } = await supabase.rpc('undo_last_discover_swipe');
  if (error) throw error;
  return data as { recipe_id: number; liked: boolean };
}

export type SwipeFilter = 'all' | 'liked' | 'nope' | 'matches';

/** Recipe ids for the list filters: my discover likes/nopes and our visible matches. */
export async function loadMyRecipeMarks(
  userId: string,
): Promise<{ liked: Set<number>; nope: Set<number>; matches: Set<number> }> {
  const [swipes, matches] = await Promise.all([
    supabase.from('swipes').select('recipe_id, liked').eq('context', 'discover').eq('user_id', userId),
    supabase.from('visible_matches').select('recipe_id'),
  ]);
  if (swipes.error) throw swipes.error;
  if (matches.error) throw matches.error;
  return {
    liked: new Set(swipes.data.filter((s) => s.liked).map((s) => s.recipe_id)),
    nope: new Set(swipes.data.filter((s) => !s.liked).map((s) => s.recipe_id)),
    matches: new Set(matches.data.map((m) => m.recipe_id).filter((id): id is number => id !== null)),
  };
}
