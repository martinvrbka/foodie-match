import { supabase } from './supabase';

export interface RecipeSummary {
  id: number;
  title: string;
  image_url: string | null;
  cook_time_min: number | null;
  cook_time_estimated: boolean;
  cuisine: string | null;
  category: string | null;
}

export interface RecipeDetail extends RecipeSummary {
  instructions: string[];
  ingredients: string[];
}

const SUMMARY = 'id, title, image_url, cook_time_min, cook_time_estimated, cuisine, category';
const PAGE = 1000; // PostgREST's default max rows per request

/** All recipes, alphabetically. */
export async function listRecipes(): Promise<RecipeSummary[]> {
  const out: RecipeSummary[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('recipes')
      .select(SUMMARY)
      .order('title')
      .range(from, from + PAGE - 1);
    if (error) throw error;
    out.push(...data);
    if (data.length < PAGE) return out;
  }
}

export async function getRecipe(id: number): Promise<RecipeDetail | null> {
  const { data, error } = await supabase
    .from('recipes')
    .select(`${SUMMARY}, instructions, recipe_ingredients (raw_text, position)`)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const { recipe_ingredients, ...recipe } = data;
  return {
    ...recipe,
    ingredients: [...recipe_ingredients].sort((a, b) => a.position - b.position).map((i) => i.raw_text),
  };
}

/** TheMealDB serves smaller versions of each photo; other URLs are used as is. */
export function photoUrl(url: string | null, size: 'small' | 'medium' | 'full'): string | undefined {
  if (!url) return undefined;
  if (size === 'full' || !url.includes('themealdb.com')) return url;
  return `${url}/${size}`;
}
