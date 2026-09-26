import { admin, coupleOf, failsWith, ingredient, like, ok, pair, recipe, signUp, visibleMatches } from './helpers';

async function couple() {
  const [a, b] = [await signUp('Anna'), await signUp('Ben')];
  await pair(a, b);
  return [a, b] as const;
}

const exclude = (u: { client: import('./helpers').Client }, ingredientId: number) =>
  ok(u.client.from('user_excluded_ingredients').insert({ ingredient_id: ingredientId }));
const unexclude = (u: { client: import('./helpers').Client }, ingredientId: number) =>
  ok(u.client.from('user_excluded_ingredients').delete().eq('ingredient_id', ingredientId));

describe('live matching', () => {
  it('both like ⇒ match, reported to the second liker', async () => {
    const [a, b] = await couple();
    const r = await recipe([]);
    expect(await like(a, r)).toBe(false);
    expect(await like(b, r)).toBe(true);
    expect(await visibleMatches(a)).toEqual([r]);
    expect(await visibleMatches(b)).toEqual([r]);
  });

  it('like + nope ⇒ no match', async () => {
    const [a, b] = await couple();
    const r = await recipe([]);
    await like(a, r);
    expect(await like(b, r, false)).toBe(false);
    expect(await visibleMatches(a)).toEqual([]);
  });

  it("partner's exclusion blocks the match (union of both lists)", async () => {
    const [a, b] = await couple();
    const garlic = await ingredient('garlic');
    const r = await recipe([garlic]);
    await exclude(b, garlic);
    await like(a, r);
    expect(await like(b, r)).toBe(false);
  });

  it('an excluded parent blocks recipes with its descendants (no pork ⇒ no bacon)', async () => {
    const [a, b] = await couple();
    const meat = await ingredient('meat');
    const pork = await ingredient('pork', meat);
    const bacon = await ingredient('bacon', pork);
    const r = await recipe([bacon]);
    await exclude(a, meat);
    await like(a, r);
    expect(await like(b, r)).toBe(false);
  });

  it('swiping the same recipe twice is ignored', async () => {
    const [a] = await couple();
    const r = await recipe([]);
    await like(a, r);
    await like(a, r, false);
    const { data } = await ok(a.client.from('swipes').select('liked').eq('recipe_id', r));
    expect(data).toEqual([{ liked: true }]);
  });
});

describe('how a match was made', () => {
  it("live swipe ⇒ via 'swipe'; after pairing or removing an exclusion ⇒ via 'retroactive'", async () => {
    const [a, b] = await couple();
    const live = await recipe([]);
    await like(a, live);
    await like(b, live);

    const garlic = await ingredient('garlic');
    const later = await recipe([garlic]);
    await ok(a.client.from('user_excluded_ingredients').insert({ ingredient_id: garlic }));
    await like(a, later);
    await like(b, later);
    await ok(a.client.from('user_excluded_ingredients').delete().eq('ingredient_id', garlic));

    const { data } = await ok(a.client.from('matches').select('recipe_id, via').order('recipe_id'));
    expect(data).toEqual([
      { recipe_id: live, via: 'swipe' },
      { recipe_id: later, via: 'retroactive' },
    ]);
  });
});

describe('exclusion changes', () => {
  it('removing an exclusion creates the match retroactively', async () => {
    const [a, b] = await couple();
    const garlic = await ingredient('garlic');
    const r = await recipe([garlic]);
    await exclude(a, garlic);
    await like(a, r);
    await like(b, r);
    expect(await visibleMatches(a)).toEqual([]);
    await unexclude(a, garlic);
    expect(await visibleMatches(a)).toEqual([r]);
    expect(await visibleMatches(b)).toEqual([r]);
  });

  it('adding an exclusion hides the match without deleting it; removing it shows it again', async () => {
    const [a, b] = await couple();
    const shrimp = await ingredient('shrimp');
    const r = await recipe([shrimp]);
    await like(a, r);
    await like(b, r);
    await exclude(b, shrimp);
    expect(await visibleMatches(a)).toEqual([]);
    const { count } = await ok(admin.from('matches').select('*', { count: 'exact', head: true }).eq('recipe_id', r));
    expect(count).toBe(1);
    await unexclude(b, shrimp);
    expect(await visibleMatches(a)).toEqual([r]);
  });
});

describe('pairing and history', () => {
  it('likes made before pairing become matches when the couple pairs', async () => {
    const [a, b] = [await signUp('a'), await signUp('b')];
    const r = await recipe([]);
    expect(await like(a, r)).toBe(false);
    expect(await like(b, r)).toBe(false); // not paired yet
    await pair(a, b);
    expect(await visibleMatches(a)).toEqual([r]);
  });

  it('unpairing deletes the matches but keeps the swipes', async () => {
    const [a, b] = await couple();
    const r = await recipe([]);
    await like(a, r);
    await like(b, r);
    const c = await coupleOf(a);
    await ok(a.client.rpc('unpair'));
    const { count } = await ok(admin.from('matches').select('*', { count: 'exact', head: true }).eq('couple_id', c!));
    expect(count).toBe(0);
    const { data } = await ok(a.client.from('swipes').select('recipe_id'));
    expect(data).toEqual([{ recipe_id: r }]);
  });
});

describe('undo and remove', () => {
  it('undoing a like that made a match deletes the match', async () => {
    const [a, b] = await couple();
    const r = await recipe([]);
    await like(a, r);
    await like(b, r);
    const { data } = await ok(b.client.rpc('undo_last_discover_swipe'));
    expect(data).toEqual({ recipe_id: r, liked: true });
    expect(await visibleMatches(a)).toEqual([]);
  });

  it('undo with no swipes fails cleanly', async () => {
    const a = await signUp('a');
    await failsWith(a.client.rpc('undo_last_discover_swipe'), 'nothing_to_undo');
  });

  it('a removed match is never re-created', async () => {
    const [a, b] = await couple();
    const garlic = await ingredient('garlic');
    const r = await recipe([garlic]);
    await like(a, r);
    await like(b, r);
    await ok(a.client.rpc('remove_match', { p_recipe_id: r }));
    expect(await visibleMatches(b)).toEqual([]);
    // Toggling an exclusion re-runs retroactive matching; it must not bring it back.
    await exclude(a, garlic);
    await unexclude(a, garlic);
    expect(await visibleMatches(b)).toEqual([]);
    await failsWith(a.client.rpc('remove_match', { p_recipe_id: r }), 'match_not_found');
  });
});
