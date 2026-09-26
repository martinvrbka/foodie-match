import {
  availability,
  type Candidate,
  changedSlots,
  clearSlot,
  dropLeftoversOf,
  type EditContext,
  generatePlan,
  leftoverPairs,
  moveSlot,
  type PlanSlot,
  prepSchedule,
  replaceTonight,
  setLocked,
  slotKey,
  swapSlot,
} from '../plan';
import { addDays, type Meal, mealsFor } from '../week';

const MON = '2026-09-28';
const day = (i: number) => addDays(MON, i);
const key = (i: number, meal: Meal) => slotKey({ day: day(i), meal });

function grid(meals: Meal[] = ['lunch', 'dinner'], days = 7): PlanSlot[] {
  return Array.from({ length: days }, (_, i) =>
    meals.map((meal) => ({ day: day(i), meal, recipeId: null, locked: false, note: null })),
  ).flat();
}
const put = (slots: PlanSlot[], k: string, recipeId: number | null, extra: Partial<PlanSlot> = {}) =>
  slots.map((s) => (slotKey(s) === k ? { ...s, recipeId, ...extra } : s));
const at = (slots: PlanSlot[], k: string) => slots.find((s) => slotKey(s) === k)!;
const dishes = (n: number, category = 'Beef', from = 1): Candidate[] =>
  Array.from({ length: n }, (_, i) => ({ id: from + i, meals: mealsFor(category) }));

let seed = 1;
const rng = () => {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
};
beforeEach(() => {
  seed = 1;
});

const ctx: EditContext = { today: MON, noLeftovers: new Set() };
const CURRY = 50;
const PAELLA = 60;

function countOf(slots: PlanSlot[]) {
  const c = new Map<number, number>();
  for (const s of slots) if (s.recipeId !== null) c.set(s.recipeId, (c.get(s.recipeId) ?? 0) + 1);
  return c;
}

describe('leftoverPairs / prepSchedule', () => {
  it('a dish planned twice 1–2 days apart is cooked once and eaten again', () => {
    const slots = put(put(grid(), key(0, 'dinner'), CURRY), key(1, 'lunch'), CURRY);
    const [p] = prepSchedule(slots);
    expect(p.recipeId).toBe(CURRY);
    expect(slotKey(p.cook)).toBe(key(0, 'dinner'));
    expect(slotKey(p.leftover)).toBe(key(1, 'lunch'));
  });

  it('same day or 3+ days apart is not a leftover', () => {
    expect(leftoverPairs(put(put(grid(), key(0, 'lunch'), CURRY), key(0, 'dinner'), CURRY))).toEqual([]);
    expect(leftoverPairs(put(put(grid(), key(0, 'dinner'), CURRY), key(3, 'dinner'), CURRY))).toEqual([]);
  });
});

