// Advanced filters and "Do not eat" marks: private to each partner, but both partners'
// settings shape matching through partner_blocked_recipes().
import { admin, anon, ok, pair, recipe, signUp, type TestUser } from './helpers';

async function dish(over: { cook_time_min?: number | null; difficulty?: string | null; cuisine?: string | null }) {
  const id = await recipe([]);
  await ok(admin.from('recipes').update(over).eq('id', id));
  return id;
}

const setFilters = (u: TestUser, max_minutes: number | null, difficulties: string[] = [], cuisines: string[] = []) =>
  ok(u.client.from('user_recipe_filters').upsert({ max_minutes, difficulties, cuisines }, { onConflict: 'user_id' }));

const markDoNotEat = (u: TestUser, recipe_id: number) => ok(u.client.from('user_hidden_recipes').insert({ recipe_id }));

async function partnerBlocked(u: TestUser, among: number[]) {
  const { data } = await ok(u.client.rpc('partner_blocked_recipes'));
  return (data as number[]).filter((id) => among.includes(id)).sort((a, b) => a - b);
}

describe('privacy', () => {
  it("a partner can't read, change or delete my filters or marks", async () => {
    const [a, b] = [await signUp('a'), await signUp('b')];
    await pair(a, b);
    const r = await dish({});
    await setFilters(a, 45);
    await markDoNotEat(a, r);

    expect((await ok(b.client.from('user_recipe_filters').select('user_id'))).data).toEqual([]);
    expect((await ok(b.client.from('user_hidden_recipes').select('recipe_id'))).data).toEqual([]);
    await b.client.from('user_recipe_filters').update({ max_minutes: 120 }).eq('user_id', a.id);
    await b.client.from('user_hidden_recipes').delete().eq('recipe_id', r);
    const { error } = await b.client.from('user_hidden_recipes').insert({ user_id: a.id, recipe_id: r });
    expect(error).not.toBeNull();

    const mine = await ok(a.client.from('user_recipe_filters').select('max_minutes').single());
    expect(mine.data!.max_minutes).toBe(45);
    expect((await ok(a.client.from('user_hidden_recipes').select('recipe_id'))).data).toEqual([{ recipe_id: r }]);
  });

  it('only the fixed max-time steps and known difficulties are accepted', async () => {
    const a = await signUp('a');
    const { error: badTime } = await a.client.from('user_recipe_filters').upsert({ max_minutes: 300 }, { onConflict: 'user_id' });
    expect(badTime).not.toBeNull();
    const { error: badLevel } = await a.client
      .from('user_recipe_filters')
      .upsert({ difficulties: ['impossible'] }, { onConflict: 'user_id' });
    expect(badLevel).not.toBeNull();
  });

  it('not signed in: no access to settings or the RPC', async () => {
    const client = anon();
    expect((await client.from('user_recipe_filters').select('user_id')).data ?? []).toEqual([]);
    expect((await client.rpc('partner_blocked_recipes')).error).not.toBeNull();
  });
});

describe('partner_blocked_recipes', () => {
  it('returns what my partner filters out or marked, without their settings; mirrors passesFilters()', async () => {
    const [a, b] = [await signUp('a'), await signUp('b')];
    await pair(a, b);
    const quickItalian = await dish({ cook_time_min: 20, difficulty: 'easy', cuisine: 'Italian' });
    const slowItalian = await dish({ cook_time_min: 180, difficulty: 'easy', cuisine: 'Italian' });
    const untimed = await dish({ cook_time_min: null, difficulty: 'easy', cuisine: 'Italian' });
    const mexican = await dish({ cook_time_min: 20, difficulty: 'easy', cuisine: 'Mexican' });
    const hard = await dish({ cook_time_min: 20, difficulty: 'hard', cuisine: 'Italian' });
    const unknown = await dish({ cook_time_min: 20, difficulty: null, cuisine: null });
    const carbonara = await dish({ cook_time_min: 20, difficulty: 'easy', cuisine: 'Italian' });
    const all = [quickItalian, slowItalian, untimed, mexican, hard, unknown, carbonara];

    expect(await partnerBlocked(a, all)).toEqual([]);

    await setFilters(b, 60, ['easy', 'medium'], ['Italian']);
    await markDoNotEat(b, carbonara);
    expect(await partnerBlocked(a, all)).toEqual([slowItalian, untimed, mexican, hard, carbonara].sort((x, y) => x - y));
    // My own settings don't show up as "partner" blocks.
    expect(await partnerBlocked(b, all)).toEqual([]);
  });

  it('is empty when unpaired', async () => {
    const [a, b] = [await signUp('a'), await signUp('b')];
    const r = await dish({ cook_time_min: 200 });
    await setFilters(b, 15);
    expect(await partnerBlocked(a, [r])).toEqual([]);
  });

  it("marking a matched recipe doesn't remove the match (it stays in Matches)", async () => {
    const [a, b] = [await signUp('a'), await signUp('b')];
    await pair(a, b);
    const r = await dish({});
    await ok(a.client.rpc('discover_swipe', { p_recipe_id: r, p_liked: true }));
    await ok(b.client.rpc('discover_swipe', { p_recipe_id: r, p_liked: true }));
    await markDoNotEat(a, r);
    const { data } = await ok(a.client.from('visible_matches').select('recipe_id').eq('recipe_id', r));
    expect(data).toEqual([{ recipe_id: r }]);
  });
});
