import {
  addDays,
  daysBetween,
  localDate,
  mealsFor,
  mondayOf,
  pickSelection,
  planDays,
  planPhase,
  type PlanDates,
  RESWIPE_CAP,
  startedWithoutAccept,
  startOptions,
  weekCandidates,
  weekdayIndex,
} from '../week';

// 2026-09-28 is a Monday.
const MON = '2026-09-28';
const WED = '2026-09-30';
const SUN = '2026-10-04';
const NEXT_MON = '2026-10-05';

let seed = 1;
const rng = () => {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
};
beforeEach(() => {
  seed = 1;
});

describe('dates', () => {
  it('finds weekdays and Mondays, across month ends', () => {
    expect(weekdayIndex(MON)).toBe(0);
    expect(weekdayIndex(SUN)).toBe(6);
    expect(mondayOf(SUN)).toBe(MON);
    expect(mondayOf('2026-10-01')).toBe(MON);
    expect(addDays(WED, 5)).toBe('2026-10-05');
    expect(daysBetween(MON, NEXT_MON)).toBe(7);
  });

  it('a plan covers its first day to Sunday', () => {
    expect(planDays(MON)).toHaveLength(7);
    expect(planDays(WED)).toEqual([WED, '2026-10-01', '2026-10-02', '2026-10-03', SUN]);
    expect(planDays(SUN)).toEqual([SUN]);
  });

  it('uses the local date, not UTC', () => {
    expect(localDate(new Date(2026, 8, 28, 0, 30))).toBe(MON);
    expect(localDate(new Date(2026, 8, 28, 23, 59))).toBe(MON);
  });
});

describe('planPhase', () => {
  const plan = (over: Partial<PlanDates>): PlanDates => ({
    weekStart: NEXT_MON,
    firstDay: NEXT_MON,
    status: 'setup',
    createdOn: SUN,
    ...over,
  });

  it("next week's plan is upcoming until Monday", () => {
    expect(planPhase(plan({}), SUN)).toBe('upcoming');
    expect(planPhase(plan({ status: 'accepted' }), SUN)).toBe('upcoming');
  });

  it('on Monday a generated plan becomes active even without acceptance', () => {
    const p = plan({ status: 'generated' });
    expect(planPhase(p, NEXT_MON)).toBe('active');
    expect(startedWithoutAccept(p, NEXT_MON)).toBe(true);
    expect(startedWithoutAccept(plan({ status: 'accepted' }), NEXT_MON)).toBe(false);
    expect(startedWithoutAccept(p, SUN)).toBe(false);
  });

  it('on Monday a plan that was never generated is gone', () => {
    expect(planPhase(plan({ status: 'setup' }), NEXT_MON)).toBe('gone');
    expect(planPhase(plan({ status: 'choosing' }), NEXT_MON)).toBe('gone');
  });

  it('a "rest of this week" plan started today survives today only if not generated', () => {
    const p = plan({ weekStart: MON, firstDay: WED, createdOn: WED, status: 'choosing' });
    expect(planPhase(p, WED)).toBe('upcoming');
    expect(planPhase(p, '2026-10-01')).toBe('gone');
    expect(planPhase({ ...p, status: 'generated' }, WED)).toBe('active');
  });

  it('the plan ends with its week (no history kept)', () => {
    const p = plan({ weekStart: MON, firstDay: MON, status: 'accepted', createdOn: '2026-09-27' });
    expect(planPhase(p, SUN)).toBe('active');
    expect(planPhase(p, NEXT_MON)).toBe('gone');
  });
});

describe('startOptions', () => {
  it('offers next week, and the rest of this week while this week has no plan', () => {
    expect(startOptions([], WED)).toEqual({ nextWeek: NEXT_MON, restOfThisWeek: WED });
    const thisWeek: PlanDates = { weekStart: MON, firstDay: MON, status: 'accepted', createdOn: '2026-09-27' };
    expect(startOptions([thisWeek], WED).restOfThisWeek).toBeNull();
  });

  it('a discarded plan does not block the rest of this week', () => {
    const stale: PlanDates = { weekStart: MON, firstDay: MON, status: 'setup', createdOn: '2026-09-27' };
    expect(startOptions([stale], WED).restOfThisWeek).toBe(WED);
  });
});

describe('mealsFor (slot suitability)', () => {
  it('breakfast only takes breakfast dishes: an Omelette yes, a Beef Wellington no', () => {
    expect(mealsFor('Breakfast').has('breakfast')).toBe(true);
    expect(mealsFor('Beef').has('breakfast')).toBe(false);
    expect(mealsFor('Beef').has('dinner')).toBe(true);
  });

  it('snack takes starters, sides and desserts, never a main course', () => {
    for (const c of ['Starter', 'Side', 'Dessert']) expect(mealsFor(c).has('snack')).toBe(true);
    for (const c of ['Beef', 'Chicken', 'Pasta', 'Breakfast', null]) expect(mealsFor(c).has('snack')).toBe(false);
  });

  it('lunch and dinner take anything except desserts', () => {
    expect([...mealsFor('Dessert')]).toEqual(['snack']);
    expect(mealsFor(null).has('lunch')).toBe(true);
    expect(mealsFor('Side').has('dinner')).toBe(true);
  });
});

describe('pickSelection', () => {
  const matches = [
    ...Array.from({ length: 190 }, (_, i) => ({ id: i + 1, category: 'Beef' })),
    ...Array.from({ length: 10 }, (_, i) => ({ id: 1000 + i, category: 'Breakfast' })),
  ];

  it('picks at most 30 of 200 matches, including breakfast dishes when breakfast is on', () => {
    const picks = pickSelection(matches, { main: 14, breakfast: 7 }, rng);
    expect(picks).toHaveLength(RESWIPE_CAP);
    expect(new Set(picks).size).toBe(RESWIPE_CAP);
    expect(picks.filter((id) => id >= 1000).length).toBeGreaterThanOrEqual(7);
  });

  it('every switched-on slot type gets matches allowed there', () => {
    const withSnacks = [...matches, ...Array.from({ length: 5 }, (_, i) => ({ id: 2000 + i, category: 'Side' }))];
    const picks = pickSelection(withSnacks, { main: 14, breakfast: 7, snack: 7 }, rng);
    expect(picks.some((id) => id >= 1000 && id < 2000)).toBe(true);
    expect(picks.some((id) => id >= 2000)).toBe(true);
  });

  it('with fewer matches than the cap, picks them all', () => {
    expect(pickSelection(matches.slice(0, 5), { main: 14 }, rng).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
    expect(pickSelection([], { main: 14 }, rng)).toEqual([]);
  });

  it('is random per week but deterministic for the same RNG', () => {
    seed = 7;
    const a = pickSelection(matches, { main: 14 }, rng);
    seed = 7;
    expect(pickSelection(matches, { main: 14 }, rng)).toEqual(a);
    seed = 99;
    expect(pickSelection(matches, { main: 14 }, rng)).not.toEqual(a);
  });
});

describe('weekCandidates', () => {
  it("keeps this week's picks that are still matches and that nobody rejected", () => {
    // Lasagne 1 liked again, Chilli 2 rejected by partner, 3 no longer a match, 4 not reached yet.
    expect(weekCandidates([1, 2, 3, 4], new Set([1, 2, 4, 5]), new Set([2]))).toEqual([1, 4]);
  });

  it('matches outside the selection are never candidates (Goulash)', () => {
    expect(weekCandidates([1], new Set([1, 99]), new Set())).toEqual([1]);
  });
});
