// Advanced filters are shared by a couple (one set, either partner changes it); "Do not eat"
// marks are private to each partner. Both shape matching through partner_blocked_recipes().
import { admin, anon, ok, pair, recipe, signUp, type TestUser } from './helpers';

async function dish(over: { cook_time_min?: number | null; difficulty?: string | null; cuisine?: string | null }) {
  const id = await recipe([]);
  await ok(admin.from('recipes').update(over).eq('id', id));
  return id;
}

const setFilters = (u: TestUser, max_minutes: number | null, difficulties: string[] = [], cuisines: string[] = []) =>
  ok(u.client.rpc('set_recipe_filters', { p_max_minutes: max_minutes as number, p_difficulties: difficulties, p_cuisines: cuisines }));

const getFilters = async (u: TestUser) =>
  (await ok(u.client.rpc('get_recipe_filters'))).data as { max_minutes: number | null; difficulties: string[]; cuisines: string[] };

const markDoNotEat = (u: TestUser, recipe_id: number) => ok(u.client.from('user_hidden_recipes').insert({ recipe_id }));

async function partnerBlocked(u: TestUser, among: number[]) {
  const { data } = await ok(u.client.rpc('partner_blocked_recipes'));
  return (data as number[]).filter((id) => among.includes(id)).sort((a, b) => a - b);
}

describe('shared filters', () => {
  it('a paired couple has one set of filters: a change by either applies to both', async () => {
    const [a, b] = [await signUp('a'), await signUp('b')];
    await pair(a, b);
    expect(await getFilters(b)).toEqual({ max_minutes: null, difficulties: [], cuisines: [] });
    await setFilters(a, 45, ['easy'], ['Italian']);
    expect(await getFilters(b)).toEqual({ max_minutes: 45, difficulties: ['easy'], cuisines: ['Italian'] });
    await setFilters(b, null);
    expect(await getFilters(a)).toEqual({ max_minutes: null, difficulties: [], cuisines: [] });
    // Both can read the row (needed for live updates); nobody writes it directly.
    const row = await ok(a.client.from('couple_recipe_filters').select('updated_by').single());
    expect(row.data!.updated_by).toBe(b.id);
    await a.client.from('couple_recipe_filters').update({ max_minutes: 15 }).eq('updated_by', b.id);
    expect((await getFilters(a)).max_minutes).toBeNull();
  });

  it("another couple can't see our filters", async () => {
    const [a, b, c] = [await signUp('a'), await signUp('b'), await signUp('c')];
    await pair(a, b);
    await setFilters(a, 30);
    expect((await ok(c.client.from('couple_recipe_filters').select('couple_id'))).data).toEqual([]);
    expect((await getFilters(c)).max_minutes).toBeNull();
  });

  it('unpaired users have their own filters; a new couple starts with none', async () => {
    const [a, b] = [await signUp('a'), await signUp('b')];
    await setFilters(a, 60);
    expect((await getFilters(a)).max_minutes).toBe(60);
    expect((await getFilters(b)).max_minutes).toBeNull();
    await pair(a, b);
    expect((await getFilters(a)).max_minutes).toBeNull();
  });

  it('"Do not eat" marks stay private', async () => {
    const [a, b] = [await signUp('a'), await signUp('b')];
    await pair(a, b);
    const r = await dish({});
    await markDoNotEat(a, r);
    expect((await ok(b.client.from('user_hidden_recipes').select('recipe_id'))).data).toEqual([]);
    await b.client.from('user_hidden_recipes').delete().eq('recipe_id', r);
    const { error } = await b.client.from('user_hidden_recipes').insert({ user_id: a.id, recipe_id: r });
    expect(error).not.toBeNull();
    expect((await ok(a.client.from('user_hidden_recipes').select('recipe_id'))).data).toEqual([{ recipe_id: r }]);
  });

  it('only the fixed max-time steps and known difficulties are accepted', async () => {
    const a = await signUp('a');
    expect((await a.client.rpc('set_recipe_filters', { p_max_minutes: 300, p_difficulties: [], p_cuisines: [] })).error).not.toBeNull();
    expect(
      (await a.client.rpc('set_recipe_filters', { p_max_minutes: 30, p_difficulties: ['impossible'], p_cuisines: [] })).error,
    ).not.toBeNull();
  });

  it('not signed in: no access to settings or the RPCs', async () => {
    const client = anon();
    expect((await client.from('couple_recipe_filters').select('couple_id')).data ?? []).toEqual([]);
    expect((await client.rpc('partner_blocked_recipes')).error).not.toBeNull();
    expect((await client.rpc('get_recipe_filters')).error).not.toBeNull();
    expect((await client.rpc('set_recipe_filters', { p_max_minutes: 30, p_difficulties: [], p_cuisines: [] })).error).not.toBeNull();
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
    // The filters are shared, so they block for B's partner too; B's own mark doesn't.
    expect(await partnerBlocked(b, all)).toEqual([slowItalian, untimed, mexican, hard].sort((x, y) => x - y));
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
