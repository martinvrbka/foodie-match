import { changedSlots, generatePlan, leftoverPairs, type PlanSlot, swapSlot } from '../../src/logic/plan';
import { addDays, type Meal, mealsFor, mondayOf, pickSelection } from '../../src/logic/week';
import { admin, failsWith, like, ok, pair, recipe, signUp, type TestUser } from './helpers';

// The server accepts the phone's date within a day of its own; use the server's (UTC) date.
const today = new Date().toISOString().slice(0, 10);
const nextMonday = addDays(mondayOf(today), 7);

async function couple() {
  const [a, b] = [await signUp('Anna'), await signUp('Ben')];
  await pair(a, b);
  return [a, b] as const;
}

async function match(a: TestUser, b: TestUser) {
  const r = await recipe([]);
  await like(a, r);
  await like(b, r);
  return r;
}

const start = async (u: TestUser, firstDay = nextMonday) =>
  (await ok(u.client.rpc('plan_start', { p_first_day: firstDay, p_today: today }))).data as { id: string; joined: boolean };
const begin = async (u: TestUser, plan: string, picks: number[]) =>
  (await ok(u.client.rpc('plan_begin_choosing', { p_plan: plan, p_picks: picks }))).data as boolean;
const reswipe = (u: TestUser, plan: string, r: number, liked: boolean) =>
  u.client.rpc('plan_reswipe', { p_plan: plan, p_recipe_id: r, p_liked: liked });
type SlotIn = { day: string; meal: string; recipe_id: number | null; locked?: boolean; note?: string | null };
const write = (u: TestUser, plan: string, slots: SlotIn[], generate: boolean) =>
  u.client.rpc('plan_write_slots', { p_plan: plan, p_slots: slots, p_generate: generate, p_today: today });
const planRow = async (id: string) => (await ok(admin.from('week_plans').select('*').eq('id', id).single())).data!;
const slot = async (plan: string, day: string, meal: string) =>
  (await ok(admin.from('week_plan_slots').select('*').eq('plan_id', plan).eq('day', day).eq('meal', meal).single())).data!;

it("starting next week's plan makes Mon–Sun lunch and dinner; the partner joins the same plan", async () => {
  const [a, b] = await couple();
  const first = await start(a);
  expect(first.joined).toBe(false);
  const second = await start(b);
  expect(second).toEqual({ id: first.id, joined: true });
  const slots = (await ok(b.client.from('week_plan_slots').select('day, meal').eq('plan_id', first.id))).data!;
  expect(slots).toHaveLength(14);
  expect(new Set(slots.map((s) => s.meal))).toEqual(new Set(['lunch', 'dinner']));
  const p = await planRow(first.id);
  expect(p).toMatchObject({ week_start: nextMonday, first_day: nextMonday, status: 'setup', leftovers: 3 });
});

it('the rest of this week starts today; other dates are refused', async () => {
  const [a] = await couple();
  const p = await start(a, today);
  const days = (await ok(a.client.from('week_plan_slots').select('day').eq('plan_id', p.id))).data!;
  expect(Math.min(...days.map((d) => Date.parse(d.day)))).toBe(Date.parse(today));
  expect(days.every((d) => d.day <= addDays(mondayOf(today), 6))).toBe(true);
  await failsWith(a.client.rpc('plan_start', { p_first_day: addDays(nextMonday, 1), p_today: today }), 'plan_bad_date');
  await failsWith(a.client.rpc('plan_start', { p_first_day: addDays(nextMonday, 7), p_today: today }), 'plan_bad_date');
  await failsWith(a.client.rpc('plan_start', { p_first_day: nextMonday, p_today: addDays(today, 3) }), 'plan_bad_date');
});

