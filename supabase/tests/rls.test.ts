// Row level security: users see only their own and their partner's data, and
// can't change membership or match state except through the RPCs.
import { admin, anon, coupleOf, ingredient, like, ok, pair, recipe, signUp } from './helpers';

describe('not signed in', () => {
  it('cannot read recipes or profiles, or call RPCs', async () => {
    await recipe([]);
    const client = anon();
    expect((await client.from('recipes').select('id')).data ?? []).toEqual([]);
    expect((await client.from('profiles').select('id')).data ?? []).toEqual([]);
    const { error } = await client.rpc('create_pairing_code');
    expect(error).not.toBeNull();
  });
});

describe('signed in', () => {
  it('can read a recipe with its ingredient lines (recipe detail query)', async () => {
    const a = await signUp('a');
    const garlic = await ingredient('garlic');
    const r = await recipe([garlic]);
    const { data } = await ok(
      a.client
        .from('recipes')
        .select('id, recipe_ingredients (raw_text, name, measure, position, ingredient_id)')
        .eq('id', r)
        .single(),
    );
    expect(data!.recipe_ingredients).toEqual([
      { raw_text: 'line 0', name: null, measure: null, position: 0, ingredient_id: garlic },
    ]);
  });

  it('sees only own profile until paired', async () => {
    const [a] = [await signUp('a'), await signUp('b')];
    const { data } = await ok(a.client.from('profiles').select('id'));
    expect(data).toEqual([{ id: a.id }]);
  });

  it('can rename themselves but not change couple_id or rename others', async () => {
    const [a, b] = [await signUp('a'), await signUp('b')];
    await pair(a, b);
    await ok(a.client.from('profiles').update({ display_name: 'Anička' }).eq('id', a.id));
    expect((await a.client.from('profiles').update({ couple_id: null }).eq('id', a.id)).error).not.toBeNull();
    await a.client.from('profiles').update({ display_name: 'hacked' }).eq('id', b.id);
    const { data } = await ok(admin.from('profiles').select('display_name, couple_id').eq('id', b.id).single());
    expect(data!.display_name).toBe('b');
    expect(await coupleOf(a)).not.toBeNull();
  });

  it('cannot write swipes, matches or couples directly', async () => {
    const [a, b] = [await signUp('a'), await signUp('b')];
    await pair(a, b);
    const r = await recipe([]);
    const couple = (await coupleOf(a))!;
    expect((await a.client.from('swipes').insert({ user_id: a.id, recipe_id: r, context: 'discover', liked: true })).error).not.toBeNull();
    expect((await a.client.from('matches').insert({ couple_id: couple, recipe_id: r })).error).not.toBeNull();
    expect((await a.client.from('couples').insert({})).error).not.toBeNull();
    expect((await a.client.from('recipes').insert({ title: 'x', source: 'x', source_id: 'x' })).error).not.toBeNull();
  });

  it("reads partner's discover swipes and exclusions, but no other couple's data", async () => {
    const [a, b, c, d] = [await signUp('a'), await signUp('b'), await signUp('c'), await signUp('d')];
    await pair(a, b);
    await pair(c, d);
    const r = await recipe([]);
    const garlic = await ingredient('garlic');
    for (const u of [b, c]) {
      await ok(u.client.from('user_excluded_ingredients').insert({ ingredient_id: garlic }));
    }
    await like(b, r);
    await like(c, r);
    await like(d, r); // c + d match

    const swipes = (await ok(a.client.from('swipes').select('user_id'))).data!;
    expect(swipes.map((s) => s.user_id)).toEqual([b.id]);
    const exclusions = (await ok(a.client.from('user_excluded_ingredients').select('user_id'))).data!;
    expect(exclusions.map((e) => e.user_id)).toEqual([b.id]);
    expect((await ok(a.client.from('matches').select('recipe_id'))).data).toEqual([]);
    expect((await ok(a.client.from('couples').select('id'))).data).toEqual([{ id: await coupleOf(a) }]);
  });

  it('can add and remove own exclusions and mark themselves onboarded', async () => {
    const a = await signUp('a');
    const garlic = await ingredient('garlic');
    // Same call as src/data/exclusions.ts; saving twice is harmless.
    for (let i = 0; i < 2; i++) {
      await ok(
        a.client
          .from('user_excluded_ingredients')
          .upsert([{ ingredient_id: garlic }], { onConflict: 'user_id,ingredient_id', ignoreDuplicates: true }),
      );
    }
    expect((await ok(a.client.from('user_excluded_ingredients').select('ingredient_id'))).data).toEqual([
      { ingredient_id: garlic },
    ]);
    await ok(a.client.from('user_excluded_ingredients').delete().in('ingredient_id', [garlic]));
    expect((await ok(a.client.from('user_excluded_ingredients').select('ingredient_id'))).data).toEqual([]);

    expect((await ok(a.client.from('profiles').select('onboarded').single())).data).toEqual({ onboarded: false });
    await ok(a.client.from('profiles').update({ onboarded: true }).eq('id', a.id));
    expect((await ok(a.client.from('profiles').select('onboarded').single())).data).toEqual({ onboarded: true });
  });

  it("cannot add or remove someone else's exclusions", async () => {
    const [a, b] = [await signUp('a'), await signUp('b')];
    await pair(a, b);
    const garlic = await ingredient('garlic');
    expect(
      (await a.client.from('user_excluded_ingredients').insert({ user_id: b.id, ingredient_id: garlic })).error,
    ).not.toBeNull();
    await ok(b.client.from('user_excluded_ingredients').insert({ ingredient_id: garlic }));
    await a.client.from('user_excluded_ingredients').delete().eq('user_id', b.id);
    const { count } = await ok(
      admin.from('user_excluded_ingredients').select('*', { count: 'exact', head: true }).eq('user_id', b.id),
    );
    expect(count).toBe(1);
  });

  it("cannot see other users' pairing codes or invites", async () => {
    const [a, b, c] = [await signUp('a'), await signUp('b'), await signUp('c')];
    await ok(a.client.rpc('create_pairing_code'));
    await ok(a.client.rpc('send_pairing_invite', { p_email: b.email }));
    expect((await ok(c.client.from('pairing_codes').select('code'))).data).toEqual([]);
    expect((await ok(c.client.from('pairing_invites').select('id'))).data).toEqual([]);
    // The addressee can see the invite row (needed for realtime).
    expect((await ok(b.client.from('pairing_invites').select('id'))).data).toHaveLength(1);
  });
});