describe('generatePlan', () => {
  const base = { leftovers: 3, noLeftovers: new Set<number>(), today: MON };

  it('fills every slot with a dish allowed there: Omelette may go to breakfast, Wellington never', () => {
    const omelette = { id: 900, meals: mealsFor('Breakfast') };
    const wellington = { id: 901, meals: mealsFor('Beef') };
    const slots = grid(['breakfast', 'lunch', 'dinner']);
    for (let s = 1; s < 30; s++) {
      seed = s;
      const plan = generatePlan({ ...base, slots, candidates: [omelette, wellington, ...dishes(20)], rng });
      for (const slot of plan.filter((x) => x.meal === 'breakfast')) {
        expect(slot.recipeId === null || slot.recipeId === 900).toBe(true);
      }
    }
    const plan = generatePlan({ ...base, slots, candidates: [omelette, wellington, ...dishes(20)], rng });
    expect(plan.filter((x) => x.meal === 'breakfast' && x.recipeId === 900)).toHaveLength(1);
    const dinnerOnly = generatePlan({ ...base, slots: grid(['breakfast', 'dinner'], 1), candidates: [wellington], rng });
    expect(dinnerOnly.map((s) => [s.meal, s.recipeId])).toEqual([
      ['breakfast', null],
      ['dinner', 901],
    ]);
  });

  it('never puts a main course at snack', () => {
    const plan = generatePlan({ ...base, slots: grid(['snack', 'dinner']), candidates: dishes(20), rng });
    expect(plan.filter((s) => s.meal === 'snack').every((s) => s.recipeId === null && s.note === 'nothing_matched')).toBe(true);
  });

  it('plans exactly the leftover setting: 3 dishes twice, 1–2 days apart, none more than twice', () => {
    const plan = generatePlan({ ...base, slots: grid(), candidates: dishes(20), rng });
    expect(plan.every((s) => s.recipeId !== null)).toBe(true);
    const counts = countOf(plan);
    expect([...counts.values()].filter((n) => n === 2)).toHaveLength(3);
    expect(Math.max(...counts.values())).toBe(2);
    expect(leftoverPairs(plan)).toHaveLength(3);
  });

  it('leftover setting 0 plans no repeats; 11 dishes + 3 leftovers fill 14 slots', () => {
    const none = generatePlan({ ...base, leftovers: 0, slots: grid(), candidates: dishes(20), rng });
    expect([...countOf(none).values()].every((n) => n === 1)).toBe(true);
    const tight = generatePlan({ ...base, slots: grid(), candidates: dishes(11), rng });
    expect(tight.every((s) => s.recipeId !== null)).toBe(true);
  });

  it('never plans a "not good for leftovers" dish as a leftover', () => {
    const cands = dishes(8);
    const plan = generatePlan({ ...base, slots: grid(), candidates: cands, noLeftovers: new Set(cands.map((c) => c.id)), rng });
    expect([...countOf(plan).values()].every((n) => n === 1)).toBe(true);
    expect(plan.filter((s) => s.recipeId === null)).toHaveLength(6);
  });

  it('slots it cannot fill stay empty with "nothing matched", never a one-partner dish', () => {
    const plan = generatePlan({ ...base, slots: grid(), candidates: dishes(3), rng });
    const filled = plan.filter((s) => s.recipeId !== null);
    expect(filled.every((s) => s.recipeId! >= 1 && s.recipeId! <= 3)).toBe(true);
    expect(plan.filter((s) => s.note === 'nothing_matched').length).toBe(14 - filled.length);
  });

  it('with no candidates at all every slot is empty', () => {
    const plan = generatePlan({ ...base, slots: grid(), candidates: [], rng });
    expect(plan.every((s) => s.recipeId === null && s.note === 'nothing_matched')).toBe(true);
  });

  it('uses scarce breakfast dishes for breakfast, not for lunch/dinner leftovers', () => {
    const plan = generatePlan({
      ...base,
      slots: grid(['breakfast', 'lunch', 'dinner']),
      candidates: [...dishes(7, 'Breakfast', 100), ...dishes(11)],
      rng,
    });
    expect(plan.every((s) => s.recipeId !== null)).toBe(true);
    expect(plan.filter((s) => s.meal === 'breakfast').every((s) => s.recipeId! >= 100)).toBe(true);
  });

  it('Regenerate keeps locked slots and past days, and repeats nothing', () => {
    const THU = day(3);
    let slots = generatePlan({ ...base, slots: grid(), candidates: dishes(20), rng });
    slots = slots.map((s) => (slotKey(s) === key(5, 'dinner') ? { ...s, locked: true } : s));
    const again = generatePlan({ ...base, slots, candidates: dishes(20), today: THU, rng });
    for (const s of again) {
      const old = at(slots, slotKey(s));
      if (s.day < THU || s.locked) expect(s).toEqual(old);
    }
    const counts = countOf(again.filter((s) => s.day >= THU));
    expect(Math.max(...counts.values())).toBeLessThanOrEqual(2);
    for (const [id, n] of countOf(again)) {
      if (n === 2) expect(leftoverPairs(again).some((p) => p.recipeId === id)).toBe(true);
    }
  });
});

describe('availability', () => {
  it('lunch+dinner counted together and not short with 11 dishes + 3 leftovers; breakfast short with 1 dish', () => {
    const av = availability({
      slots: grid(['breakfast', 'lunch', 'dinner']),
      candidates: [...dishes(11), ...dishes(1, 'Breakfast', 100)],
      leftovers: 3,
      noLeftovers: new Set(),
      today: MON,
    });
    expect(av).toEqual([
      { group: 'breakfast', dishes: 1, slots: 7, short: true },
      { group: 'main', dishes: 12, slots: 14, short: false },
    ]);
  });

  it('dishes not good for leftovers fill one slot only', () => {
    const cands = dishes(11);
    const av = availability({
      slots: grid(),
      candidates: cands,
      leftovers: 3,
      noLeftovers: new Set(cands.map((c) => c.id)),
      today: MON,
    });
    expect(av[0].short).toBe(true);
  });
});