it('unpaired users cannot plan, and nobody else can see or change a plan', async () => {
  const [a] = await couple();
  const loner = await signUp('Cid');
  await failsWith(loner.client.rpc('plan_start', { p_first_day: nextMonday, p_today: today }), 'not_paired');
  const p = await start(a);
  expect((await ok(loner.client.from('week_plans').select('id'))).data).toEqual([]);
  expect((await ok(loner.client.from('week_plan_slots').select('day'))).data).toEqual([]);
  await failsWith(loner.client.rpc('plan_accept', { p_plan: p.id }), 'plan_not_found');
  // No direct writes, even for members.
  const { error } = await a.client.from('week_plan_slots').update({ locked: true }).eq('plan_id', p.id);
  expect(error).not.toBeNull();
  const ins = await a.client.from('week_plan_swipes').insert({ plan_id: p.id, user_id: a.id, recipe_id: 1, liked: true });
  expect(ins.error).not.toBeNull();
});

it('setup: switch cells and leftovers; only the first "begin choosing" applies and non-matches are dropped', async () => {
  const [a, b] = await couple();
  const [m1, m2] = [await match(a, b), await match(a, b)];
  const onlyMine = await recipe([]);
  await like(a, onlyMine);
  const p = await start(a);

  await ok(a.client.rpc('plan_setup', {
    p_plan: p.id,
    p_cells: [
      { day: nextMonday, meal: 'breakfast' },
      { day: nextMonday, meal: 'dinner' },
    ],
  }));
  await failsWith(a.client.rpc('plan_setup', { p_plan: p.id, p_cells: [{ day: addDays(nextMonday, 7), meal: 'lunch' }] }), 'plan_bad_cells');
  await ok(b.client.rpc('plan_set_leftovers', { p_plan: p.id, p_leftovers: 1 }));
  await failsWith(b.client.rpc('plan_set_leftovers', { p_plan: p.id, p_leftovers: 8 }), 'plan_bad_leftovers');

  expect(await begin(a, p.id, [m2, onlyMine, m1])).toBe(true);
  expect(await begin(b, p.id, [m1])).toBe(false);
  expect(await planRow(p.id)).toMatchObject({ status: 'choosing', picks: [m2, m1], leftovers: 1 });
  expect((await ok(admin.from('week_plan_slots').select('meal').eq('plan_id', p.id))).data).toHaveLength(2);
  await failsWith(a.client.rpc('plan_setup', { p_plan: p.id, p_cells: [] }), 'plan_wrong_stage');
});

it('re-swipe: only this week\'s picks, undo the last one, finish', async () => {
  const [a, b] = await couple();
  const [m1, m2, other] = [await match(a, b), await match(a, b), await match(a, b)];
  const p = await start(a);
  await begin(a, p.id, [m1, m2]);

  await failsWith(reswipe(a, p.id, other, true), 'plan_not_in_selection');
  await ok(reswipe(a, p.id, m1, true));
  await ok(reswipe(a, p.id, m2, false));
  expect((await ok(a.client.rpc('plan_undo_reswipe', { p_plan: p.id }))).data).toBe(m2);
  const left = (await ok(b.client.from('week_plan_swipes').select('recipe_id, liked').eq('plan_id', p.id))).data!;
  expect(left).toEqual([{ recipe_id: m1, liked: true }]);

  await ok(a.client.rpc('plan_finish_reswipe', { p_plan: p.id }));
  const members = (await ok(b.client.from('week_plan_members').select('user_id, reswipe_done').eq('plan_id', p.id))).data!;
  expect(members.find((x) => x.user_id === a.id)?.reswipe_done).toBe(true);
  expect(members.find((x) => x.user_id === b.id)?.reswipe_done).toBe(false);
});

