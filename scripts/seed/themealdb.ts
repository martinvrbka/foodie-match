// Imports every TheMealDB recipe into our own tables. Safe to re-run: recipes are
// matched by (source, source_id) and ingredients by canonical_name, so ids, swipes
// and exclusions survive. Run with Node 24 (type stripping):
//   npm run seed            → cloud project from .env (SUPABASE_SECRET_KEY)
//   npm run seed -- --local → local Supabase (npx supabase start)
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../../src/data/database.types.ts';
import { ingredientTable, normalizeIngredient, type IngredientMap } from '../../src/logic/ingredients.ts';
import { estimateCookTime, splitInstructions } from '../../src/logic/recipes.ts';

const API = 'https://www.themealdb.com/api/json/v1/1';
const BATCH = 200;

interface Meal {
  idMeal: string;
  strMeal: string;
  strCategory: string | null;
  strArea: string | null;
  strCountry?: string | null;
  strInstructions: string | null;
  strMealThumb: string | null;
  [key: string]: string | null | undefined;
}

function target(): { url: string; key: string; label: string } {
  if (process.argv.includes('--local')) {
    const status = JSON.parse(execSync('npx supabase status -o json', { stdio: ['ignore', 'pipe', 'ignore'] }).toString());
    return { url: status.API_URL, key: status.SECRET_KEY, label: 'LOCAL' };
  }
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error('Set EXPO_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY in .env');
  return { url, key, label: url };
}

async function fetchJson(url: string, attempt = 1): Promise<{ meals: Meal[] | null }> {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as { meals: Meal[] | null };
  } catch (e) {
    if (attempt >= 3) throw e;
    await new Promise((r) => setTimeout(r, 1000 * attempt));
    return fetchJson(url, attempt + 1);
  }
}

async function fetchAllMeals(): Promise<Meal[]> {
  const byId = new Map<string, Meal>();
  for (const letter of 'abcdefghijklmnopqrstuvwxyz') {
    const { meals } = await fetchJson(`${API}/search.php?f=${letter}`);
    for (const m of meals ?? []) byId.set(m.idMeal, m);
  }
  return [...byId.values()];
}

/** Extra ingredient lines for recipes whose TheMealDB list is incomplete, by idMeal. */
type RecipeFixes = Record<string, string[]>;

function ingredientLines(meal: Meal, fixes: RecipeFixes): { raw: string; line: string }[] {
  const out: { raw: string; line: string }[] = [];
  for (let i = 1; i <= 20; i++) {
    const raw = (meal[`strIngredient${i}`] ?? '').trim();
    if (!raw) continue;
    const measure = (meal[`strMeasure${i}`] ?? '').trim();
    out.push({ raw, line: `${measure} ${raw}`.trim() });
  }
  for (const raw of fixes[meal.idMeal] ?? []) out.push({ raw, line: raw });
  return out;
}

function chunks<T>(items: T[], size = BATCH): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function check<T>(res: { data: T | null; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data as T;
}

async function main() {
  const { url, key, label } = target();
  const db = createClient<Database>(url, key, { auth: { persistSession: false } });
  const map = JSON.parse(readFileSync(new URL('../../data/ingredient-map.json', import.meta.url), 'utf8')) as IngredientMap & {
    recipeFixes: RecipeFixes;
  };

  console.log(`Seeding ${label}`);
  const meals = await fetchAllMeals();
  console.log(`Fetched ${meals.length} recipes from TheMealDB`);

  // Ingredients: canonical names plus all their ancestors.
  const parsed = meals.map((meal) => ({
    meal,
    lines: ingredientLines(meal, map.recipeFixes).map((l) => ({ ...l, name: normalizeIngredient(l.raw, map) })),
  }));
  const table = ingredientTable(new Set(parsed.flatMap((p) => p.lines.map((l) => l.name))), map);

  const ids = new Map<string, number>();
  for (const batch of chunks(table)) {
    const rows = check(
      await db
        .from('ingredients')
        .upsert(batch.map((t) => ({ canonical_name: t.name, category: t.category })), { onConflict: 'canonical_name' })
        .select('id, canonical_name'),
      'ingredients',
    );
    for (const r of rows) ids.set(r.canonical_name, r.id);
  }
  for (const batch of chunks(table)) {
    check(
      await db.from('ingredients').upsert(
        batch.map((t) => ({
          canonical_name: t.name,
          category: t.category,
          parent_id: t.parent ? ids.get(t.parent)! : null,
        })),
        { onConflict: 'canonical_name' },
      ),
      'ingredient parents',
    );
  }
  console.log(`Upserted ${table.length} ingredients`);

  // Recipes.
  const recipeIds = new Map<string, number>();
  for (const batch of chunks(parsed)) {
    const rows = check(
      await db
        .from('recipes')
        .upsert(
          batch.map(({ meal, lines }) => ({
            source: 'themealdb',
            source_id: meal.idMeal,
            title: meal.strMeal.trim(),
            image_url: meal.strMealThumb,
            cuisine: meal.strArea ?? meal.strCountry ?? null,
            category: meal.strCategory,
            instructions: splitInstructions(meal.strInstructions ?? ''),
            cook_time_min: estimateCookTime(meal.strInstructions ?? '', lines.length),
            cook_time_estimated: true,
          })),
          { onConflict: 'source,source_id' },
        )
        .select('id, source_id'),
      'recipes',
    );
    for (const r of rows) recipeIds.set(r.source_id, r.id);
  }
  console.log(`Upserted ${recipeIds.size} recipes`);

  // Recipe ingredients: replaced wholesale per recipe.
  let lineCount = 0;
  for (const batch of chunks(parsed, 100)) {
    const batchIds = batch.map((p) => recipeIds.get(p.meal.idMeal)!);
    check(await db.from('recipe_ingredients').delete().in('recipe_id', batchIds), 'clear recipe ingredients');
    const rows = batch.flatMap(({ meal, lines }) =>
      lines.map((l, position) => ({
        recipe_id: recipeIds.get(meal.idMeal)!,
        ingredient_id: ids.get(l.name)!,
        raw_text: l.line,
        position,
      })),
    );
    check(await db.from('recipe_ingredients').insert(rows), 'recipe ingredients');
    lineCount += rows.length;
  }
  console.log(`Inserted ${lineCount} ingredient lines`);

  const other = table.filter((t) => t.category === 'other').map((t) => t.name);
  console.log(`\n${other.length} ingredients have category "other" (fine for filtering; add them to`);
  console.log(`data/ingredient-map.json for nicer grouping):\n${other.join(', ')}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