describe('edits', () => {
  const planned = () => put(put(put(grid(), key(0, 'dinner'), CURRY), key(1, 'lunch'), CURRY), key(2, 'dinner'), 7);

  it('swapping a dish already planned into its slot 1 day later makes a leftover', () => {
    const r = swapSlot(put(grid(), key(0, 'dinner'), CURRY), key(1, 'lunch'), CURRY, ctx);
    expect(r.ok).toBe(true);
    if (r.ok) expect(prepSchedule(r.slots)[0].recipeId).toBe(CURRY);
  });

  it('swapping it into Friday is refused as already planned', () => {
    expect(swapSlot(put(grid(), key(0, 'dinner'), CURRY), key(4, 'dinner'), CURRY, ctx)).toEqual({
      ok: false,
      error: 'already_planned',
    });
    // Before the first one, or a third time, too.
    expect(swapSlot(put(grid(), key(1, 'dinner'), CURRY), key(0, 'dinner'), CURRY, ctx).ok).toBe(false);
    expect(swapSlot(planned(), key(2, 'lunch'), CURRY, ctx).ok).toBe(false);
  });

  it('a "not good for leftovers" dish cannot be swapped in a second time', () => {
    const r = swapSlot(put(grid(), key(0, 'dinner'), CURRY), key(1, 'lunch'), CURRY, { ...ctx, noLeftovers: new Set([CURRY]) });
    expect(r).toEqual({ ok: false, error: 'already_planned' });
  });

  it('any match can go into any slot by swap (rules on categories are for Generate only)', () => {
    const r = swapSlot(grid(['breakfast']), key(0, 'breakfast'), 999, ctx);
    expect(r.ok && at(r.slots, key(0, 'breakfast')).recipeId).toBe(999);
  });

  it('changing the cook-day meal empties its leftover and removes the prep entry', () => {
    for (const r of [swapSlot(planned(), key(0, 'dinner'), PAELLA, ctx), clearSlot(planned(), key(0, 'dinner'), ctx)]) {
      expect(r.ok).toBe(true);
      if (!r.ok) continue;
      expect(at(r.slots, key(1, 'lunch'))).toMatchObject({ recipeId: null, note: 'leftover_removed' });
      expect(prepSchedule(r.slots)).toEqual([]);
    }
  });

  it('a locked leftover stays as a normal meal', () => {
    const slots = put(planned(), key(1, 'lunch'), CURRY, { locked: true });
    const r = swapSlot(slots, key(0, 'dinner'), PAELLA, ctx);
    expect(r.ok && at(r.slots, key(1, 'lunch'))).toMatchObject({ recipeId: CURRY, note: 'no_longer_leftover' });
    expect(r.ok && prepSchedule(r.slots)).toEqual([]);
  });

  it('changing the leftover itself keeps the cook-day meal', () => {
    const r = clearSlot(planned(), key(1, 'lunch'), ctx);
    expect(r.ok && at(r.slots, key(0, 'dinner')).recipeId).toBe(CURRY);
  });

  it('moving a leftover to Sunday or before its cook day is refused', () => {
    expect(moveSlot(planned(), key(1, 'lunch'), key(6, 'lunch'), ctx)).toEqual({ ok: false, error: 'leftover_timing' });
    expect(moveSlot(planned(), key(1, 'lunch'), key(0, 'lunch'), ctx)).toEqual({ ok: false, error: 'leftover_timing' });
  });

  it('moving a leftover within 1–2 days is fine; moving swaps with the target dish', () => {
    const r = moveSlot(planned(), key(1, 'lunch'), key(2, 'dinner'), ctx);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(at(r.slots, key(2, 'dinner')).recipeId).toBe(CURRY);
    expect(at(r.slots, key(1, 'lunch')).recipeId).toBe(7);
    expect(prepSchedule(r.slots)[0].leftover.day).toBe(day(2));
  });

  it('moving a normal dish to an empty slot', () => {
    const r = moveSlot(planned(), key(2, 'dinner'), key(5, 'lunch'), ctx);
    expect(r.ok && at(r.slots, key(5, 'lunch')).recipeId).toBe(7);
    expect(r.ok && at(r.slots, key(2, 'dinner'))).toMatchObject({ recipeId: null, note: 'cleared' });
  });

  it('days before today cannot be edited; a leftover whose cook day passed is never emptied', () => {
    const tue: EditContext = { ...ctx, today: day(1) };
    expect(swapSlot(planned(), key(0, 'dinner'), PAELLA, tue)).toEqual({ ok: false, error: 'past_day' });
    expect(moveSlot(planned(), key(2, 'dinner'), key(0, 'lunch'), tue)).toEqual({ ok: false, error: 'past_day' });
    expect(setLocked(planned(), key(0, 'dinner'), true, tue).ok).toBe(false);
    const r = clearSlot(planned(), key(1, 'lunch'), tue);
    expect(r.ok).toBe(true); // the leftover itself can still be changed on its day
  });

  it('locked slots must be unlocked before editing by hand', () => {
    const slots = put(planned(), key(2, 'dinner'), 7, { locked: true });
    expect(swapSlot(slots, key(2, 'dinner'), PAELLA, ctx)).toEqual({ ok: false, error: 'locked' });
    expect(clearSlot(slots, key(2, 'dinner'), ctx)).toEqual({ ok: false, error: 'locked' });
    const unlocked = setLocked(slots, key(2, 'dinner'), false, ctx);
    expect(unlocked.ok && swapSlot(unlocked.slots, key(2, 'dinner'), PAELLA, ctx).ok).toBe(true);
  });

  it('"Not good for leftovers" empties the planned leftover but keeps the cook-day meal', () => {
    const out = dropLeftoversOf(planned(), CURRY, ctx);
    expect(at(out, key(0, 'dinner')).recipeId).toBe(CURRY);
    expect(at(out, key(1, 'lunch'))).toMatchObject({ recipeId: null, note: 'leftover_removed' });
  });

  it('changedSlots lists only what differs', () => {
    const r = swapSlot(planned(), key(0, 'dinner'), PAELLA, ctx);
    expect(r.ok && changedSlots(planned(), r.slots).map(slotKey)).toEqual([key(0, 'dinner'), key(1, 'lunch')]);
  });
});

