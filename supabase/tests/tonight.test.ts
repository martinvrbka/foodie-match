import { admin, type Client, failsWith, ok, pair, recipe, signUp, type TestUser } from './helpers';

async function couple() {
  const [a, b] = [await signUp('Anna'), await signUp('Ben')];
  await pair(a, b);
  return [a, b] as const;
}

const start = async (u: TestUser) => (await ok(u.client.rpc('start_tonight', { p_filters: {} }))).data as string;
const swipe = (u: TestUser, s: string, r: number, liked: boolean) =>
  ok(u.client.rpc('tonight_swipe', { p_session: s, p_recipe_id: r, p_liked: liked }));
const finish = async (u: TestUser, s: string) =>
  (await ok(u.client.rpc('tonight_finish_swiping', { p_session: s }))).data as boolean;
const advance = async (c: Client, s: string, from: string, to: string, shortlist?: number[], winner?: number) =>
  (
    await ok(
      c.rpc('tonight_advance', {
        p_session: s,
        p_from: from,
        p_to: to,
        ...(shortlist ? { p_shortlist: shortlist } : {}),
        ...(winner !== undefined ? { p_winner: winner } : {}),
      }),
    )
  ).data as boolean;
const session = async (s: string) =>
  (await ok(admin.from('tonight_sessions').select('*').eq('id', s).single())).data!;

it('both partners join the same session; a third person cannot see or use it', async () => {
  const [a, b] = await couple();
  const c = await signUp('Cid');
  const s = await start(a);
  expect(await start(b)).toBe(s);
  expect((await ok(b.client.from('tonight_participants').select('user_id').eq('session_id', s))).data).toHaveLength(2);
  expect((await ok(c.client.from('tonight_sessions').select('id'))).data).toEqual([]);
  await failsWith(c.client.rpc('tonight_swipe', { p_session: s, p_recipe_id: 1, p_liked: true }), 'tonight_not_found');
});

it('unpaired users cannot start', async () => {
  const a = await signUp('a');
  await failsWith(a.client.rpc('start_tonight', { p_filters: {} }), 'not_paired');
});

it('tonight swipes are visible to the partner and never touch discover or matches', async () => {
  const [a, b] = await couple();
  const r = await recipe([]);
  const s = await start(a);
  await swipe(a, s, r, true);
  await swipe(b, s, r, true);
  const seenByB = (await ok(b.client.from('swipes').select('user_id, context').eq('session_id', s))).data!;
  expect(seenByB).toHaveLength(2);
  expect((await ok(a.client.from('matches').select('recipe_id'))).data).toEqual([]);
  // Discover still shows the recipe (no discover swipe was recorded).
  expect((await ok(a.client.from('swipes').select('id').eq('context', 'discover'))).data).toEqual([]);
});

it('full flow: swipe → ranking → winner; only the first advance applies', async () => {
  const [a, b] = await couple();
  const [r1, r2] = [await recipe([]), await recipe([])];
  const s = await start(a);
  for (const u of [a, b]) for (const r of [r1, r2]) await swipe(u, s, r, true);

  expect(await finish(a, s)).toBe(false);
  await failsWith(a.client.rpc('tonight_advance', { p_session: s, p_from: 'swiping', p_to: 'ranking', p_shortlist: [r1, r2] }), 'tonight_not_finished');
  expect(await finish(b, s)).toBe(true);

  expect(await advance(a.client, s, 'swiping', 'ranking', [r1, r2])).toBe(true);
  expect(await advance(b.client, s, 'swiping', 'ranking', [r1, r2])).toBe(false); // already applied

  await ok(a.client.rpc('tonight_submit_ranking', { p_session: s, p_recipe_ids: [r1, r2] }));
  const bothRanked = (await ok(b.client.rpc('tonight_submit_ranking', { p_session: s, p_recipe_ids: [r2, r1] }))).data;
  expect(bothRanked).toBe(true);
  const ranks = (await ok(a.client.from('tonight_rankings').select('user_id, recipe_id, rank').eq('session_id', s))).data!;
  expect(ranks).toHaveLength(4);

  expect(await advance(b.client, s, 'ranking', 'done', undefined, r2)).toBe(true);
  expect(await advance(a.client, s, 'ranking', 'done', undefined, r1)).toBe(false); // first write wins
  const done = await session(s);
  expect(done.status).toBe('done');
  expect(done.winner_recipe_id).toBe(r2);
  expect(done.completed_at).not.toBeNull();

  // A new session can start once this one is done.
  expect(await start(a)).not.toBe(s);
});

it('rejects rankings that are not a full order of the shortlist, and wrong stages', async () => {
  const [a, b] = await couple();
  const [r1, r2, r3] = [await recipe([]), await recipe([]), await recipe([])];
  const s = await start(a);
  await failsWith(a.client.rpc('tonight_submit_ranking', { p_session: s, p_recipe_ids: [r1] }), 'tonight_wrong_stage');
  await finish(a, s);
  await finish(b, s);
  await advance(a.client, s, 'swiping', 'ranking', [r1, r2]);
  await failsWith(a.client.rpc('tonight_submit_ranking', { p_session: s, p_recipe_ids: [r1] }), 'tonight_bad_ranking');
  await failsWith(a.client.rpc('tonight_submit_ranking', { p_session: s, p_recipe_ids: [r1, r3] }), 'tonight_bad_ranking');
  await failsWith(a.client.rpc('tonight_swipe', { p_session: s, p_recipe_id: r1, p_liked: true }), 'tonight_wrong_stage');
});

it('shortlisting: each submits exactly min(5, n) picks from the shortlist', async () => {
  const [a, b] = await couple();
  const ids = [];
  for (let i = 0; i < 6; i++) ids.push(await recipe([]));
  const s = await start(a);
  await finish(a, s);
  await finish(b, s);
  await advance(a.client, s, 'swiping', 'shortlisting', ids);
  await failsWith(a.client.rpc('tonight_submit_top', { p_session: s, p_recipe_ids: ids.slice(0, 4) }), 'tonight_bad_picks');
  expect((await ok(a.client.rpc('tonight_submit_top', { p_session: s, p_recipe_ids: ids.slice(0, 5) }))).data).toBe(false);
  expect((await ok(b.client.rpc('tonight_submit_top', { p_session: s, p_recipe_ids: ids.slice(1, 6) }))).data).toBe(true);
  expect(await advance(b.client, s, 'shortlisting', 'ranking', ids)).toBe(true);
});

it('choosing: the first tap wins, and the winner must be on the list', async () => {
  const [a, b] = await couple();
  const [r1, r2, r3] = [await recipe([]), await recipe([]), await recipe([])];
  const s = await start(a);
  await finish(a, s);
  await finish(b, s);
  await advance(a.client, s, 'swiping', 'choosing', [r1, r2]);
  await failsWith(
    a.client.rpc('tonight_advance', { p_session: s, p_from: 'choosing', p_to: 'done', p_winner: r3 }),
    'tonight_no_winner',
  );
  expect(await advance(b.client, s, 'choosing', 'done', undefined, r2)).toBe(true);
  expect(await advance(a.client, s, 'choosing', 'done', undefined, r1)).toBe(false);
  expect((await session(s)).winner_recipe_id).toBe(r2);
});

it('cancel ends the session for both and allows a new one', async () => {
  const [a, b] = await couple();
  const s = await start(a);
  await ok(b.client.rpc('cancel_tonight', { p_session: s }));
  expect((await session(s)).status).toBe('cancelled');
  expect(await start(a)).not.toBe(s);
});