it('Generate uses only picks nobody rejected; a manual swap may use any visible match', async () => {
  const [a, b] = await couple();
  const [lasagne, chilli, goulash] = [await match(a, b), await match(a, b), await match(a, b)];
  const notMatch = await recipe([]);
  const p = await start(a);
  await begin(a, p.id, [lasagne, chilli]);
  await ok(reswipe(b, p.id, chilli, false)); // partner passes on Chilli this week

  const mon = (meal: string, recipe_id: number | null) => ({ day: nextMonday, meal, recipe_id, note: null });
  await failsWith(write(a, p.id, [mon('dinner', chilli)], true), 'plan_rejected');
  await failsWith(write(a, p.id, [mon('dinner', goulash)], true), 'plan_rejected'); // not in this week's selection
  await failsWith(write(a, p.id, [mon('dinner', notMatch)], true), 'plan_not_a_match');
  await failsWith(write(a, p.id, [mon('dinner', lasagne)], false), 'plan_wrong_stage'); // no edits before Generate

  await ok(write(a, p.id, [mon('dinner', lasagne), { ...mon('lunch', null), note: 'nothing_matched' }], true));
  expect(await planRow(p.id)).toMatchObject({ status: 'generated', generated_by: a.id });
  expect(await slot(p.id, nextMonday, 'dinner')).toMatchObject({ recipe_id: lasagne, changed_by: a.id });

  // Swap: Chilli is still a match and can be chosen by hand this week.
  await ok(write(b, p.id, [mon('lunch', chilli)], false));
  expect(await slot(p.id, nextMonday, 'lunch')).toMatchObject({ recipe_id: chilli, changed_by: b.id, note: null });
  await failsWith(write(b, p.id, [mon('lunch', notMatch)], false), 'plan_not_a_match');
});

it('Regenerate never touches locked slots; days before today are read-only', async () => {
  const [a, b] = await couple();
  const [m1, m2] = [await match(a, b), await match(a, b)];
  const p = await start(a, today);
  await begin(a, p.id, [m1, m2]);
  await ok(write(a, p.id, [{ day: today, meal: 'dinner', recipe_id: m1 }], true));
  await ok(write(a, p.id, [{ day: today, meal: 'dinner', recipe_id: m1, locked: true }], false));
  await failsWith(write(b, p.id, [{ day: today, meal: 'dinner', recipe_id: m2 }], true), 'plan_slot_locked');

  // Pretend the plan started yesterday: that day can't change any more.
  const yesterday = addDays(today, -1);
  if (mondayOf(yesterday) === mondayOf(today)) {
    await ok(admin.from('week_plans').update({ first_day: yesterday }).eq('id', p.id));
    await ok(admin.from('week_plan_slots').insert({ plan_id: p.id, day: yesterday, meal: 'dinner' }));
    await failsWith(write(a, p.id, [{ day: yesterday, meal: 'dinner', recipe_id: m2 }], false), 'plan_past_day');
  }
});

it("a partner's late rejection empties the dish's slots with their name", async () => {
  const [a, b] = await couple();
  const [lasagne, paella] = [await match(a, b), await match(a, b)];
  const p = await start(a, today);
  await begin(a, p.id, [lasagne, paella]);
  await ok(write(a, p.id, [{ day: today, meal: 'dinner', recipe_id: lasagne }], true));

  await ok(reswipe(b, p.id, lasagne, false)); // B hadn't seen the plan yet
  expect(await slot(p.id, today, 'dinner')).toMatchObject({ recipe_id: null, note: 'partner_passed', changed_by: b.id });

  await ok(b.client.rpc('plan_finish_reswipe', { p_plan: p.id }));
  await failsWith(reswipe(b, p.id, paella, false), 'plan_wrong_stage');
});

it('either partner accepts alone; "Changed by" uses when each partner last opened the plan', async () => {
  const [a, b] = await couple();
  const m = await match(a, b);
  const p = await start(a);
  await failsWith(a.client.rpc('plan_accept', { p_plan: p.id }), 'plan_wrong_stage');
  await begin(a, p.id, [m]);
  await ok(write(a, p.id, [{ day: nextMonday, meal: 'dinner', recipe_id: m }], true));
  await ok(b.client.rpc('plan_accept', { p_plan: p.id }));
  expect(await planRow(p.id)).toMatchObject({ status: 'accepted', accepted_by: b.id });
  await ok(a.client.rpc('plan_accept', { p_plan: p.id })); // no-op

  expect((await ok(b.client.rpc('plan_mark_seen', { p_plan: p.id }))).data).toBeNull();
  const seen = (await ok(b.client.rpc('plan_mark_seen', { p_plan: p.id }))).data as string;
  expect(Date.parse(seen)).toBeGreaterThan(0);
});