describe('replaceTonight', () => {
  const planned = () => put(put(grid(), key(0, 'dinner'), CURRY), key(1, 'lunch'), CURRY);

  it("the Tonight winner replaces tonight's dinner and its leftover is removed", () => {
    const out = replaceTonight(planned(), MON, PAELLA, ctx);
    expect(at(out, key(0, 'dinner')).recipeId).toBe(PAELLA);
    expect(at(out, key(1, 'lunch'))).toMatchObject({ recipeId: null, note: 'leftover_removed' });
  });

  it('replaces even a locked dinner; same dish or no dinner slot changes nothing', () => {
    const locked = put(planned(), key(0, 'dinner'), CURRY, { locked: true });
    expect(at(replaceTonight(locked, MON, PAELLA, ctx), key(0, 'dinner'))).toMatchObject({ recipeId: PAELLA, locked: false });
    expect(replaceTonight(planned(), MON, CURRY, ctx)).toEqual(planned());
    expect(replaceTonight(grid(['lunch']), MON, PAELLA, ctx)).toEqual(grid(['lunch']));
  });

  it('the winner planned later in the week is taken out, unless it becomes tonight\'s leftover', () => {
    const later = put(planned(), key(4, 'dinner'), PAELLA);
    expect(at(replaceTonight(later, MON, PAELLA, ctx), key(4, 'dinner'))).toMatchObject({ recipeId: null, note: 'eaten_tonight' });
    const tomorrow = put(planned(), key(1, 'dinner'), PAELLA);
    const out = replaceTonight(tomorrow, MON, PAELLA, ctx);
    expect(at(out, key(1, 'dinner')).recipeId).toBe(PAELLA);
    expect(prepSchedule(out).map((p) => p.recipeId)).toEqual([PAELLA]);
  });
});
