import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../src/data/database.types';

export type Client = SupabaseClient<Database>;

const url = () => process.env.TEST_SUPABASE_URL!;
const noSession = { auth: { persistSession: false, autoRefreshToken: false } };

/** Service-role client: bypasses RLS. For fixtures and checking state only. */
export const admin: Client = createClient<Database>(url(), process.env.TEST_SUPABASE_SECRET_KEY!, noSession);

/** Not signed in. */
export const anon = (): Client => createClient<Database>(url(), process.env.TEST_SUPABASE_PUBLISHABLE_KEY!, noSession);

const run = Math.random().toString(36).slice(2, 8);
let counter = 0;
export const unique = (prefix: string) => `${prefix}-${run}-${++counter}`;

export interface TestUser {
  id: string;
  email: string;
  name: string;
  client: Client;
}

/** Signs up a new user through the public API, like the app does. */
export async function signUp(name = 'user', email = `${unique(name)}@test.local`): Promise<TestUser> {
  const client = anon();
  const { data, error } = await client.auth.signUp({
    email,
    password: 'password123',
    options: { data: { display_name: name } },
  });
  if (error || !data.user) throw error ?? new Error('no user');
  return { id: data.user.id, email: email.toLowerCase().trim(), name, client };
}

export async function pair(a: TestUser, b: TestUser) {
  const { data } = await ok(a.client.rpc('create_pairing_code'));
  await ok(b.client.rpc('redeem_pairing_code', { p_code: (data as { code: string }).code }));
}

/** Unwraps a Supabase response, failing the test on error. */
export async function ok<T extends { error: unknown }>(p: PromiseLike<T>): Promise<T> {
  const res = await p;
  if (res.error) throw new Error(`Unexpected error: ${JSON.stringify(res.error)}`);
  return res;
}

/** Expects an RPC to fail with the given error code (the exception message). */
export async function failsWith(p: PromiseLike<{ error: { message: string } | null }>, code: string) {
  const { error } = await p;
  expect(error?.message).toBe(code);
}

export async function ingredient(name: string, parentId: number | null = null) {
  const { data } = await ok(
    admin.from('ingredients').insert({ canonical_name: unique(name), parent_id: parentId }).select('id').single(),
  );
  return data!.id;
}

export async function recipe(ingredientIds: number[]) {
  const { data } = await ok(
    admin.from('recipes').insert({ title: unique('recipe'), source: 'test', source_id: unique('src') }).select('id').single(),
  );
  const id = data!.id;
  if (ingredientIds.length > 0) {
    await ok(
      admin.from('recipe_ingredients').insert(
        ingredientIds.map((ingredient_id, i) => ({ recipe_id: id, ingredient_id, raw_text: `line ${i}`, position: i })),
      ),
    );
  }
  return id;
}

export const like = (u: TestUser, recipeId: number, liked = true) =>
  ok(u.client.rpc('discover_swipe', { p_recipe_id: recipeId, p_liked: liked })).then(
    (r) => (r.data as { matched: boolean }).matched,
  );

export async function coupleOf(u: TestUser) {
  const { data } = await ok(admin.from('profiles').select('couple_id').eq('id', u.id).single());
  return data!.couple_id;
}

/** Recipe ids visible as matches to this user (RLS + current exclusions applied). */
export async function visibleMatches(u: TestUser) {
  const { data } = await ok(u.client.from('visible_matches').select('recipe_id'));
  return data!.map((r) => r.recipe_id).sort();
}