it('cleanup deletes ended weeks and plans never generated before their first day', async () => {
  const [a, b] = await couple();
  const c = (await ok(admin.from('profiles').select('couple_id').eq('id', a.id).single())).data!.couple_id!;
  const lastWeek = addDays(mondayOf(today), -7);
  const ended = (await ok(admin.from('week_plans').insert({
    couple_id: c, week_start: lastWeek, first_day: lastWeek, created_on: addDays(lastWeek, -1),
    status: 'accepted', started_by: a.id,
  }).select('id').single())).data!.id;
  const thisMonday = mondayOf(today);
  const stale = (await ok(admin.from('week_plans').insert({
    couple_id: c, week_start: thisMonday, first_day: thisMonday, created_on: addDays(thisMonday, -1),
    status: 'choosing', started_by: b.id,
  }).select('id').single())).data!.id;

  await ok(a.client.rpc('plan_cleanup', { p_today: today }));
  const left = (await ok(admin.from('week_plans').select('id').eq('couple_id', c))).data!.map((x) => x.id);
  expect(left).not.toContain(ended);
  expect(left).not.toContain(stale);
});

it('"Not good for leftovers" is remembered for the couple and can be undone; unpair deletes plans', async () => {
  const [a, b] = await couple();
  const m = await match(a, b);
  await ok(a.client.rpc('set_leftovers_ok', { p_recipe_id: m, p_ok: false }));
  expect((await ok(b.client.from('couple_no_leftovers').select('recipe_id'))).data).toEqual([{ recipe_id: m }]);
  await ok(b.client.rpc('set_leftovers_ok', { p_recipe_id: m, p_ok: true }));
  expect((await ok(a.client.from('couple_no_leftovers').select('recipe_id'))).data).toEqual([]);

  const p = await start(a);
  await ok(a.client.rpc('unpair'));
  expect((await ok(admin.from('week_plans').select('id').eq('id', p.id))).data).toEqual([]);
});

it('end to end with the real rules: select, re-swipe, generate with leftovers, then swap', async () => {
  const [a, b] = await couple();
  const ms: number[] = [];
  for (let i = 0; i < 14; i++) ms.push(await match(a, b));
  const p = await start(a);
  const picks = pickSelection(ms.map((id) => ({ id, category: null })), { main: 14 }, Math.random);
  expect(await begin(a, p.id, picks)).toBe(true);
  const rejected = picks[0];
  await ok(reswipe(b, p.id, rejected, false));

  const load = async (): Promise<PlanSlot[]> =>
    (await ok(a.client.from('week_plan_slots').select('day, meal, recipe_id, locked, note').eq('plan_id', p.id))).data!.map(
      (s) => ({ day: s.day, meal: s.meal as Meal, recipeId: s.recipe_id, locked: s.locked, note: s.note as PlanSlot['note'] }),
    );
  const toRow = (s: PlanSlot) => ({ day: s.day, meal: s.meal, recipe_id: s.recipeId, locked: s.locked, note: s.note });

  const before = await load();
  const candidates = picks.filter((id) => id !== rejected).map((id) => ({ id, meals: mealsFor(null) }));
  const planned = generatePlan({ slots: before, candidates, leftovers: 3, noLeftovers: new Set(), today, rng: Math.random });
  await ok(write(a, p.id, changedSlots(before, planned).map(toRow), true));

  const saved = await load();
  expect(saved.every((s) => s.recipeId !== null && s.recipeId !== rejected)).toBe(true);
  expect(leftoverPairs(saved)).toHaveLength(3);

  // B swaps the first cook-day meal for the rejected dish (allowed by hand): its leftover is emptied.
  const pair = leftoverPairs(saved)[0];
  const edit = swapSlot(saved, `${pair.cook.day}:${pair.cook.meal}`, rejected, { today, noLeftovers: new Set() });
  if (!edit.ok) throw new Error(edit.error);
  await ok(write(b, p.id, changedSlots(saved, edit.slots).map(toRow), false));
  const after = await load();
  expect(after.find((s) => s.day === pair.leftover.day && s.meal === pair.leftover.meal)).toMatchObject({
    recipeId: null,
    note: 'leftover_removed',
  });
});
